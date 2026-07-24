"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MenuTwoLineIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import Sidebar, { type SidebarChat } from "./Sidebar";
import Composer from "./Composer";
import Greeting from "./Greeting";
import MessageList, {
  type AgentWorkLog,
  type ChatMessage,
  type ToolWorkItem,
} from "./MessageList";
import {
  deleteConversation,
  generateConversationTitle,
  resumeChat,
  streamChat,
} from "@/lib/api/chat-client";
import { createChatSearcher } from "@/lib/chat-search";
import type { ToolApprovalRequest, ChatStreamEvent } from "@/lib/agents/protocol";
import {
  createChatTitle,
  EMPTY_CHAT_STORE,
  loadChatStore,
  saveChatStore,
  type StoredChat,
  type StoredChatStore,
} from "@/lib/chat-storage";
import "./ChatLayout.css";

const EMPTY_MESSAGES: ChatMessage[] = [];
const DEFAULT_USER_NAME = "there";

// Tool names that should execute silently (no approval card, the run resumes
// automatically) once client-executed tools exist. Empty for now.
const AUTO_EXECUTED_TOOLS = new Set<string>([]);

function getWorkLog(message: ChatMessage, startedAt = Date.now()): AgentWorkLog {
  return message.work ?? { startedAt, items: [] };
}

function setToolStatus(
  message: ChatMessage,
  callId: string,
  status: ToolWorkItem["status"],
  completedAt?: number,
): ChatMessage {
  if (!message.work) return message;
  let found = false;
  const items = message.work.items.map((item) => {
    if (item.type !== "tool" || item.callId !== callId) return item;
    found = true;
    return {
      ...item,
      status,
      ...(completedAt ? { completedAt } : {}),
    };
  });

  return found ? { ...message, work: { ...message.work, items } } : message;
}

function resumeWorkClock(message: ChatMessage, resumedAt = Date.now()): ChatMessage {
  if (!message.work?.pausedAt) return message;
  const pausedDuration = Math.max(0, resumedAt - message.work.pausedAt);
  return {
    ...message,
    work: {
      ...message.work,
      startedAt: message.work.startedAt + pausedDuration,
      pausedAt: undefined,
    },
  };
}

