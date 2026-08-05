import {
  RunContext,
  RunState,
  isOpenAIResponsesRawModelStreamEvent,
  run,
  type RunToolCallItem,
  type RunToolCallOutputItem,
  type RunToolApprovalItem,
} from "@openai/agents";
import { caddieAgent, type CaddieRunContext } from "./caddie-agent";
import { savePendingRun } from "./pending-runs";
import {
  CONFIRM_LABELS,
  encodeEvent,
  type AssistantPhase,
  type ChatStreamEvent,
  type ClientToolName,
  type ConfirmLabel,
  type ToolExecutor,
} from "./protocol";

// No client-executed tools exist yet — every tool currently runs on the
// server. Add tool names here as client-executed tools are introduced (see
// the comment in caddie-agent.ts).
const CLIENT_TOOL_NAMES = new Set<ClientToolName>([]);

const PRIVATE_TOOL_ARGUMENTS = new Set([
  "approvalTitle",
  "approvalDescription",
  "confirmLabel",
]);
const TOOL_ARGUMENT_STRING_LIMIT = 800;
const TOOL_OUTPUT_PREVIEW_LIMIT = 1_200;
// Chart arguments contain every category and value, so generating them can
// take noticeably longer than executing render_chart itself.
const EARLY_PROGRESS_TOOL_NAMES = new Set(["render_chart"]);

interface StreamCaddieRunOptions {
  input: string | RunState<CaddieRunContext, typeof caddieAgent>;
  conversationId: string;
  userId: string;
  signal: AbortSignal;
  /**
   * The context a resumed run was restored with. RunState keeps its own copy
   * private, so the caller passes the same object here to let the stream read
   * what the tools write (see restoreRunState).
   */
  resumedContext?: CaddieRunContext;
}

interface TextSegment {
  itemId: string;
  phase: AssistantPhase;
}

function toolExecutor(name: string): ToolExecutor {
  return CLIENT_TOOL_NAMES.has(name as ClientToolName) ? "client" : "server";
}

function parseArguments(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argumentsJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function publicToolArguments(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args)
      .filter(([key]) => !PRIVATE_TOOL_ARGUMENTS.has(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" && value.length > TOOL_ARGUMENT_STRING_LIMIT
          ? `${value.slice(0, TOOL_ARGUMENT_STRING_LIMIT)}…`
          : value,
      ]),
  );
}

function toolCallPresentation(item: RunToolCallItem): {
  callId: string;
  name: string;
  executor: ToolExecutor;
  arguments: Record<string, unknown>;
} | null {
  const callId = item.callId;
  const name = item.toolName;
  if (!callId || !name) return null;

  const args =
    item.rawItem.type === "function_call"
      ? parseArguments(item.rawItem.arguments)
      : {};

  return {
    callId,
    name,
    executor: toolExecutor(name),
    arguments: publicToolArguments(args),
  };
}

function toolOutputPreview(item: RunToolCallOutputItem): string | undefined {
  let output: string;
  try {
    output =
      typeof item.output === "string"
        ? item.output
        : JSON.stringify(item.output);
  } catch {
    return undefined;
  }

  if (!output) return undefined;
  return output.length > TOOL_OUTPUT_PREVIEW_LIMIT
    ? `${output.slice(0, TOOL_OUTPUT_PREVIEW_LIMIT)}…`
    : output;
}

function assistantPhase(value: unknown): AssistantPhase {
  return value === "commentary" ? "commentary" : "final_answer";
}

function asToolApprovalInterruption(
  interruption: RunToolApprovalItem,
): {
  toolCallId: string;
  name: string;
  executor: ToolExecutor;
  arguments: Record<string, unknown>;
} | null {
  const { rawItem } = interruption;
  if (rawItem.type !== "function_call") return null;

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(rawItem.arguments);
  } catch {
    return null;
  }

  if (
    !parsedArguments ||
    typeof parsedArguments !== "object" ||
    Array.isArray(parsedArguments)
  ) {
    return null;
  }

  return {
    toolCallId: rawItem.callId,
    name: rawItem.name,
    executor: toolExecutor(rawItem.name),
    arguments: parsedArguments as Record<string, unknown>,
  };
}

// The model generates the approval texts as part of the tool call itself
// (add approvalTitle/approvalDescription/confirmLabel fields to a tool's
// parameters, per the workupdate reference project's approvalPresentationFields
// pattern). Fall back to generic copy if a field is missing or malformed so
// the approval card never renders empty.
function approvalPresentation(args: Record<string, unknown>): {
  title: string;
  description: string;
  confirmLabel: ConfirmLabel;
} {
  const title =
    typeof args.approvalTitle === "string" && args.approvalTitle.trim()
      ? args.approvalTitle.trim().slice(0, 80)
      : "Allow Caddie to perform this action?";
  const description =
    typeof args.approvalDescription === "string" && args.approvalDescription.trim()
      ? args.approvalDescription.trim().slice(0, 240)
      : "Caddie needs your approval before it can continue with this request.";
  const confirmLabel = CONFIRM_LABELS.includes(args.confirmLabel as ConfirmLabel)
    ? (args.confirmLabel as ConfirmLabel)
    : "Allow";

  return { title, description, confirmLabel };
}

function publicError(error: unknown): ChatStreamEvent {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      type: "response.error",
      code: "cancelled",
      message: "Response stopped.",
    };
  }

  return {
    type: "response.error",
    code: "agent_error",
    message: "Caddie could not complete that response. Please try again.",
  };
}

