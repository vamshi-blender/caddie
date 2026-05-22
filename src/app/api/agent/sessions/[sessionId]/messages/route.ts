import { getAgentMessages } from "@/lib/agent/session-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const messages = await getAgentMessages(sessionId);

  return Response.json({ messages });
}
