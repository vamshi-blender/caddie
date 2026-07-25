import type {
  AgentToolStatus,
  AgentWorkItem,
  AgentWorkLog,
  ChatMessage,
} from "@/components/chat/MessageList";

const DEFAULT_CHAT_TITLE = "New chat";
const MAX_TITLE_LENGTH = 56;
let lastQueuedPayload = "";
let saveQueue: Promise<void> = Promise.resolve();

export type ChatTitleStatus = "pending" | "generated" | "fallback" | "manual";

export interface StoredChat {
  id: string;
  title: string;
  titleStatus: ChatTitleStatus;
  messages: ChatMessage[];
  conversationId: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StoredChatStore {
  activeChatId: string | null;
  chats: StoredChat[];
}

export const EMPTY_CHAT_STORE: StoredChatStore = {
  activeChatId: null,
  chats: [],
};

export function createChatTitle(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return DEFAULT_CHAT_TITLE;
  if (normalized.length <= MAX_TITLE_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

const TOOL_STATUSES = new Set<AgentToolStatus>([
  "running",
  "awaiting_approval",
  "completed",
  "rejected",
  "failed",
]);

function restoreWorkItem(value: unknown): AgentWorkItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<AgentWorkItem>;

  if (
    item.type === "commentary" &&
    typeof item.id === "string" &&
    typeof item.content === "string"
  ) {
    return { id: item.id, type: "commentary", content: item.content };
  }

  if (
    item.type !== "tool" ||
    typeof item.id !== "string" ||
    typeof item.callId !== "string" ||
    typeof item.name !== "string" ||
    (item.executor !== "client" && item.executor !== "server") ||
    !item.arguments ||
    typeof item.arguments !== "object" ||
    Array.isArray(item.arguments) ||
    !item.status ||
    !TOOL_STATUSES.has(item.status) ||
    typeof item.startedAt !== "number"
  ) {
    return null;
  }

  return {
    id: item.id,
    type: "tool",
    callId: item.callId,
    name: item.name,
    executor: item.executor,
    arguments: item.arguments,
    status: item.status,
    ...(typeof item.output === "string" ? { output: item.output } : {}),
    startedAt: item.startedAt,
    ...(typeof item.completedAt === "number"
      ? { completedAt: item.completedAt }
      : {}),
  };
}

function restoreWorkLog(value: unknown): AgentWorkLog | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const work = value as Partial<AgentWorkLog>;
  if (typeof work.startedAt !== "number" || !Array.isArray(work.items)) {
    return undefined;
  }

  return {
    startedAt: work.startedAt,
    ...(typeof work.pausedAt === "number" ? { pausedAt: work.pausedAt } : {}),
    ...(typeof work.completedAt === "number"
      ? { completedAt: work.completedAt }
      : {}),
    items: work.items
      .map(restoreWorkItem)
      .filter((item): item is AgentWorkItem => item !== null),
  };
}

function restoreMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Partial<ChatMessage>;
  if (
    typeof message.id !== "string" ||
    (message.role !== "user" && message.role !== "assistant") ||
    typeof message.content !== "string"
  ) {
    return null;
  }

  const work = restoreWorkLog(message.work);

  if (
    message.role === "assistant" &&
    (message.status === "pending" ||
      message.status === "streaming" ||
      message.status === "approval")
  ) {
    const interruptedAt = Date.now();
    return {
      id: message.id,
      role: "assistant",
      content: message.content,
      status: "error",
      error: "This response was interrupted. Try sending the message again.",
      work: work
        ? {
            ...work,
            completedAt: work.completedAt ?? interruptedAt,
            items: work.items.map((item) =>
              item.type === "tool" &&
              (item.status === "running" || item.status === "awaiting_approval")
                ? { ...item, status: "failed", completedAt: interruptedAt }
                : item,
            ),
          }
        : undefined,
    };
  }

  return { ...(message as ChatMessage), work };
}

