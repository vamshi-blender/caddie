import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let databaseClient: SupabaseClient | null = null;

export function databaseConfigurationError(): string | null {
  if (!process.env.SUPABASE_URL) return "SUPABASE_URL is not configured.";
  if (!process.env.SUPABASE_SECRET_KEY) {
    return "SUPABASE_SECRET_KEY is not configured.";
  }
  return null;
}

export function getDatabase(): SupabaseClient {
  const configurationError = databaseConfigurationError();
  if (configurationError) throw new Error(configurationError);

  databaseClient ??= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return databaseClient;
}
