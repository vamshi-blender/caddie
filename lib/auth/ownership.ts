import "server-only";

interface ConversationOwnershipStore {
  owners: Map<string, string>;
}

declare global {
  var __caddieConversationOwnership: ConversationOwnershipStore | undefined;
}

// Development implementation. Replace this with a durable shared store before
// deploying across multiple processes or serverless instances.
const store =
  globalThis.__caddieConversationOwnership ?? {
    owners: new Map<string, string>(),
  };

globalThis.__caddieConversationOwnership = store;

import { getDatabase } from "@/lib/db/supabase";

export function registerConversationOwner(
  conversationId: string,
  userId: string,
): void {
  store.owners.set(conversationId, userId);
}

export async function isConversationOwner(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  if (store.owners.get(conversationId) === userId) return true;

  const { data, error } = await getDatabase()
    .from("conversations")
    .select("id")
    .eq("openai_conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Could not verify conversation: ${error.message}`);
  return Boolean(data);
}

export async function removeConversationOwner(
  conversationId: string,
  userId: string,
): Promise<void> {
  if (store.owners.get(conversationId) === userId) {
    store.owners.delete(conversationId);
  }

  const { error } = await getDatabase()
    .from("conversations")
    .delete()
    .eq("openai_conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw new Error(`Could not delete conversation: ${error.message}`);
}
