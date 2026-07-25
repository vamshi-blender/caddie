import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { getCurrentTimeResult } from "./tools/check-time";
import {
  MAX_SQL_CALLS_PER_RESPONSE,
  runReadonlySql,
} from "./tools/run-readonly-sql";

export interface ClientToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface CaddieRunContext {
  clientToolResults: Record<string, ClientToolResult>;
  userId: string;
  conversationId: string;
  sqlCallsUsed: number;
}

const checkTimeParameters = z
  .object({
    timeZone: z.string().nullable(),
  })
  .strict();

const checkTime = tool({
  name: "check_time",
  description:
    "Return the current date and time. Use this whenever the user asks for the current date or time.",
  parameters: checkTimeParameters,
  async execute({ timeZone }) {
    return JSON.stringify(getCurrentTimeResult({ timeZone }));
  },
});

// Add future Caddie tools to this array. Client-executed tools (tools whose
// execute() relays a result the browser produced) should set
// `needsApproval: async () => true` and read their result from
// `runContext.context.clientToolResults[callId]` — see the workupdate
// reference project's relayClientResult() pattern for the shape to follow.
export const caddieAgent = new Agent<CaddieRunContext>({
  name: "Caddie",
  model: process.env.OPENAI_MODEL ?? "gpt-5.6",
  instructions: `You are Caddie, a thoughtful personal AI assistant.

Help the user clearly and directly. Keep answers concise unless the task benefits from detail.
Remember and use relevant information from the current conversation.
For tool-heavy work, use brief commentary updates before and between tool calls so the user can follow meaningful progress. Put only the completed answer in the final answer phase, and do not repeat the entire work log there.
Use check_time for current date or time questions.
Use run_readonly_sql when the user asks a question that requires information from the configured Oracle database.
Generate only read-only Oracle SELECT queries. If table or column details are needed, query Oracle metadata using run_readonly_sql.
You can use run_readonly_sql up to ${MAX_SQL_CALLS_PER_RESPONSE} times for one response. This limit resets for each new user message. Use the calls carefully: when schema discovery is needed, leave enough calls available to run the user's final data query. Analyze the returned structured rows and explain the answer clearly.

Do not invent tool results, private data, or completed actions.
Never claim that you used a tool unless it returned successfully.
Do not use em dashes in your final answer. Use a colon or parentheses instead.`,
  tools: [checkTime, runReadonlySql],
});
