import { redirect } from "next/navigation";
import ChatLayout from "@/components/chat/ChatLayout";
import { getCurrentSession } from "@/lib/auth/session";

function displayNameFromEmail(email: string): string {
  const localPart = email.split("@", 1)[0] ?? "";
  const firstName = localPart.split(".", 1)[0]?.trim() ?? "";
  if (!firstName) return "Caddie User";

  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

// The (app) layout above is the real auth gate; the check here is a defensive
// fallback that also narrows `session` for the display name below.
export default async function ChatShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return (
    <>
      <ChatLayout userName={displayNameFromEmail(session.email)} userEmail={session.email} />
      {children}
    </>
  );
}
