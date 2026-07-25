import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";

// Guards every route in this group. `/login` lives in the (auth) group
// instead, so it stays reachable while logged out.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await getCurrentSession())) redirect("/login");
  return <>{children}</>;
}
