import {
  query,
  startup,
  type Options,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
  type WarmQuery,
} from "@anthropic-ai/claude-agent-sdk";
import {
  AGENT_CWD,
  AGENT_ENV,
  AGENT_SYSTEM_PROMPT,
  CADDIE_MCP_SERVER_NAME,
  CADDIE_MCP_URL,
} from "@/lib/agent/config";
import { fileSessionStore } from "@/lib/agent/file-session-store";
import { agentHooks } from "@/lib/agent/hooks";
import { recordAgentEvent, recordSdkMessage } from "@/lib/agent/observability";
import {
  createSession,
  deleteSessionRecord,
  getAgentMessages,
  hasAgentTranscript,
  titleSessionFromPrompt,
  updateSession,
} from "@/lib/agent/session-index";

type RunAgentInput = {
  prompt: string;
  sessionId?: string;
  resumeSessionAt?: string;
  abortSignal?: AbortSignal;
  onStream?: (event: AgentStreamEvent) => Promise<void> | void;
};

const activeSessions = new Set<string>();
const activeSessionAbortControllers = new Map<string, AbortController>();
let warmAgentPromise: Promise<WarmAgent> | undefined;

type WarmAgent = {
  abortController: AbortController;
  query: WarmQuery;
};

export class AgentRunStoppedError extends Error {
  constructor() {
    super("Agent stopped by user.");
    this.name = "AgentRunStoppedError";
  }
}

export type AgentStreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "assistant_start"; id: string }
  | { type: "text"; id: string; text: string }
  | { type: "assistant_done"; id: string }
  | { type: "mcp_start"; id: string; toolName: string }
  | { type: "mcp_input"; id: string; text: string }
  | { type: "mcp_done"; id: string; isError?: boolean; result?: string }
  | { type: "result"; sessionId: string; subtype: SDKResultMessage["subtype"] }
  | { type: "stopped"; sessionId: string };

type ActiveContentBlock =
  | { type: "text"; id: string }
  | { type: "tool"; id: string; toolUseId?: string; toolName: string; input: string };

