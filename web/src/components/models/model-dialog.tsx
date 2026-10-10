"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { SERVER_PRESETS } from "@/lib/labels";
import type { Model, ModelIn } from "@/lib/types";

const EMPTY: ModelIn = {
  name: "",
  kind: "openai",
  base_url: "http://localhost:11434/v1",
  model: "",
  api_key_env: null,
  notes: null,
};

export function ModelDialog({
  open,
  onOpenChange,
  model,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model?: Model | null;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Mounted fresh on every open, so the form starts from the current model */}
        <ModelForm key={model?.id ?? "new"} model={model} onDone={() => onOpenChange(false)} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function ModelForm({ model, onDone, onSaved }: { model?: Model | null; onDone: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ModelIn>(() => (model ? { ...model } : EMPTY));
  const [available, setAvailable] = useState<string[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ModelIn>(key: K, value: ModelIn[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function fetchModels() {
    if (!form.base_url) return;
    setFetching(true);
    try {
      const ids = await api.get<string[]>(`/server-models?base_url=${encodeURIComponent(form.base_url)}`);
      setAvailable(ids);
      if (ids.length === 0) toast.info("The server is running but has no models loaded.");
    } catch (e) {
      setAvailable(null);
      toast.error((e as Error).message);
    } finally {
      setFetching(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const body = {
      ...form,
      name: form.name.trim() || form.model?.trim() || "Untitled model",
      api_key_env: form.api_key_env?.trim() || null,
      notes: form.notes?.trim() || null,
    };
    try {
      if (model) await api.put(`/models/${model.id}`, body);
      else await api.post("/models", body);
      toast.success(model ? "Model updated" : `Added ${body.name}`);
      onSaved();
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const isBaseline = form.kind === "baseline";

  return (
    <form onSubmit={save} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{model ? "Edit model" : "Add a model"}</DialogTitle>
        <DialogDescription>
          Any server with an OpenAI-compatible API works: Ollama, LM Studio, llama.cpp, vLLM, Jan and others.
        </DialogDescription>
      </DialogHeader>

      {!isBaseline && (
        <>
          <div className="space-y-2">
            <Label>Server</Label>
            <div className="flex flex-wrap gap-1.5">
              {SERVER_PRESETS.map((p) => (
                <Button
                  key={p.name}
                  type="button"
                  size="sm"
                  variant={form.base_url === p.base_url ? "default" : "outline"}
                  className="h-7"
                  onClick={() => {
                    set("base_url", p.base_url);
                    setAvailable(null);
                  }}
                >
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="base_url">Base URL</Label>
            <Input
              id="base_url"
              value={form.base_url ?? ""}
              onChange={(e) => set("base_url", e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="font-mono text-sm"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="model">Model id</Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={fetchModels}
                disabled={fetching}
              >
                {fetching ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} List models on server
              </Button>
            </div>
            {available && available.length > 0 ? (
              <Select value={form.model ?? ""} onValueChange={(v) => set("model", v)}>
                <SelectTrigger id="model" className="w-full font-mono text-sm">
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((id) => (
                    <SelectItem key={id} value={id} className="font-mono text-sm">
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="model"
                value={form.model ?? ""}
                onChange={(e) => set("model", e.target.value)}
                placeholder="llama3.1:8b"
                className="font-mono text-sm"
                required
              />
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Display name</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={form.model || "My fine-tune v2"}
        />
      </div>

      {!isBaseline && (
        <div className="space-y-2">
          <Label htmlFor="api_key_env">
            API key variable <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="api_key_env"
            value={form.api_key_env ?? ""}
            onChange={(e) => set("api_key_env", e.target.value)}
            placeholder="MY_SERVER_API_KEY"
            className="font-mono text-sm"
          />
          <p className="text-muted-foreground text-xs">
            Name of an environment variable on the backend that holds the key. The key itself is never stored.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id="notes"
          rows={2}
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Quantization, training data, checkpoint…"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2Icon className="animate-spin" />}
          {model ? "Save changes" : "Add model"}
        </Button>
      </DialogFooter>
    </form>
  );
}
