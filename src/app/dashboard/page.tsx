"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import type { Game } from "@/lib/types";
import PatternFocusCallout from "@/components/PatternFocusCallout";

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

export default function DashboardPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const playerName = user?.playerName ?? null;

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/games`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load games: ${res.status}`);
        return res.json();
      })
      .then(setGames)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!games) return <p className="p-8 text-foreground">Loading…</p>;

  const record = playerName ? computeRecord(games, playerName) : null;
  const recent = [...games]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 5);

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

      <PatternFocusCallout playerName={playerName} />

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