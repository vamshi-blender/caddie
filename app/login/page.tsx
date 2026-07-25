import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/login/LoginForm";
import { getCurrentSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Log in — Caddie",
};

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/");
  return <LoginForm />;
}
