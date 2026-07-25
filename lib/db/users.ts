import "server-only";

import { getDatabase } from "./supabase";

export interface AppUser {
  id: string;
  email: string;
  passwordHash: string;
}

export async function findActiveUserByEmail(
  email: string,
): Promise<AppUser | null> {
  const { data, error } = await getDatabase()
    .from("app_users")
    .select("id,email,password_hash")
    .eq("email", email.trim().toLowerCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`Could not read the login account: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id as string,
    email: data.email as string,
    passwordHash: data.password_hash as string,
  };
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getDatabase()
    .from("app_users")
    .update({ last_login_at: now, updated_at: now })
    .eq("id", userId);

  if (error) throw new Error(`Could not update the login account: ${error.message}`);
}
