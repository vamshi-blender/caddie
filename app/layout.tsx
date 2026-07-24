import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caddie",
  description: "Caddie AI assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
