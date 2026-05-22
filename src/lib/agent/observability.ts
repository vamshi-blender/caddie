import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

const LOG_DIR = path.join(process.cwd(), ".agent-data", "logs");
const EVENTS_PATH = path.join(LOG_DIR, "events.jsonl");

type EventPayload = {
  event: string;
  sessionId?: string;
  messageId?: string;
  data?: Record<string, unknown>;
};

export async function recordAgentEvent(payload: EventPayload) {
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(
    EVENTS_PATH,
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      ...payload,
    })}\n`,
    "utf8",
  );
}

export async function recordSdkMessage(message: SDKMessage) {
  const typed = message as SDKMessage & {
    subtype?: string;
    uuid?: string;
    session_id?: string;
    total_cost_usd?: number;
    num_turns?: number;
    usage?: unknown;
  };

  await recordAgentEvent({
    event: `sdk.${typed.type}${typed.subtype ? `.${typed.subtype}` : ""}`,
    sessionId: typed.session_id,
    messageId: typed.uuid,
    data: {
      totalCostUsd: typed.total_cost_usd,
      numTurns: typed.num_turns,
      usage: typed.usage,
    },
  });
}
