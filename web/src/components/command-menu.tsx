"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BoxIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MessageSquareIcon,
  MoonIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  SwordsIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useRuns } from "@/lib/api";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { data: runs } = useRuns();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hidden h-8 w-56 justify-between font-normal md:inline-flex"
      >
        <span className="flex items-center gap-2">
          <SearchIcon className="size-3.5" />
          Search…
        </span>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <Button variant="ghost" size="icon" className="size-8 md:hidden" onClick={() => setOpen(true)} aria-label="Search">
        <SearchIcon />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Command menu" description="Jump to a page or run an action">
        <Command>
          <CommandInput placeholder="Type a command or search runs…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => go("/runs/new")}>
                <PlayIcon /> New evaluation run
              </CommandItem>
              <CommandItem onSelect={() => go("/models?new=1")}>
                <PlusIcon /> Add model
              </CommandItem>
              <CommandItem onSelect={() => go("/benchmarks?import=1")}>
                <FlaskConicalIcon /> Import a benchmark
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  setOpen(false);
                }}
              >
                {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />} Toggle theme
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigate">
              <CommandItem onSelect={() => go("/")}>
                <LayoutDashboardIcon /> Overview
              </CommandItem>
              <CommandItem onSelect={() => go("/runs")}>
                <ListChecksIcon /> Runs
              </CommandItem>
              <CommandItem onSelect={() => go("/models")}>
                <BoxIcon /> Models
              </CommandItem>
              <CommandItem onSelect={() => go("/benchmarks")}>
                <FlaskConicalIcon /> Benchmarks
              </CommandItem>
              <CommandItem onSelect={() => go("/playground")}>
                <MessageSquareIcon /> Playground
              </CommandItem>
              <CommandItem onSelect={() => go("/arena")}>
                <SwordsIcon /> Arena
              </CommandItem>
            </CommandGroup>
            {runs && runs.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Recent runs">
                  {runs.slice(0, 8).map((r) => (
                    <CommandItem key={r.id} value={`${r.name} ${r.model_name} ${r.id}`} onSelect={() => go(`/runs/${r.id}`)}>
                      <ListChecksIcon />
                      <span className="truncate">{r.name}</span>
                      <span className="text-muted-foreground ml-auto truncate text-xs">{r.model_name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