export function streamCaddieRun({
  input,
  conversationId,
  userId,
  signal,
  resumedContext,
}: StreamCaddieRunOptions): ReadableStream<Uint8Array> {
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  signal.addEventListener("abort", abort, { once: true });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => controller.enqueue(encodeEvent(event));
      send({
        type: "response.started",
        requestId: crypto.randomUUID(),
        conversationId,
      });

      try {
        const isResumedRun = input instanceof RunState;
        // Either way this is the same object the tools mutate, so draining
        // charts off it works for fresh and resumed runs alike.
        const runContext: CaddieRunContext = resumedContext ?? {
          clientToolResults: {},
          userId,
          conversationId,
          sqlCallsUsed: 0,
          chartsRendered: 0,
          charts: [],
        };

        const result = await run(caddieAgent, input, {
          stream: true,
          signal: abortController.signal,
          maxTurns: 8,
          ...(isResumedRun ? {} : { context: runContext, conversationId }),
        });

        let startsNewSegment = true;
        let fallbackSegmentNumber = 0;
        let currentSegment: TextSegment = {
          itemId: `assistant-${fallbackSegmentNumber}`,
          phase: "final_answer",
        };
        const segmentsByOutputIndex = new Map<number, TextSegment>();
        const earlyToolStartedAt = new Map<string, number>();

        for await (const event of result) {
          if (isOpenAIResponsesRawModelStreamEvent(event)) {
            const modelEvent = event.data.event;

            if (modelEvent.type === "response.created") {
              segmentsByOutputIndex.clear();
            } else if (
              modelEvent.type === "response.output_item.added" &&
              modelEvent.item.type === "message"
            ) {
              const segment: TextSegment = {
                itemId:
                  modelEvent.item.id ||
                  `assistant-${++fallbackSegmentNumber}`,
                phase: assistantPhase(modelEvent.item.phase),
              };
              segmentsByOutputIndex.set(modelEvent.output_index, segment);
              currentSegment = segment;
              startsNewSegment = true;
            } else if (
              modelEvent.type === "response.output_item.added" &&
              modelEvent.item.type === "function_call" &&
              EARLY_PROGRESS_TOOL_NAMES.has(modelEvent.item.name)
            ) {
              const callId = modelEvent.item.call_id;
              const startedAt = Date.now();
              earlyToolStartedAt.set(callId, startedAt);
              send({
                type: "tool.preparing",
                callId,
                name: modelEvent.item.name,
                executor: toolExecutor(modelEvent.item.name),
                startedAt,
              });
            }

            continue;
          }

          if (
            event.type === "run_item_stream_event" &&
            event.name === "message_output_created"
          ) {
            startsNewSegment = true;
            continue;
          }

          if (
            event.type === "run_item_stream_event" &&
            event.name === "tool_called" &&
            event.item.type === "tool_call_item"
          ) {
            const toolCall = toolCallPresentation(event.item);
            if (toolCall) {
              send({
                type: "tool.started",
                ...toolCall,
                startedAt:
                  earlyToolStartedAt.get(toolCall.callId) ?? Date.now(),
              });
            }
            continue;
          }

          if (
            event.type === "run_item_stream_event" &&
            event.name === "tool_output" &&
            event.item.type === "tool_call_output_item"
          ) {
            const callId = event.item.callId;
            if (callId) {
              const output = toolOutputPreview(event.item);
              send({
                type: "tool.completed",
                callId,
                ...(output ? { output } : {}),
                completedAt: Date.now(),
              });
              earlyToolStartedAt.delete(callId);
            }
            // render_chart parks accepted specs on the run context; forward
            // any that appeared as their own event. Draining the queue keeps
            // a chart from being emitted twice across turns.
            for (const chart of runContext.charts.splice(0)) {
              send({
                type: "chart.rendered",
                chartId: crypto.randomUUID(),
                chart,
              });
            }
            continue;
          }

          if (
            event.type === "raw_model_stream_event" &&
            event.data.type === "output_text_delta"
          ) {
            if (!event.data.delta) continue;

            const outputIndex = event.data.providerData?.output_index;
            const segment =
              typeof outputIndex === "number"
                ? segmentsByOutputIndex.get(outputIndex) ?? currentSegment
                : currentSegment;

            send({
              type: "response.delta",
              delta: event.data.delta,
              itemId: segment.itemId,
              phase: segment.phase,
              ...(startsNewSegment ? { startsNewSegment: true } : {}),
            });
            startsNewSegment = false;
          }
        }

        await result.completed;

        const approval = result.interruptions
          .map(asToolApprovalInterruption)
          .find((candidate) => candidate !== null);

        if (approval) {
          const runId = savePendingRun({
            serializedState: result.state.toString(),
            conversationId,
            toolCallId: approval.toolCallId,
            toolName: approval.name,
            executor: approval.executor,
            userId,
          });

          send({
            type: "tool_approval.request",
            runId,
            toolCallId: approval.toolCallId,
            name: approval.name,
            executor: approval.executor,
            arguments: approval.arguments,
            ...approvalPresentation(approval.arguments),
            requiresApproval: true,
          });
          send({ type: "response.paused", runId, pausedAt: Date.now() });
          return;
        }

        if (result.interruptions.length > 0) {
          // A paused run we cannot surface must not masquerade as a completed
          // response — the user would wait on an answer that never arrives.
          send({
            type: "response.error",
            code: "unsupported_interruption",
            message: "Caddie paused for an approval it could not display. Please try again.",
          });
          return;
        }

        send({
          type: "response.completed",
          conversationId,
        });
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Caddie agent run failed", error);
          send(publicError(error));
        }
      } finally {
        signal.removeEventListener("abort", abort);
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });
}

export async function restoreRunState(
  serializedState: string,
  context: CaddieRunContext,
) {
  return RunState.fromStringWithContext(
    caddieAgent,
    serializedState,
    new RunContext(context),
    { contextStrategy: "replace" },
  );
}
