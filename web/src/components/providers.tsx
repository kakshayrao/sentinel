"use client";

import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ errorRetryCount: 2 }}>
        <TooltipProvider delayDuration={150}>
          {children}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
