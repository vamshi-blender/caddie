import { createSession, listAgentSessions } from "@/lib/agent/session-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = await listAgentSessions();
  return Response.json({ sessions });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const session = await createSession(body.title);
  return Response.json({ session }, { status: 201 });
}
