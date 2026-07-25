import "server-only";

import type {
  AgentToolStatus,
  AgentWorkLog,
  ChatMessage,
  ToolWorkItem,
} from "@/components/chat/MessageList";
import type {
  ChatTitleStatus,
  StoredChat,
  StoredChatStore,
} from "@/lib/chat-storage";
import { getDatabase } from "./supabase";

interface ConversationRow {
  id: string;
  openai_conversation_id: string | null;
  title: string;
  title_status: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sequence_number: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface ToolCallRow {
  id: string;
  message_id: string;
  tool_call_id: string;
  sequence_number: number;
  tool_name: string;
  executor: "client" | "server";
  arguments_json: string;
  output_text: string | null;
  status: "completed" | "rejected" | "failed";
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

function parseToolArguments(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function validTitleStatus(value: string): ChatTitleStatus {
  return value === "pending" ||
    value === "generated" ||
    value === "fallback" ||
    value === "manual"
    ? value
    : "fallback";
}

function restoreWorkLog(
  message: MessageRow,
  tools: ToolCallRow[],
): AgentWorkLog | undefined {
  if (tools.length === 0) return undefined;

  const items: ToolWorkItem[] = tools.map((tool) => ({
    id: tool.id,
    type: "tool",
    callId: tool.tool_call_id,
    name: tool.tool_name,
    executor: tool.executor,
    arguments: parseToolArguments(tool.arguments_json),
    status: tool.status as AgentToolStatus,
    ...(tool.output_text ? { output: tool.output_text } : {}),
    startedAt: Date.parse(tool.started_at ?? tool.created_at),
    ...(tool.completed_at
      ? { completedAt: Date.parse(tool.completed_at) }
      : {}),
  }));

  return {
    startedAt: Math.min(...items.map((item) => item.startedAt)),
    completedAt: Math.max(
      ...items.map((item) => item.completedAt ?? item.startedAt),
    ),
    items,
  };
}

export async function loadStoredChats(userId: string): Promise<StoredChatStore> {
  const database = getDatabase();
  const { data: conversationData, error: conversationError } = await database
    .from("conversations")
    .select(
      "id,openai_conversation_id,title,title_status,is_pinned,created_at,updated_at",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (conversationError) {
    throw new Error(`Could not load conversations: ${conversationError.message}`);
  }

  const conversations = (conversationData ?? []) as ConversationRow[];
  const conversationIds = conversations.map((conversation) => conversation.id);
  if (conversationIds.length === 0) {
    return { activeChatId: null, chats: [] };
  }

  const { data: messageData, error: messageError } = await database
    .from("messages")
    .select("id,conversation_id,sequence_number,role,content,created_at")
    .in("conversation_id", conversationIds)
    .order("sequence_number", { ascending: true });

  if (messageError) {
    throw new Error(`Could not load messages: ${messageError.message}`);
  }

  const messages = (messageData ?? []) as MessageRow[];
  const messageIds = messages.map((message) => message.id);
  let tools: ToolCallRow[] = [];

  if (messageIds.length > 0) {
    const { data: toolData, error: toolError } = await database
      .from("message_tool_calls")
      .select(
        "id,message_id,tool_call_id,sequence_number,tool_name,executor,arguments_json,output_text,status,started_at,completed_at,created_at",
      )
      .in("message_id", messageIds)
      .order("sequence_number", { ascending: true });

    if (toolError) {
      throw new Error(`Could not load tool calls: ${toolError.message}`);
    }
    tools = (toolData ?? []) as ToolCallRow[];
  }

  const toolsByMessage = new Map<string, ToolCallRow[]>();
  for (const tool of tools) {
    const existing = toolsByMessage.get(tool.message_id) ?? [];
    existing.push(tool);
    toolsByMessage.set(tool.message_id, existing);
  }

  const messagesByConversation = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    const chatMessage: ChatMessage = {
      id: message.id,
      role: message.role,
      content: message.content,
      ...(message.role === "assistant"
        ? {
            status: "done" as const,
            work: restoreWorkLog(
              message,
              toolsByMessage.get(message.id) ?? [],
            ),
          }
        : {}),
    };
    const existing = messagesByConversation.get(message.conversation_id) ?? [];
    existing.push(chatMessage);
    messagesByConversation.set(message.conversation_id, existing);
  }

  const chats: StoredChat[] = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    titleStatus: validTitleStatus(conversation.title_status),
    messages: messagesByConversation.get(conversation.id) ?? [],
    conversationId: conversation.openai_conversation_id,
    pinned: conversation.is_pinned,
    createdAt: Date.parse(conversation.created_at),
    updatedAt: Date.parse(conversation.updated_at),
  }));

