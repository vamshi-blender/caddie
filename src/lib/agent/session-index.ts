import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  getSessionMessages,
  listSessions,
  renameSession,
  type SDKSessionInfo,
} from "@anthropic-ai/claude-agent-sdk";
import { AGENT_CWD } from "@/lib/agent/config";
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
  const messages = await getSessionMessages(sessionId, {
    dir: AGENT_CWD,
    includeSystemMessages: true,
    sessionStore: fileSessionStore,
  });

  return messages.map((message) => ({
    id: message.uuid,
    sessionId: message.session_id,
    role: message.type,
    text: extractText(message.message),
    raw: message.message,
  }));
}

export async function titleSessionFromPrompt(sessionId: string, prompt: string) {
  const title = firstMeaningfulLine(prompt, "Analysis session");
  await updateSession(sessionId, { title });
  await renameSession(sessionId, title, {
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
