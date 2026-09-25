"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { getMyPlayerName } from "@/lib/profile";

type PatternTag = "MISSED_MATE" | "ALLOWED_MATE" | "HANGING_PIECE" | "POSITIONAL";

// The backend omits any severity key whose count is 0 rather than sending it
// as 0 (e.g. {"BLUNDER": 1} with no MISTAKE/INACCURACY keys at all) — so
// every field here is optional, and every read of it needs a `?? 0` fallback.
type MistakeCounts = { BLUNDER?: number; MISTAKE?: number; INACCURACY?: number };

type ProgressEntry = {
  gameId: number;
  title: string | null;
  uploadedAt: string;
  totalMoves: number;
  mistakeCounts: MistakeCounts;
  patternsPresent: PatternTag[];
};

type ProgressResponse = {
  playerName: string;
  gamesIncluded: number;
  gamesStillAnalyzing: number;
  patternTotals: Record<PatternTag, number>;
  entries: ProgressEntry[];
};

const PATTERN_LABELS: Record<PatternTag, string> = {
  HANGING_PIECE: "Hanging Piece",
  MISSED_MATE: "Missed Mate",
  ALLOWED_MATE: "Allowed Mate",
  POSITIONAL: "Unclassified",
};

const ACTIONABLE_PATTERNS: PatternTag[] = ["HANGING_PIECE", "MISSED_MATE", "ALLOWED_MATE"];

const WINDOW_OPTIONS = [
  { size: 8 as const, label: "Recent form (last 8)" },
  { size: 20 as const, label: "Full trend (last 20)" },
  { size: "all" as const, label: "All time" },
];
type WindowSize = (typeof WINDOW_OPTIONS)[number]["size"];

// A percentage on a 2-vs-1 comparison isn't a trend, it's noise dressed up as
// confidence — so a percent claim only renders once the earlier half of the
// window has at least this many occurrences to compare against.
const MIN_EARLY_HITS_FOR_PERCENT = 2;

const SEVERITY_COLOR: Record<"BLUNDER" | "MISTAKE" | "INACCURACY", string> = {
  BLUNDER: "bg-red-800",
  MISTAKE: "bg-orange-700",
  INACCURACY: "bg-amber-500",
};

function totalIssues(counts: MistakeCounts): number {
  return (counts.BLUNDER ?? 0) + (counts.MISTAKE ?? 0) + (counts.INACCURACY ?? 0);
}

function computeOverallTrend(entries: ProgressEntry[]) {
  const mid = Math.floor(entries.length / 2);
  const early = entries.slice(0, mid);
  const late = entries.slice(mid);
  const earlyAvg = early.reduce((s, e) => s + totalIssues(e.mistakeCounts), 0) / (early.length || 1);
  const lateAvg = late.reduce((s, e) => s + totalIssues(e.mistakeCounts), 0) / (late.length || 1);
  const changePercent = earlyAvg > 0 ? ((earlyAvg - lateAvg) / earlyAvg) * 100 : null;
  return { earlyAvg, lateAvg, changePercent };
}

