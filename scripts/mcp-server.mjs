import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const mcpOracleScript = path.join(__dirname, "mcp_oracle_exec.py");
const dataTablesDir = path.join(repoRoot, ".agent-data", "data-tables");

const port = Number.parseInt(process.env.MCP_PORT ?? "8787", 10);
const publicUrl =
  process.env.MCP_PUBLIC_URL ??
  "https://unstreamlined-hidebound-daniell.ngrok-free.dev/mcp";

const titleSchema = z
  .string()
  .trim()
  .min(1)
  .describe("Short query title. Recommended 3 words, preferably 5 words or fewer.");

const timingSchema = z.object({
  connect_ms: z.number().nullable(),
  execute_ms: z.number().nullable(),
  fetch_ms: z.number().nullable(),
  total_ms: z.number(),
});

const sqlResultOutputSchema = {
  title: z.string(),
  ok: z.boolean(),
  sql_text: z.string().optional(),
  columns: z
    .array(
      z.object({
        name: z.string(),
        oracle_type: z.string(),
        display_size: z.number().nullable(),
        internal_size: z.number().nullable(),
        precision: z.number().nullable(),
        scale: z.number().nullable(),
        nullable: z.boolean().nullable(),
      }),
    )
    .optional(),
  rows: z.array(z.record(z.string(), z.any())).optional(),
  row_count: z.number().optional(),
  has_rows: z.boolean().optional(),
  truncated: z.boolean().optional(),
  timings: timingSchema.optional(),
  error: z
    .object({
      error_type: z.string(),
      message: z.string().optional(),
      oracle_code: z.number().nullable().optional(),
      oracle_message: z.string().optional(),
      oracle_context: z.string().nullable().optional(),
      sql_text: z.string().nullable().optional(),
    })
    .optional(),
  raw: z
    .object({
      exit_code: z.number(),
      stdout: z.string(),
      stderr: z.string(),
    })
    .optional(),
};

const tableArtifactOutputSchema = {
  title: z.string(),
  ok: z.boolean(),
  sql_text: z.string().optional(),
  table: z
    .object({
      id: z.string(),
      title: z.string(),
      row_count: z.number(),
      column_count: z.number(),
      truncated: z.boolean(),
      data_url: z.string(),
    })
    .optional(),
  timings: timingSchema.optional(),
  error: sqlResultOutputSchema.error,
};

function formatToolMessage(response) {
  if (!response.ok) {
    const error = response.error ?? {};
    const oraclePrefix =
      error.oracle_code === undefined || error.oracle_code === null
        ? ""
        : `ORA-${String(error.oracle_code).padStart(5, "0")}: `;
    const message = error.oracle_message ?? error.message ?? "Query failed.";
    const timing = response.timings?.total_ms;
    return [
      `Title: ${response.title}`,
      `Status: Failed`,
      `Error: ${oraclePrefix}${message}`,
      timing === undefined ? null : `Total: ${timing} ms`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const timing = response.timings?.total_ms;
  return [
    `Title: ${response.title}`,
    `Status: Completed`,
    `Rows: ${response.row_count ?? 0}`,
    `Columns: ${response.columns?.length ?? 0}`,
    timing === undefined ? null : `Total: ${timing} ms`,
  ]
    .filter(Boolean)
    .join("\n");
}

function runSql(sqlQuery, maxRows) {
  return new Promise((resolve) => {
    const args = [mcpOracleScript];

    if (maxRows !== undefined) {
      args.push("--max-rows", String(maxRows));
    }

    const child = spawn(
      "python",
      args,
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

function parseSqlResult(result, sqlQuery) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    return {
      ok: false,
      error: {
        error_type: "mcp_result_parse_error",
        message: error instanceof Error ? error.message : String(error),
        sql_text: sqlQuery,
      },
      raw: {
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    };
  }
}

async function saveDataTable({ title, sqlQuery, payload, maxRows }) {
  const id = randomUUID();
  const filePath = path.join(dataTablesDir, `${id}.json`);
  const rowCount = payload.row_count ?? payload.rows?.length ?? 0;
  const columnCount = payload.columns?.length ?? 0;
  const truncated = Boolean(payload.truncated);

  const table = {
    id,
    title,
    sql_text: sqlQuery,
    columns: payload.columns ?? [],
    rows: payload.rows ?? [],
    row_count: rowCount,
    column_count: columnCount,
    truncated,
    max_rows: maxRows,
    created_at: new Date().toISOString(),
  };

  await mkdir(dataTablesDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(table)}\n`, "utf8");

  return {
    id,
    title,
    row_count: rowCount,
    column_count: columnCount,
    truncated,
    data_url: `/api/data-tables/${id}`,
  };
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
        "Runs a SQL query against the configured local Oracle database and returns structured JSON rows, metadata, errors, and timings.",
      inputSchema: {
        title: titleSchema.describe(
          "Short UI title for non-technical users. Recommended 2-3 words, preferably 5 words or fewer. Examples: Looking Customer Data, Exploring Database.",
        ),
        sql_query: z.string().min(1).describe("SQL query to run."),
      },
      outputSchema: sqlResultOutputSchema,
    },
    async ({ title, sql_query }) => {
      const result = await runSql(sql_query);
      const payload = parseSqlResult(result, sql_query);
      const response = {
        title,
        ...payload,
      };

      return {
        content: [
          {
            type: "text",
            text: formatToolMessage(response),
          },
        ],
        isError: !payload.ok,
        structuredContent: response,
      };
    },
  );

  server.registerTool(
    "create_sql_table",
    {
      title: "Create SQL Table",
      description:
        "Runs a read-only SQL query against the configured local Oracle database, stores the returned rows as a UI-renderable table artifact, and returns only table metadata so large row sets do not consume assistant response tokens.",
      inputSchema: {
        title: titleSchema.describe(
          "Short table title for users. Recommended 2-5 words. Examples: Recent Payments, Division Summary.",
        ),
        sql_query: z.string().min(1).describe("Read-only SQL query to run for the table."),
        max_rows: z
          .number()
          .int()
          .min(1)
          .max(10000)
          .optional()
          .describe("Maximum rows to fetch and store. Defaults to 1000; hard limit is 10000."),
      },
      outputSchema: tableArtifactOutputSchema,
    },
    async ({ title, sql_query, max_rows }) => {
      const rowLimit = max_rows ?? 1000;
      const result = await runSql(sql_query, rowLimit);
      const payload = parseSqlResult(result, sql_query);

      if (!payload.ok) {
        const response = {
          title,
          ...payload,
        };

        return {
          content: [
            {
              type: "text",
              text: formatToolMessage(response),
            },
          ],
          isError: true,
          structuredContent: response,
        };
      }

      const table = await saveDataTable({
        title,
        sqlQuery: payload.sql_text ?? sql_query,
        payload,
        maxRows: rowLimit,
      });
      const response = {
        title,
        ok: true,
        sql_text: payload.sql_text,
        table,
        timings: payload.timings,
      };

      return {
        content: [
          {
            type: "text",
            text: [
              `Title: ${title}`,
              "Status: Table ready",
              `Rows: ${table.row_count}${table.truncated ? ` (limited to ${rowLimit})` : ""}`,
              `Columns: ${table.column_count}`,
              `Table: ${table.data_url}`,
              payload.timings?.total_ms === undefined ? null : `Total: ${payload.timings.total_ms} ms`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        structuredContent: response,
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
