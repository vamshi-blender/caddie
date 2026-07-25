import "server-only";

import { createHash } from "node:crypto";
import oracledb, {
  type Connection,
  type Metadata,
  type Pool,
  type ResultSet,
} from "oracledb";
import { getActiveDatabaseConfig, type ActiveDatabaseConfig } from "@/lib/db/database-config";
import { recordQueryAudit, type QueryAuditEntry } from "@/lib/db/query-audit";
import type { OracleDatabaseConfig } from "./config";
import { SqlSafetyError, validateReadonlySql } from "./sql-safety";

const QUERY_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_ROWS = 200;
const HARD_MAX_ROWS = 1_000;
const MAX_CELL_CHARACTERS = 10_000;
const SENSITIVE_COLUMN_PATTERN =
  /(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|SSN|AADHAAR|CREDIT_?CARD|CVV)/i;

interface PoolState {
  version: string;
  pool: Pool;
}

interface OraclePoolGlobal {
  state: PoolState | null;
  transition: Promise<PoolState> | null;
}

const oraclePoolGlobal = globalThis as typeof globalThis & {
  __caddieOraclePool?: OraclePoolGlobal;
};

const poolGlobal =
  oraclePoolGlobal.__caddieOraclePool ??
  (oraclePoolGlobal.__caddieOraclePool = {
    state: null,
    transition: null,
  });

export interface ReadonlyQueryRequest {
  sql: string;
  binds?: Record<string, string | number | null>;
  maxRows?: number | null;
  userId: string;
  conversationId: string;
}

export interface ReadonlyQueryResult {
  ok: boolean;
  columns?: Array<{
    name: string;
    oracleType: string;
    nullable?: boolean;
    precision?: number;
    scale?: number;
    redacted: boolean;
  }>;
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
  truncated?: boolean;
  durationMs: number;
  error?: string;
  errorCode?: string;
}

function poolMaximum(): number {
  const parsed = Number.parseInt(process.env.ORACLE_POOL_MAX ?? "4", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 4;
}

async function createPool(active: ActiveDatabaseConfig): Promise<PoolState> {
  const pool = await oracledb.createPool({
    user: active.config.user,
    password: active.config.password,
    connectString: active.config.dsn,
    poolMin: 0,
    poolMax: poolMaximum(),
    poolIncrement: 1,
    poolTimeout: 60,
    queueTimeout: 5_000,
    connectTimeout: 10_000,
    stmtCacheSize: 30,
  });
  return { version: active.version, pool };
}

async function getPool(active: ActiveDatabaseConfig): Promise<Pool> {
  if (poolGlobal.state?.version === active.version) {
    return poolGlobal.state.pool;
  }

  if (poolGlobal.transition) {
    const transitioned = await poolGlobal.transition;
    if (transitioned.version === active.version) return transitioned.pool;
  }

  const previous = poolGlobal.state;
  poolGlobal.transition = createPool(active);

  try {
    const next = await poolGlobal.transition;
    poolGlobal.state = next;
    if (previous && previous.version !== next.version) {
      void previous.pool.close(10).catch((error) => {
        console.error("Failed to retire the previous Oracle pool", error);
      });
    }
    return next.pool;
  } finally {
    poolGlobal.transition = null;
  }
}

export async function activateDatabaseConfig(
  active: ActiveDatabaseConfig,
): Promise<void> {
  await getPool(active);
}

function publicOracleError(error: unknown): {
  message: string;
  code?: string;
  timedOut: boolean;
} {
  if (!(error instanceof Error)) {
    return { message: "The Oracle operation failed.", timedOut: false };
  }

  const codeMatch = error.message.match(/\b(?:ORA|NJS|DPI)-\d+\b/);
  const code = codeMatch?.[0];
  const timedOut =
    code === "NJS-040" ||
    code === "NJS-106" ||
    /timeout|timed out/i.test(error.message);

  return {
    message: error.message
      .replace(/\s+/g, " ")
      .replace(/password\s*=\s*\S+/gi, "password=[hidden]")
      .slice(0, 500),
    ...(code ? { code } : {}),
    timedOut,
  };
}

async function connectForTest(config: OracleDatabaseConfig): Promise<Connection> {
  return oracledb.getConnection({
    user: config.user,
    password: config.password,
    connectString: config.dsn,
    connectTimeout: 10_000,
  });
}

export async function testOracleConnection(
  config: OracleDatabaseConfig,
): Promise<{ ok: true; databaseName?: string }> {
  let connection: Connection | null = null;
  try {
    connection = await connectForTest(config);
    connection.callTimeout = 10_000;
    const result = await connection.execute<{ DATABASE_NAME: string }>(
      "select sys_context('USERENV', 'DB_NAME') as database_name from dual",
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 1 },
    );
    return {
      ok: true,
      databaseName: result.rows?.[0]?.DATABASE_NAME,
    };
  } catch (error) {
    const publicError = publicOracleError(error);
    throw new Error(publicError.message);
  } finally {
    await connection?.close().catch(() => undefined);
  }
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) {
    return `[binary value: ${value.byteLength} bytes]`;
  }
  if (typeof value === "string") {
    return value.length > MAX_CELL_CHARACTERS
      ? `${value.slice(0, MAX_CELL_CHARACTERS)}…`
      : value;
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeValue(item)]),
    );
  }
  return value;
}

