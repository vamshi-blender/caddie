import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

const ENCRYPTION_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export const oracleConfigInputSchema = z
  .object({
    user: z.string().trim().min(1).max(128),
    password: z.string().max(512),
    dsn: z.string().trim().min(1).max(4_000),
  })
  .strict();

export type OracleDatabaseConfig = z.infer<typeof oracleConfigInputSchema>;

function encryptionKey(): Buffer {
  const encoded = process.env.CADDIE_DB_CONFIG_KEY;
  if (!encoded) {
    throw new Error("CADDIE_DB_CONFIG_KEY is not configured.");
  }

  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) {
    throw new Error(
      "CADDIE_DB_CONFIG_KEY must be a base64url-encoded 32-byte key.",
    );
  }

  return key;
}

export function databaseEncryptionConfigurationError(): string | null {
  try {
    encryptionKey();
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "CADDIE_DB_CONFIG_KEY is invalid.";
  }
}

export function encryptOracleConfig(config: OracleDatabaseConfig): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptOracleConfig(ciphertext: string): OracleDatabaseConfig {
  const [version, ivValue, tagValue, encryptedValue] = ciphertext.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    !tagValue ||
    !encryptedValue
  ) {
    throw new Error("The saved database configuration is invalid.");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey(),
      Buffer.from(ivValue, "base64url"),
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]);
    return oracleConfigInputSchema.parse(
      JSON.parse(decrypted.toString("utf8")) as unknown,
    );
  } catch {
    throw new Error("The saved database configuration could not be decrypted.");
  }
}
