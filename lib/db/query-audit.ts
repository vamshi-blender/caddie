import "server-only";

import { getDatabase } from "./supabase";

export interface QueryAuditEntry {
  userId: string;
  conversationId: string;
  configVersion: string;
  sqlHash: string;
  referencedObjects: string[];
  durationMs: number;
  rowCount: number;
  outcome: "succeeded" | "blocked" | "failed" | "timed_out";
  errorCode?: string;
}

export async function recordQueryAudit(entry: QueryAuditEntry): Promise<void> {
  const { error } = await getDatabase().from("database_query_audit").insert({
    user_id: entry.userId,
    conversation_id: entry.conversationId,
    config_version: entry.configVersion,
    sql_hash: entry.sqlHash,
    referenced_objects: entry.referencedObjects,
    duration_ms: Math.max(0, Math.round(entry.durationMs)),
    row_count: Math.max(0, entry.rowCount),
    outcome: entry.outcome,
    error_code: entry.errorCode ?? null,
  });

  if (error) {
    console.error("Failed to record Oracle query audit", error.message);
  }
}
