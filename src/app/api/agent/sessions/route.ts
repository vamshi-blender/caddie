import { createSession, listAgentSessions } from "@/lib/agent/session-index";
import { prewarmAgent } from "@/lib/agent/run-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  prewarmAgent();
  const sessions = await listAgentSessions();
  return Response.json({ sessions });
}

export async function POST(request: Request) {
  prewarmAgent();
  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const session = await createSession(body.title);
  return Response.json({ session }, { status: 201 });
}
