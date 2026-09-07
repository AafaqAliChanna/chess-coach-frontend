"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Game = {
  id: number;
  pgn: string;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  uploadedAt: string;
};

export default function GamesListPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://localhost:8080/api/games")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load games: ${res.status}`);
        return res.json();
      })
      .then(setGames)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!games) return <p className="p-8 text-foreground">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-2xl px-8 py-16">
      <h1 className="mb-8 font-serif text-3xl text-foreground">My games</h1>

      {games.length === 0 ? (
        <p className="text-foreground/60">
          No games uploaded yet.{" "}
          <Link href="/" className="text-board underline">
            Upload one
          </Link>
          .
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-foreground/50">
              <th className="py-2 font-medium">Players</th>
              <th className="font-medium">Result</th>
              <th className="font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id} className="border-b border-hairline">
                <td className="py-3">
                  <Link href={`/games/${game.id}`} className="text-board hover:text-board-dark">
                    {game.whitePlayer} vs {game.blackPlayer}
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