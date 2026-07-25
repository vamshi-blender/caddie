import { getCurrentSession, unauthorizedResponse } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return unauthorizedResponse();
  return Response.json({ authenticated: true, email: session.email });
}
