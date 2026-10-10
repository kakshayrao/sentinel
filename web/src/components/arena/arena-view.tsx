"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { EqualIcon, Loader2Icon, RotateCcwIcon, SwordsIcon, ThumbsDownIcon, TrophyIcon } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page-header";
import { EmptyState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, useLeaderboard, useModels } from "@/lib/api";
import { ms, tps } from "@/lib/format";
import type { Battle, BattleSide, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";

const RANDOM = "random";

function Answer({ label, side, winner, revealed }: { label: string; side: BattleSide; winner: boolean; revealed: boolean }) {
  return (
    <Card className={cn("gap-3 transition-colors", winner && "border-emerald-500/60 ring-2 ring-emerald-500/15")}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {label}
          {winner && <TrophyIcon className="size-4 text-emerald-500" />}
        </CardTitle>
        {revealed ? (
          <Badge variant="secondary" className="max-w-[60%] truncate">
            {side.model_name}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">Hidden until you vote</span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            "bg-muted/40 max-h-[28rem] min-h-40 overflow-y-auto rounded-md border p-4 text-sm leading-relaxed whitespace-pre-wrap",
            side.error && "text-destructive",
          )}
        >
          {side.error ?? side.response}
        </div>
        <div className="text-muted-foreground tabular flex gap-4 text-xs">
          <span>{ms(side.latency_ms)}</span>
          <span>{tps(side.tokens_per_sec)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function BattleTab({ onVoted }: { onVoted: () => void }) {
  const { data: models } = useModels();
  const [prompt, setPrompt] = useState("");
  const [modelA, setModelA] = useState(RANDOM);
  const [modelB, setModelB] = useState(RANDOM);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(false);

  const enough = (models?.length ?? 0) >= 2;
  const picksValid = (modelA === RANDOM) === (modelB === RANDOM) && (modelA === RANDOM || modelA !== modelB);

  async function start() {
    setLoading(true);
    setBattle(null);
    try {
      const body = modelA === RANDOM ? { prompt } : { prompt, model_a_id: modelA, model_b_id: modelB };
      setBattle(await api.post<Battle>("/arena/battles", body));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function vote(winner: Verdict) {
    if (!battle) return;
    try {
      setBattle(await api.post<Battle>(`/arena/battles/${battle.id}/vote`, { winner }));
      onVoted();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (models && !enough) {
    return (
      <EmptyState
        icon={<SwordsIcon />}
        title="The arena needs two models"
        description="Add at least two models (for example two quantizations of the same model) to compare them blind."
      >
        <Button asChild>
          <Link href="/models?new=1">Add model</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="arena-prompt">Prompt</Label>
            <Textarea
              id="arena-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask anything. Both models answer, and you pick the better reply without knowing which is which."
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {(["A", "B"] as const).map((slot) => (
              <div key={slot} className="space-y-2 sm:w-56">
                <Label>Model {slot}</Label>
                <Select value={slot === "A" ? modelA : modelB} onValueChange={slot === "A" ? setModelA : setModelB}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RANDOM}>Random (blind)</SelectItem>
                    {models?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button className="sm:ml-auto" onClick={start} disabled={!prompt.trim() || loading || !picksValid}>
              {loading ? <Loader2Icon className="animate-spin" /> : <SwordsIcon />} {loading ? "Generating…" : "Battle"}
            </Button>
          </div>
          {!picksValid && <p className="text-muted-foreground text-xs">Pick two different models, or leave both on Random.</p>}
        </CardContent>
      </Card>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <LoadingRows rows={4} />
          <LoadingRows rows={4} />
        </div>
      )}

      {battle && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Answer label="Model A" side={battle.a} winner={battle.winner === "a"} revealed={!!battle.winner} />
            <Answer label="Model B" side={battle.b} winner={battle.winner === "b"} revealed={!!battle.winner} />
          </div>
          {battle.winner ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-muted-foreground text-sm">Vote recorded. The leaderboard is updated.</p>
              <Button variant="outline" onClick={start} disabled={loading}>
                <RotateCcwIcon /> Same prompt, new pair
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-4">
              <Button variant="outline" onClick={() => vote("a")}>
                A is better
              </Button>
              <Button variant="outline" onClick={() => vote("tie")}>
                <EqualIcon /> Tie
              </Button>
              <Button variant="outline" onClick={() => vote("both_bad")}>
                <ThumbsDownIcon /> Both are bad
              </Button>
              <Button variant="outline" onClick={() => vote("b")}>
                B is better
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LeaderboardTab() {
  const { data, isLoading } = useLeaderboard();
  if (isLoading) return <LoadingRows rows={4} />;
  if (!data?.length) {
    return <EmptyState icon={<TrophyIcon />} title="No votes yet" description="Vote in a few battles and an Elo leaderboard appears here." />;
  }
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Elo ratings</CardTitle>
        <CardDescription>
          Every model starts at 1000. Ties and &ldquo;both are bad&rdquo; count as draws. Ratings settle after a few dozen votes.
        </CardDescription>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 pl-6">#</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Rating</TableHead>
            <TableHead className="text-right">Battles</TableHead>
            <TableHead className="hidden text-right sm:table-cell">W / L / D</TableHead>
            <TableHead className="pr-6 text-right">Win rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r, i) => (
            <TableRow key={r.model_id}>
              <TableCell className="text-muted-foreground pl-6 font-mono text-xs">{i + 1}</TableCell>
              <TableCell className="font-medium">
                {r.model_name}
                {i === 0 && <TrophyIcon className="ml-2 inline size-3.5 text-amber-500" />}
              </TableCell>
              <TableCell className="tabular text-right font-semibold">{Math.round(r.rating)}</TableCell>
              <TableCell className="tabular text-right">{r.battles}</TableCell>
              <TableCell className="tabular text-muted-foreground hidden text-right sm:table-cell">
                {r.wins} / {r.losses} / {r.ties}
              </TableCell>
              <TableCell className="tabular pr-6 text-right">{r.battles ? `${Math.round((r.wins / r.battles) * 100)}%` : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function ArenaView() {
  const { mutate } = useLeaderboard();
  return (
    <>
      <PageHeader
        title="Arena"
        description="Blind side-by-side comparisons. Your votes become Elo ratings, the method behind Chatbot Arena."
      />
      <PageBody>
        <Tabs defaultValue="battle">
          <TabsList>
            <TabsTrigger value="battle">Battle</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>
          <TabsContent value="battle" className="pt-4">
            <BattleTab onVoted={() => mutate()} />
          </TabsContent>
          <TabsContent value="leaderboard" className="pt-4">
            <LeaderboardTab />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
