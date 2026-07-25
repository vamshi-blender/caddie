import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caddie",
  description: "Caddie AI assistant",
};

const restoreThemeScript = `
  try {
    const savedTheme = window.localStorage.getItem("caddieTheme");
    if (savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full">
        {children}
        <Script id="restore-theme" strategy="beforeInteractive">
          {restoreThemeScript}
        </Script>
      </body>
    </html>
  );
}
