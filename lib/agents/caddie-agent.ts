import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { getServerTimeResult } from "./tools/server-time";

export interface ClientToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface CaddieRunContext {
  clientToolResults: Record<string, ClientToolResult>;
}

const serverTimeParameters = z
  .object({
    timeZone: z.string().nullable(),
  })
  .strict();

const getServerTime = tool({
  name: "get_server_time",
  description:
    "Return the current server date and time. Use this whenever the user asks for the current date or time.",
  parameters: serverTimeParameters,
  async execute({ timeZone }) {
    return JSON.stringify(getServerTimeResult({ timeZone }));
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
Use get_server_time for current date or time questions.

Do not invent tool results, private data, or completed actions.
Never claim that you used a tool unless it returned successfully.
Do not use em dashes in your final answer. Use a colon or parentheses instead.`,
  tools: [getServerTime],
});
