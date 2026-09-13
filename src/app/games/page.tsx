"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

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
  const { user } = useAuth();
  const router = useRouter();

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
    if (!user) {
      router.push("/login");
      return;
    }
    const displayName = game.title || `${game.whitePlayer} vs ${game.blackPlayer}`;
    const confirmed = window.confirm(
      `Delete "${displayName}"? This permanently removes the game and its analysis — it cannot be undone.`
    );
    if (!confirmed) return;
    await deleteGames([game.id]);
  }

  async function handleDeleteSelected() {
    if (!user) {
      router.push("/login");
      return;
    }
    const count = selectedIds.size;
    const confirmed = window.confirm(
      `Delete ${count} selected game${count > 1 ? "s" : ""}? This permanently removes them and their analysis — it cannot be undone.`
    );
    if (!confirmed) return;
    await deleteGames([...selectedIds]);
  }

  async function deleteGames(ids: number[]) {
    if (!user) return;
    setError("");
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        const response = await fetch(`${API_BASE_URL}/api/games/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user.token}` },
        });
        return { id, status: response.status };
      })
    );

    const succeeded: number[] = [];
    let sawUnauthorized = false;
    let forbiddenCount = 0;
    let otherFailCount = 0;

    for (const result of results) {
      if (result.status !== "fulfilled") {
        otherFailCount++;
        continue;
      }
      const { id, status } = result.value;
      if (status === 204 || status === 200) succeeded.push(id);
      else if (status === 401) sawUnauthorized = true;
      else if (status === 403) forbiddenCount++;
      else otherFailCount++;
    }

    if (succeeded.length > 0) {
      setGames((prev) => prev?.filter((g) => !succeeded.includes(g.id)) ?? null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        succeeded.forEach((id) => next.delete(id));
        return next;
      });
    }

    if (sawUnauthorized) {
      router.push("/login");
      return;
    }
    if (forbiddenCount > 0) {
      setError(`${forbiddenCount} game(s) couldn't be deleted — they belong to a different account.`);
    } else if (otherFailCount > 0) {
      setError(`${otherFailCount} delete(s) failed unexpectedly.`);
    }
  }

  if (!games) return error ? <p className="p-8 text-red-700">{error}</p> : <p className="p-8 text-foreground">Loading…</p>;

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

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

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
                <input type="checkbox" checked={allFilteredSelected} onChange={() => toggleSelectAll(filteredIds)} />
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
                  <input type="checkbox" checked={selectedIds.has(game.id)} onChange={() => toggleSelected(game.id)} />
                </td>
                <td>
                  <Link href={`/games/${game.id}`} className="text-board hover:text-board-dark">
                    {game.title || `${game.whitePlayer} vs ${game.blackPlayer}`}
                  </Link>
                </td>
                <td className="font-mono text-foreground/70">{game.result}</td>
                <td className="text-foreground/70">{new Date(game.uploadedAt).toLocaleString()}</td>
                <td className="text-right">
                  <button onClick={() => handleDeleteOne(game)} className="text-xs text-red-700 hover:underline">
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