import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type {
  SessionKey,
  SessionStore,
  SessionStoreEntry,
} from "@anthropic-ai/claude-agent-sdk";

const STORE_ROOT = path.join(process.cwd(), ".agent-data", "session-store");
const locks = new Map<string, Promise<void>>();

function safePart(value: string) {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 16);
  const slug = value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  return `${slug || "key"}-${hash}`;
}

function keyPath(key: SessionKey) {
  const parts = [STORE_ROOT, safePart(key.projectKey), safePart(key.sessionId)];

  if (key.subpath) {
    parts.push(...key.subpath.split(/[\\/]+/).filter(Boolean).map(safePart));
  }

  return path.join(...parts, "transcript.jsonl");
}

async function withLock<T>(lockKey: string, action: () => Promise<T>) {
  const previous = locks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  locks.set(lockKey, previous.then(() => current));

  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(lockKey) === current) {
      locks.delete(lockKey);
    }
  }
}

async function readEntries(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionStoreEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function listTranscriptFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return listTranscriptFiles(fullPath);
        return entry.name === "transcript.jsonl" ? [fullPath] : [];
      }),
    );

    return files.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export const fileSessionStore: SessionStore = {
  async append(key, entries) {
    const filePath = keyPath(key);

    await withLock(filePath, async () => {
      await mkdir(path.dirname(filePath), { recursive: true });

      const existing = (await readEntries(filePath)) ?? [];
      const seen = new Set(existing.map((entry) => entry.uuid).filter(Boolean));
      const nextEntries = entries.filter((entry) => !entry.uuid || !seen.has(entry.uuid));

      if (nextEntries.length === 0) return;

      const content = [...existing, ...nextEntries]
        .map((entry) => JSON.stringify(entry))
        .join("\n");

      await writeFile(filePath, `${content}\n`, "utf8");
    });
  },

  async load(key) {
    return readEntries(keyPath(key));
  },

  async listSessions(projectKey) {
    const projectDir = path.join(STORE_ROOT, safePart(projectKey));
    const children = await readdir(projectDir, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      },
    );

    const sessions = await Promise.all(
      children
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const transcript = path.join(projectDir, entry.name, "transcript.jsonl");
          const info = await stat(transcript).catch(() => undefined);

          if (!info) return undefined;

          const sessionId = entry.name.replace(/-[a-f0-9]{16}$/, "");
          return { sessionId, mtime: info.mtimeMs };
        }),
    );

    return sessions.filter((session): session is { sessionId: string; mtime: number } =>
      Boolean(session),
    );
  },

  async listSubkeys(key) {
    const sessionDir = path.dirname(keyPath(key));
    const files = await listTranscriptFiles(sessionDir);

    return files
      .map((file) => path.relative(sessionDir, path.dirname(file)))
      .filter((subpath) => subpath && subpath !== ".");
  },
};
