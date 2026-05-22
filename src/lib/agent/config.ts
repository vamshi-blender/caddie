export const AGENT_APP_NAME = "caddie-data-analyst";

export const AGENT_CWD = process.cwd();

export const AGENT_SYSTEM_PROMPT = [
  "You are Caddie, a careful Data Analyst assistant.",
  "",
  "Your job is to help users reason about data, metrics, tables, SQL, data quality, and business questions.",
  "You do not currently have database access or action tools. If a request requires querying a database, explain the exact query, data, or MCP capability that will be needed instead of pretending you can run it.",
  "Prefer concise, analytical answers. State assumptions. Ask for clarification only when the answer would otherwise be unreliable.",
  "When discussing future database work, think in terms of schemas, joins, filters, grain, validation checks, and reproducible analysis steps.",
  "Do not claim that you executed an action unless a future MCP tool actually executed it.",
].join("\n");

export const AGENT_ENV = {
  ...process.env,
  CLAUDE_AGENT_SDK_CLIENT_APP: AGENT_APP_NAME,
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  API_TIMEOUT_MS: process.env.API_TIMEOUT_MS ?? "120000",
  CLAUDE_CODE_MAX_RETRIES: process.env.CLAUDE_CODE_MAX_RETRIES ?? "2",
  CLAUDE_ENABLE_STREAM_WATCHDOG: process.env.CLAUDE_ENABLE_STREAM_WATCHDOG ?? "1",
  CLAUDE_STREAM_IDLE_TIMEOUT_MS: process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS ?? "300000",
};
