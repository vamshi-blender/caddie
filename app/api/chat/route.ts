import { z } from "zod";
import OpenAI from "openai";
import { streamCaddieRun } from "@/lib/agents/stream-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(20_000),
    conversationId: z.string().min(1).max(200).optional(),
  })
  .strict();

function unavailableReason(): string | null {
  if (!process.env.OPENAI_API_KEY) return "OPENAI_API_KEY is not configured.";
  return null;
}

export async function POST(request: Request) {
  const unavailable = unavailableReason();
  if (unavailable) {
    return Response.json({ error: unavailable }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "A non-empty message is required." },
      { status: 400 },
    );
  }

  let conversationId = parsed.data.conversationId;
  if (!conversationId) {
    try {
      const openai = new OpenAI();
      const conversation = await openai.conversations.create(
        {},
        { signal: request.signal },
      );
      conversationId = conversation.id;
    } catch (error) {
      console.error("Failed to create an OpenAI conversation", error);
      return Response.json(
        { error: "Caddie could not start a conversation. Please try again." },
        { status: 502 },
      );
    }
  }

  const stream = streamCaddieRun({
    input: parsed.data.message,
    conversationId,
    signal: request.signal,
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
