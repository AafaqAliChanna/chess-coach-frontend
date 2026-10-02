"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import {
  humanizePattern,
  isPatternTag,
  type PatternBetterLine,
  type PatternDetail,
  type PatternOccurrence,
  type PatternTrend,
} from "@/lib/patterns";

function gamePlyHref(occurrence: PatternOccurrence): string {
  return `/games/${occurrence.gameId}?ply=${occurrence.plyNumber}`;
}

function trendCopy(trend: PatternTrend): string {
  if (trend === "IMPROVING") return "You've cut this down recently.";
  if (trend === "DECLINING") return "This has crept up lately — worth a look.";
  if (trend === "STABLE") return "Holding steady.";
  return "Not enough games yet to show a trend.";
}

function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function OccurrenceLink({ occurrence }: { occurrence: PatternOccurrence }) {
  return (
    <Link href={gamePlyHref(occurrence)} className="flex items-center gap-3 border-b border-hairline py-3 text-sm hover:bg-hairline/20">
      <div className="w-16 shrink-0">
        <Chessboard options={{ position: occurrence.fenBefore, allowDragging: false }} />
      </div>
      <span className="min-w-0 flex-1">
        Move <span className="font-mono">{occurrence.plyNumber}</span>{" "}
        <span className="font-mono">{occurrence.san}</span>
        <span className="mt-1 block text-xs text-foreground/60">
          Engine recommends <span className="font-mono">{occurrence.bestMoveSan}</span>
          {occurrence.pieceHung && <> · hangs {label(occurrence.pieceHung)}</>}
        </span>
      </span>
      <span className="shrink-0 text-xs text-foreground/60">{occurrence.winPercentLoss}% lost</span>
    </Link>
  );
}

function BetterLineSteps({ fenBefore, line }: { fenBefore: string; line: PatternBetterLine }) {
  const [step, setStep] = useState(-1);
  const position = step === -1 ? fenBefore : line.fensAfterEachMove[step];

  return (
    <div className="mt-4 max-w-[280px]">
      <div className="aspect-square w-full">
        <Chessboard options={{ position, allowDragging: false }} />
      </div>
      <div className="mt-2 flex items-center justify-between border border-hairline bg-board/5 px-2 py-1.5">
        <button onClick={() => setStep((current) => Math.max(-1, current - 1))} disabled={step === -1} className="text-xs text-foreground hover:text-board disabled:opacity-30">
          ← Prev
        </button>
        <span className="font-mono text-xs text-foreground">{step === -1 ? "Start" : line.movesSan[step]}</span>
        <button onClick={() => setStep((current) => Math.min(line.movesSan.length - 1, current + 1))} disabled={step === line.movesSan.length - 1} className="text-xs text-foreground hover:text-board disabled:opacity-30">
          Next →
        </button>
      </div>
    </div>
  );
}

function TeachingCard({ title, occurrence }: { title: string; occurrence: PatternOccurrence }) {
  return (
    <section className="border border-hairline p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/60">{title}</p>
          <p className="mt-1 text-sm text-foreground/70">
            Move {occurrence.plyNumber} · {label(occurrence.gamePhase)} · cost {occurrence.winPercentLoss}% win probability
          </p>
        </div>
        <Link href={gamePlyHref(occurrence)} className="shrink-0 text-xs text-board hover:underline">View game →</Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,280px)_1fr]">
        <div className="aspect-square w-full max-w-[280px]">
          <Chessboard options={{ position: occurrence.fenBefore, allowDragging: false }} />
        </div>
        <div className="text-sm text-foreground">
          <p>You played <span className="font-mono font-semibold">{occurrence.san}</span>.</p>
          <p className="mt-2">The engine recommends instead <span className="font-mono font-semibold text-board">{occurrence.bestMoveSan}</span>.</p>
          {occurrence.pieceHung && <p className="mt-2 text-foreground/70">What was hanging: <span className="font-medium">{label(occurrence.pieceHung)}</span>.</p>}
          {occurrence.betterLine && <BetterLineSteps fenBefore={occurrence.fenBefore} line={occurrence.betterLine} />}
        </div>
      </div>
    </section>
  );
}

