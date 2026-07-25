import { deleteSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await deleteSession();
  return new Response(null, { status: 204 });
}
