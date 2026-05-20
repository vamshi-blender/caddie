import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const oqScript = path.join(__dirname, "oq.ps1");

const port = Number.parseInt(process.env.MCP_PORT ?? "8787", 10);
const publicUrl =
  process.env.MCP_PUBLIC_URL ??
  "https://unstreamlined-hidebound-daniell.ngrok-free.dev/mcp";

const titleSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.split(/\s+/).filter(Boolean).length <= 5, {
    message: "Use a short title, maximum 5 words.",
  })
  .describe("Short query title. Recommended 3 words, maximum 5 words.");

function runSql(sqlQuery) {
  return new Promise((resolve) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", oqScript],
      {
        cwd: repoRoot,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${error.message}`,
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });

    child.stdin.end(sqlQuery);
  });
}

function createServer() {
  const server = new McpServer({
    name: "caddie-sql-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "run_sql_query",
    {
      title: "Run SQL Query",
      description:
        "Runs a SQL query against the configured local Oracle database and returns the raw result.",
      inputSchema: {
        description: titleSchema,
        sql_query: z.string().min(1).describe("SQL query to run."),
      },
    },
    async ({ description, sql_query }) => {
      const result = await runSql(sql_query);
      const output = [result.stdout.trimEnd(), result.stderr.trimEnd()]
        .filter(Boolean)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text:
              output ||
              `Query completed with exit code ${result.exitCode} and no output.`,
          },
        ],
        isError: result.exitCode !== 0,
        structuredContent: {
          description,
          exit_code: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    },
  );

  return server;
}

const app = createMcpExpressApp({ host: "0.0.0.0" });

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mcp_endpoint: "/mcp",
    public_url: publicUrl,
  });
});

app.post("/mcp", async (req, res) => {
  const server = createServer();

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    }),
  );
});

app.delete("/mcp", (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    }),
  );
});

app.listen(port, (error) => {
  if (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }

  console.log(`Caddie MCP server listening at http://localhost:${port}/mcp`);
  console.log(`Expected public MCP URL: ${publicUrl}`);
});
