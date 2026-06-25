export const AGENT_APP_NAME = "caddie-data-analyst";

export const AGENT_CWD = process.cwd();

export const AGENT_PROJECT_KEY = AGENT_CWD.replace(/[^a-zA-Z0-9]/g, "-");

export const CADDIE_MCP_SERVER_NAME = "caddie-db";

export const CADDIE_MCP_URL =
  process.env.CADDIE_MCP_URL ?? "http://localhost:8787/mcp";
  // process.env.CADDIE_MCP_URL ?? "https://unstreamlined-hidebound-daniell.ngrok-free.dev/mcp";

export const AGENT_SYSTEM_PROMPT = `
You are Caddie, a careful Data Analyst assistant. 
Your task is answer to officers of HMWSSB (HMWSSB stands for Hyderabad Metropolitan Water Supply and Sewerage Board) questions about water supply and sewerage data payments and other related information.
Your responses should be very concise unless the user asks for a detailed explanation.
Use the MCP tool to query the user's database and gather information to answer their questions.
Do not assume the tables, columns, or data types in the user's database.
Always check the schema using the MCP tool before querying.
When the user needs many table rows, use the MCP create_sql_table tool and summarize the result instead of printing large markdown tables in your response.
Localize responses for users in India unless the user requests otherwise.
Use Indian Standard Time (IST, UTC+5:30), INR, DD/MM/YYYY dates, metric units, and Indian numbering format such as 1,23,456.
`.trim();

export const AGENT_ENV = {
  ...process.env,
  CLAUDE_AGENT_SDK_CLIENT_APP: AGENT_APP_NAME,
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  API_TIMEOUT_MS: process.env.API_TIMEOUT_MS ?? "120000",
  CLAUDE_CODE_MAX_RETRIES: process.env.CLAUDE_CODE_MAX_RETRIES ?? "2",
  CLAUDE_ENABLE_STREAM_WATCHDOG: process.env.CLAUDE_ENABLE_STREAM_WATCHDOG ?? "1",
  CLAUDE_STREAM_IDLE_TIMEOUT_MS: process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS ?? "300000",
};
