import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  listSessions,
  renameSession,
  type SDKSessionInfo,
} from "@anthropic-ai/claude-agent-sdk";
import { AGENT_CWD, AGENT_PROJECT_KEY } from "@/lib/agent/config";
import { fileSessionStore } from "@/lib/agent/file-session-store";
import { extractText, firstMeaningfulLine } from "@/lib/agent/text";

export type AgentSessionStatus = "draft" | "running" | "idle" | "error";

export type AgentSessionRecord = {
  id: string;
  title: string;
  status: AgentSessionStatus;
  createdAt: string;
  updatedAt: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  lastError?: string;
};

export type AgentChatMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "mcp";
  text: string;
  raw?: unknown;
  status?: "running" | "done" | "error";
  toolName?: string;
  input?: string;
  result?: string;
  durationSeconds?: number;
};

const INDEX_PATH = path.join(process.cwd(), ".agent-data", "sessions.json");
let indexLock = Promise.resolve();

async function withIndexLock<T>(action: () => Promise<T>) {
  const previous = indexLock;
  let release!: () => void;
  indexLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await action();
  } finally {
    release();
  }
}

async function readIndex() {
  try {
    const raw = await readFile(INDEX_PATH, "utf8");
    return JSON.parse(raw) as AgentSessionRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeIndex(records: AgentSessionRecord[]) {
  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

export async function createSession(title = "New analysis") {
  const now = new Date().toISOString();
  const record: AgentSessionRecord = {
    id: randomUUID(),
    title,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  await withIndexLock(async () => {
    const records = await readIndex();
    records.unshift(record);
    await writeIndex(records);
  });

  return record;
}

export async function updateSession(
  id: string,
  updates: Partial<Omit<AgentSessionRecord, "id" | "createdAt">>,
) {
  return withIndexLock(async () => {
    const records = await readIndex();
    const now = new Date().toISOString();
    const existing = records.find((record) => record.id === id);

    if (existing) {
      Object.assign(existing, updates, { updatedAt: now });
    } else {
      records.unshift({
        id,
        title: updates.title ?? "Analysis session",
        status: updates.status ?? "idle",
        createdAt: now,
        updatedAt: now,
        sourceSessionId: updates.sourceSessionId,
        sourceMessageId: updates.sourceMessageId,
        lastError: updates.lastError,
      });
    }

    await writeIndex(records);
    return records.find((record) => record.id === id)!;
  });
}

export async function deleteSessionRecord(id: string) {
  await withIndexLock(async () => {
    const records = await readIndex();
    await writeIndex(records.filter((record) => record.id !== id));
  });
}

export async function listAgentSessions() {
  const [indexed, sdkSessions] = await Promise.all([
    readIndex(),
    listSessions({ dir: AGENT_CWD, sessionStore: fileSessionStore }).catch(() => []),
  ]);

  const sdkById = new Map(sdkSessions.map((session) => [session.sessionId, session]));

  return indexed
    .map((record) => {
      const sdkSession = sdkById.get(record.id);
      return mergeSessionRecord(record, sdkSession);
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getAgentMessages(sessionId: string) {
  const entries = await fileSessionStore.load({ projectKey: AGENT_PROJECT_KEY, sessionId });

  if (!entries) return [];

  return transcriptEntriesToMessages(entries, sessionId);
}

export async function hasAgentTranscript(sessionId: string) {
  const entries = await fileSessionStore.load({ projectKey: AGENT_PROJECT_KEY, sessionId });

  return Boolean(
    entries?.some((entry) => {
      const record = entry as { type?: string };
      return record.type === "user" || record.type === "assistant";
    }),
  );
}

export async function titleSessionFromPrompt(sessionId: string, prompt: string) {
  const title = firstMeaningfulLine(prompt, "Analysis session");
  await updateSession(sessionId, { title });
  void renameSession(sessionId, title, {
    dir: AGENT_CWD,
    sessionStore: fileSessionStore,
  }).catch(() => undefined);
}

function mergeSessionRecord(record: AgentSessionRecord, sdkSession?: SDKSessionInfo) {
  return {
    ...record,
    title: sdkSession?.customTitle ?? record.title ?? sdkSession?.summary ?? "Analysis session",
    updatedAt: new Date(sdkSession?.lastModified ?? Date.parse(record.updatedAt)).toISOString(),
    createdAt: new Date(sdkSession?.createdAt ?? Date.parse(record.createdAt)).toISOString(),
    summary: sdkSession?.summary,
  };
}

function transcriptEntriesToMessages(entries: unknown[], sessionId: string) {
  const messages: AgentChatMessage[] = [];
  const mcpByToolUseId = new Map<string, AgentChatMessage>();

  for (const entry of entries) {
    const record = entry as {
      type?: string;
      uuid?: string;
      message?: {
        role?: string;
        content?: unknown;
      };
      toolUseResult?: unknown;
      mcpMeta?: {
        structuredContent?: unknown;
      };
    };

    if (record.type === "user") {
      const content = Array.isArray(record.message?.content) ? record.message.content : [];
      const toolResults = content.filter(isToolResultBlock);

      if (toolResults.length > 0) {
        for (const toolResult of toolResults) {
          const mcpMessage =
            mcpByToolUseId.get(toolResult.tool_use_id) ??
            createMcpMessageFromResult(toolResult, record, sessionId);

          const result =
            stringifyToolContent(record.mcpMeta?.structuredContent) ??
            stringifyToolContent(toolResult.content) ??
            stringifyToolContent(record.toolUseResult);

          mcpMessage.status = toolResult.is_error ? "error" : "done";
          mcpMessage.result = result;
          mcpMessage.durationSeconds = extractDurationSeconds(result);

          if (!mcpByToolUseId.has(toolResult.tool_use_id)) {
            mcpByToolUseId.set(toolResult.tool_use_id, mcpMessage);
            messages.push(mcpMessage);
          }
        }

        continue;
      }

      const text = extractText(record.message);
      if (text.trim()) {
        messages.push({
          id: record.uuid ?? randomUUID(),
          sessionId,
          role: "user",
          text,
          raw: record.message,
        });
      }

      continue;
    }

    if (record.type === "assistant") {
      const content = Array.isArray(record.message?.content) ? record.message.content : [];

      for (const block of content) {
        if (isTextBlock(block)) {
          const text = block.text.trim();
          if (!text) continue;

          messages.push({
            id: `${record.uuid ?? randomUUID()}-${messages.length}`,
            sessionId,
            role: "assistant",
            text,
            raw: block,
          });
        }

        if (isToolUseBlock(block) && block.name.startsWith("mcp__")) {
          const mcpMessage: AgentChatMessage = {
            id: block.id,
            sessionId,
            role: "mcp",
            text: "",
            toolName: block.name,
            input: JSON.stringify(block.input ?? {}, null, 2),
            status: "running",
            raw: block,
          };

          mcpByToolUseId.set(block.id, mcpMessage);
          messages.push(mcpMessage);
        }
      }
    }
  }

  return messages.filter((message) => message.role === "mcp" || message.text.trim());
}

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  return (
    Boolean(block) &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "text" &&
    typeof (block as { text?: unknown }).text === "string"
  );
}

function isToolUseBlock(
  block: unknown,
): block is { type: "tool_use"; id: string; name: string; input?: unknown } {
  return (
    Boolean(block) &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "tool_use" &&
    typeof (block as { id?: unknown }).id === "string" &&
    typeof (block as { name?: unknown }).name === "string"
  );
}

function isToolResultBlock(
  block: unknown,
): block is { type: "tool_result"; tool_use_id: string; content?: unknown; is_error?: boolean } {
  return (
    Boolean(block) &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "tool_result" &&
    typeof (block as { tool_use_id?: unknown }).tool_use_id === "string"
  );
}

function createMcpMessageFromResult(
  toolResult: { tool_use_id: string; content?: unknown },
  record: { uuid?: string; mcpMeta?: { structuredContent?: unknown } },
  sessionId: string,
): AgentChatMessage {
  const result =
    stringifyToolContent(record.mcpMeta?.structuredContent) ?? stringifyToolContent(toolResult.content);
  const parsed = parseJsonObject(result);

  return {
    id: toolResult.tool_use_id || record.uuid || randomUUID(),
    sessionId,
    role: "mcp",
    text: "",
    toolName: "mcp",
    input: parsed?.sql_text
      ? JSON.stringify(
          {
            title: parsed.title ?? "Database query",
            sql_query: parsed.sql_text,
          },
          null,
          2,
        )
      : undefined,
    result,
    durationSeconds: extractDurationSeconds(result),
    status: "done",
  };
}

function stringifyToolContent(content: unknown) {
  if (content === undefined || content === null) return undefined;
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

function parseJsonObject(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function extractDurationSeconds(result: string | undefined) {
  const parsed = parseJsonObject(result);
  const totalMs = (parsed?.timings as { total_ms?: unknown } | undefined)?.total_ms;

  if (typeof totalMs === "number") return totalMs / 1000;

  const match = result?.match(/Total:\s*([\d.]+)\s*ms/i);
  return match ? Number(match[1]) / 1000 : undefined;
}
