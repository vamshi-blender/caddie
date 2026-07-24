import { isChatStreamEvent, type ChatStreamEvent } from "@/lib/agents/protocol";

interface StreamRequestOptions {
  path: "/api/chat" | "/api/chat/resume";
  body: Record<string, unknown>;
  signal: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // Fall back to a status-based message below.
  }
  return `Request failed with status ${response.status}.`;
}

async function streamRequest({
  path,
  body,
  signal,
  onEvent,
}: StreamRequestOptions): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw new Error(await readError(response));
  if (!response.body) throw new Error("The backend returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event: unknown = JSON.parse(line);
      if (!isChatStreamEvent(event)) {
        throw new Error("The backend sent an unknown stream event.");
      }
      onEvent(event);
    }

    if (done) break;
  }

  if (buffer.trim()) {
    const event: unknown = JSON.parse(buffer);
    if (!isChatStreamEvent(event)) {
      throw new Error("The backend sent an unknown stream event.");
    }
    onEvent(event);
  }
}

export function streamChat(options: {
  message: string;
  conversationId?: string;
  signal: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}) {
  return streamRequest({
    path: "/api/chat",
    body: {
      message: options.message,
      ...(options.conversationId
        ? { conversationId: options.conversationId }
        : {}),
    },
    signal: options.signal,
    onEvent: options.onEvent,
  });
}

export function resumeChat(options: {
  runId: string;
  toolCallId: string;
  approved: boolean;
  result?: unknown;
  error?: string;
  instruction?: string;
  signal: AbortSignal;
  onEvent: (event: ChatStreamEvent) => void;
}) {
  return streamRequest({
    path: "/api/chat/resume",
    body: {
      runId: options.runId,
      toolCallId: options.toolCallId,
      approved: options.approved,
      ...(options.result === undefined ? {} : { result: options.result }),
      ...(options.error ? { error: options.error } : {}),
      ...(options.instruction ? { instruction: options.instruction } : {}),
    },
    signal: options.signal,
    onEvent: options.onEvent,
  });
}

export async function generateConversationTitle(message: string): Promise<string> {
  const response = await fetch("/api/conversations/title", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) throw new Error(await readError(response));

  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("title" in body) ||
    typeof body.title !== "string" ||
    !body.title.trim()
  ) {
    throw new Error("The backend returned an invalid conversation title.");
  }

  return body.title.trim().slice(0, 56);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch("/api/conversations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
  });

  if (!response.ok) throw new Error(await readError(response));
}
