"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { getMyPlayerName } from "@/lib/profile";
import type { Game } from "@/lib/types";

type Phase = "OPENING" | "MIDDLEGAME" | "ENDGAME";
type Severity = "INACCURACY" | "MISTAKE" | "BLUNDER";
type PatternsResponse = {
  gamesFound: number;
  gamesAnalyzed: number;
  mistakesByPhase: Record<Phase, Record<Severity, number>>;
};

function computeRecord(games: Game[], name: string) {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  const lower = name.toLowerCase();

  for (const game of games) {
    const isWhite = game.whitePlayer.toLowerCase() === lower;
    const isBlack = game.blackPlayer.toLowerCase() === lower;
    if (!isWhite && !isBlack) continue;

    if (game.result === "1-0") isWhite ? wins++ : losses++;
    else if (game.result === "0-1") isBlack ? wins++ : losses++;
    else if (game.result === "1/2-1/2") draws++;
  }

  const total = wins + losses + draws;
  return { wins, losses, draws, total, winRate: total > 0 ? (wins / total) * 100 : null };
}

function findBiggestPattern(data: PatternsResponse): { phase: Phase; severity: Severity; count: number } | null {
  let best: { phase: Phase; severity: Severity; count: number } | null = null;
  for (const phase of ["OPENING", "MIDDLEGAME", "ENDGAME"] as Phase[]) {
    for (const severity of ["INACCURACY", "MISTAKE", "BLUNDER"] as Severity[]) {
      const count = data.mistakesByPhase[phase]?.[severity] ?? 0;
      if (!best || count > best.count) best = { phase, severity, count };
    }
  }
  return best && best.count > 0 ? best : null;
}

export default function DashboardPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [patterns, setPatterns] = useState<PatternsResponse | null>(null);
  const [error, setError] = useState("");
  const [playerName, setPlayerName] = useState<string | null>(null);

  useEffect(() => {
    setPlayerName(getMyPlayerName());
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/games`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load games: ${res.status}`);
        return res.json();
      })
      .then(setGames)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!playerName) return;
    fetch(`${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/patterns`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setPatterns)
      .catch(() => {});
  }, [playerName]);

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!games) return <p className="p-8 text-foreground">Loading…</p>;

  const record = playerName ? computeRecord(games, playerName) : null;
  const biggestPattern = patterns ? findBiggestPattern(patterns) : null;

  const recent = [...games]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 5);

  const trainingHref =
    playerName && biggestPattern
      ? `/training?name=${encodeURIComponent(playerName)}&phase=${biggestPattern.phase}`
      : null;

  return (
    <div className="px-8 py-12">
      <h1 className="mb-1 font-serif text-3xl text-foreground">Dashboard</h1>
      <p className="mb-8 text-sm text-foreground/60">Good to see you back.</p>

      {!playerName && (
        <p className="mb-8 border border-hairline bg-brass/10 p-3 text-sm text-foreground">
          Set your player name in{" "}
          <Link href="/profile" className="text-board underline">
            Profile
          </Link>{" "}
          to unlock win rate and pattern insights below.
        </p>
      )}

      <div className="mb-10 border border-hairline bg-board/5 p-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/50">Your top focus</p>
        {!playerName ? (
          <p className="text-sm text-foreground/70">Set your player name in Profile to see this.</p>
        ) : !patterns ? (
          <p className="text-sm text-foreground/70">Loading…</p>
        ) : biggestPattern ? (
          <>
            <p className="mb-4 text-lg text-foreground">
              You lose the most ground to <span className="font-semibold">{biggestPattern.severity.toLowerCase()}</span>{" "}
              moves in the <span className="font-semibold">{biggestPattern.phase.toLowerCase()}</span> — {biggestPattern.count}{" "}
              found in your analyzed games so far.
            </p>
            <div className="flex gap-3">
              {trainingHref && (
                <Link
                  href={trainingHref}
                  className="bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark"
                >
                  Practice this
                </Link>
              )}
              <Link href="/chess-dna" className="border border-hairline px-4 py-2 text-sm text-foreground hover:bg-hairline/30">
                See full breakdown
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-foreground/70">No mistakes found yet for this name.</p>
        )}
      </div>

      <div className="mb-10 grid grid-cols-3 gap-4">
        <div className="border border-hairline p-4">
          <p className="text-xs text-foreground/50">Games analyzed</p>
          <p className="font-serif text-2xl text-foreground">{games.length}</p>
        </div>
        <div className="border border-hairline p-4 opacity-50">
          <p className="text-xs text-foreground/50">Rating</p>
          <p className="font-serif text-2xl text-foreground">— Coming soon</p>
        </div>
        <div className="border border-hairline p-4">
          <p className="text-xs text-foreground/50">Win rate</p>
          {record && record.total > 0 ? (
            <>
              <p className="font-serif text-2xl text-foreground">{record.winRate!.toFixed(0)}%</p>
              <p className="text-xs text-foreground/50">
                {record.wins}W {record.draws}D {record.losses}L
              </p>
            </>
          ) : (
            <p className="font-serif text-2xl text-foreground opacity-50">
              {playerName ? "No decisive games yet" : "— Coming soon"}
            </p>
          )}
        </div>
      </div>

      <h2 className="mb-3 font-serif text-xl text-foreground">Recent games</h2>
      {recent.length === 0 ? (
        <p className="text-foreground/60">
          No games yet.{" "}
          <Link href="/" className="text-board underline">
            Upload your first game
          </Link>
          .
        </p>
      ) : (
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-foreground/50">
              <th className="py-2 font-medium">Game</th>
              <th className="font-medium">Result</th>
              <th className="font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((game) => (
              <tr key={game.id} className="border-b border-hairline">
                <td className="py-2">
                  <Link href={`/games/${game.id}`} className="text-board hover:text-board-dark">
                    {game.title || `${game.whitePlayer} vs ${game.blackPlayer}`}
                  </Link>
                </td>
                <td className="font-mono text-foreground/70">{game.result}</td>
                <td className="text-foreground/70">{new Date(game.uploadedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}