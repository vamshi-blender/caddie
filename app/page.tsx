import { redirect } from "next/navigation";
import ChatLayout from "@/components/chat/ChatLayout";
import { getCurrentSession } from "@/lib/auth/session";

export default async function Home() {
  if (!(await getCurrentSession())) redirect("/login");
  return <ChatLayout />;
}
