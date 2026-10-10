"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";

import { CommandMenu } from "@/components/command-menu";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/runs", label: "Runs" },
  { href: "/models", label: "Models" },
  { href: "/benchmarks", label: "Benchmarks" },
  { href: "/playground", label: "Playground" },
  { href: "/arena", label: "Arena" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function ApiStatus() {
  const { data, error, isLoading } = useHealth();
  const online = !!data && !error;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground hidden items-center gap-2 text-xs sm:flex">
          <span className="relative flex size-2">
            {online && <span className="bg-success absolute inline-flex size-full animate-ping rounded-full opacity-50" />}
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                isLoading ? "bg-muted-foreground" : online ? "bg-success" : "bg-destructive",
              )}
            />
          </span>
          {isLoading ? "Connecting" : online ? "API online" : "API offline"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {online ? `Sentinel API v${data.version}` : "Start the backend: sentinel serve"}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  );
}

function NavTabs({ pathname }: { pathname: string | null }) {
  return (
    <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4">
      {NAV.map((item) => {
        const active = pathname !== null && isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative px-3 pt-1 pb-3 text-sm transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active && <span className="bg-foreground absolute inset-x-3 -bottom-px h-0.5 rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** The current path is runtime data on dynamic routes, so it streams in behind Suspense. */
function ActiveNavTabs() {
  return <NavTabs pathname={usePathname()} />;
}

export function SiteHeader() {
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="size-5" />
          Sentinel
        </Link>
        <span className="text-muted-foreground/40 select-none text-lg font-light">/</span>
        <span className="text-muted-foreground truncate text-sm">Local workspace</span>
        <div className="ml-auto flex items-center gap-2">
          <ApiStatus />
          <CommandMenu />
          <ThemeToggle />
        </div>
      </div>
      <Suspense fallback={<NavTabs pathname={null} />}>
        <ActiveNavTabs />
      </Suspense>
    </header>
  );
}
