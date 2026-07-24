import type { ToolExecutor } from "./protocol";

const PENDING_RUN_TTL_MS = 10 * 60 * 1000;

export interface PendingRun {
  serializedState: string;
  conversationId: string;
  toolCallId: string;
  toolName: string;
  executor: ToolExecutor;
  createdAt: number;
}

declare global {
  var __caddiePendingRuns: Map<string, PendingRun> | undefined;
}

const pendingRuns =
  globalThis.__caddiePendingRuns ?? new Map<string, PendingRun>();

if (process.env.NODE_ENV !== "production") {
  globalThis.__caddiePendingRuns = pendingRuns;
}

function removeExpiredRuns() {
  const cutoff = Date.now() - PENDING_RUN_TTL_MS;
  for (const [runId, pending] of pendingRuns) {
    if (pending.createdAt < cutoff) pendingRuns.delete(runId);
  }
}

export function savePendingRun(run: Omit<PendingRun, "createdAt">): string {
  removeExpiredRuns();
  const runId = crypto.randomUUID();
  pendingRuns.set(runId, { ...run, createdAt: Date.now() });
  return runId;
}

export function takePendingRun(runId: string): PendingRun | undefined {
  removeExpiredRuns();
  const pending = pendingRuns.get(runId);
  if (pending) pendingRuns.delete(runId);
  return pending;
}
