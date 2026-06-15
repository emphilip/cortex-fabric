import type { ReactNode } from "react";
import "./globals.css";

import { Sidebar } from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";

export const metadata = {
  title: "Cortex — Admin",
  description: "Inspect queries, audits, and provider health.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Sidebar />
          <main className="mx-auto max-w-6xl px-6 py-6 md:ml-56">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
