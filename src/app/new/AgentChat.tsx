"use client";

import { KeyboardEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type AgentSession = {
  id: string;
  title: string;
  status: "draft" | "running" | "idle" | "error";
  updatedAt: string;
  summary?: string;
  lastError?: string;
};

type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "mcp";
  text: string;
  isPending?: boolean;
  status?: "running" | "done" | "error" | "stopped";
  toolName?: string;
  input?: string;
  result?: string;
  startedAt?: number;
  durationSeconds?: number;
};

type ChatStreamEvent =
  | { type: "ack"; receivedAt: string }
  | { type: "session"; sessionId: string }
  | { type: "assistant_start"; id: string }
  | { type: "text"; id: string; text: string }
  | { type: "assistant_done"; id: string }
  | { type: "mcp_start"; id: string; toolName: string }
  | { type: "mcp_input"; id: string; text: string }
  | { type: "mcp_done"; id: string; isError?: boolean; result?: string }
  | { type: "result"; sessionId: string; subtype: string }
  | { type: "stopped"; sessionId?: string }
  | { type: "done"; sessionId: string; messages: AgentMessage[] }
  | { type: "error"; error: string };

type ProcessStep = {
  id: string;
  title: string;
  description: string;
  status: "running" | "done" | "error" | "stopped";
};

function BubbleMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children: linkChildren, ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-current/40 underline-offset-2"
          >
            {linkChildren}
          </a>
        ),
        p: ({ children: paragraphChildren }) => (
          <p className="mb-2 last:mb-0">{paragraphChildren}</p>
        ),
        ul: ({ children: listChildren }) => (
          <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{listChildren}</ul>
        ),
        ol: ({ children: listChildren }) => (
          <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{listChildren}</ol>
        ),
        blockquote: ({ children: quoteChildren }) => (
          <blockquote className="mb-2 border-l-2 border-current/30 pl-3 italic last:mb-0">
            {quoteChildren}
          </blockquote>
        ),
        code: ({ children: codeChildren, className }) => {
          const isBlock = Boolean(className);

          if (isBlock) {
            return (
              <code className={`${className ?? ""} block overflow-x-auto whitespace-pre p-3`}>
                {codeChildren}
              </code>
            );
          }

          return (
            <code className="rounded-sm bg-current/10 px-1 py-0.5 font-mono text-[0.92em]">
              {codeChildren}
            </code>
          );
        },
        pre: ({ children: preChildren }) => (
          <pre className="mb-2 overflow-x-auto border border-current/15 bg-current/5 text-xs last:mb-0">
            {preChildren}
          </pre>
        ),
        table: ({ children: tableChildren }) => (
          <div className="mb-2 overflow-x-auto last:mb-0">
            <table className="min-w-full border-collapse text-left text-xs">{tableChildren}</table>
          </div>
        ),
        th: ({ children: cellChildren }) => (
          <th className="border border-current/20 px-2 py-1 font-semibold">{cellChildren}</th>
        ),
        td: ({ children: cellChildren }) => (
          <td className="border border-current/20 px-2 py-1">{cellChildren}</td>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export default function AgentChat({ initialPrompt = "" }: { initialPrompt?: string }) {
  const normalizedInitialPrompt = initialPrompt.trim();
  const promptRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const isSendingRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stoppedByUserRef = useRef(false);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [messages, setMessages] = useState<AgentMessage[]>(() =>
    normalizedInitialPrompt
      ? [
          { id: "initial-user", role: "user", text: normalizedInitialPrompt },
          { id: "initial-assistant", role: "assistant", text: "", isPending: true },
        ]
      : [],
  );
  const [prompt, setPrompt] = useState("");
  const [resumeSessionAt, setResumeSessionAt] = useState<string>();
  const [isSending, setIsSending] = useState(Boolean(normalizedInitialPrompt));
  const [showMcpDebug, setShowMcpDebug] = useState(false);
  const [showProcessDetails, setShowProcessDetails] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [submittedPrompt, setSubmittedPrompt] = useState(normalizedInitialPrompt);
  const [error, setError] = useState<string>();

  const processSteps = useMemo(() => buildProcessSteps(messages, isSending), [messages, isSending]);
  const sidebarWidth = sidebarCollapsed ? 48 : 228;

  async function loadSessions(selectFirst = false) {
    const response = await fetch("/api/agent/sessions", { cache: "no-store" });
    const data = (await response.json()) as { sessions: AgentSession[] };
    setSessions(data.sessions);

    if (selectFirst && data.sessions[0]) {
      setActiveSessionId(data.sessions[0].id);
    }
  }

  async function loadMessages(sessionId: string) {
    const response = await fetch(`/api/agent/sessions/${sessionId}/messages`, {
      cache: "no-store",
    });
    const data = (await response.json()) as { messages: AgentMessage[] };
    setMessages(data.messages.filter((message) => message.role === "mcp" || message.text.trim()));
  }

  async function createNewSession() {
    const response = await fetch("/api/agent/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New analysis" }),
    });
    const data = (await response.json()) as { session: AgentSession };
    setSessions((current) => [data.session, ...current]);
    setActiveSessionId(data.session.id);
    setMessages([]);
    setSubmittedPrompt("");
    setResumeSessionAt(undefined);
    setError(undefined);
  }

  async function submitPrompt() {
    const promptElement =
      promptRef.current ??
      document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        '[data-caddie-prompt="true"]',
      );
    const trimmed = (promptElement?.value || prompt).trim();
    if (!trimmed || isSending || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSending(true);
    setShowProcessDetails(true);
    stoppedByUserRef.current = false;
    setError(undefined);
    setPrompt("");
    setSubmittedPrompt(trimmed);
    if (promptElement) {
      promptElement.value = "";
    }

    const userMessageId = `local-user-${crypto.randomUUID()}`;
    const assistantMessageId = `stream-${crypto.randomUUID()}`;
    setMessages((current) => [
      ...current,
      { id: userMessageId, role: "user", text: trimmed },
      { id: assistantMessageId, role: "assistant", text: "", isPending: true },
    ]);

    try {
      const replacePendingWith = (message: AgentMessage) => {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current;

          const pendingIndex = current.findIndex(
            (item) => item.id === assistantMessageId || item.isPending,
          );

          if (pendingIndex === -1) return [...current, message];

          return current.map((item, index) => (index === pendingIndex ? message : item));
        });
      };

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          prompt: trimmed,
          sessionId: activeSessionId,
          resumeSessionAt,
        }),
      });

      if (!response.ok) {
        throw new Error("Agent request failed.");
      }

      if (!response.body) {
        throw new Error("Agent response stream was empty.");
      }

      await readChatStream(response.body, (streamEvent) => {
        if (streamEvent.type === "ack") {
          return;
        }

        if (streamEvent.type === "session") {
          setActiveSessionId(streamEvent.sessionId);
          return;
        }

        if (streamEvent.type === "assistant_start") {
          replacePendingWith({ id: streamEvent.id, role: "assistant", text: "" });
          return;
        }

        if (streamEvent.type === "text") {
          setMessages((current) =>
            current.map((message) =>
              message.id === streamEvent.id
                ? {
                    ...message,
                    isPending: false,
                    text: `${message.text}${streamEvent.text}`,
                  }
                : message,
            ),
          );
          return;
        }

        if (streamEvent.type === "assistant_done") {
          setMessages((current) =>
            current.filter((message) => message.id !== streamEvent.id || message.text.trim()),
          );
          return;
        }

        if (streamEvent.type === "mcp_start") {
          setMessages((current) =>
            current.filter(
              (message) =>
                message.isPending ||
                message.text.trim() ||
                !message.id.startsWith("assistant-"),
            ),
          );
          replacePendingWith({
            id: streamEvent.id,
            role: "mcp",
            text: "",
            toolName: streamEvent.toolName,
            status: "running",
            input: "",
            startedAt: performance.now(),
          });
          return;
        }

        if (streamEvent.type === "mcp_input") {
          setMessages((current) =>
            current.map((message) =>
              message.id === streamEvent.id
                ? { ...message, input: `${message.input ?? ""}${streamEvent.text}` }
                : message,
            ),
          );
          return;
        }

        if (streamEvent.type === "mcp_done") {
          setMessages((current) =>
            current.map((message) =>
              message.id === streamEvent.id
                ? {
                    ...message,
                    status: streamEvent.isError ? "error" : "done",
                    result: streamEvent.result,
                    durationSeconds:
                      extractDurationSeconds(streamEvent.result) ??
                      (message.startedAt === undefined
                        ? undefined
                        : (performance.now() - message.startedAt) / 1000),
                  }
                : message,
            ),
          );
          return;
        }

        if (streamEvent.type === "done") {
          setActiveSessionId(streamEvent.sessionId);
          return;
        }

        if (streamEvent.type === "stopped") {
          markRunningMessagesStopped();
          return;
        }

        if (streamEvent.type === "error") {
          throw new Error(streamEvent.error);
        }
      });

      setResumeSessionAt(undefined);
      await loadSessions();
    } catch (caught) {
      if (stoppedByUserRef.current || isAbortError(caught)) {
        markRunningMessagesStopped();
        await loadSessions();
        return;
      }

      setError(caught instanceof Error ? caught.message : "Agent request failed.");
      setPrompt(trimmed);
      setMessages((current) =>
        current.filter(
          (message) =>
            message.id !== assistantMessageId || message.text.trim().length > 0,
        ),
      );
    } finally {
      setIsSending(false);
      setShowProcessDetails(false);
      isSubmittingRef.current = false;
      abortControllerRef.current = null;
      stoppedByUserRef.current = false;
    }
  }

  async function stopRunningAgent() {
    if (!isSending) return;

    stoppedByUserRef.current = true;
    abortControllerRef.current?.abort();
    markRunningMessagesStopped();
    setIsSending(false);
    setShowProcessDetails(false);

    if (activeSessionId) {
      await fetch("/api/agent/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId }),
      }).catch(() => undefined);
      await loadSessions().catch(() => undefined);
    }
  }

  function markRunningMessagesStopped() {
    setMessages((current) =>
      current.map((message) => {
        if (message.isPending) {
          return { ...message, isPending: false, text: "Stopped." };
        }

        if (message.role === "mcp" && message.status === "running") {
          return { ...message, status: "stopped", result: "Stopped by user." };
        }

        return message;
      }),
    );
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadSessions(true);
    });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  useEffect(() => {
    if (!normalizedInitialPrompt || !isSending) return;

    const timeout = window.setTimeout(() => {
      setIsSending(false);
      setShowProcessDetails(false);
      setMessages((current) => current.filter((message) => !message.isPending));
    }, 5200);

    return () => window.clearTimeout(timeout);
  }, [normalizedInitialPrompt, isSending]);

  useEffect(() => {
    if (activeSessionId && !isSendingRef.current) {
      queueMicrotask(() => {
        void loadMessages(activeSessionId);
      });
    }
  }, [activeSessionId]);

  useEffect(() => {
    function submitOnEnter(event: globalThis.KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.isComposing ||
        target?.getAttribute("data-caddie-prompt") !== "true"
      ) {
        return;
      }

      event.preventDefault();
      void submitPrompt();
    }

    function submitOnSendClick(event: MouseEvent | PointerEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest("[data-caddie-send='true']")) return;

      event.preventDefault();
      void submitPrompt();
    }

    document.addEventListener("keydown", submitOnEnter, true);
    document.addEventListener("pointerdown", submitOnSendClick, true);
    document.addEventListener("mousedown", submitOnSendClick, true);
    document.addEventListener("click", submitOnSendClick, true);
    return () => {
      document.removeEventListener("keydown", submitOnEnter, true);
      document.removeEventListener("pointerdown", submitOnSendClick, true);
      document.removeEventListener("mousedown", submitOnSendClick, true);
      document.removeEventListener("click", submitOnSendClick, true);
    };
  });

  const recentSessions = sessions.length
    ? sessions
    : [
        { id: "placeholder-riverbend", title: "Riverbend Chat" },
        { id: "placeholder-cascade", title: "Cascade Project C..." },
        { id: "placeholder-harbor", title: "Harbor Support Ch..." },
        { id: "placeholder-flowchart", title: "Flowchart Mocku..." },
        { id: "placeholder-streams", title: "Current Streams" },
      ];
  const hasConversation = messages.length > 0 || submittedPrompt.trim().length > 0;

  return (
    <main className="h-screen overflow-hidden bg-white text-[#1c1c1d]">
      <div
        className="h-screen bg-white"
      >
        <aside
          data-caddie-sidebar="true"
          className="fixed bottom-0 left-0 top-0 z-50 border-r border-[#ececee] bg-[#fafafa] transition-[width] duration-300 ease-out"
          style={{ width: sidebarWidth }}
        >
          <div
            data-caddie-sidebar-inner="true"
            className={`flex h-full flex-col gap-[22px] p-3 transition-all duration-300 ease-out ${
              sidebarCollapsed ? "items-center" : "items-start"
            }`}
          >
            {sidebarCollapsed ? (
              <button
                data-caddie-logo-toggle="true"
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                className="grid size-6 cursor-pointer place-items-center"
                title="Expand sidebar"
              >
                <LogoMark collapsed />
              </button>
            ) : (
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <LogoMark />
                  <span
                    data-caddie-sidebar-text="true"
                    className="bg-[linear-gradient(90deg,#c125b8,#5b63d6)] bg-clip-text text-[20px] font-semibold tracking-normal text-transparent"
                  >
                    Caddie
                  </span>
                </div>
                <button
                  data-caddie-sidebar-toggle="true"
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="grid size-4 cursor-pointer place-items-center text-[#5b5b64] transition hover:text-[#303030]"
                  title="Collapse sidebar"
                >
                  <PanelIcon />
                </button>
              </div>
            )}

            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="grid size-[26px] cursor-pointer place-items-center rounded-[8px] p-1 text-[#5b5b64] transition hover:bg-[#f1f1f5]"
                  title="Search"
                >
                  <SearchIcon />
                </button>
                <button
                  type="button"
                  onClick={createNewSession}
                  className="grid size-[26px] cursor-pointer place-items-center rounded-[8px] p-1 text-[#5b5b64] transition hover:bg-[#f1f1f5]"
                  title="New chat"
                >
                  <PlusIcon />
                </button>
                <button
                  type="button"
                  className="grid size-[26px] cursor-pointer place-items-center rounded-[8px] p-1 text-[#5b5b64] transition hover:bg-[#f1f1f5]"
                  title="Recent chats"
                >
                  <CommentIcon />
                </button>
              </div>
            ) : (
              <>
                <div className="flex w-full flex-col gap-2">
                  <label
                    data-caddie-search-box="true"
                    className="flex h-[34px] items-center gap-2 rounded-[8px] border border-[#e7e7e9] bg-white p-1.5 text-[#5b5b64] focus-within:border-[#d5d6dc]"
                  >
                    <SearchIcon />
                    <input
                      data-caddie-sidebar-text="true"
                      type="search"
                      placeholder="Search"
                      className="min-w-0 flex-1 bg-transparent text-[14px] font-normal text-[#5b5b64] outline-none placeholder:text-[#5b5b64]"
                    />
                  </label>

                  <button
                    data-caddie-nav-button="true"
                    type="button"
                    onClick={createNewSession}
                    className="flex h-[30px] w-full cursor-pointer items-center gap-2 rounded-[8px] p-1.5 text-left text-[14px] font-medium text-[#5b5b64] transition hover:bg-[#f1f1f5]"
                  >
                    <PlusIcon />
                    <span data-caddie-sidebar-text="true">New Chat</span>
                  </button>
                  <button
                    data-caddie-collapsed-only="true"
                    type="button"
                    hidden
                    className="grid size-[26px] cursor-pointer place-items-center rounded-[8px] p-1 text-[#5b5b64] transition hover:bg-[#f1f1f5]"
                    title="Recent chats"
                  >
                    <CommentIcon />
                  </button>
                </div>

                <div data-caddie-extended-only="true" className="flex w-full flex-col gap-2">
                  <div className="flex items-center text-[14px] font-medium text-[#5b5b64]">
                    <span>Recents</span>
                    <ChevronDownIcon />
                  </div>

                  <div className="flex flex-col gap-1">
                    {recentSessions.map((session) => {
                      const isPlaceholder = session.id.startsWith("placeholder-");
                      return (
                        <button
                          type="button"
                          key={session.id}
                          onClick={
                            isPlaceholder
                              ? undefined
                              : () => {
                                  setActiveSessionId(session.id);
                                  setResumeSessionAt(undefined);
                                  setError(undefined);
                                }
                          }
                          className={`flex h-[30px] w-full items-center gap-2 rounded-[8px] p-1.5 text-left text-[14px] font-medium text-[#5b5b64] transition ${
                            session.id === activeSessionId
                              ? "cursor-pointer bg-[#f0eefb]"
                              : isPlaceholder
                                ? "cursor-default"
                                : "cursor-pointer hover:bg-[#f1f1f5]"
                          }`}
                        >
                          <RecentIcon />
                          <span data-caddie-sidebar-text="true" className="block truncate">
                            {session.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>

        <section
          data-caddie-main-section="true"
          className="fixed bottom-0 right-0 top-0 min-w-0 bg-white transition-[left] duration-300 ease-out"
          style={{ left: sidebarWidth }}
        >
          <header
            data-caddie-topbar="true"
            className="fixed right-0 top-0 z-40 flex h-[54px] items-center justify-end border-b border-[#e7e7e9] bg-white p-3 transition-[left] duration-300 ease-out"
            style={{ left: sidebarWidth }}
          >
            <div className="flex items-center gap-2">
              {isSending && (
                <button
                  data-caddie-running-only="true"
                  type="button"
                  onClick={() => {
                    void stopRunningAgent();
                  }}
                  className="h-[34px] cursor-pointer rounded-[8px] border border-[#f0cbc4] bg-[#fff2ef] px-3 text-[14px] font-medium text-[#ba513d] transition hover:bg-[#ffe9e4]"
                  title="Stop the running response"
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMcpDebug((current) => !current)}
                className={`flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[8px] border p-2 text-[14px] font-medium transition ${
                  showMcpDebug
                    ? "border-[#dcd7ff] bg-[#f3f0ff] text-[#6959c9]"
                    : "border-[#e7e7e9] bg-white text-[#1c1c1d] hover:bg-[#f8f8fa]"
                }`}
              >
                <DownloadIcon />
                <span>Export</span>
                <ChevronDownIcon />
              </button>
              <button
                type="button"
                className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[8px] border border-[#e7e7e9] bg-white p-2 text-[14px] font-medium text-[#1c1c1d] transition hover:bg-[#f8f8fa]"
              >
                <ShareIcon />
                <span>Share</span>
              </button>
              <div className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[#ffded0] text-[20px] font-medium text-[#ee9265]">
                S
              </div>
            </div>
          </header>

          <div
            data-caddie-workspace="true"
            className="absolute bottom-0 left-0 right-0 top-[54px] overflow-hidden"
          >
            {!hasConversation ? (
              <div className="grid h-full place-items-center overflow-y-auto px-8 py-10">
                <div className="w-full max-w-[617px]">
                  <div className="mb-6 text-center">
                    <h1 className="text-[32px] font-medium leading-normal tracking-normal text-[#303030]">
                      How can I help you today?
                    </h1>
                    <p className="mt-1.5 text-[18px] font-normal leading-normal text-[#807f83]">
                      Ask me anything, and I&apos;ll help you to get things done
                    </p>
                  </div>
                  <Composer
                    error={error}
                    isSending={isSending}
                    promptRef={promptRef}
                    setPrompt={setPrompt}
                    submitPrompt={submitPrompt}
                    stopRunningAgent={stopRunningAgent}
                  />
                </div>
              </div>
            ) : (
              <div className="relative h-full overflow-hidden">
                <div className="h-full overflow-y-auto px-6 pb-36 pt-7">
                  <ConversationView
                    isSending={isSending}
                    messages={messages}
                    processSteps={processSteps}
                    submittedPrompt={submittedPrompt}
                    showProcessDetails={showProcessDetails}
                    setShowProcessDetails={setShowProcessDetails}
                  />
                </div>
                <div
                  data-caddie-fixed-composer="true"
                  className="pointer-events-none fixed bottom-0 right-0 z-50 h-[100px] bg-transparent transition-[left] duration-300 ease-out"
                  style={{ left: sidebarWidth }}
                >
                  <div className="pointer-events-auto absolute left-1/2 top-1/2 w-[min(912px,calc(100%-48px))] -translate-x-1/2 -translate-y-1/2">
                    <Composer
                      compact
                      error={error}
                      isSending={isSending}
                      promptRef={promptRef}
                      setPrompt={setPrompt}
                      submitPrompt={submitPrompt}
                      stopRunningAgent={stopRunningAgent}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Composer({
  compact = false,
  error,
  isSending,
  promptRef,
  setPrompt,
  submitPrompt,
  stopRunningAgent,
}: {
  compact?: boolean;
  error: string | undefined;
  isSending: boolean;
  promptRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  setPrompt: (value: string) => void;
  submitPrompt: () => Promise<void>;
  stopRunningAgent: () => Promise<void>;
}) {
  if (compact) {
    return (
      <form
        action="/new"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          void submitPrompt();
        }}
        onKeyDownCapture={(event) => handleComposerEnter(event, submitPrompt)}
      >
        {error && (
          <div className="mb-2 rounded-[12px] border border-[#f0cbc4] bg-[#fff2ef] px-3 py-2 text-[13px] text-[#ba513d]">
            {error}
          </div>
        )}
        <div className="flex min-h-[58px] items-center justify-between gap-3 rounded-[16px] border border-[#d3d3d3] bg-white px-3 py-4 shadow-[0_-12px_24px_rgba(227,227,227,0.4),0_30px_60px_#e2e2e2]">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-[#5b5b64] transition hover:bg-[#f4f4f5]"
              title="Add files"
            >
              <PlusIcon />
            </button>
            <input
              data-caddie-prompt="true"
              name="prompt"
              ref={(node) => {
                promptRef.current = node;
              }}
              onChange={(event) => setPrompt(event.target.value)}
              onInput={(event) => setPrompt(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submitPrompt();
                }
              }}
              placeholder="Ask anything......."
              className="min-w-0 flex-1 bg-transparent text-[16px] font-normal leading-normal text-[#1c1c1d] outline-none placeholder:text-[#807f83]"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[14px] font-normal text-black transition hover:bg-[#f4f4f5]"
            >
              Source
              <ChevronDownIcon />
            </button>
            <button
              type="button"
              className="grid size-7 cursor-pointer place-items-center rounded-full text-[#5b5b64] transition hover:bg-[#f4f4f5]"
              title="Voice input"
            >
              <MicIcon />
            </button>
            <button
              data-caddie-send={isSending ? undefined : "true"}
              type={isSending ? "button" : "submit"}
              onPointerDown={(event) => {
                event.preventDefault();
                if (isSending) return;
                void submitPrompt();
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                if (isSending) return;
                void submitPrompt();
              }}
              onClick={
                isSending
                  ? () => {
                      void stopRunningAgent();
                    }
                  : () => {
                      void submitPrompt();
                    }
              }
              className={`grid size-7 cursor-pointer place-items-center rounded-full transition disabled:cursor-not-allowed ${
                isSending
                  ? "bg-[#fff2ef] text-[#ba513d] hover:bg-[#ffe9e4]"
                  : "bg-[#1c1c1d] text-white hover:bg-[#2b2d33] disabled:bg-[#1c1c1d] disabled:text-white"
              }`}
              title={isSending ? "Stop" : "Send"}
            >
              {isSending ? <StopIcon /> : <ArrowRightIcon />}
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form
      action="/new"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        void submitPrompt();
      }}
      onKeyDownCapture={(event) => handleComposerEnter(event, submitPrompt)}
    >
      {error && (
        <div className="mb-3 rounded-[12px] border border-[#f0cbc4] bg-[#fff2ef] px-4 py-3 text-sm text-[#ba513d]">
          {error}
        </div>
      )}
      <div className="relative min-h-[136px] rounded-[16px] border border-[#ececee] bg-white transition focus-within:border-[#d4d5dc]">
        <input
          data-caddie-prompt="true"
          name="prompt"
          type="text"
          ref={(node) => {
            promptRef.current = node;
          }}
          onChange={(event) => setPrompt(event.target.value)}
          onInput={(event) => setPrompt(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submitPrompt();
            }
          }}
          placeholder="Ask anything......."
          className="w-full rounded-[16px] bg-transparent p-3 text-[16px] font-normal leading-normal text-[#303030] outline-none placeholder:text-[#807f83]"
        />
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="flex h-[28px] cursor-pointer items-center gap-1.5 rounded-full bg-[#f4f4f5] py-1.5 pl-2 pr-3 text-[14px] font-normal text-black transition hover:bg-[#ededf0]"
            >
              <PlusIcon />
              <span>Add Files</span>
            </button>
            <button
              type="button"
              className="flex h-[28px] cursor-pointer items-center gap-1.5 rounded-full border border-[#ececee] bg-white py-1.5 pl-3 pr-2 text-[14px] font-normal text-black transition hover:bg-[#f8f8fa]"
            >
              Source
              <ChevronDownIcon />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="grid size-[28px] cursor-pointer place-items-center rounded-full text-[#5b5b64] transition hover:bg-[#f4f4f5]"
              title="Voice input"
            >
              <MicIcon />
            </button>
            <button
              data-caddie-send={isSending ? undefined : "true"}
              type={isSending ? "button" : "submit"}
              onPointerDown={(event) => {
                event.preventDefault();
                if (isSending) return;
                void submitPrompt();
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                if (isSending) return;
                void submitPrompt();
              }}
              onClick={
                isSending
                  ? () => {
                      void stopRunningAgent();
                    }
                  : () => {
                      void submitPrompt();
                    }
              }
              className={`grid size-[28px] cursor-pointer place-items-center rounded-full transition disabled:cursor-not-allowed ${
                isSending
                  ? "bg-[#fff2ef] text-[#ba513d] hover:bg-[#ffe9e4]"
                  : "bg-[#1c1c1d] text-white hover:bg-[#2b2d33] disabled:bg-[#1c1c1d] disabled:text-white"
              }`}
              title={isSending ? "Stop" : "Send"}
            >
              {isSending ? <StopIcon /> : <ArrowRightIcon />}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ConversationView({
  isSending,
  messages,
  processSteps,
  submittedPrompt,
  showProcessDetails,
  setShowProcessDetails,
}: {
  isSending: boolean;
  messages: AgentMessage[];
  processSteps: ProcessStep[];
  submittedPrompt: string;
  showProcessDetails: boolean;
  setShowProcessDetails: (value: boolean) => void;
}) {
  const userMessages = messages.filter((message) => message.role === "user");
  const assistantMessages = messages.filter(
    (message) => message.role === "assistant" && message.text.trim() && !message.isPending,
  );
  const latestUserMessage = userMessages.at(-1);
  const visiblePrompt = latestUserMessage?.text || submittedPrompt;
  const shouldShowProcess = isSending || processSteps.length > 0;
  const isProcessOpen = isSending || showProcessDetails;
  const visibleProcessSteps = processSteps;
  const showSkeletonLoaders = isSending;
  const reportKind = inferReportKind(visiblePrompt);
  const shouldShowGeneratedReport = Boolean(visiblePrompt);

  return (
    <div className="relative mx-auto min-h-full w-full max-w-[1212px]">
      <style>{`
        @keyframes caddie-step-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes caddie-skeleton-shimmer {
          0% { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
      `}</style>
      {visiblePrompt && (
        <div className="ml-auto block w-fit max-w-[min(529px,46vw)] rounded-[12px] bg-[#f5f5f5] px-4 py-3 text-left text-[16px] font-normal leading-normal text-[#1c1c1d]">
          {visiblePrompt}
        </div>
      )}

      <div className="mt-8 w-full max-w-[976px] transition-all duration-300 ease-out">
        {shouldShowProcess && (
          <div className="transition-all duration-300 ease-out">
            <button
              data-caddie-process-toggle="true"
              type="button"
              onClick={() => {
                if (isSending) {
                  setShowProcessDetails(true);
                  return;
                }

                setShowProcessDetails(!showProcessDetails);
              }}
              className="mb-4 flex cursor-pointer items-center gap-1.5 px-2 text-[14px] font-normal leading-normal text-[#787881]"
            >
              <span>
                <span data-caddie-process-label="true">
                  {isSending ? "Thinking..." : "Process details"}
                </span>
              </span>
              <span
                data-caddie-process-chevron="true"
                className={`grid size-[18px] place-items-center rounded-full bg-[#e7e7e9] text-[#5b5b64] transition-transform duration-300 ${
                  isProcessOpen ? "rotate-0" : "-rotate-90"
                }`}
              >
                <ChevronDownIcon />
              </span>
            </button>
          </div>
        )}

        {shouldShowProcess && (
          <div
            data-caddie-process-panel="true"
            data-caddie-process-open={isProcessOpen ? "true" : "false"}
            className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out ${
              isProcessOpen
                ? "grid-rows-[1fr] opacity-100 translate-y-0"
                : "grid-rows-[0fr] opacity-0 -translate-y-1"
            }`}
          >
            <div className="overflow-hidden">
              <div className="rounded-[12px] border border-[#e7e7e9] bg-[#f9f9f9] p-3">
                <div className="flex flex-col gap-3">
                  {visibleProcessSteps.map((step, index) => (
                    <ProcessStepRow
                      key={step.id}
                      step={step}
                      isLast={index === processSteps.length - 1 && !showSkeletonLoaders}
                      delayMs={index * 520}
                    />
                  ))}

                  {showSkeletonLoaders && <ThinkingSkeletonRows />}

                  {isSending && (
                    <div
                      data-caddie-processing-only="true"
                      className="flex items-start gap-1.5"
                      style={{
                        animation: "caddie-step-in 280ms ease-out both",
                        animationDelay: `${visibleProcessSteps.length * 520 + 180}ms`,
                      }}
                    >
                      <div className="grid size-4 shrink-0 place-items-center rounded-full border border-[#b9bbc4] bg-white">
                        <span className="size-1.5 animate-pulse rounded-full bg-[#8c8f99]" />
                      </div>
                      <div className="min-w-0 flex-1 text-[14px] font-normal leading-normal">
                        <p className="text-[#5b5b64]">Getting things....</p>
                        <div className="mt-2 h-3 w-[44%] rounded-full bg-[linear-gradient(90deg,#ececee_0%,#f7f7f8_45%,#ececee_90%)] bg-[length:220%_100%] [animation:caddie-skeleton-shimmer_1.35s_ease-in-out_infinite]" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {shouldShowGeneratedReport && (
          <div
            data-caddie-response="true"
            hidden={isSending}
            className="mt-0 transition-all duration-300 ease-out data-[visible=true]:translate-y-0 data-[visible=true]:opacity-100"
          >
            <ReportResponse prompt={visiblePrompt} kind={reportKind} />
          </div>
        )}

        {assistantMessages.map((message) => (
          <article
            key={message.id}
            className="mt-4 rounded-[12px] border border-[#ececee] bg-white p-4 text-[14px] leading-6 text-[#1c1c1d]"
          >
            <BubbleMarkdown>{message.text}</BubbleMarkdown>
          </article>
        ))}
      </div>
    </div>
  );
}

function handleComposerEnter(
  event: KeyboardEvent<HTMLElement>,
  submitPrompt: () => Promise<void>,
) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;

  event.preventDefault();
  void submitPrompt();
}

type ReportKind = "bar" | "table" | "text";

function inferReportKind(prompt: string): ReportKind {
  const normalized = prompt.toLowerCase();

  if (/\btable\b|\btabular\b|\brows?\b|\bcolumns?\b|\blist\b/.test(normalized)) {
    return "table";
  }

  if (/\bbar\b|\bgraph\b|\bchart\b|\bvisual/i.test(normalized)) {
    return "bar";
  }

  if (/\bsummary\b|\bdescribe\b|\bexplain\b|\bwhy\b|\binsight\b|\bnarrative\b/.test(normalized)) {
    return "text";
  }

  return "bar";
}

function ReportResponse({ prompt, kind }: { prompt: string; kind: ReportKind }) {
  const title = makeReportTitle(prompt, kind);
  const description =
    kind === "table"
      ? "Here is the requested data report in a table format. Scroll horizontally to review all columns."
      : kind === "text"
        ? "Here is a concise descriptive response based on the report request."
        : "Here's a breakdown of your top 7 CAN numbers requesting tankers in July 2025 in a bar chart.";

  return (
    <section
      className="flex w-full max-w-[1008px] flex-col gap-4"
      style={{ animation: "caddie-step-in 320ms ease-out both" }}
    >
      <div className="flex w-full flex-col gap-2 px-2 leading-normal">
        <h2 className="text-[18px] font-medium text-[#1c1c1d]">{title}</h2>
        <p className="text-[16px] font-normal text-[#5b5b64]">{description}</p>
      </div>

      {kind === "table" ? (
        <TableReport />
      ) : kind === "text" ? (
        <TextReport />
      ) : (
        <BarChartReport />
      )}

      {kind === "bar" && (
        <p className="max-w-[1008px] text-[14px] leading-6 text-[#5b5b64]">
          CAN-1042 leads the July 2025 tanker requests in this sample report. The next highest
          request volumes are concentrated across CAN-1188 and CAN-1320, with a gradual taper across
          the remaining CAN numbers.
        </p>
      )}
    </section>
  );
}

function makeReportTitle(prompt: string, kind: ReportKind) {
  if (prompt.toLowerCase().includes("can")) {
    return "Top 7 CAN Numbers Requesting Tankers - July 2025";
  }

  if (kind === "table") return "Requested Data Report";
  if (kind === "text") return "Report Summary";
  return "Generated Data Chart";
}

const reportRows = [
  { can: "CAN-1042", division: "Division 1", subdivision: "Sub-Division 1", bookings: 168, complaints: "02" },
  { can: "CAN-1188", division: "Division 1", subdivision: "Sub-Division 2", bookings: 142, complaints: "03" },
  { can: "CAN-1320", division: "Division 2", subdivision: "Sub-Division 1", bookings: 126, complaints: "01" },
  { can: "CAN-1457", division: "Division 2", subdivision: "Sub-Division 3", bookings: 112, complaints: "02" },
  { can: "CAN-1594", division: "Division 3", subdivision: "Sub-Division 1", bookings: 98, complaints: "01" },
  { can: "CAN-1726", division: "Division 3", subdivision: "Sub-Division 2", bookings: 86, complaints: "02" },
  { can: "CAN-1903", division: "Division 4", subdivision: "Sub-Division 1", bookings: 74, complaints: "00" },
];

function BarChartReport() {
  const maxBookings = Math.max(...reportRows.map((row) => row.bookings));

  return (
    <div className="w-full rounded-[16px] bg-[#f9f9f9] p-6">
      <div className="flex w-full flex-col gap-[10px] overflow-hidden rounded-[20px] bg-[#fafafa]">
        <div className="flex w-full items-center gap-0.5 p-[25px]">
          <p className="flex h-[40px] w-[150px] flex-col justify-center font-['Roboto',sans-serif] text-[36px] font-medium leading-none text-black">
            890.93
          </p>
        </div>
        <div className="flex w-full flex-col items-start justify-center p-[25px] pt-0">
          <div className="flex w-full items-center gap-[9px]">
            <div className="h-px min-w-0 flex-1 border-t border-dashed border-[#cfcfd4]" />
            <p className="text-[12px] font-bold leading-5 tracking-normal text-black">MAX</p>
          </div>
          <div className="flex min-h-[190px] w-full items-end justify-between gap-3 pt-3">
            {reportRows.map((row, index) => {
              const height = Math.round((row.bookings / maxBookings) * 161);

              return (
                <div key={row.can} className="flex min-w-[54px] flex-1 flex-col items-center gap-2">
                  <div
                    className={`w-[39px] rounded-[8px] transition-all duration-300 ${
                      index === 0 ? "bg-[#4361ee]" : "bg-[#e9e9e9]"
                    }`}
                    style={{ height }}
                    title={`${row.can}: ${row.bookings}`}
                  />
                  <p className="w-full truncate text-center text-[12px] font-medium leading-5 tracking-normal text-[#525252]">
                    {row.can.replace("CAN-", "")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TableReport() {
  const extendedRows = [
    ...reportRows,
    ...reportRows.map((row, index) => ({
      ...row,
      can: `CAN-${2100 + index}`,
      bookings: Math.max(42, row.bookings - 38),
    })),
  ];

  return (
    <div className="w-full overflow-hidden rounded-[16px]">
      <div className="w-full overflow-x-auto pb-3 [scrollbar-color:#d6d6d8_transparent] [scrollbar-width:thin]">
        <table className="w-full min-w-[1188px] border-separate border-spacing-0 text-left text-[16px] leading-normal">
          <thead>
            <tr>
              {[
                "S.No",
                "Division Name",
                "Sub-Division Name",
                "CAN Number",
                "Booking Count",
                "Complaint Count",
                "Resolved Count",
                "Pending Count",
              ].map((heading, index, headings) => (
                <th
                  key={heading}
                  className={`border-b border-l border-t border-[#e7e7e9] bg-[#f2f2f2] px-3 py-2 font-medium text-[#1c1c1d] ${
                    index === 0 ? "rounded-tl-[8px]" : ""
                  } ${index === headings.length - 1 ? "rounded-tr-[8px] border-r" : ""}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {extendedRows.map((row, index) => (
              <tr key={`${row.can}-${index}`}>
                {[
                  `${index + 1}.`,
                  row.division,
                  row.subdivision,
                  row.can,
                  row.bookings,
                  row.complaints,
                  Math.max(30, row.bookings - 12),
                  Math.max(0, 12 - (index % 5)),
                ].map((cell, cellIndex, cells) => (
                  <td
                    key={`${row.can}-${cellIndex}`}
                    className={`border-b border-l border-[#e7e7e9] px-3 py-2 font-normal text-[#5b5b64] ${
                      cellIndex === cells.length - 1 ? "border-r" : ""
                    } ${index === extendedRows.length - 1 && cellIndex === 0 ? "rounded-bl-[8px]" : ""} ${
                      index === extendedRows.length - 1 && cellIndex === cells.length - 1
                        ? "rounded-br-[8px]"
                        : ""
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ResponseActions />
    </div>
  );
}

function TextReport() {
  return (
    <article className="max-w-[927px] rounded-[12px] border border-[#e7e7e9] bg-white p-4 text-[15px] leading-7 text-[#1c1c1d]">
      <p>
        The July 2025 tanker request pattern is concentrated in a small set of CAN numbers. The top
        requester accounts for the largest share of volume, while the remaining top CAN numbers show
        a steady decline in booking count.
      </p>
      <p className="mt-3 text-[#5b5b64]">
        This response is intentionally descriptive because the prompt does not require a chart or
        table. When a prompt asks for a graph, table, comparison, or ranked list, Caddie will switch
        to the corresponding report view.
      </p>
    </article>
  );
}

function ResponseActions() {
  return (
    <div className="mt-3 flex items-center gap-3 text-[#8c8f99]">
      <button type="button" className="grid size-4 place-items-center hover:text-[#5b5b64]" title="Copy">
        <CopyIcon />
      </button>
      <button type="button" className="grid size-4 place-items-center hover:text-[#5b5b64]" title="Like">
        <ThumbIcon />
      </button>
      <button type="button" className="grid size-4 place-items-center hover:text-[#5b5b64]" title="Dislike">
        <ThumbIcon flipped />
      </button>
      <button type="button" className="grid size-4 place-items-center hover:text-[#5b5b64]" title="More">
        <MoreIcon />
      </button>
    </div>
  );
}

function ProcessStepRow({
  step,
  isLast,
  delayMs = 0,
}: {
  step: ProcessStep;
  isLast: boolean;
  delayMs?: number;
}) {
  return (
    <div
      className="flex items-start gap-1.5"
      style={{
        animation: "caddie-step-in 280ms ease-out both",
        animationDelay: `${delayMs}ms`,
      }}
    >
      <div className="flex shrink-0 flex-col items-center">
        <StepStatusIcon status={step.status} />
        {!isLast && <div className="mt-1 h-7 w-px bg-[#d8d8dc]" />}
      </div>
      <div className="min-w-0 flex-1 text-[14px] font-normal leading-normal">
        <p className="text-[#5b5b64]">{step.title}</p>
        <p className="mt-1 break-words text-[#1c1c1d]">{step.description}</p>
      </div>
    </div>
  );
}

function ThinkingSkeletonRows() {
  return (
    <div
      data-caddie-processing-only="true"
      className="flex items-start gap-1.5"
      style={{ animation: "caddie-step-in 280ms ease-out both" }}
    >
      <div className="flex shrink-0 flex-col items-center">
        <span className="grid size-4 place-items-center rounded-full border border-[#d8d8dc] bg-white">
          <span className="size-1.5 animate-pulse rounded-full bg-[#b9bbc4]" />
        </span>
        <div className="mt-1 h-7 w-px bg-[#d8d8dc]" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="h-3 w-[18%] rounded-full bg-[linear-gradient(90deg,#ececee_0%,#f7f7f8_45%,#ececee_90%)] bg-[length:220%_100%] [animation:caddie-skeleton-shimmer_1.35s_ease-in-out_infinite]" />
        <div className="mt-3 h-3 w-[72%] rounded-full bg-[linear-gradient(90deg,#ececee_0%,#f7f7f8_45%,#ececee_90%)] bg-[length:220%_100%] [animation:caddie-skeleton-shimmer_1.35s_ease-in-out_infinite]" />
        <div className="mt-2 h-3 w-[52%] rounded-full bg-[linear-gradient(90deg,#ececee_0%,#f7f7f8_45%,#ececee_90%)] bg-[length:220%_100%] [animation:caddie-skeleton-shimmer_1.35s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}

function StepStatusIcon({ status }: { status: ProcessStep["status"] }) {
  const statusClass =
    status === "running"
      ? "animate-pulse border-[#b9bbc4] bg-white"
      : status === "error"
        ? "border-[#d66a59] bg-[#fff2ef]"
        : status === "stopped"
          ? "border-[#a5a6ad] bg-[#f4f4f5]"
          : "border-[#8c8f99] bg-white";

  return (
    <span className={`grid size-4 place-items-center rounded-full border ${statusClass}`}>
      {status === "running" ? (
        <span className="size-1.5 rounded-full bg-[#8c8f99]" />
      ) : (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="m3 6 2 2 4-5" stroke="#5b5b64" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function LogoMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span
      data-caddie-logo-mark="true"
      className={`relative grid place-items-center overflow-hidden rounded-[5px] bg-[conic-gradient(from_140deg,#7c3cff,#e245b7,#ff855a,#3a7cff,#7c3cff)] font-extrabold leading-none text-white shadow-sm ${
        collapsed ? "size-6 text-[14px]" : "size-5 text-[13px]"
      }`}
    >
      C
      <span
        className={`absolute right-0 top-0 rounded-full bg-[#3a7cff] ${
          collapsed ? "size-1.5" : "size-1.5"
        }`}
      />
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m20 20-4.1-4.1m1.7-5.1a6.8 6.8 0 1 1-13.6 0 6.8 6.8 0 0 1 13.6 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RecentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h10M5 12h7M5 17h4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 18.5 4 20l1-3.6A7.6 7.6 0 0 1 4 12.7C4 8.4 7.6 5 12 5s8 3.4 8 7.7-3.6 7.7-8 7.7a8.6 8.6 0 0 1-4.5-1.9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M10 7v10M15 9l-3 3 3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4v9m0 0 3-3m-3 3-3-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.8 12.6 15.2 16M15.2 8 8.8 11.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="6.5" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.5" cy="6.8" r="2.5" stroke="currentColor" strokeWidth="1.9" />
      <circle cx="17.5" cy="17.2" r="2.5" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h13m0 0-5-5m5 5-5 5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ThumbIcon({ flipped = false }: { flipped?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={flipped ? "rotate-180" : undefined}
    >
      <path
        d="M7 10v10M7 10l4.2-6.3c.6-.9 2-.5 2 .6V9h4.4c1.3 0 2.2 1.2 1.9 2.4l-1.4 6A2 2 0 0 1 16.2 19H7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function buildProcessSteps(messages: AgentMessage[], isSending: boolean): ProcessStep[] {
  const mcpMessages = messages.filter((message) => message.role === "mcp");

  if (mcpMessages.length === 0) {
    if (!isSending && !messages.some((message) => message.role === "user")) return [];

    return [
      {
        id: "planning",
        title: "Thought 15s",
        description:
          "Planning the analysis path, identifying the requested output, and preparing the data needed to answer it.",
        status: "done",
      },
      {
        id: "context",
        title: "Check current sources",
        description: "Reviewing the available session context and deciding which records should be checked first.",
        status: "done",
      },
      {
        id: "data",
        title: "Thought for 8s",
        description:
          "Determining the filters, ranking logic, and fields needed before preparing the final response.",
        status: "done",
      },
    ];
  }

  return mcpMessages.map((message, index) => {
    const parsedInput = parseMcpInput(message.input);
    const title =
      message.status === "running"
        ? parsedInput.title
        : message.durationSeconds !== undefined
          ? `${parsedInput.title} ${formatSeconds(message.durationSeconds)}`
          : parsedInput.title;

    return {
      id: message.id,
      title: title || `Step ${index + 1}`,
      description: describeProcessStep(message, parsedInput.sqlQuery),
      status: message.status ?? "running",
    };
  });
}

function describeProcessStep(message: AgentMessage, parsedInput: string) {
  if (message.status === "error") {
    return summarizeToolText(message.result) || "The step failed while processing this request.";
  }

  if (message.status === "stopped") {
    return "This step was stopped before it completed.";
  }

  if (parsedInput.trim()) {
    return parsedInput.trim();
  }

  if (message.input?.trim()) {
    return summarizeToolText(message.input);
  }

  if (message.result?.trim()) {
    return summarizeToolText(message.result);
  }

  return "Gathering the next piece of information for this request.";
}

function summarizeToolText(value: string | undefined) {
  if (!value?.trim()) return "";

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const preferred =
      parsed.summary ??
      parsed.message ??
      parsed.sql_query ??
      parsed.sql ??
      parsed.query ??
      parsed.result ??
      parsed.output;

    if (typeof preferred === "string" && preferred.trim()) {
      return trimText(preferred);
    }

    return trimText(JSON.stringify(parsed));
  } catch {
    return trimText(value);
  }
}

function trimText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 260 ? `${normalized.slice(0, 257)}...` : normalized;
}

function parseMcpInput(input: string | undefined) {
  if (!input?.trim()) {
    return { title: "Preparing database query", sqlQuery: "" };
  }

  try {
    const parsed = JSON.parse(input) as {
      title?: unknown;
      sql_query?: unknown;
      sql?: unknown;
      query?: unknown;
    };

    return {
      title: typeof parsed.title === "string" ? parsed.title : "Database query",
      sqlQuery:
        typeof parsed.sql_query === "string"
          ? parsed.sql_query
          : typeof parsed.sql === "string"
            ? parsed.sql
            : typeof parsed.query === "string"
              ? parsed.query
              : "",
    };
  } catch {
    return { title: "Preparing database query", sqlQuery: input };
  }
}

function extractDurationSeconds(result: string | undefined) {
  if (!result?.trim()) return undefined;

  try {
    const parsed = JSON.parse(result) as { timings?: { total_ms?: unknown } };
    return typeof parsed.timings?.total_ms === "number"
      ? parsed.timings.total_ms / 1000
      : undefined;
  } catch {
    const match = result.match(/Total:\s*([\d.]+)\s*ms/i);
    return match ? Number(match[1]) / 1000 : undefined;
  }
}

function formatSeconds(seconds: number) {
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const record = error as { name?: unknown; message?: unknown };
  const name = typeof record.name === "string" ? record.name : "";
  const message = typeof record.message === "string" ? record.message : "";

  return name === "AbortError" || message.includes("aborted");
}

async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as ChatStreamEvent);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as ChatStreamEvent);
  }
}
