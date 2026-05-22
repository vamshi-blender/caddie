"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  role: "user" | "assistant" | "system";
  text: string;
  isPending?: boolean;
};

type ChatStreamEvent =
  | { type: "ack"; receivedAt: string }
  | { type: "session"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "result"; sessionId: string; subtype: string }
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

export default function AgentChat() {
  const formRef = useRef<HTMLFormElement>(null);
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [resumeSessionAt, setResumeSessionAt] = useState<string>();
  const [isSending, setIsSending] = useState(false);
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
    setMessages(data.messages.filter((message) => message.text.trim()));
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
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

        if (streamEvent.type === "text") {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantMessageId
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

        if (streamEvent.type === "done") {
          setActiveSessionId(streamEvent.sessionId);
          setMessages(streamEvent.messages.filter((message) => message.text.trim()));
          return;
        }

        if (streamEvent.type === "error") {
          throw new Error(streamEvent.error);
        }
      });

      setResumeSessionAt(undefined);
      await loadSessions();
    } catch (caught) {
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
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadSessions(true);
    });
  }, []);

  useEffect(() => {
    if (activeSessionId && !isSending) {
      queueMicrotask(() => {
        void loadMessages(activeSessionId);
      });
    }
  }, [activeSessionId, isSending]);

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
                className="grid size-9 place-items-center border border-[#1f3328] bg-[#1f3328] text-lg leading-none text-white transition hover:bg-[#2f4b3b]"
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
                      ? "border-[#1f3328] bg-white"
                      : "border-transparent bg-transparent hover:border-[#c9cabf] hover:bg-[#f7f7f2]"
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
                  {resumeSessionAt ? `Branch from ${resumeSessionAt.slice(0, 8)}` : "Tool-less"}
                </p>
              </div>
              <div className="rounded-full border border-[#d8d8cf] px-3 py-1 text-xs uppercase text-[#4e554b]">
                {isSending ? "Running" : activeSession?.status ?? "Draft"}
              </div>
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
                      : "mr-auto max-w-[92%] border-[#d8d8cf] bg-white text-[#181916]"
                  }`}
                >
                  <div className="whitespace-pre-wrap text-sm leading-6">
                    {message.isPending ? (
                      <span className="inline-flex items-center gap-1 text-[#6c6f65]">
                        <span className="size-1.5 animate-pulse rounded-full bg-[#6c6f65]" />
                        Thinking
                      </span>
                    ) : (
                      message.text
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
                  type="submit"
                  disabled={isSending || !prompt.trim()}
                  className="w-24 border border-[#1f3328] bg-[#1f3328] px-4 text-sm font-semibold text-white transition hover:bg-[#2f4b3b] disabled:cursor-not-allowed disabled:border-[#c9cabf] disabled:bg-[#c9cabf]"
                >
                  Send
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
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
