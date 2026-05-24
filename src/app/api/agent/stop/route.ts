import { stopAgentSession } from "@/lib/agent/run-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
  };

  if (!body.sessionId) {
    return Response.json({ stopped: false, error: "sessionId is required." }, { status: 400 });
  }

  const stopped = await stopAgentSession(body.sessionId);

  return Response.json({ stopped });
}
