"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileUpIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { CATEGORY_LABELS, SCORER_LABELS } from "@/lib/labels";
import type { Scorer, SuiteCategory, SuiteInfo, SuiteUploadIn } from "@/lib/types";

const EXAMPLES: Partial<Record<Scorer, string>> = {
  choice: '{"input": "Which planet is largest?", "choices": ["Mars", "Jupiter", "Venus"], "target": "B"}',
  numeric: '{"input": "What is 17 * 3?", "target": "51"}',
  exact: '{"input": "Capital of Japan? Answer in one word.", "target": ["Tokyo"]}',
  contains: '{"input": "Name a primary color.", "target": ["red", "blue", "yellow"]}',
  f1: '{"input": "Who wrote it?", "context": "The book was written by R. K. Narayan.", "target": "R. K. Narayan"}',
  rouge_l: '{"input": "Summarize.", "context": "<long text>", "target": "<reference summary>"}',
  json: '{"input": "Extract name and age: Asha, 31", "target": {"name": "Asha", "age": 31}}',
  ifeval: '{"input": "Describe tea in 2 bullets.", "constraints": [{"type": "num_bullets", "value": 2}]}',
  judge: '{"input": "Explain DNS simply.", "target": "Maps names to IP addresses; uses an analogy; accurate."}',
  code: '{"input": "def add(a, b):\\n    \\"\\"\\"Return a + b.\\"\\"\\"\\n", "entry_point": "add", "tests": "def check(f):\\n    assert f(2, 3) == 5"}',
};

const TEMPLATES: Partial<Record<Scorer, string>> = {
  choice: "{context}Question: {input}\n\n{choices}\n\nRespond with only the letter of the correct answer.",
  numeric: "{input}\n\nGive the final answer on its own line as 'Answer: <number>'.",
  f1: "Passage:\n{context}\n\nQuestion: {input}\nAnswer with a short phrase from the passage.",
  rouge_l: "Summarize the following text in one or two sentences.\n\n{context}",
  json: "{input}\n\nReply with only a JSON object.",
  code: "Complete this Python function. Return it in a ```python code block.\n\n```python\n{input}\n```",
};

const INITIAL: SuiteUploadIn = {
  name: "",
  description: "",
  category: "custom",
  scorer: "exact",
  prompt_template: "{input}",
  system_prompt: null,
  max_tokens: 512,
  jsonl: "",
};

export function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (suite: SuiteInfo) => void;
}) {
  const [form, setForm] = useState<SuiteUploadIn>(INITIAL);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof SuiteUploadIn>(key: K, value: SuiteUploadIn[K]) => setForm((f) => ({ ...f, [key]: value }));
  const lines = form.jsonl.split("\n").filter((l) => l.trim()).length;

  async function readFile(file: File) {
    set("jsonl", await file.text());
    if (!form.name) set("name", file.name.replace(/\.(jsonl|json|txt)$/i, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const suite = await api.post<SuiteInfo>("/suites", { ...form, system_prompt: form.system_prompt?.trim() || null });
      toast.success(`Created ${suite.name} with ${suite.item_count} items`);
      onUploaded(suite);
      setForm(INITIAL);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Create a custom benchmark</DialogTitle>
            <DialogDescription>
              Upload your own test set as JSONL: one JSON object per line with an <code className="font-mono">input</code>{" "}
              and, depending on the scorer, a <code className="font-mono">target</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="suite-name">Name</Label>
              <Input id="suite-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Support FAQ" required />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v as SuiteCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Scorer</Label>
            <Select
              value={form.scorer}
              onValueChange={(v) => {
                const scorer = v as Scorer;
                setForm((f) => ({ ...f, scorer, prompt_template: TEMPLATES[scorer] ?? "{input}" }));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCORER_LABELS).map(([id, s]) => (
                  <SelectItem key={id} value={id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{SCORER_LABELS[form.scorer].description}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="template">Prompt template</Label>
            <Textarea
              id="template"
              rows={3}
              value={form.prompt_template}
              onChange={(e) => set("prompt_template", e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-muted-foreground text-xs">
              Placeholders: <code className="font-mono">{"{input}"}</code>, <code className="font-mono">{"{context}"}</code>,{" "}
              <code className="font-mono">{"{choices}"}</code> (rendered as A. … B. …).
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="jsonl">Items (JSONL)</Label>
              <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-xs">
                <FileUpIcon className="size-3.5" /> Load file
                <input
                  type="file"
                  accept=".jsonl,.json,.txt"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
                />
              </label>
            </div>
            <Textarea
              id="jsonl"
              rows={7}
              value={form.jsonl}
              onChange={(e) => set("jsonl", e.target.value)}
              placeholder={EXAMPLES[form.scorer]}
              className="font-mono text-xs"
              required
            />
            <p className="text-muted-foreground text-xs">
              {lines} item{lines === 1 ? "" : "s"}. Example line: <code className="font-mono break-all">{EXAMPLES[form.scorer]}</code>
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-2">
              <Label htmlFor="system">
                System prompt <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input id="system" value={form.system_prompt ?? ""} onChange={(e) => set("system_prompt", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_tokens">Max tokens</Label>
              <Input
                id="max_tokens"
                type="number"
                min={16}
                max={8192}
                value={form.max_tokens}
                onChange={(e) => set("max_tokens", Number(e.target.value) || 512)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !lines}>
              {busy && <Loader2Icon className="animate-spin" />} Create benchmark
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
