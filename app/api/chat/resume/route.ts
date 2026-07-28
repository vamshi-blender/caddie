import { z } from "zod";
import type {
  CaddieRunContext,
  ClientToolResult,
} from "@/lib/agents/caddie-agent";
import { takePendingRun } from "@/lib/agents/pending-runs";
import { restoreRunState, streamCaddieRun } from "@/lib/agents/stream-run";
import { getCurrentSession, unauthorizedResponse } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resumeRequestSchema = z
  .object({
    runId: z.string().uuid(),
    toolCallId: z.string().min(1).max(300),
    approved: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().max(1_000).optional(),
    // User-provided alternative instruction; only meaningful with approved: false.
    instruction: z.string().min(1).max(2_000).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = resumeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid resume request." }, { status: 400 });
  }

  const pending = takePendingRun(parsed.data.runId, session.userId);
  if (!pending || pending.toolCallId !== parsed.data.toolCallId) {
    return Response.json(
      { error: "This tool request expired or was already handled." },
      { status: 410 },
    );
  }

  // Client-executed tools return their result from the browser; the tool's
  // execute() reads it out of the run context. Server-executed tools run on
  // approval inside the SDK, so no client result is expected or stored.
  const clientToolResults: Record<string, ClientToolResult> = {};
  if (pending.executor === "client") {
    const clientResult: ClientToolResult = parsed.data.approved
      ? { ok: true, data: parsed.data.result }
      : {
          ok: false,
          error: parsed.data.error ?? "The user declined this request.",
        };

    if (JSON.stringify(clientResult).length > 60_000) {
      return Response.json(
        { error: "The client tool result is too large." },
        { status: 413 },
      );
    }

    clientToolResults[pending.toolCallId] = clientResult;
  }

  // Held onto so the stream can read what the resumed run's tools write into
  // it (RunState keeps its own copy private).
  const resumedContext: CaddieRunContext = {
    clientToolResults,
    userId: session.userId,
    conversationId: pending.conversationId,
    sqlCallsUsed: 0,
    chartsRendered: 0,
    charts: [],
  };
  const state = await restoreRunState(pending.serializedState, resumedContext);
  const interruption = state
    .getInterruptions()
    .find(
      (item) =>
        item.rawItem.type === "function_call" &&
        item.rawItem.callId === pending.toolCallId &&
        item.name === pending.toolName,
    );

  if (!interruption) {
    return Response.json(
      { error: "The saved tool request is invalid." },
      { status: 409 },
    );
  }

  if (parsed.data.approved) {
    state.approve(interruption);
  } else {
    // The rejection message is delivered to the model as the tool call's
    // output, so an alternative instruction rides along in the same resumed
    // run — no extra model turn needed.
    state.reject(interruption, {
      message: parsed.data.instruction
        ? `The user declined this tool call and instead asked: "${parsed.data.instruction}". Follow the user's instruction.`
        : parsed.data.error ?? "The user declined this request.",
    });
  }

  const stream = streamCaddieRun({
    input: state,
    conversationId: pending.conversationId,
    userId: session.userId,
    signal: request.signal,
    resumedContext,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
