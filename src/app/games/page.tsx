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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/games`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load games: ${res.status}`);
        return res.json();
      })
      .then(setGames)
      .catch((err) => setError(err.message));
  }, []);

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(idsOnScreen: number[]) {
    setSelectedIds((prev) => {
      const allSelected = idsOnScreen.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(idsOnScreen);
    });
  }

  async function handleDeleteOne(game: Game) {
    const displayName = game.title || `${game.whitePlayer} vs ${game.blackPlayer}`;
    const confirmed = window.confirm(
      `Delete "${displayName}"? This permanently removes the game and its analysis — it cannot be undone.`
    );
    if (!confirmed) return;
    await deleteGames([game.id]);
  }

  async function handleDeleteSelected() {
    const count = selectedIds.size;
    const confirmed = window.confirm(
      `Delete ${count} selected game${count > 1 ? "s" : ""}? This permanently removes them and their analysis — it cannot be undone.`
    );
    if (!confirmed) return;
    await deleteGames([...selectedIds]);
  }

  async function deleteGames(ids: number[]) {
    try {
      const results = await Promise.all(
        ids.map((id) => fetch(`${API_BASE_URL}/api/games/${id}`, { method: "DELETE" }))
      );
      const failed = results.filter((r) => !r.ok && r.status !== 204);
      if (failed.length > 0) {
        throw new Error(`${failed.length} of ${ids.length} deletes failed`);
      }
      setGames((prev) => prev?.filter((g) => !ids.includes(g.id)) ?? null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
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
  const filteredIds = filtered.map((g) => g.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  return (
    <div className="mx-auto w-full max-w-2xl px-8 py-16">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl text-foreground">My games</h1>
        {selectedIds.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            className="border border-red-700 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            Delete {selectedIds.size} selected
          </button>
        )}
      </div>

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
              <th className="w-8 py-2">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={() => toggleSelectAll(filteredIds)}
                />
              </th>
              <th className="font-medium">Game</th>
              <th className="font-medium">Result</th>
              <th className="font-medium">Uploaded</th>
              <th className="font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((game) => (
              <tr key={game.id} className="border-b border-hairline">
                <td className="py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(game.id)}
                    onChange={() => toggleSelected(game.id)}
                  />
                </td>
                <td>
                  <Link href={`/games/${game.id}`} className="text-board hover:text-board-dark">
                    {game.title || `${game.whitePlayer} vs ${game.blackPlayer}`}
                  </Link>
                </td>
                <td className="font-mono text-foreground/70">{game.result}</td>
                <td className="text-foreground/70">{new Date(game.uploadedAt).toLocaleString()}</td>
                <td className="text-right">
                  <button
                    onClick={() => handleDeleteOne(game)}
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