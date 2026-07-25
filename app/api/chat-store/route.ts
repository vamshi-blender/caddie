import { z } from "zod";
import {
  loadStoredChats,
  saveStoredChats,
} from "@/lib/db/chat-store";
import { getCurrentSession, unauthorizedResponse } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const commentarySchema = z
  .object({
    id: z.string().min(1).max(300),
    type: z.literal("commentary"),
    content: z.string().max(100_000),
  })
  .strict();

const toolSchema = z
  .object({
    id: z.string().min(1).max(300),
    type: z.literal("tool"),
    callId: z.string().min(1).max(300),
    name: z.string().min(1).max(200),
    executor: z.enum(["client", "server"]),
    arguments: z.record(z.string(), z.unknown()),
    status: z.enum(["completed", "rejected", "failed"]),
    output: z.string().max(100_000).optional(),
    startedAt: z.number().finite().nonnegative(),
    completedAt: z.number().finite().nonnegative().optional(),
  })
  .strict();

const workSchema = z
  .object({
    startedAt: z.number().finite().nonnegative(),
    completedAt: z.number().finite().nonnegative().optional(),
    items: z.array(z.union([commentarySchema, toolSchema])).max(500),
  })
  .strict();

const messageSchema = z.discriminatedUnion("role", [
  z
    .object({
      id: z.string().uuid(),
      role: z.literal("user"),
      content: z.string().max(100_000),
    })
    .strict(),
  z
    .object({
      id: z.string().uuid(),
      role: z.literal("assistant"),
      content: z.string().max(200_000),
      status: z.literal("done"),
      work: workSchema.optional(),
    })
    .strict(),
]);

const chatSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().max(56),
    titleStatus: z.enum(["pending", "generated", "fallback", "manual"]),
    messages: z.array(messageSchema).max(2_000),
    conversationId: z.string().min(1).max(200),
    pinned: z.boolean(),
    createdAt: z.number().finite().nonnegative(),
    updatedAt: z.number().finite().nonnegative(),
  })
  .strict();

const saveSchema = z
  .object({
    chats: z.array(chatSchema).max(500),
  })
  .strict();

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return unauthorizedResponse();

  try {
    return Response.json(await loadStoredChats(session.userId));
  } catch (error) {
    console.error("Could not load chat history", error);
    return Response.json(
      { error: "Chat history could not be loaded." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid chat data." }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid chat data." }, { status: 400 });
  }

  try {
    await saveStoredChats(session.userId, parsed.data.chats);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Could not save chat history", error);
    return Response.json(
      { error: "Chat history could not be saved." },
      { status: 503 },
    );
  }
}
