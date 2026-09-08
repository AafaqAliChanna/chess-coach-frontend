"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";

type Game = {
  id: number;
  pgn: string;
  title: string | null;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  uploadedAt: string;
};

export default function GamesListPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/games`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load games: ${res.status}`);
        return res.json();
      })
      .then(setGames)
      .catch((err) => setError(err.message));
  }, []);

  async function handleDelete(game: Game) {
    const displayName = game.title || `${game.whitePlayer} vs ${game.blackPlayer}`;
    const confirmed = window.confirm(
      `Delete "${displayName}"? This permanently removes the game and its analysis — it cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/games/${game.id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to delete: ${response.status}`);
      }
      setGames((prev) => prev?.filter((g) => g.id !== game.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!games) return <p className="p-8 text-foreground">Loading…</p>;

  const filtered = games.filter((game) => {
    const query = search.toLowerCase();
    return (
      game.whitePlayer.toLowerCase().includes(query) ||
      game.blackPlayer.toLowerCase().includes(query) ||
      (game.title?.toLowerCase().includes(query) ?? false)
    );
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-8 py-16">
      <h1 className="mb-6 font-serif text-3xl text-foreground">My games</h1>

      {games.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by player or title…"
          className="mb-6 w-full border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
        />
      )}

      {games.length === 0 ? (
        <p className="text-foreground/60">
          No games uploaded yet.{" "}
          <Link href="/" className="text-board underline">
            Upload one
          </Link>
          .
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-foreground/60">No games match "{search}".</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-foreground/50">
              <th className="py-2 font-medium">Game</th>
              <th className="font-medium">Result</th>
              <th className="font-medium">Uploaded</th>
              <th className="font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((game) => (
              <tr key={game.id} className="border-b border-hairline">
                <td className="py-3">
                  <Link href={`/games/${game.id}`} className="text-board hover:text-board-dark">
                    {game.title || `${game.whitePlayer} vs ${game.blackPlayer}`}
                  </Link>
                </td>
                <td className="font-mono text-foreground/70">{game.result}</td>
                <td className="text-foreground/70">{new Date(game.uploadedAt).toLocaleString()}</td>
                <td className="text-right">
                  <button
                    onClick={() => handleDelete(game)}
                    className="text-xs text-red-700 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}