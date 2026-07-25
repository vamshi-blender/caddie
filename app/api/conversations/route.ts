import OpenAI from "openai";
import { z } from "zod";
import {
  isConversationOwner,
  removeConversationOwner,
} from "@/lib/auth/ownership";
import { getCurrentSession, unauthorizedResponse } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deleteConversationSchema = z
  .object({
    conversationId: z.string().min(1).max(200),
  })
  .strict();

function unavailableReason(): string | null {
  if (!process.env.OPENAI_API_KEY) return "OPENAI_API_KEY is not configured.";
  return null;
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession();
  if (!session) return unauthorizedResponse();

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

  const parsed = deleteConversationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "A valid conversation ID is required." },
      { status: 400 },
    );
  }

  if (
    !(await isConversationOwner(
      parsed.data.conversationId,
      session.userId,
    ))
  ) {
    return Response.json(
      { error: "That conversation is not available to this account." },
      { status: 403 },
    );
  }

  try {
    const openai = new OpenAI();
    await openai.conversations.delete(parsed.data.conversationId, {
      signal: request.signal,
    });
    await removeConversationOwner(parsed.data.conversationId, session.userId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof OpenAI.APIError && error.status === 404) {
      await removeConversationOwner(parsed.data.conversationId, session.userId);
      return new Response(null, { status: 204 });
    }

    console.error("Failed to delete an OpenAI conversation", error);
    return Response.json(
      { error: "Caddie could not delete that conversation. Please try again." },
      { status: 502 },
    );
  }
}
