import { getActiveDatabaseConfig } from "@/lib/db/database-config";
import {
  databaseEncryptionConfigurationError,
  oracleConfigInputSchema,
} from "@/lib/oracle/config";
import { testOracleConnection } from "@/lib/oracle/service";
import {
  getCurrentSession,
  unauthorizedResponse,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return unauthorizedResponse();

  const configurationError = databaseEncryptionConfigurationError();
  if (configurationError) {
    return Response.json({ error: configurationError }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = oracleConfigInputSchema.safeParse(body);
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

    const result = await testOracleConnection({
      ...parsed.data,
      password,
    });
    return Response.json(result);
  } catch (error) {
    console.error("Oracle connection test failed", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The Oracle connection test failed.",
      },
      { status: 400 },
    );
  }
}
