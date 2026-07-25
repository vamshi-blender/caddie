"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
import { useMediaQuery } from "@/lib/use-media-query";
import "./ChatLayout.css";

const EMPTY_MESSAGES: ChatMessage[] = [];
// Matches ChatGPT's own breakpoint for switching between a docked sidebar
// (rail-collapsible, part of the layout) and a modal overlay sidebar.
const DESKTOP_QUERY = "(min-width: 768px)";
const RAIL_COLLAPSED_KEY = "caddieSidebarRailCollapsed";

function createClientId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function chatIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/c\/([^/]+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// Soft URL updates integrate with the Next.js router. The shared (chat) layout
// keeps this component mounted while the page marker changes, so an active
// response is not cancelled when a new chat receives its permanent URL.
function openChatUrl(chatId: string) {
  const path = `/c/${encodeURIComponent(chatId)}`;
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
}

function openHomeUrl(options?: { replace?: boolean }) {
  if (window.location.pathname === "/") return;
  if (options?.replace) window.history.replaceState(null, "", "/");
  else window.history.pushState(null, "", "/");
}

function getSavedRailCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === "true";
}

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

export default function ChatLayout({ userName }: { userName: string }) {
  const pathname = usePathname();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
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
    setRailCollapsed(getSavedRailCollapsed());

    return () => activeRequestRef.current?.abort();
  }, []);

  // The URL is the source of truth for which chat is open. This effect keeps
  // the active chat in sync with it — covering initial load on /c/<id>,
  // browser back/forward, and the handlers below (which update both eagerly
  // and land here as no-ops). An id that isn't in this user's chats — deleted,
  // mistyped, or someone else's — redirects home.
  useEffect(() => {
    if (!hydrated) return;
    // Read the live location, not the `pathname` hook value: after a
    // pushState the hook lags by a render, and acting on the stale "/" here
    // would abort the request a brand-new chat just started ("Response
    // stopped."). The hook still serves as the re-run trigger for
    // back/forward navigation.
    const routeChatId = chatIdFromPath(window.location.pathname);

    if (routeChatId === null) {
      if (chatStore.activeChatId !== null) {
        activeRequestRef.current?.abort();
        setChatStore((current) => ({ ...current, activeChatId: null }));
      }
      return;
    }

    if (!chatStore.chats.some((chat) => chat.id === routeChatId)) {
      openHomeUrl({ replace: true });
      if (chatStore.activeChatId !== null) {
        setChatStore((current) => ({ ...current, activeChatId: null }));
      }
      return;
    }

    if (chatStore.activeChatId !== routeChatId) {
      activeRequestRef.current?.abort();
      setChatStore((current) => ({ ...current, activeChatId: routeChatId }));
    }
  }, [pathname, hydrated, chatStore.activeChatId, chatStore.chats]);

  function handleToggleRail() {
    setRailCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(RAIL_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  useEffect(() => {
    if (!hydrated) return;
    const timeout = setTimeout(() => {
      void saveChatStore(chatStore).catch((error) =>
        console.error("Could not save chat history", error),
      );
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
        openHomeUrl();
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
          status: "error",
          error:
            cancelled
              ? "Response stopped."
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
    const chatId = activeChat?.id ?? createClientId();
    const requestConversationId = activeChat?.conversationId ?? undefined;
    const now = Date.now();
    const userMessage: ChatMessage = {
      id: createClientId(),
      role: "user",
      content,
    };
    const replyId = createClientId();
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

    if (!activeChat) {
      // The chat now exists in local state, so the reconcile effect won't
      // bounce this URL back home even though the server hasn't saved it yet.
      openChatUrl(chatId);
      void generateTitle(chatId, content);
    }

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
    openHomeUrl();
  }

  async function handleLogout() {
    handleCancel();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  function handleSelectChat(chatId: string) {
    if (chatId === chatStore.activeChatId) return;
    if (!chatStore.chats.some((chat) => chat.id === chatId)) return;
    handleCancel();
    setChatStore((current) => ({ ...current, activeChatId: chatId }));
    openChatUrl(chatId);
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

    if (chatId === chatStore.activeChatId) {
      handleCancel();
      // The deleted chat's URL is gone for good — replace it so Back doesn't
      // land on a dead link.
      openHomeUrl({ replace: true });
    }
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
      id: createClientId(),
      role: "user",
      content: instruction,
    };
    const replyId = createClientId();
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

  // The docked sidebar (desktop) always carries its own trigger — expanded or
  // collapsed to a rail — so the topbar's menu button is only needed on
  // mobile, where it opens the overlay instead.
  const showTopbarSidebarTrigger = !isDesktop;

  return (
    <div className="chat-layout">
      {isDesktop && (
        <Sidebar
          variant="docked"
          railCollapsed={railCollapsed}
          onToggleRail={handleToggleRail}
          open
          userName={userName}
          chats={sidebarChats}
          activeChatId={chatStore.activeChatId}
          busy={busy}
          onClose={() => {}}
          onSearchChats={searchChats}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onRenameChat={handleRenameChat}
          onTogglePinChat={handleTogglePinChat}
          onDeleteChat={handleDeleteChat}
          onLogout={() => void handleLogout()}
        />
      )}
      <div className="chat-stage">
        <header className="chat-topbar">
          <div className="chat-topbar-brand">
            {showTopbarSidebarTrigger && (
              <button
                type="button"
                className="icon-button sidebar-trigger app-tooltip app-tooltip--bottom app-tooltip--start"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
                data-tooltip="Open sidebar"
              >
                <HugeiconsIcon icon={MenuTwoLineIcon} size={20} />
              </button>
            )}
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
              <Greeting userName={userName} />
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

      {!isDesktop && (
        <Sidebar
          variant="overlay"
          open={sidebarOpen}
          userName={userName}
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
          onLogout={() => void handleLogout()}
        />
      )}
    </div>
  );
}
