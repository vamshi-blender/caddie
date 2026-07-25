import { z } from "zod";
import {
  authConfigurationError,
  createSession,
  verifyCredentials,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(1_000),
  })
  .strict();

export async function POST(request: Request) {
  const configurationError = authConfigurationError();
  if (configurationError) {
    console.error(configurationError);
    return Response.json(
      { error: "Login is not configured yet." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid login request." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "The email or password is incorrect." },
      { status: 401 },
    );
  }

  let user;
  try {
    user = await verifyCredentials(parsed.data.email, parsed.data.password);
  } catch (error) {
    console.error("Could not verify login credentials", error);
    return Response.json(
      { error: "Login is temporarily unavailable." },
      { status: 503 },
    );
  }

  if (!user) {
    return Response.json(
      { error: "The email or password is incorrect." },
      { status: 401 },
    );
  }

  try {
    await createSession(user);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Could not create login session", error);
    return Response.json(
      { error: "Login is temporarily unavailable." },
      { status: 503 },
    );
  }
}
