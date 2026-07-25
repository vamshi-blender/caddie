import type { Metadata } from "next";
import DatabaseSettingsForm from "@/components/settings/DatabaseSettingsForm";

export const metadata: Metadata = {
  title: "Settings — Caddie",
};

export default function SettingsPage() {
  return <DatabaseSettingsForm />;
}
