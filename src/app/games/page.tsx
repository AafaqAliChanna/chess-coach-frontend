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

  if (error) return <p className="p-8 text-red-600">Error: {error}</p>;
  if (!games) return <p className="p-8 text-stone-900">Loading...</p>;

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold text-stone-900">My Games</h1>

      {games.length === 0 ? (
        <p className="text-stone-600">
          No games uploaded yet. <Link href="/" className="underline">Upload one</Link>.
        </p>
      ) : (
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b text-left text-stone-500">
              <th className="py-2">Players</th>
              <th>Result</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.id} className="border-b hover:bg-stone-100">
                <td className="py-2">
                  <Link href={`/games/${game.id}`} className="text-stone-900 underline">
                    {game.whitePlayer} vs {game.blackPlayer}
                  </Link>
                </td>
                <td>{game.result}</td>
                <td>{new Date(game.uploadedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}