export default function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatStore, setChatStore] = useState<StoredChatStore>(EMPTY_CHAT_STORE);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  // A silent tool request captured mid-stream; consumed (execute + resume)
  // as soon as the paused stream settles.
  const autoToolRef = useRef<ToolApprovalRequest | null>(null);
  const busyRef = useRef(false);

  const activeChat =
    chatStore.chats.find((chat) => chat.id === chatStore.activeChatId) ?? null;
  const messages = activeChat?.messages ?? EMPTY_MESSAGES;
  const conversationId = activeChat?.conversationId ?? null;
  const hasMessages = messages.length > 0;
  const hasPendingApproval = messages.some((message) => message.status === "approval");
  const sidebarChats: SidebarChat[] = [...chatStore.chats]
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.updatedAt - left.updatedAt;
    })
    .map(({ id, title, titleStatus, pinned }) => ({
      id,
      title,
      titlePending: titleStatus === "pending",
      pinned,
    }));
  const searchChats = useMemo(
    () => createChatSearcher(chatStore.chats),
    [chatStore.chats],
  );

  useEffect(() => {
    loadChatStore()
      .then(setChatStore)
      .finally(() => setHydrated(true));

    return () => activeRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => {
      void saveChatStore(chatStore);
    }, 150);
    return () => clearTimeout(timeout);
  }, [chatStore, hydrated]);

  useEffect(() => {
    if (!hydrated) return;

    for (const chat of chatStore.chats) {
      if (chat.titleStatus !== "pending") continue;
      const firstUserMessage = chat.messages.find(
        (message) => message.role === "user",
      );
      if (!firstUserMessage) continue;
      void generateTitle(chat.id, firstUserMessage.content);
    }
    // Pending titles are retried once when persisted chats are restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const dock = composerDockRef.current;
    if (!dock) return;

    // Track the floating composer dock's real height so the spacer below the
    // messages can match it exactly — otherwise a growing composer (e.g. a
    // long, multi-line message) covers message content instead of the
    // content scrolling clear of it.
    let lastHeight = dock.getBoundingClientRect().height;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.contentRect.height;
      setComposerHeight(height);
      // Stay pinned to bottom only when the dock's height changes (e.g. the
      // composer growing with a longer message) — a width-only change (e.g.
      // resizing the panel) should never force a scroll.
      if (height !== lastHeight && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      lastHeight = height;
    });
    observer.observe(dock);
    return () => observer.disconnect();
  }, [hasMessages]);

  useEffect(() => {
    function handleNewChatShortcut(event: globalThis.KeyboardEvent) {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        activeRequestRef.current?.abort();
        setChatStore((current) => ({ ...current, activeChatId: null }));
      }
    }

    window.addEventListener("keydown", handleNewChatShortcut);
    return () => window.removeEventListener("keydown", handleNewChatShortcut);
  }, []);

  function setBusyState(next: boolean) {
    busyRef.current = next;
    setBusy(next);
  }

  function updateChat(chatId: string, update: (chat: StoredChat) => StoredChat) {
    setChatStore((current) => ({
      ...current,
      chats: current.chats.map((chat) => (chat.id === chatId ? update(chat) : chat)),
    }));
  }

  function updateAssistant(
    chatId: string,
    messageId: string,
    update: (message: ChatMessage) => ChatMessage,
  ) {
    updateChat(chatId, (chat) => ({
      ...chat,
      messages: chat.messages.map((message) =>
        message.id === messageId ? update(message) : message,
      ),
    }));
  }

  async function generateTitle(chatId: string, firstUserMessage: string) {
    try {
      const title = await generateConversationTitle(firstUserMessage);
      updateChat(chatId, (chat) =>
        chat.titleStatus === "pending"
          ? { ...chat, title, titleStatus: "generated" }
          : chat,
      );
    } catch (error) {
      console.error("Could not generate a conversation title", error);
      updateChat(chatId, (chat) =>
        chat.titleStatus === "pending"
          ? {
              ...chat,
              title: createChatTitle(firstUserMessage),
              titleStatus: "fallback",
            }
          : chat,
      );
    }
  }

  function handleStreamEvent(
    chatId: string,
    messageId: string,
    event: ChatStreamEvent,
  ) {
    if (event.type === "response.started") {
      updateChat(chatId, (chat) => ({
        ...chat,
        conversationId: event.conversationId,
      }));
      updateAssistant(chatId, messageId, (message) => resumeWorkClock(message));
    } else if (event.type === "response.delta") {
      updateAssistant(chatId, messageId, (message) => {
        if (event.phase === "commentary") {
          const work = getWorkLog(message);
          const existingIndex = work.items.findIndex(
            (item) => item.type === "commentary" && item.id === event.itemId,
          );
          const items = [...work.items];

          if (existingIndex === -1) {
            items.push({
              id: event.itemId,
              type: "commentary",
              content: event.delta,
            });
          } else {
            const existing = items[existingIndex];
            if (existing.type === "commentary") {
              const trailingNewlines = existing.content.match(/\n+$/)?.[0].length ?? 0;
              const segmentBreak =
                event.startsNewSegment && existing.content.length > 0
                  ? "\n".repeat(Math.max(0, 2 - trailingNewlines))
                  : "";
              items[existingIndex] = {
                ...existing,
                content: existing.content + segmentBreak + event.delta,
              };
            }
          }

          return {
            ...message,
            work: { ...work, items },
            status: "streaming",
            error: undefined,
          };
        }

        const trailingNewlines = message.content.match(/\n+$/)?.[0].length ?? 0;
        const segmentBreak =
          event.startsNewSegment && message.content.length > 0
            ? "\n".repeat(Math.max(0, 2 - trailingNewlines))
            : "";
        const work = message.work?.items.length
          ? {
              ...message.work,
              pausedAt: undefined,
              completedAt: message.work.completedAt ?? Date.now(),
            }
          : message.work;

        return {
          ...message,
          content: message.content + segmentBreak + event.delta,
          work,
          status: "streaming",
          error: undefined,
        };
      });
    } else if (event.type === "tool.started") {
      updateAssistant(chatId, messageId, (message) => {
        const work = getWorkLog(message, event.startedAt);
        const existingIndex = work.items.findIndex(
          (item) => item.type === "tool" && item.callId === event.callId,
        );
        const tool: ToolWorkItem = {
          id: `tool-${event.callId}`,
          type: "tool",
          callId: event.callId,
          name: event.name,
          executor: event.executor,
          arguments: event.arguments,
          status: "running",
          startedAt: event.startedAt,
        };
        const items = [...work.items];
        if (existingIndex === -1) items.push(tool);
        else {
          const existing = items[existingIndex];
          items[existingIndex] =
            existing.type === "tool"
              ? { ...existing, ...tool, status: "running" }
              : tool;
        }

        return {
          ...message,
          work: { ...work, pausedAt: undefined, completedAt: undefined, items },
          status: "streaming",
          error: undefined,
        };
      });
    } else if (event.type === "tool.completed") {
      updateAssistant(chatId, messageId, (message) => {
        if (!message.work) return message;
        const existingIndex = message.work.items.findIndex(
          (item) => item.type === "tool" && item.callId === event.callId,
        );
        // Alternative-instruction resumes stream into a fresh bubble while
        // the rejected tool remains in the previous bubble's work log.
        if (existingIndex === -1) return message;

        const items = [...message.work.items];
        const existing = items[existingIndex];
        if (existing.type === "tool") {
          if (existing.status === "rejected" || existing.status === "failed") {
            return message;
          }
          items[existingIndex] = {
            ...existing,
            status: "completed",
            ...(event.output ? { output: event.output } : {}),
            completedAt: event.completedAt,
          };
        }

        return {
          ...message,
          work: { ...message.work, items },
          status: "streaming",
        };
      });
    } else if (event.type === "tool_approval.request") {
      if (AUTO_EXECUTED_TOOLS.has(event.name)) {
        // Silent tool: no approval card. Keep the tool spinning in the work
        // log and stash the request; executeRequest resumes the run once
        // this (about-to-pause) stream closes.
        autoToolRef.current = event;
        updateAssistant(chatId, messageId, (message) => ({
          ...setToolStatus(message, event.toolCallId, "running"),
          status: "pending",
        }));
      } else {
        updateAssistant(chatId, messageId, (message) => ({
          ...setToolStatus(message, event.toolCallId, "awaiting_approval"),
          status: "approval",
          toolRequest: event,
        }));
      }
    } else if (event.type === "response.paused") {
      updateAssistant(chatId, messageId, (message) => ({
        ...message,
        work: message.work?.items.length
          ? { ...message.work, pausedAt: event.pausedAt }
          : message.work,
      }));
    } else if (event.type === "response.completed") {
      updateAssistant(chatId, messageId, (message) => ({
        ...message,
        status: "done",
        toolRequest: undefined,
        work: message.work?.items.length
          ? {
              ...message.work,
              pausedAt: undefined,
              completedAt: message.work.completedAt ?? Date.now(),
            }
          : message.work,
      }));
      updateChat(chatId, (chat) => ({
        ...chat,
        conversationId: event.conversationId,
      }));
    } else if (event.type === "response.error") {
      updateAssistant(chatId, messageId, (message) => {
        const failedAt = Date.now();
        return {
          ...message,
          status: "error",
          error: event.message,
          toolRequest: undefined,
          work: message.work?.items.length
            ? {
                ...message.work,
                pausedAt: undefined,
                completedAt: message.work.completedAt ?? failedAt,
                items: message.work.items.map((item) =>
                  item.type === "tool" &&
                  (item.status === "running" || item.status === "awaiting_approval")
                    ? { ...item, status: "failed" as const, completedAt: failedAt }
                    : item,
                ),
              }
            : message.work,
        };
      });
    }
  }

  async function executeRequest(
    chatId: string,
    messageId: string,
    request: (signal: AbortSignal, onEvent: (event: ChatStreamEvent) => void) => Promise<void>,
  ) {
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setBusyState(true);
    // Anything stashed by a previous stream is stale by definition.
    autoToolRef.current = null;

    try {
      await request(controller.signal, (event) =>
        handleStreamEvent(chatId, messageId, event),
      );

      // A silent tool paused this run: execute it and resume immediately —
      // the user never sees an approval card. No client-executed tools exist
      // yet, so this branch is currently unreachable but kept as the seam.
      const autoRequest = autoToolRef.current;
      if (autoRequest && !controller.signal.aborted) {
        autoToolRef.current = null;
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      updateAssistant(chatId, messageId, (message) => {
        const stoppedAt = Date.now();
        return {
          ...message,
          status: cancelled && message.content ? "done" : "error",
          error:
            cancelled && !message.content
              ? "Response stopped."
              : cancelled
                ? undefined
                : error instanceof Error
                  ? error.message
                  : "Caddie could not respond.",
          toolRequest: undefined,
          work: message.work?.items.length
            ? {
                ...message.work,
                pausedAt: undefined,
                completedAt: message.work.completedAt ?? stoppedAt,
                items: message.work.items.map((item) =>
                  item.type === "tool" &&
                  (item.status === "running" || item.status === "awaiting_approval")
                    ? { ...item, status: "failed" as const, completedAt: stoppedAt }
                    : item,
                ),
              }
            : message.work,
        };
      });
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
      setBusyState(false);
    }
  }

  function handleSend(content: string) {
    if (!hydrated || busyRef.current || hasPendingApproval) return;
    const chatId = activeChat?.id ?? crypto.randomUUID();
    const requestConversationId = activeChat?.conversationId ?? undefined;
    const now = Date.now();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const replyId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: replyId,
      role: "assistant",
      content: "",
      status: "pending",
      work: { startedAt: now, items: [] },
    };

    setChatStore((current) => {
      const existing = current.chats.find((chat) => chat.id === chatId);
      if (existing) {
        return {
          ...current,
          activeChatId: chatId,
          chats: current.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [...chat.messages, userMessage, assistantMessage],
                  updatedAt: now,
                }
              : chat,
          ),
        };
      }

      const chat: StoredChat = {
        id: chatId,
        title: "",
        titleStatus: "pending",
        messages: [userMessage, assistantMessage],
        conversationId: null,
        pinned: false,
        createdAt: now,
        updatedAt: now,
      };
      return {
        activeChatId: chatId,
        chats: [chat, ...current.chats],
      };
    });

    if (!activeChat) void generateTitle(chatId, content);

    void executeRequest(chatId, replyId, (signal, onEvent) =>
      streamChat({
        message: content,
        conversationId: requestConversationId,
        signal,
        onEvent,
      }),
    );
  }

  function handleCancel() {
    activeRequestRef.current?.abort();
  }

  function handleNewChat() {
    handleCancel();
    setChatStore((current) => ({ ...current, activeChatId: null }));
  }

  function handleSelectChat(chatId: string) {
    if (chatId === chatStore.activeChatId) return;
    handleCancel();
    setChatStore((current) =>
      current.chats.some((chat) => chat.id === chatId)
        ? { ...current, activeChatId: chatId }
        : current,
    );
  }

  function handleRenameChat(chatId: string, title: string) {
    const normalized = title.replace(/\s+/g, " ").trim().slice(0, 56);
    if (!normalized) return;
    updateChat(chatId, (chat) => ({
      ...chat,
      title: normalized,
      titleStatus: "manual",
    }));
  }

  function handleTogglePinChat(chatId: string) {
    updateChat(chatId, (chat) => ({ ...chat, pinned: !chat.pinned }));
  }

  async function handleDeleteChat(chatId: string): Promise<boolean> {
    const chat = chatStore.chats.find((candidate) => candidate.id === chatId);
    if (!chat) return true;

    try {
      if (chat.conversationId) {
        await deleteConversation(chat.conversationId);
      }
    } catch (error) {
      console.error("Could not delete Caddie conversation", error);
      return false;
    }

    if (chatId === chatStore.activeChatId) handleCancel();
    setChatStore((current) => ({
      activeChatId:
        current.activeChatId === chatId ? null : current.activeChatId,
      chats: current.chats.filter((candidate) => candidate.id !== chatId),
    }));
    return true;
  }

  async function handleToolDecision(messageId: string, approved: boolean) {
    if (busyRef.current) return;
    const chatId = activeChat?.id;
    if (!chatId) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    const toolRequest = message?.toolRequest;
    if (!toolRequest) return;

    setBusyState(true);

    updateAssistant(chatId, messageId, (current) => ({
      ...setToolStatus(
        resumeWorkClock(current),
        toolRequest.toolCallId,
        approved ? "running" : "rejected",
        approved ? undefined : Date.now(),
      ),
      status: "pending",
      toolRequest: undefined,
    }));

    // Server-executed tools run inside the backend once approved; client
    // tools would produce a result here once any exist (see caddie-agent.ts).
    const result: unknown = undefined;
    const error: string | undefined = approved
      ? undefined
      : "The user declined this request.";

    void executeRequest(chatId, messageId, (signal, onEvent) =>
      resumeChat({
        runId: toolRequest.runId,
        toolCallId: toolRequest.toolCallId,
        approved,
        result,
        error,
        signal,
        onEvent,
      }),
    );
  }

  function handleToolInstruction(messageId: string, instruction: string) {
    if (busyRef.current) return;
    const chatId = activeChat?.id;
    if (!chatId) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    const toolRequest = message?.toolRequest;
    if (!toolRequest) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: instruction,
    };
    const replyId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: replyId,
      role: "assistant",
      content: "",
      status: "pending",
      work: { startedAt: Date.now(), items: [] },
    };

    // Show the instruction as a normal user turn, then stream the resumed
    // run into a fresh assistant bubble below it. The paused approval bubble
    // is closed out — or dropped entirely if the model had no text yet.
    updateChat(chatId, (chat) => ({
      ...chat,
      updatedAt: Date.now(),
      messages: [
        ...chat.messages.map((candidate) =>
            candidate.id === messageId
              ? {
                  ...setToolStatus(
                    candidate,
                    toolRequest.toolCallId,
                    "rejected",
                    Date.now(),
                  ),
                  status: "done" as const,
                  toolRequest: undefined,
                  work: candidate.work?.items.length
                    ? {
                        ...candidate.work,
                        pausedAt: undefined,
                        completedAt: candidate.work.completedAt ?? Date.now(),
                      }
                    : candidate.work,
                }
              : candidate,
          ),
        userMessage,
        assistantMessage,
      ],
    }));

    void executeRequest(chatId, replyId, (signal, onEvent) =>
      resumeChat({
        runId: toolRequest.runId,
        toolCallId: toolRequest.toolCallId,
        approved: false,
        instruction,
        signal,
        onEvent,
      }),
    );
  }

  function handleRetry(messageId: string) {
    if (busyRef.current || hasPendingApproval) return;
    const chatId = activeChat?.id;
    if (!chatId) return;
    const failedIndex = messages.findIndex((message) => message.id === messageId);
    if (failedIndex < 1) return;
    const previousUser = [...messages.slice(0, failedIndex)]
      .reverse()
      .find((message) => message.role === "user");
    if (!previousUser) return;

    updateAssistant(chatId, messageId, (message) => ({
      ...message,
      content: "",
      status: "pending",
      error: undefined,
      work: { startedAt: Date.now(), items: [] },
    }));
    void executeRequest(chatId, messageId, (signal, onEvent) =>
      streamChat({
        message: previousUser.content,
        conversationId: conversationId ?? undefined,
        signal,
        onEvent,
      }),
    );
  }

  return (
    <div className="chat-layout">
      <div className="chat-stage">
        <header className="chat-topbar">
          <div className="chat-topbar-brand">
            <button
              type="button"
              className="icon-button sidebar-trigger app-tooltip app-tooltip--bottom app-tooltip--start"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              data-tooltip="Open sidebar"
            >
              <HugeiconsIcon icon={MenuTwoLineIcon} size={20} />
            </button>
            <span className="chat-brand-name">Caddie</span>
          </div>
          <div className="chat-topbar-actions">
            <button
              type="button"
              className="icon-button app-tooltip app-tooltip--bottom app-tooltip--multiline"
              onClick={handleNewChat}
              aria-label="New chat"
              aria-keyshortcuts="Control+Shift+O"
              data-tooltip={"New chat\nCtrl+Shift+O"}
            >
              <HugeiconsIcon icon={PlusSignIcon} size={20} />
            </button>
          </div>
        </header>

        {hasMessages ? (
          <div className="chat-thread">
            <div className="chat-scroll" ref={scrollRef}>
              <MessageList
                messages={messages}
                onApproveTool={(messageId) => void handleToolDecision(messageId, true)}
                onRejectTool={(messageId) => void handleToolDecision(messageId, false)}
                onInstructTool={handleToolInstruction}
                onRetry={handleRetry}
              />
              {/* Keep the last message actions comfortably clear of the floating composer. */}
              <div
                className="chat-scroll-spacer"
                style={{ height: `calc(${composerHeight}px + var(--space-6))` }}
              />
            </div>
            <div className="chat-composer-dock" ref={composerDockRef}>
              <div className="chat-composer-area">
                <Composer
                  onSend={handleSend}
                  busy={busy}
                  disabled={!hydrated || hasPendingApproval}
                  captureGlobalTyping={!sidebarOpen}
                  onCancel={handleCancel}
                />
              </div>
            </div>
          </div>
        ) : (
          <main className="chat-main">
            <div className="chat-composer-area">
              <Greeting userName={DEFAULT_USER_NAME} />
              <Composer
                onSend={handleSend}
                busy={busy}
                disabled={!hydrated || hasPendingApproval}
                captureGlobalTyping={!sidebarOpen}
                onCancel={handleCancel}
              />
            </div>
          </main>
        )}
      </div>

      <Sidebar
        open={sidebarOpen}
        userName={DEFAULT_USER_NAME}
        chats={sidebarChats}
        activeChatId={chatStore.activeChatId}
        busy={busy}
        onClose={() => setSidebarOpen(false)}
        onSearchChats={searchChats}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onTogglePinChat={handleTogglePinChat}
        onDeleteChat={handleDeleteChat}
      />
    </div>
  );
}
