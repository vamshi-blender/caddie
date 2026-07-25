import { z } from "zod";
import {
  getActiveDatabaseConfig,
  saveActiveDatabaseConfig,
} from "@/lib/db/database-config";
import {
  databaseEncryptionConfigurationError,
  oracleConfigInputSchema,
} from "@/lib/oracle/config";
import {
  activateDatabaseConfig,
  testOracleConnection,
} from "@/lib/oracle/service";
import {
  getCurrentSession,
  unauthorizedResponse,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const saveRequestSchema = oracleConfigInputSchema.extend({
  password: z.string().max(512),
});

function configurationUnavailable(): Response | null {
  const error = databaseEncryptionConfigurationError();
  return error ? Response.json({ error }, { status: 503 }) : null;
}

function publicError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The database configuration operation failed.";
}

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return unauthorizedResponse();

  const unavailable = configurationUnavailable();
  if (unavailable) return unavailable;

  try {
    const active = await getActiveDatabaseConfig();
    if (!active) return Response.json({ configured: false });

    return Response.json({
      configured: true,
      user: active.config.user,
      dsn: active.config.dsn,
      passwordConfigured: Boolean(active.config.password),
      updatedAt: active.updatedAt,
    });
  } catch (error) {
    console.error("Failed to load Oracle settings", error);
    return Response.json({ error: publicError(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getCurrentSession();
  if (!session) return unauthorizedResponse();

  const unavailable = configurationUnavailable();
  if (unavailable) return unavailable;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = saveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Username and connection string are required." },
      { status: 400 },
    );
  }

  try {
    const existing = await getActiveDatabaseConfig();
    const password = parsed.data.password || existing?.config.password || "";
    if (!password) {
      return Response.json({ error: "A database password is required." }, { status: 400 });
    }

    const config = {
      user: parsed.data.user,
      password,
      dsn: parsed.data.dsn,
    };

    const test = await testOracleConnection(config);
    const saved = await saveActiveDatabaseConfig(config, session.userId);

    try {
      await activateDatabaseConfig(saved);
    } catch (error) {
      // The tested settings are safely persisted. A later query will retry pool
      // creation if this instance experienced a transient failure.
      console.error("Failed to warm the updated Oracle pool", error);
    }

    return Response.json({
      ok: true,
      configured: true,
      user: saved.config.user,
      dsn: saved.config.dsn,
      passwordConfigured: true,
      updatedAt: saved.updatedAt,
      databaseName: test.databaseName,
    });
  } catch (error) {
    console.error("Failed to save Oracle settings", error);
    return Response.json({ error: publicError(error) }, { status: 400 });
  }
}
