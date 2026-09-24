"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { getMyPlayerName } from "@/lib/profile";
import type { Game } from "@/lib/types";

type ReportEntry = {
  centipawnLoss: number;
  classification: "NONE" | "INACCURACY" | "MISTAKE" | "BLUNDER" | "PENDING";
};

type GameStats = {
  gameId: number;
  uploadedAt: string;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  totalIssues: number;
};

const RECENT_GAMES_LIMIT = 20;
const MATE_SCORE_THRESHOLD = 5000; // same known-bug guard used on the Training page

export default function ProgressPage() {
  const [stats, setStats] = useState<GameStats[] | null>(null);
  const [error, setError] = useState("");
  const [playerName, setPlayerName] = useState<string | null>(null);

  useEffect(() => {
    setPlayerName(getMyPlayerName());
  }, []);

  useEffect(() => {
    if (!playerName) return;

    async function load() {
      try {
        const gamesRes = await fetch(`${API_BASE_URL}/api/games`);
        if (!gamesRes.ok) throw new Error(`Failed to load games: ${gamesRes.status}`);
        const allGames: Game[] = await gamesRes.json();

        const lower = playerName.toLowerCase();
        const myGames = allGames
          .filter(
            (g) => g.whitePlayer.toLowerCase() === lower || g.blackPlayer.toLowerCase() === lower
          )
          .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
          .slice(-RECENT_GAMES_LIMIT);

        const results = await Promise.all(
          myGames.map(async (game) => {
            const res = await fetch(`${API_BASE_URL}/api/games/${game.id}/report`);
            if (!res.ok) return null;
            const report: ReportEntry[] = await res.json();
            const analyzed = report.filter((r) => r.classification !== "PENDING");
            if (analyzed.length === 0) return null; // still analyzing, skip from the trend

            const blunders = analyzed.filter((r) => r.classification === "BLUNDER").length;
            const mistakes = analyzed.filter((r) => r.classification === "MISTAKE").length;
            const inaccuracies = analyzed.filter((r) => r.classification === "INACCURACY").length;

            const stat: GameStats = {
              gameId: game.id,
              uploadedAt: game.uploadedAt,
              blunders,
              mistakes,
              inaccuracies,
              totalIssues: blunders + mistakes + inaccuracies,
            };
            return stat;
          })
        );

        setStats(results.filter((s): s is GameStats => s !== null));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    load();
  }, [playerName]);

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
  if (!stats) return <p className="p-8 text-foreground">Loading — fetching your recent games' reports…</p>;

  if (stats.length === 0) {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">Progress</h1>
        <p className="text-sm text-foreground/60">
          No analyzed games found yet for "{playerName}". Upload or import some games first.
        </p>
      </div>
    );
  }

  const maxIssues = Math.max(...stats.map((s) => s.totalIssues), 1);

  const mid = Math.floor(stats.length / 2);
  const earlierAvg = stats.slice(0, mid).reduce((sum, s) => sum + s.totalIssues, 0) / (mid || 1);
  const laterAvg = stats.slice(mid).reduce((sum, s) => sum + s.totalIssues, 0) / (stats.length - mid || 1);
  const changePercent = earlierAvg > 0 ? ((earlierAvg - laterAvg) / earlierAvg) * 100 : null;

  return (
    <div className="px-8 py-12">
      <h1 className="mb-1 font-serif text-3xl text-foreground">Progress</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Based on your {stats.length} most recently analyzed games as "{playerName}" — not your full history.
      </p>

      {changePercent !== null && (
        <div className="mb-8 border border-hairline p-4">
          <p className="mb-1 text-xs font-medium uppercase text-foreground/50">Milestone</p>
          <p className="text-sm text-foreground">
            {changePercent > 0 ? (
              <>
                You've cut mistakes per game by{" "}
                <span className="font-semibold text-board">{changePercent.toFixed(0)}%</span> across this recent
                window.
              </>
            ) : changePercent < 0 ? (
              <>
                Mistakes per game are up{" "}
                <span className="font-semibold text-red-800">{Math.abs(changePercent).toFixed(0)}%</span> across
                this recent window.
              </>
            ) : (
              "No meaningful change across this recent window."
            )}
          </p>
        </div>
      )}

      <div className="mb-10 border border-hairline p-4">
        <p className="mb-4 text-xs font-medium uppercase text-foreground/50">
          Mistakes per game (oldest → newest, last {stats.length})
        </p>
        <div className="flex items-end gap-1" style={{ height: 140 }}>
          {stats.map((s) => (
            <div
              key={s.gameId}
              title={`${new Date(s.uploadedAt).toLocaleDateString()} — ${s.blunders} blunders, ${s.mistakes} mistakes, ${s.inaccuracies} inaccuracies`}
              className="flex-1 bg-board hover:bg-board-dark"
              style={{ height: `${Math.max((s.totalIssues / maxIssues) * 100, 4)}%` }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-foreground/40">Hover a bar for that game's breakdown.</p>
      </div>

      <div className="border border-hairline p-4 opacity-60">
        <p className="mb-1 text-xs font-medium uppercase text-foreground/50">Training consistency</p>
        <p className="text-sm text-foreground/70">
          Not tracked yet — the backend doesn't record training attempts or streaks. Coming once that's built.
        </p>
      </div>
    </div>
  );
}