function columnDescription(metadata: Metadata<Record<string, unknown>>) {
  return {
    name: metadata.name,
    oracleType: metadata.dbTypeName ?? metadata.dbType?.name ?? "UNKNOWN",
    ...(metadata.nullable === undefined ? {} : { nullable: metadata.nullable }),
    ...(metadata.precision === undefined ? {} : { precision: metadata.precision }),
    ...(metadata.scale === undefined ? {} : { scale: metadata.scale }),
    redacted: SENSITIVE_COLUMN_PATTERN.test(metadata.name),
  };
}

async function fetchRows(
  resultSet: ResultSet<Record<string, unknown>>,
  maxRows: number,
): Promise<{
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
}> {
  const fetched = await resultSet.getRows(maxRows + 1);
  const truncated = fetched.length > maxRows;
  return {
    rows: fetched.slice(0, maxRows),
    truncated,
  };
}

export async function executeReadonlySql(
  request: ReadonlyQueryRequest,
): Promise<ReadonlyQueryResult> {
  const startedAt = performance.now();
  const sqlHash = createHash("sha256").update(request.sql).digest("hex");
  const active = await getActiveDatabaseConfig();
  if (!active) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: "No Oracle database has been configured. Add it in Settings first.",
      errorCode: "database_not_configured",
    };
  }

  let referencedObjects: string[] = [];
  let auditOutcome: QueryAuditEntry["outcome"] = "failed";
  let auditRowCount = 0;
  let auditErrorCode: string | undefined;
  let connection: Connection | null = null;
  let resultSet: ResultSet<Record<string, unknown>> | null = null;

  try {
    const validated = validateReadonlySql(request.sql);
    referencedObjects = validated.referencedObjects;
    const maxRows = Math.min(
      HARD_MAX_ROWS,
      Math.max(1, request.maxRows ?? DEFAULT_MAX_ROWS),
    );

    connection = await (await getPool(active)).getConnection();
    connection.callTimeout = QUERY_TIMEOUT_MS;
    connection.clientId = request.userId.slice(0, 64);
    connection.clientInfo = `caddie:${request.conversationId}`.slice(0, 64);
    connection.action = "run_readonly_sql";

    const result = await connection.execute<Record<string, unknown>>(
      validated.sql,
      request.binds ?? {},
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        resultSet: true,
        fetchArraySize: maxRows + 1,
      },
    );
    resultSet = result.resultSet ?? null;
    if (!resultSet) throw new Error("Oracle did not return a query result.");

    const columns = (result.metaData ?? resultSet.metaData).map(columnDescription);
    const sensitiveColumns = new Set(
      columns.filter((column) => column.redacted).map((column) => column.name),
    );
    const fetched = await fetchRows(resultSet, maxRows);
    const rows = fetched.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          sensitiveColumns.has(key) ? "[redacted]" : serializeValue(value),
        ]),
      ),
    );

    auditOutcome = "succeeded";
    auditRowCount = rows.length;
    return {
      ok: true,
      columns,
      rows,
      rowCount: rows.length,
      truncated: fetched.truncated,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    if (error instanceof SqlSafetyError) {
      auditOutcome = "blocked";
      auditErrorCode = "read_only_violation";
      return {
        ok: false,
        durationMs: Math.round(performance.now() - startedAt),
        error: error.message,
        errorCode: auditErrorCode,
      };
    }

    const publicError = publicOracleError(error);
    auditOutcome = publicError.timedOut ? "timed_out" : "failed";
    auditErrorCode = publicError.code ?? (publicError.timedOut ? "timeout" : "oracle_error");
    return {
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      error: publicError.message,
      errorCode: auditErrorCode,
    };
  } finally {
    await resultSet?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
    await recordQueryAudit({
      userId: request.userId,
      conversationId: request.conversationId,
      configVersion: active.version,
      sqlHash,
      referencedObjects,
      durationMs: performance.now() - startedAt,
      rowCount: auditRowCount,
      outcome: auditOutcome,
      ...(auditErrorCode ? { errorCode: auditErrorCode } : {}),
    });
  }
}