function restoreChat(value: unknown): StoredChat | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<StoredChat>;
  if (typeof candidate.id !== "string" || !candidate.id) return null;

  const messages = Array.isArray(candidate.messages)
    ? candidate.messages.map(restoreMessage).filter((item) => item !== null)
    : [];
  const firstUserMessage = messages.find((message) => message.role === "user");
  const now = Date.now();

  return {
    id: candidate.id,
    title:
      typeof candidate.title === "string" && candidate.title.trim()
        ? candidate.title.trim().slice(0, MAX_TITLE_LENGTH)
        : createChatTitle(firstUserMessage?.content ?? ""),
    titleStatus:
      candidate.titleStatus === "pending" ||
      candidate.titleStatus === "generated" ||
      candidate.titleStatus === "fallback" ||
      candidate.titleStatus === "manual"
        ? candidate.titleStatus
        : "fallback",
    messages,
    conversationId:
      typeof candidate.conversationId === "string" && candidate.conversationId
        ? candidate.conversationId
        : null,
    pinned: candidate.pinned === true,
    createdAt:
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : now,
    updatedAt:
      typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
        ? candidate.updatedAt
        : now,
  };
}

function restoreStore(value: unknown): StoredChatStore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<StoredChatStore>;
  if (!Array.isArray(candidate.chats)) return null;

  const seenIds = new Set<string>();
  const chats = candidate.chats
    .map(restoreChat)
    .filter((chat): chat is StoredChat => {
      if (!chat || seenIds.has(chat.id)) return false;
      seenIds.add(chat.id);
      return true;
    });
  const activeChatId =
    typeof candidate.activeChatId === "string" &&
    chats.some((chat) => chat.id === candidate.activeChatId)
      ? candidate.activeChatId
      : null;

  return { activeChatId, chats };
}

export async function loadChatStore(): Promise<StoredChatStore> {
  const response = await fetch("/api/chat-store", { cache: "no-store" });
  if (!response.ok) throw new Error("Chat history could not be loaded.");

  try {
    const parsed: unknown = await response.json();
    const restored = restoreStore(parsed);
    if (restored) {
      lastQueuedPayload = JSON.stringify({
        chats: restored.chats,
      });
      return restored;
    }
  } catch {
    // Fall through to an empty store below.
  }

  return { ...EMPTY_CHAT_STORE };
}

function committedMessages(messages: ChatMessage[]): ChatMessage[] {
  const committed: ChatMessage[] = [];
  let pendingUsers: ChatMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      pendingUsers.push({
        id: message.id,
        role: "user",
        content: message.content,
      });
      continue;
    }

    if (message.status === "done") {
      committed.push(
        ...pendingUsers,
        {
          id: message.id,
          role: "assistant",
          content: message.content,
          status: "done",
          ...(message.work
            ? {
                work: {
                  startedAt: message.work.startedAt,
                  ...(message.work.completedAt
                    ? { completedAt: message.work.completedAt }
                    : {}),
                  items: message.work.items.filter(
                    (item) =>
                      item.type === "commentary" ||
                      item.status === "completed" ||
                      item.status === "rejected" ||
                      item.status === "failed",
                  ),
                },
              }
            : {}),
        },
      );
    }

    pendingUsers = [];
  }

  return committed;
}

function committedChats(store: StoredChatStore): StoredChat[] {
  return store.chats
    .map((chat) => ({
      ...chat,
      messages: committedMessages(chat.messages),
    }))
    .filter(
      (chat): chat is StoredChat & { conversationId: string } =>
        chat.messages.length > 0 && Boolean(chat.conversationId),
    );
}

export function saveChatStore(store: StoredChatStore): Promise<void> {
  const payload = JSON.stringify({ chats: committedChats(store) });
  if (payload === lastQueuedPayload) return saveQueue;
  lastQueuedPayload = payload;

  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const response = await fetch("/api/chat-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!response.ok) {
        if (lastQueuedPayload === payload) lastQueuedPayload = "";
        throw new Error("Chat history could not be saved.");
      }
    });

  return saveQueue;
}