  return { activeChatId: null, chats };
}

export async function saveStoredChats(
  userId: string,
  chats: StoredChat[],
): Promise<void> {
  if (chats.length === 0) return;

  const database = getDatabase();
  const chatIds = chats.map((chat) => chat.id);
  const { data: existingChats, error: ownershipError } = await database
    .from("conversations")
    .select("id,user_id")
    .in("id", chatIds);

  if (ownershipError) {
    throw new Error(`Could not verify conversations: ${ownershipError.message}`);
  }
  if (
    (existingChats ?? []).some(
      (chat) => (chat.user_id as string) !== userId,
    )
  ) {
    throw new Error("A conversation belongs to a different account.");
  }

  const now = new Date().toISOString();
  const conversationRows = chats.map((chat) => ({
    id: chat.id,
    user_id: userId,
    openai_conversation_id: chat.conversationId,
    title: chat.title || "New chat",
    title_status: chat.titleStatus,
    is_pinned: chat.pinned,
    updated_at: new Date(chat.updatedAt).toISOString(),
  }));
  const { error: conversationError } = await database
    .from("conversations")
    .upsert(conversationRows, { onConflict: "id" });

  if (conversationError) {
    throw new Error(`Could not save conversations: ${conversationError.message}`);
  }

  const messageRows = chats.flatMap((chat) =>
    chat.messages.map((message, sequenceNumber) => ({
      id: message.id,
      conversation_id: chat.id,
      sequence_number: sequenceNumber,
      role: message.role,
      content: message.content,
    })),
  );
  if (messageRows.length > 0) {
    const { error: messageError } = await database
      .from("messages")
      .upsert(messageRows, { onConflict: "id" });
    if (messageError) {
      throw new Error(`Could not save messages: ${messageError.message}`);
    }
  }

  const toolRows = chats.flatMap((chat) =>
    chat.messages.flatMap((message) =>
      (message.work?.items ?? [])
        .map((item, sequenceNumber) => ({ item, sequenceNumber }))
        .filter(
          ({ item }) =>
            item.type === "tool" &&
            (item.status === "completed" ||
              item.status === "rejected" ||
              item.status === "failed"),
        )
        .map(({ item, sequenceNumber }) => {
          const tool = item as ToolWorkItem;
          return {
            message_id: message.id,
            tool_call_id: tool.callId,
            sequence_number: sequenceNumber,
            tool_name: tool.name,
            executor: tool.executor,
            arguments_json: JSON.stringify(tool.arguments),
            output_text: tool.output ?? null,
            status: tool.status,
            approval_status:
              tool.status === "rejected" ? "rejected" : "not_required",
            started_at: new Date(tool.startedAt).toISOString(),
            completed_at: tool.completedAt
              ? new Date(tool.completedAt).toISOString()
              : now,
          };
        }),
    ),
  );

  if (toolRows.length > 0) {
    const { error: toolError } = await database
      .from("message_tool_calls")
      .upsert(toolRows, { onConflict: "message_id,tool_call_id" });
    if (toolError) {
      throw new Error(`Could not save tool calls: ${toolError.message}`);
    }
  }
}