export async function runAgent(input: RunAgentInput) {
  const prompt = input.prompt.trim();
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  if (!prompt) {
    throw new Error("Prompt is required.");
  }

  // Timing: Session setup
  let t1 = Date.now();
  const isBranch = Boolean(input.sessionId && input.resumeSessionAt);
  const shouldResume = Boolean(
    input.sessionId && !isBranch && (await hasAgentTranscript(input.sessionId)),
  );
  const sessionRecord = isBranch
    ? await createSession("Branching analysis")
    : input.sessionId
      ? await updateSession(input.sessionId, { status: "running" })
      : await createSession("New analysis");
  timings.sessionSetup = Date.now() - t1;

  if (activeSessions.has(sessionRecord.id)) {
    throw new Error("This session is already running. Wait for the current response to finish.");
  }

  const abortController = new AbortController();
  const abortCurrentRun = () => abortController.abort();

  if (input.abortSignal?.aborted) {
    abortController.abort();
  } else {
    input.abortSignal?.addEventListener("abort", abortCurrentRun, { once: true });
  }

  activeSessions.add(sessionRecord.id);
  activeSessionAbortControllers.set(sessionRecord.id, abortController);

  // Timing: Update session status
  t1 = Date.now();
  await updateSession(sessionRecord.id, {
    status: "running",
    sourceSessionId: isBranch ? input.sessionId : undefined,
    sourceMessageId: input.resumeSessionAt,
  });
  timings.updateSessionStatus = Date.now() - t1;

  let result: SDKResultMessage | undefined;
  const messages: SDKMessage[] = [];
  const activeBlocks = new Map<number, ActiveContentBlock>();
  const toolBubbles = new Map<string, string>();
  let currentSessionId = sessionRecord.id;
  let closeWarmQuery: (() => void) | undefined;

  try {
    // Timing: Query initialization (SDK setup)
    t1 = Date.now();
    const warmAgent = !isBranch && !shouldResume ? await takeWarmAgent() : undefined;
    let stream: Query;
    let runAbortController = abortController;

    if (warmAgent) {
      runAbortController = warmAgent.abortController;
      activeSessionAbortControllers.set(sessionRecord.id, runAbortController);
      closeWarmQuery = () => {
        warmAgent.query.close();
        warmAgent.abortController.abort();
      };
      input.abortSignal?.addEventListener("abort", closeWarmQuery, { once: true });
      stream = warmAgent.query.query(prompt);
    } else {
      stream = query({
        prompt,
        options: buildAgentOptions({
          abortController,
          sessionId: isBranch || shouldResume ? undefined : sessionRecord.id,
          resume: isBranch ? input.sessionId : shouldResume ? sessionRecord.id : undefined,
          resumeSessionAt: input.resumeSessionAt,
          forkSession: isBranch,
          title: sessionRecord.title,
          eventSessionId: sessionRecord.id,
        }),
      });
    }
    timings.queryInitialization = Date.now() - t1;

    // Log timing for first message
    console.log(`[TIMING] Agent initialization: ${JSON.stringify(timings)}`);
    await recordAgentEvent({
      event: "timing.agent-initialization",
      sessionId: sessionRecord.id,
      data: { timings, totalMs: Date.now() - startTime },
    });

    let firstMessageTime: number | undefined;
    let messageCount = 0;

    for await (const message of stream) {
      if (messageCount === 0) {
        firstMessageTime = Date.now() - startTime;
        console.log(`[TIMING] First message received after ${firstMessageTime}ms`);
      }
      messageCount++;

      messages.push(message);
      await recordSdkMessage(message);

      if (message.type === "system" && message.subtype === "init" && message.session_id !== sessionRecord.id) {
        currentSessionId = message.session_id;
        activeSessions.add(message.session_id);
        activeSessionAbortControllers.delete(sessionRecord.id);
        activeSessionAbortControllers.set(message.session_id, runAbortController);
        await updateSession(message.session_id, {
          title: sessionRecord.title,
          status: "running",
          sourceSessionId: input.sessionId,
          sourceMessageId: input.resumeSessionAt,
        });
      }

      if (message.type === "system" && message.subtype === "init") {
        await input.onStream?.({ type: "session", sessionId: message.session_id });
      }

      if (message.type === "stream_event") {
        await emitStreamEvent(message.event, activeBlocks, toolBubbles, input.onStream);
      }

      if (message.type === "user") {
        await emitToolResults(message.message, toolBubbles, input.onStream);
      }

      if (message.type === "result") {
        result = message;
        await input.onStream?.({
          type: "result",
          sessionId: message.session_id,
          subtype: message.subtype,
        });
      }
    }

    if (!result) {
      throw new Error("Agent finished without returning a result message.");
    }

    const finalSessionId = result.session_id;
    if (finalSessionId !== sessionRecord.id) {
      await deleteSessionRecord(sessionRecord.id);
    }

    await updateSession(finalSessionId, {
      status: result.subtype === "success" ? "idle" : "error",
      lastError: result.subtype === "success" ? undefined : result.subtype,
    });

    await titleSessionFromPrompt(finalSessionId, prompt);

    return {
      sessionId: finalSessionId,
      result,
      messages: await getAgentMessages(finalSessionId),
      events: messages.map((message) => ({
        type: message.type,
        subtype: "subtype" in message ? message.subtype : undefined,
      })),
    };
  } catch (error) {
    if (isAbortError(error) || abortController.signal.aborted) {
      await updateSession(sessionRecord.id, {
        status: "idle",
        lastError: undefined,
      });
      await input.onStream?.({ type: "stopped", sessionId: sessionRecord.id });
      throw new AgentRunStoppedError();
    }

    await updateSession(sessionRecord.id, {
      status: "error",
      lastError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    input.abortSignal?.removeEventListener("abort", abortCurrentRun);
    if (closeWarmQuery) {
      input.abortSignal?.removeEventListener("abort", closeWarmQuery);
    }
    prewarmAgent();
    activeSessions.delete(sessionRecord.id);
    activeSessions.delete(currentSessionId);
    activeSessionAbortControllers.delete(sessionRecord.id);
    activeSessionAbortControllers.delete(currentSessionId);
  }
}

export function prewarmAgent() {
  if (!warmAgentPromise) {
    warmAgentPromise = createWarmAgent();
  }
}

async function takeWarmAgent() {
  const warmAgent = warmAgentPromise;
  warmAgentPromise = undefined;

  if (!warmAgent) return undefined;

  return warmAgent.catch((error) => {
    void recordAgentEvent({
      event: "sdk.prewarm.failed",
      data: { error: error instanceof Error ? error.message : String(error) },
    });
    return undefined;
  });
}

async function createWarmAgent(): Promise<WarmAgent> {
  const abortController = new AbortController();
  const startedAt = Date.now();
  const warmQuery = await startup({
    options: buildAgentOptions({
      abortController,
      title: "New analysis",
      eventSessionId: "prewarm",
    }),
  });

  void recordAgentEvent({
    event: "sdk.prewarm.ready",
    sessionId: "prewarm",
    data: { totalMs: Date.now() - startedAt },
  });

  return { abortController, query: warmQuery };
}

function buildAgentOptions(input: {
  abortController: AbortController;
  sessionId?: string;
  resume?: string;
  resumeSessionAt?: string;
  forkSession?: boolean;
  title: string;
  eventSessionId: string;
}): Options {
  return {
    abortController: input.abortController,
    sessionId: input.sessionId,
    resume: input.resume,
    resumeSessionAt: input.resumeSessionAt,
    forkSession: input.forkSession,
    title: input.title,
    cwd: AGENT_CWD,
    env: AGENT_ENV,
    systemPrompt: AGENT_SYSTEM_PROMPT,
    settingSources: [],
    skills: [],
    allowedTools: [`mcp__${CADDIE_MCP_SERVER_NAME}__*`],
    disallowedTools: [
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "Monitor",
      "Agent",
      "Skill",
      "AskUserQuestion",
      "TaskCreate",
      "TaskUpdate",
      "ToolSearch",
    ],
    mcpServers: {
      [CADDIE_MCP_SERVER_NAME]: {
        type: "http",
        url: CADDIE_MCP_URL,
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      },
    },
    strictMcpConfig: true,
    model: "haiku",
    permissionMode: "dontAsk",
    thinking: { type: "disabled" },
    effort: "low",
    hooks: agentHooks,
    includeHookEvents: true,
    includePartialMessages: true,
    promptSuggestions: true,
    sessionStore: fileSessionStore,
    sessionStoreFlush: "eager",
    loadTimeoutMs: 30000,
    stderr: (data) => {
      void recordAgentEvent({
        event: "sdk.stderr",
        sessionId: input.eventSessionId,
        data: { data },
      });
    },
  };
}

export async function stopAgentSession(sessionId: string) {
  const abortController = activeSessionAbortControllers.get(sessionId);

  if (!abortController) return false;

  abortController.abort();
  await updateSession(sessionId, {
    status: "idle",
    lastError: undefined,
  });

  return true;
}

async function emitStreamEvent(
  event: unknown,
  activeBlocks: Map<number, ActiveContentBlock>,
  toolBubbles: Map<string, string>,
  onStream?: RunAgentInput["onStream"],
) {
  if (!event || typeof event !== "object") return "";

  const record = event as {
    type?: string;
    index?: number;
    content_block?: {
      type?: string;
      id?: string;
      name?: string;
    };
    delta?: { type?: string; text?: string; partial_json?: string };
  };
  const index = record.index ?? 0;

  if (record.type === "content_block_start") {
    if (record.content_block?.type === "text") {
      const id = `assistant-${crypto.randomUUID()}`;
      activeBlocks.set(index, { type: "text", id });
      await onStream?.({ type: "assistant_start", id });
    }

    if (record.content_block?.type === "tool_use") {
      const id = `mcp-${crypto.randomUUID()}`;
      const toolName = record.content_block.name ?? "MCP tool";
      const toolUseId = record.content_block.id;
      activeBlocks.set(index, { type: "tool", id, toolName, toolUseId, input: "" });
      if (toolUseId) toolBubbles.set(toolUseId, id);
      await onStream?.({ type: "mcp_start", id, toolName });
    }
  }

  if (record.type === "content_block_delta" && record.delta?.type === "text_delta") {
    const block = activeBlocks.get(index);
    if (block?.type === "text") {
      await onStream?.({ type: "text", id: block.id, text: record.delta.text ?? "" });
    }
  }

  if (record.type === "content_block_delta" && record.delta?.type === "input_json_delta") {
    const block = activeBlocks.get(index);
    if (block?.type === "tool") {
      block.input += record.delta.partial_json ?? "";
      await onStream?.({ type: "mcp_input", id: block.id, text: record.delta.partial_json ?? "" });
    }
  }

  if (record.type === "content_block_stop") {
    const block = activeBlocks.get(index);
    activeBlocks.delete(index);
    if (block?.type === "text") {
      await onStream?.({ type: "assistant_done", id: block.id });
    }
  }
}

async function emitToolResults(
  message: unknown,
  toolBubbles: Map<string, string>,
  onStream?: RunAgentInput["onStream"],
) {
  const record = message as { content?: unknown };
  const content = Array.isArray(record.content) ? record.content : [];

  for (const block of content) {
    const toolResult = block as {
      type?: string;
      tool_use_id?: string;
      is_error?: boolean;
      content?: unknown;
    };

    if (toolResult.type !== "tool_result" || !toolResult.tool_use_id) continue;

    const id = toolBubbles.get(toolResult.tool_use_id);
    if (!id) continue;

    await onStream?.({
      type: "mcp_done",
      id,
      isError: toolResult.is_error,
      result: stringifyToolResult(toolResult.content),
    });
  }
}

function stringifyToolResult(content: unknown) {
  if (typeof content === "string") return truncate(content);
  if (Array.isArray(content)) {
    return truncate(
      content
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "text" in item) {
            return String((item as { text: unknown }).text);
          }
          return JSON.stringify(item);
        })
        .join("\n"),
    );
  }
  if (content == null) return undefined;
  return truncate(JSON.stringify(content));
}

function truncate(value: string) {
  return value.length > 800 ? `${value.slice(0, 800)}...` : value;
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const record = error as { name?: unknown; message?: unknown };
  const name = typeof record.name === "string" ? record.name : "";
  const message = typeof record.message === "string" ? record.message : "";

  return (
    name === "AbortError" ||
    name === "AgentRunStoppedError" ||
    message.includes("aborted") ||
    message.includes("AbortError") ||
    message.includes("FetchRequestCanceledException")
  );
}
