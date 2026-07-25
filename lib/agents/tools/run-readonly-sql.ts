import { tool } from "@openai/agents";
import { z } from "zod";
import { executeReadonlySql } from "@/lib/oracle/service";
import type { CaddieRunContext } from "../caddie-agent";

export const MAX_SQL_CALLS_PER_RESPONSE = 10;

const sqlParameters = z
  .object({
    purpose: z.string().trim().min(1).max(300),
    sql: z.string().trim().min(1).max(50_000),
    binds: z
      .array(
        z
          .object({
            name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
            value: z.union([z.string(), z.number(), z.null()]),
          })
          .strict(),
      )
      .nullable(),
    maxRows: z.number().int().min(1).max(1_000).nullable(),
  })
  .strict();

export const runReadonlySql = tool<typeof sqlParameters, CaddieRunContext>({
  name: "run_readonly_sql",
  description:
    "Run one read-only Oracle SELECT query against the shared database configured in Settings and return structured rows. Use Oracle data dictionary SELECT queries through this same tool when schema details are needed.",
  parameters: sqlParameters,
  timeoutMs: 120_000,
  timeoutBehavior: "error_as_result",
  isEnabled: ({ runContext }) =>
    runContext.context.sqlCallsUsed < MAX_SQL_CALLS_PER_RESPONSE,
  async execute({ sql, binds, maxRows }, runContext) {
    if (!runContext) {
      return JSON.stringify({
        ok: false,
        error: "The SQL tool is missing its server context.",
      });
    }

    const context = runContext.context;
    if (context.sqlCallsUsed >= MAX_SQL_CALLS_PER_RESPONSE) {
      return JSON.stringify({
        ok: false,
        error: "The SQL query limit has been reached for this response.",
      });
    }

    // Increment before awaiting so parallel calls cannot exceed the limit.
    context.sqlCallsUsed += 1;

    const result = await executeReadonlySql({
      sql,
      binds: Object.fromEntries(
        (binds ?? []).map((bind) => [bind.name, bind.value]),
      ),
      maxRows,
      userId: context.userId,
      conversationId: context.conversationId,
    });
    return JSON.stringify(result);
  },
});