function computePatternTrend(entries: ProgressEntry[], tag: PatternTag) {
  const mid = Math.floor(entries.length / 2);
  const early = entries.slice(0, mid);
  const late = entries.slice(mid);
  const earlyHits = early.filter((e) => e.patternsPresent.includes(tag)).length;
  const lateHits = late.filter((e) => e.patternsPresent.includes(tag)).length;

  let cleanStreak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].patternsPresent.includes(tag)) break;
    cleanStreak++;
  }

  return { earlyHits, lateHits, earlyTotal: early.length, lateTotal: late.length, cleanStreak };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function ProgressPage() {
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [windowSize, setWindowSize] = useState<WindowSize>(20);
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPlayerName(getMyPlayerName());
  }, []);

  useEffect(() => {
    if (!playerName) return;
    setLoading(true);
    setError("");
    const query = windowSize === "all" ? "" : `?window=${windowSize}`;
    fetch(`${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/progress${query}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((json: ProgressResponse) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [playerName, windowSize]);

  if (!playerName) {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">Progress</h1>
        <p className="text-sm text-foreground">
          Set your player name in{" "}
          <Link href="/profile" className="text-board underline">
            Profile
          </Link>{" "}
          to see your progress.
        </p>
      </div>
    );
  }

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!data && loading) return <p className="p-8 text-foreground">Loading…</p>;
  if (!data) return null;

  const { entries } = data;

  if (entries.length < 4) {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">Progress</h1>
        <p className="text-sm text-foreground/70">
          Not enough analyzed games yet to show a trend — upload or import a few more, or check back once{" "}
          {data.gamesStillAnalyzing > 0 ? `the ${data.gamesStillAnalyzing} game(s) still analyzing finish` : "more games are analyzed"}.
        </p>
      </div>
    );
  }

  const overall = computeOverallTrend(entries);
  const maxIssues = Math.max(...entries.map((e) => totalIssues(e.mistakeCounts)), 1);

  const rankedPatterns = ACTIONABLE_PATTERNS.filter((t) => (data.patternTotals[t] ?? 0) > 0).sort(
    (a, b) => (data.patternTotals[b] ?? 0) - (data.patternTotals[a] ?? 0)
  );
  const positionalCount = data.patternTotals.POSITIONAL ?? 0;

  let headline: string;
  if (overall.changePercent === null) {
    headline = "Not enough of a baseline yet to call a trend either way.";
  } else if (overall.changePercent > 10) {
    headline = `You're improving — mistakes per game are down ${overall.changePercent.toFixed(0)}% over this window.`;
  } else if (overall.changePercent < -10) {
    headline = `Mistakes per game are up ${Math.abs(overall.changePercent).toFixed(0)}% over this window — worth a closer look.`;
  } else {
    headline = "Roughly steady over this window — no big swing either direction yet.";
  }

  // Overview stats: clean games, severity totals, best/worst game.
  const cleanGames = entries.filter((e) => totalIssues(e.mistakeCounts) === 0).length;
  const severityTotals = entries.reduce(
    (acc, e) => ({
      BLUNDER: acc.BLUNDER + (e.mistakeCounts.BLUNDER ?? 0),
      MISTAKE: acc.MISTAKE + (e.mistakeCounts.MISTAKE ?? 0),
      INACCURACY: acc.INACCURACY + (e.mistakeCounts.INACCURACY ?? 0),
    }),
    { BLUNDER: 0, MISTAKE: 0, INACCURACY: 0 }
  );
  const bestGame = entries.reduce((best, e) => (totalIssues(e.mistakeCounts) < totalIssues(best.mistakeCounts) ? e : best), entries[0]);
  const worstGame = entries.reduce((worst, e) => (totalIssues(e.mistakeCounts) > totalIssues(worst.mistakeCounts) ? e : worst), entries[0]);

  return (
    <div className="px-8 py-12">
      <h1 className="mb-1 font-serif text-3xl text-foreground">Progress</h1>
      <p className="mb-6 text-sm text-foreground/60">
        Based on your {data.gamesIncluded} most recently analyzed games as "{playerName}".
        {data.gamesStillAnalyzing > 0 && ` ${data.gamesStillAnalyzing} more game(s) still analyzing.`}
      </p>

      <div className="mb-6 flex gap-2">
        {WINDOW_OPTIONS.map((opt) => (
          <button
            key={opt.size}
            onClick={() => setWindowSize(opt.size)}
            className={`border px-3 py-1 text-xs ${
              windowSize === opt.size ? "border-board bg-board text-white" : "border-hairline text-foreground hover:bg-hairline/30"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="border border-hairline p-3">
          <p className="text-xs text-foreground/50">Clean games</p>
          <p className="font-serif text-xl text-foreground">
            {cleanGames}/{entries.length}
          </p>
        </div>
        <div className="border border-hairline p-3">
          <p className="text-xs text-foreground/50">This window</p>
          <p className="text-xs text-foreground">
            <span className="text-red-800">{severityTotals.BLUNDER} blunders</span>
            {" · "}
            <span className="text-orange-700">{severityTotals.MISTAKE} mistakes</span>
            {" · "}
            <span className="text-amber-600">{severityTotals.INACCURACY} inaccuracies</span>
          </p>
        </div>
        <Link href={`/games/${bestGame.gameId}`} className="border border-hairline p-3 hover:bg-hairline/30">
          <p className="text-xs text-foreground/50">Best game</p>
          <p className="text-xs text-board">
            {totalIssues(bestGame.mistakeCounts)} issue(s) · {fmtDate(bestGame.uploadedAt)}
          </p>
        </Link>
        <Link href={`/games/${worstGame.gameId}`} className="border border-hairline p-3 hover:bg-hairline/30">
          <p className="text-xs text-foreground/50">Toughest game</p>
          <p className="text-xs text-red-800">
            {totalIssues(worstGame.mistakeCounts)} issue(s) · {fmtDate(worstGame.uploadedAt)}
          </p>
        </Link>
      </div>

      <div className="mb-10 border border-hairline bg-board/5 p-6">
        <p className="text-lg text-foreground">{headline}</p>
        {loading && <p className="mt-2 text-xs italic text-foreground/50">Updating…</p>}
      </div>

      {rankedPatterns.length > 0 && (
        <div className="mb-10">
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-foreground/50">Patterns worth working on</p>
          <div className="space-y-4">
            {rankedPatterns.map((tag) => {
              const trend = computePatternTrend(entries, tag);
              const canShowPercent = trend.earlyHits >= MIN_EARLY_HITS_FOR_PERCENT;
              const percent = canShowPercent ? ((trend.earlyHits - trend.lateHits) / trend.earlyHits) * 100 : null;

              return (
                <div key={tag} className="border border-hairline p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-serif text-lg text-foreground">{PATTERN_LABELS[tag]}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-foreground/50">{data.patternTotals[tag]} occurrences this window</span>
                      <Link href={`/mistake-library?pattern=${tag}`} className="text-xs text-board hover:underline">
                        Practice →
                      </Link>
                    </div>
                  </div>

                  <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                    {entries.map((e) => (
                      <Link
                        key={e.gameId}
                        href={`/games/${e.gameId}`}
                        title={fmtDate(e.uploadedAt)}
                        className={`h-6 min-w-[10px] flex-1 border ${
                          e.patternsPresent.includes(tag)
                            ? "border-red-800 bg-red-800/40 hover:bg-red-800/60"
                            : "border-board bg-board/20 hover:bg-board/40"
                        }`}
                      />
                    ))}
                  </div>

                  <p className="text-sm text-foreground">
                    Showed up in{" "}
                    <span className="font-mono">
                      {trend.earlyHits}/{trend.earlyTotal}
                    </span>{" "}
                    of your earlier games, then{" "}
                    <span className="font-mono">
                      {trend.lateHits}/{trend.lateTotal}
                    </span>{" "}
                    more recently
                    {percent !== null && (
                      <span className={percent > 0 ? " text-board" : percent < 0 ? " text-red-800" : ""}>
                        {" "}
                        ({Math.abs(percent).toFixed(0)}% {percent > 0 ? "fewer" : percent < 0 ? "more" : "— unchanged"})
                      </span>
                    )}
                    {percent === null && (
                      <span className="text-foreground/50"> — not enough occurrences yet for a percentage</span>
                    )}
                    .
                  </p>
                  <p className="mt-1 text-xs text-foreground/50">
                    {trend.cleanStreak > 0
                      ? `Clean streak: ${trend.cleanStreak} game${trend.cleanStreak > 1 ? "s" : ""} in a row without it.`
                      : "Showed up in your most recent game."}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {positionalCount > 0 && (
        <div className="mb-10 border border-hairline p-4 opacity-60">
          <p className="text-sm text-foreground">
            {positionalCount} additional mistake(s) this window didn't match a specific detectable pattern — no rule
            caught a mechanical cause, so there's no trend to show for these specifically.{" "}
            <Link href="/mistake-library?pattern=POSITIONAL" className="text-board hover:underline">
              Review them →
            </Link>
          </p>
        </div>
      )}

      <div className="border border-hairline p-4">
        <p className="mb-4 text-xs font-medium uppercase text-foreground/50">
          Mistakes per game (oldest → newest, last {entries.length})
        </p>
        <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height: 140 }}>
          {entries.map((e) => {
            const b = e.mistakeCounts.BLUNDER ?? 0;
            const m = e.mistakeCounts.MISTAKE ?? 0;
            const i = e.mistakeCounts.INACCURACY ?? 0;
            const issues = b + m + i;
            const heightPct = Math.max((issues / maxIssues) * 100, issues > 0 ? 4 : 0);
            return (
              <Link
                key={e.gameId}
                href={`/games/${e.gameId}`}
                title={`${fmtDate(e.uploadedAt)} — ${b} blunders, ${m} mistakes, ${i} inaccuracies`}
                className="flex min-w-[10px] flex-1 flex-col-reverse hover:opacity-80"
                style={{ height: "100%" }}
              >
                <div style={{ height: `${heightPct}%` }} className="flex flex-col-reverse">
                  {b > 0 && <div className={SEVERITY_COLOR.BLUNDER} style={{ flexBasis: `${(b / issues) * 100}%` }} />}
                  {m > 0 && <div className={SEVERITY_COLOR.MISTAKE} style={{ flexBasis: `${(m / issues) * 100}%` }} />}
                  {i > 0 && <div className={SEVERITY_COLOR.INACCURACY} style={{ flexBasis: `${(i / issues) * 100}%` }} />}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-foreground/60">
          <span className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 ${SEVERITY_COLOR.BLUNDER}`} /> Blunder
          </span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 ${SEVERITY_COLOR.MISTAKE}`} /> Mistake
          </span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 ${SEVERITY_COLOR.INACCURACY}`} /> Inaccuracy
          </span>
        </div>
        <p className="mt-2 text-xs text-foreground/40">Hover or click a bar for that game.</p>
      </div>
    </div>
  );
}