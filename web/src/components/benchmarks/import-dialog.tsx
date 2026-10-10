"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, DownloadIcon, Loader2Icon } from "lucide-react";

import { CategoryBadge, CodeTag } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, useHub } from "@/lib/api";
import type { SuiteInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ImportDialog({
  open,
  onOpenChange,
  installed,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installed: Set<string>;
  onImported: (suite: SuiteInfo) => void;
}) {
  const { data: hub } = useHub();
  const [selected, setSelected] = useState("gsm8k");
  const [limit, setLimit] = useState(100);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const suite = await api.post<SuiteInfo>("/hub/import", { benchmark: selected, limit });
      toast.success(`Imported ${suite.name} with ${suite.item_count} items`);
      onImported(suite);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a standard benchmark</DialogTitle>
          <DialogDescription>
            Downloads a random sample from the Hugging Face datasets server. Larger samples give steadier scores but
            take longer to run.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 max-h-[50vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {hub?.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected(b.id)}
              className={cn(
                "hover:border-foreground/30 rounded-lg border p-3 text-left transition-colors",
                selected === b.id && "border-foreground ring-foreground/10 ring-2",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{b.name}</span>
                {installed.has(`hub-${b.id}`) ? (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <CheckIcon className="size-3" /> Imported
                  </span>
                ) : (
                  <CategoryBadge category={b.category} />
                )}
              </div>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{b.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <CodeTag>{b.dataset}</CodeTag>
                <span className="text-muted-foreground text-[11px]">{b.size}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="limit">Sample size</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={2000}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(2000, Number(e.target.value) || 1)))}
              className="w-32"
            />
          </div>
          <p className="text-muted-foreground pb-2 text-xs">
            Importing again replaces the earlier sample of the same benchmark.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={busy || !selected}>
            {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
