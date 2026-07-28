// Canonical event/type contract shared between the Caddie agent backend and
// the chat UI. Both sides import this same file (no hand-duplication, unlike
// the workupdate reference project where the client kept its own copy).

import type { ChartSpec } from "@/lib/charts/spec";

// Names of tools that execute in the browser (relayed back via the resume
// endpoint) rather than on the server. Empty for now — add entries here as
// client-executed tools are introduced.
export type ClientToolName = never;

export type ToolExecutor = "client" | "server";

export type AssistantPhase = "commentary" | "final_answer";

export const CONFIRM_LABELS = [
  "Allow",
  "Run",
  "Send",
  "Update",
  "Confirm",
  "Approve",
] as const;

export type ConfirmLabel = (typeof CONFIRM_LABELS)[number];

export type ChatStreamEvent =
  | {
      type: "response.started";
      requestId: string;
      conversationId: string;
    }
  | {
      type: "response.delta";
      delta: string;
      itemId: string;
      phase: AssistantPhase;
      startsNewSegment?: true;
    }
  | {
      type: "tool.started";
      callId: string;
      name: string;
      executor: ToolExecutor;
      arguments: Record<string, unknown>;
      startedAt: number;
    }
  | {
      type: "tool.completed";
      callId: string;
      output?: string;
      completedAt: number;
    }
  | {
      // A chart accepted by render_chart. Carried as its own event rather than
      // inside tool.completed so the chart renders in the answer body instead
      // of the collapsible work log.
      type: "chart.rendered";
      chartId: string;
      chart: ChartSpec;
    }
  | {
      type: "tool_approval.request";
      runId: string;
      toolCallId: string;
      name: string;
      executor: ToolExecutor;
      arguments: Record<string, unknown>;
      title: string;
      description: string;
      confirmLabel: ConfirmLabel;
      requiresApproval: true;
    }
  | {
      type: "response.paused";
      runId: string;
      pausedAt: number;
    }
  | {
      type: "response.completed";
      conversationId: string;
    }
  | {
      type: "response.error";
      code: string;
      message: string;
    };

const EVENT_TYPES = new Set<ChatStreamEvent["type"]>([
  "response.started",
  "response.delta",
  "tool.started",
  "tool.completed",
  "chart.rendered",
  "tool_approval.request",
  "response.paused",
  "response.completed",
  "response.error",
]);

export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string" &&
    EVENT_TYPES.has((value as { type: ChatStreamEvent["type"] }).type)
  );
}

export interface ToolApprovalRequest {
  runId: string;
  toolCallId: string;
  name: string;
  executor: ToolExecutor;
  arguments: Record<string, unknown>;
  title: string;
  description: string;
  confirmLabel: ConfirmLabel;
}

export function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}