function Breakdown({ title, values, small = false }: { title: string; values: Record<string, number>; small?: boolean }) {
  const entries = Object.entries(values).sort(([, a], [, b]) => b - a);
  const maximum = Math.max(...entries.map(([, value]) => value), 1);

  return (
    <section className={`border border-hairline p-5 ${small ? "" : "bg-board/5"}`}>
      <h2 className={`${small ? "text-base" : "text-xl"} font-serif text-foreground`}>{title}</h2>
      <div className="mt-4 space-y-3">
        {entries.map(([name, value]) => (
          <div key={name}>
            <div className="mb-1 flex justify-between gap-3 text-sm text-foreground">
              <span>{label(name)}</span><span className="font-mono">{value}</span>
            </div>
            <div className="h-2 bg-hairline/40"><div className="h-2 bg-board" style={{ width: `${(value / maximum) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PatternDetailPage() {
  const params = useParams();
  const tag = typeof params.tag === "string" ? params.tag : null;
  const { user } = useAuth();
  const playerName = user?.playerName ?? null;
  const [data, setData] = useState<PatternDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!playerName || !isPatternTag(tag)) return;
    fetch(`${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/patterns/${tag}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        return response.json() as Promise<PatternDetail>;
      })
      .then((response) => {
        setError("");
        setData(response);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [playerName, tag]);

  if (!playerName) {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">Pattern detail</h1>
        <p className="text-sm text-foreground">
          Set your player name in{" "}
          <Link href="/profile" className="text-board underline">Profile</Link> to see this pattern.
        </p>
      </div>
    );
  }
  if (!isPatternTag(tag)) return <p className="p-8 text-red-700">Unknown pattern.</p>;
  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!data || data.playerName !== playerName) return <p className="p-8 text-foreground">Loading…</p>;

  return (
    <div className="px-8 py-12">
      <Link href="/chess-dna" className="mb-5 inline-block text-sm text-board hover:underline">← My Chess DNA</Link>
      <h1 className="mb-2 font-serif text-3xl text-foreground">{humanizePattern(data.pattern)}</h1>
      <p className="mb-8 text-sm text-foreground/60">
        {data.gamesAnalyzed} games analyzed · {data.totalOccurrences} occurrences · {data.gamesAffected} games affected
      </p>

      <div className="max-w-3xl space-y-6">
        <section className="border border-hairline bg-board/5 p-6">
          {data.cleanGameStreak > 0 ? (
            <>
              <p className="font-serif text-4xl text-board">🔥 {data.cleanGameStreak}</p>
              <p className="mt-1 text-sm text-foreground">games since your last one.</p>
            </>
          ) : data.mostRecentOccurrence ? (
            <p className="text-lg text-foreground">
              Last seen: move {data.mostRecentOccurrence.plyNumber} ({data.mostRecentOccurrence.san}) in your most recent game.
            </p>
          ) : (
            <p className="text-sm text-foreground/70">No occurrence is available yet.</p>
          )}
        </section>

        {data.worstOccurrence && (
          <TeachingCard title="Costliest moment" occurrence={data.worstOccurrence} />
        )}

        <Breakdown title="What you hang" values={data.occurrencesByPieceHung} />
        <Breakdown title="When it happens" values={data.occurrencesByPhase} small />

        {data.mostRecentOccurrence && (
          <TeachingCard title="Most recent occurrence" occurrence={data.mostRecentOccurrence} />
        )}

        {data.costEvidence && (
          <section className="border border-hairline p-5">
            <p className="text-lg text-foreground">
              Games with this pattern end without a win {data.costEvidence.gamesWithPatternLostOrDrawnPercent}% of the time — versus{" "}
              {data.costEvidence.gamesWithoutPatternLostOrDrawnPercent}% when you avoid it.
            </p>
            <p className="mt-3 border-l-2 border-hairline pl-3 text-sm text-foreground/70">{data.costEvidence.note}</p>
          </section>
        )}

        <p className={`text-sm ${data.trend === "IMPROVING" ? "text-board" : "text-foreground/70"}`}>
          {trendCopy(data.trend)}
        </p>

        <section>
          <h2 className="mb-2 font-serif text-xl text-foreground">Recent occurrences</h2>
          {data.recentOccurrences.length === 0 ? (
            <p className="text-sm text-foreground/60">No recent occurrences.</p>
          ) : (
            <div>{data.recentOccurrences.map((occurrence) => <OccurrenceLink key={`${occurrence.gameId}-${occurrence.plyNumber}`} occurrence={occurrence} />)}</div>
          )}
        </section>
      </div>
    </div>
  );
}
