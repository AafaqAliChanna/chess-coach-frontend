"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";

type Game = {
  id: number;
  title: string | null;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  uploadedAt: string;
};

export default function DashboardPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState("");

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

  const recent = [...games]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 5);

  return (
    <div className="px-8 py-12">
      <h1 className="mb-8 font-serif text-3xl text-foreground">Dashboard</h1>

      <div className="mb-10 grid grid-cols-3 gap-4">
        <div className="border border-hairline p-4">
          <p className="text-xs text-foreground/50">Games analyzed</p>
          <p className="font-serif text-2xl text-foreground">{games.length}</p>
        </div>
        <div className="border border-hairline p-4 opacity-50">
          <p className="text-xs text-foreground/50">Rating</p>
          <p className="font-serif text-2xl text-foreground">— Coming soon</p>
        </div>
        <div className="border border-hairline p-4 opacity-50">
          <p className="text-xs text-foreground/50">Win rate</p>
          <p className="font-serif text-2xl text-foreground">— Coming soon</p>
        </div>
      </div>

      <div className="mb-10 border border-hairline p-4 opacity-50">
        <p className="mb-1 text-xs font-medium uppercase text-foreground/50">Your biggest pattern</p>
        <p className="text-sm text-foreground/70">
          Coming soon — requires analyzing patterns across multiple games (Chess DNA).
        </p>
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