"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

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

export default function AgentChat() {
  const formRef = useRef<HTMLFormElement>(null);
  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stoppedByUserRef = useRef(false);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [resumeSessionAt, setResumeSessionAt] = useState<string>();
  const [isSending, setIsSending] = useState(false);
  const [showMcpDebug, setShowMcpDebug] = useState(false);
  const [error, setError] = useState<string>();

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [activeSessionId, sessions],
  );

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
    setResumeSessionAt(undefined);
    setError(undefined);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = prompt.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    stoppedByUserRef.current = false;
    setError(undefined);
    setPrompt("");

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
    if (activeSessionId && !isSendingRef.current) {
      queueMicrotask(() => {
        void loadMessages(activeSessionId);
      });
    }
  }, [activeSessionId]);

  return (
    <main className="min-h-screen bg-[#f7f7f2] text-[#181916]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-[#d8d8cf] bg-[#ebece4] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-[#d8d8cf] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6c6f65]">
                  Caddie
                </p>
                <h1 className="text-xl font-semibold">Data Analyst</h1>
              </div>
              <button
                type="button"
                onClick={createNewSession}
                className="grid size-9 cursor-pointer place-items-center border border-[#1f3328] bg-[#1f3328] text-lg leading-none text-white transition hover:bg-[#2f4b3b]"
                title="New session"
              >
                +
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto p-3 lg:max-h-none lg:flex-1">
              {sessions.map((session) => (
                <button
                  type="button"
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setResumeSessionAt(undefined);
                    setError(undefined);
                  }}
                  className={`mb-2 block w-full border px-3 py-3 text-left transition ${
                    session.id === activeSessionId
                      ? "cursor-pointer border-[#1f3328] bg-white"
                      : "cursor-pointer border-transparent bg-transparent hover:border-[#c9cabf] hover:bg-[#f7f7f2]"
                  }`}
                >
                  <span className="block truncate text-sm font-semibold">{session.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-3 text-xs text-[#6c6f65]">
                    <span>{formatTime(session.updatedAt)}</span>
                    <span className="uppercase">{session.status}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="border-b border-[#d8d8cf] bg-[#f7f7f2]/90 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">
                  {activeSession?.title ?? "New analysis"}
                </p>
                <p className="text-xs text-[#6c6f65]">
                  {resumeSessionAt ? `Branch from ${resumeSessionAt.slice(0, 8)}` : "MCP enabled"}
                </p>
              </div>
              <div className="rounded-full border border-[#d8d8cf] px-3 py-1 text-xs uppercase text-[#4e554b]">
                {isSending ? "Running" : activeSession?.status ?? "Draft"}
              </div>
              {isSending && (
                <button
                  type="button"
                  onClick={() => {
                    void stopRunningAgent();
                  }}
                  className="cursor-pointer border border-[#9b3328] bg-[#9b3328] px-3 py-1 text-xs font-semibold uppercase text-white transition hover:bg-[#7d281f]"
                  title="Stop the running response"
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMcpDebug((current) => !current)}
                className={`border px-3 py-1 text-xs cursor-pointer font-semibold uppercase transition ${
                  showMcpDebug
                    ? "border-[#1f3328] bg-[#1f3328] text-white"
                    : "border-[#d8d8cf] bg-transparent text-[#4e554b] hover:border-[#1f3328]"
                }`}
              >
                MCP Debug
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.length === 0 && (
                <div className="border border-dashed border-[#c9cabf] bg-white px-5 py-5">
                  <p className="text-sm text-[#4e554b]">
                    Ask about a metric, schema, SQL approach, validation check, or analysis plan.
                  </p>
                </div>
              )}

              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`group border px-4 py-3 ${
              message.role === "user"
                ? "ml-auto max-w-[86%] border-[#1f3328] bg-[#1f3328] text-white"
                : message.role === "mcp"
                  ? "mr-auto max-w-[92%] border-[#bec7bb] bg-[#edf4ee] text-[#243529]"
                : "mr-auto max-w-[92%] border-[#d8d8cf] bg-white text-[#181916]"
                  }`}
                >
                  <div className="text-sm leading-6">
                    {message.role === "mcp" ? (
                      <McpBubble message={message} debug={showMcpDebug} />
                    ) : message.isPending ? (
                      <span className="inline-flex items-center gap-1 text-[#6c6f65]">
                        <span className="size-1.5 animate-pulse rounded-full bg-[#6c6f65]" />
                        Thinking
                      </span>
                    ) : (
                      <BubbleMarkdown>{message.text}</BubbleMarkdown>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <form
            ref={formRef}
            onSubmit={sendMessage}
            className="border-t border-[#d8d8cf] bg-[#f7f7f2] p-4"
          >
            <div className="mx-auto max-w-3xl">
              {error && (
                <div className="mb-3 border border-[#b65c4a] bg-[#fff5f1] px-3 py-2 text-sm text-[#8b2f22]">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  rows={2}
                  placeholder="Analyze..."
                  className="min-h-12 flex-1 resize-none border border-[#c9cabf] bg-white px-3 py-3 text-sm outline-none transition placeholder:text-[#8d9085] focus:border-[#1f3328]"
                />
                <button
                  type={isSending ? "button" : "submit"}
                  onClick={
                    isSending
                      ? () => {
                          void stopRunningAgent();
                        }
                      : undefined
                  }
                  disabled={!isSending && !prompt.trim()}
                  className={`w-24 cursor-pointer border px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:border-[#c9cabf] disabled:bg-[#c9cabf] ${
                    isSending
                      ? "border-[#9b3328] bg-[#9b3328] hover:bg-[#7d281f]"
                      : "border-[#1f3328] bg-[#1f3328] hover:bg-[#2f4b3b]"
                  }`}
                >
                  {isSending ? "Stop" : "Send"}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function McpBubble({ message, debug }: { message: AgentMessage; debug: boolean }) {
  const input = parseMcpInput(message.input);

  if (debug) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#4f654f]">
          <span
            className={`size-2 rounded-full ${
              message.status === "error"
                ? "bg-[#b65c4a]"
                : message.status === "done"
                  ? "bg-[#4d7f55]"
                  : message.status === "stopped"
                    ? "bg-[#7c8077]"
                  : "animate-pulse bg-[#8a9a84]"
            }`}
          />
          MCP {message.status ?? "running"}
        </div>
        <div className="font-mono text-xs text-[#243529]">{message.toolName}</div>
        {message.input && (
          <pre className="max-h-36 overflow-auto border border-[#cfdbc9] bg-white/70 p-2 font-mono text-xs">
            {message.input}
          </pre>
        )}
          {message.durationSeconds !== undefined && (
            <div className="text-xs text-[#4f654f]">
              Total: {formatSeconds(message.durationSeconds)}
            </div>
          )}
          {message.result && (
            <pre className="max-h-48 overflow-auto border border-[#cfdbc9] bg-white/70 p-2 font-mono text-xs">
              {message.result}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div
      className={`font-semibold ${
        message.status === "error"
          ? "text-[#9b3328]"
          : message.status === "done"
            ? "text-[#2f6f3a]"
            : message.status === "stopped"
              ? "text-[#6c6f65]"
            : "animate-pulse text-[#6a7a64]"
      }`}
    >
      {input.title}
      {message.durationSeconds !== undefined && (
        <span className="ml-2 text-xs font-medium text-current/70">
          {formatSeconds(message.durationSeconds)}
        </span>
      )}
    </div>
  );
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
