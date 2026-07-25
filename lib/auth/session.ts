import "server-only";

import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { databaseConfigurationError } from "@/lib/db/supabase";
import {
  findActiveUserByEmail,
  recordSuccessfulLogin,
  type AppUser,
} from "@/lib/db/users";

const SESSION_COOKIE = "caddie_session";
const SESSION_ISSUER = "caddie";
const SESSION_AUDIENCE = "caddie-web";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const PASSWORD_HASH_BYTES = 64;
const scryptAsync = promisify(scrypt);

export interface AuthSession {
  userId: string;
  email: string;
  sessionId: string;
}

function authSecret(): Uint8Array {
  const secret = process.env.CADDIE_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("CADDIE_AUTH_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export function authConfigurationError(): string | null {
  const databaseError = databaseConfigurationError();
  if (databaseError) return databaseError;
  if (!process.env.CADDIE_AUTH_SECRET || process.env.CADDIE_AUTH_SECRET.length < 32) {
    return "CADDIE_AUTH_SECRET must contain at least 32 characters.";
  }
  return null;
}

async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (expected.length !== PASSWORD_HASH_BYTES) return false;
    const actual = (await scryptAsync(
      password,
      salt,
      PASSWORD_HASH_BYTES,
    )) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AppUser | null> {
  const user = await findActiveUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return null;
  return user;
}

export async function createSession(user: AppUser): Promise<AuthSession> {
  const cookieStore = await cookies();
  const sessionId = crypto.randomUUID();
  const secret = authSecret();

  const sessionToken = await new SignJWT({
    userId: user.id,
    email: user.email,
    sessionId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(user.id)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);

  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  await recordSuccessfulLogin(user.id);
  return { userId: user.id, email: user.email, sessionId };
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, authSecret(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    if (
      typeof payload.userId !== "string" ||
      !payload.userId ||
      typeof payload.email !== "string" ||
      !payload.email ||
      typeof payload.sessionId !== "string" ||
      !payload.sessionId
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      email: payload.email,
      sessionId: payload.sessionId,
    };
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete("caddie_actor");
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Please log in to continue." }, { status: 401 });
}
