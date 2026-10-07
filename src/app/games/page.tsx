"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { getAuth } from "@/lib/auth";
import type { Game } from "@/lib/types";

export default function GamesListPage() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [unclaimedGames, setUnclaimedGames] = useState<Game[] | null>(null);
  const [showUnclaimed, setShowUnclaimed] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const token = user?.token ?? getAuth()?.token;
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`${API_BASE_URL}/api/games`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load games: ${res.status}`);
        return res.json();
      })
      .then(setGames)
      .catch((err) => setError(err.message));
  }, [router, user]);

  async function toggleUnclaimedGames() {
    const nextShowUnclaimed = !showUnclaimed;
    setShowUnclaimed(nextShowUnclaimed);
    if (!nextShowUnclaimed || unclaimedGames) return;

    const token = user?.token ?? getAuth()?.token;
    const response = await fetch(`${API_BASE_URL}/api/games/unclaimed`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      setError(`Failed to load unclaimed games: ${response.status}`);
      return;
    }
    setUnclaimedGames(await response.json());
  }

  async function claimMyGames() {
    const auth = user ?? getAuth();
    if (!auth) {
      router.push("/login");
      return;
    }
    setIsClaiming(true);
    setClaimMessage("");
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/games/claim-mine`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!response.ok) throw new Error(`Failed to claim games: ${response.status}`);
      const result: { gamesClaimed: number } = await response.json();
      setClaimMessage(`Linked ${result.gamesClaimed} game${result.gamesClaimed === 1 ? "" : "s"} to your account.`);
      await refreshGames();
      setUnclaimedGames(null);
      if (showUnclaimed) {
        const unclaimedResponse = await fetch(`${API_BASE_URL}/api/games/unclaimed`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (unclaimedResponse.ok) setUnclaimedGames(await unclaimedResponse.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim games.");
    } finally {
      setIsClaiming(false);
    }
  }

  async function refreshGames() {
    const auth = user ?? getAuth();
    if (!auth) return;
    const response = await fetch(`${API_BASE_URL}/api/games`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!response.ok) throw new Error(`Failed to refresh games: ${response.status}`);
    setGames(await response.json());
  }

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
  const playerName = user?.playerName?.trim() || null;

  function getPlayerColor(game: Game): "white" | "black" | null {
    if (!playerName) return null;
    const normalizedName = playerName.toLowerCase();
    if (game.whitePlayer.toLowerCase() === normalizedName) return "white";
    if (game.blackPlayer.toLowerCase() === normalizedName) return "black";
    return null;
  }

  function getPlayerResult(game: Game): "won" | "lost" | "draw" | null {
    const playerColor = getPlayerColor(game);
    if (!playerColor || !["1-0", "0-1", "1/2-1/2"].includes(game.result)) return null;
    if (game.result === "1/2-1/2") return "draw";
    const playerWon = (playerColor === "white" && game.result === "1-0") || (playerColor === "black" && game.result === "0-1");
    return playerWon ? "won" : "lost";
  }

  function getPlayerAccuracy(game: Game): number | null {
    const playerColor = getPlayerColor(game);
    if (playerColor === "white") return game.whiteAccuracy ?? null;
    if (playerColor === "black") return game.blackAccuracy ?? null;
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-16">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl text-foreground">My games</h1>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="border border-red-700 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              Delete {selectedIds.size} selected
            </button>
          )}
          <button
            onClick={claimMyGames}
            disabled={isClaiming}
            className="bg-board px-3 py-2 text-xs text-white hover:bg-board-dark disabled:opacity-60"
          >
            {isClaiming ? "Claiming…" : "Claim my games"}
          </button>
      </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      {claimMessage && <p className="mb-4 text-sm text-board">{claimMessage}</p>}

      <button onClick={toggleUnclaimedGames} className="mb-6 text-sm text-board underline">
        {showUnclaimed ? "Hide games not yet linked to any account" : "Games not yet linked to any account"}
      </button>
      {showUnclaimed && (
        <div className="mb-8 border border-hairline p-4">
          <h2 className="mb-3 font-serif text-xl">Unclaimed games</h2>
          {unclaimedGames === null ? (
            <p className="text-sm text-foreground/60">Loading…</p>
          ) : unclaimedGames.length === 0 ? (
            <p className="text-sm text-foreground/60">No unclaimed games.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {unclaimedGames.map((game) => (
                <li key={game.id} className="border-b border-hairline pb-2">
                  {game.title || `${game.whitePlayer} vs ${game.blackPlayer}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
        <p className="text-foreground/60">No games match &quot;{search}&quot;.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-foreground/50">
              <th className="w-8 py-2 pr-4">
                <input type="checkbox" checked={allFilteredSelected} onChange={() => toggleSelectAll(filteredIds)} />
              </th>
              <th className="whitespace-nowrap pr-6 font-medium">Game</th>
              <th className="whitespace-nowrap pr-6 font-medium">Result</th>
              <th className="whitespace-nowrap pr-6 font-medium">Uploaded</th>
              <th className="whitespace-nowrap pr-6 font-medium">AI coaching</th>
              <th className="whitespace-nowrap pr-6 font-medium" title={playerName ? `Accuracy for ${playerName}` : "Player accuracy"}>
                Accuracy
              </th>
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
                <td>
                  {(() => {
                    const playerResult = getPlayerResult(game);
                    if (!playerResult) return <span className="text-foreground/50">{game.result}</span>;
                    const resultStyles = {
                      won: "result-badge result-badge-won",
                      lost: "result-badge result-badge-lost",
                      draw: "result-badge result-badge-draw",
                    }[playerResult];
                    const resultLabel = playerResult === "won" ? "Won" : playerResult === "lost" ? "Lost" : "Draw";
                    return (
                      <span className={resultStyles}>
                        <span className="result-badge-mark" aria-hidden="true" />
                        {resultLabel}
                      </span>
                    );
                  })()}
                </td>
                <td className="text-foreground/70">{new Date(game.uploadedAt).toLocaleString()}</td>
                <td>
                  {typeof game.aiCoached === "boolean" ? (
                    <span className={`result-badge ${
                      game.aiCoached
                        ? "result-badge-won"
                        : "result-badge-lost"
                    }`}>
                      <span className="result-badge-mark" aria-hidden="true" />
                      {game.aiCoached ? "Coached" : "Not coached"}
                    </span>
                  ) : (
                    <span className="text-foreground/50" title="The list API has not supplied coaching status for this game">—</span>
                  )}
                </td>
                <td className="font-mono text-foreground/70">
                  {getPlayerAccuracy(game) === null ? "—" : `${getPlayerAccuracy(game)!.toFixed(1)}%`}
                </td>
                <td className="text-right">
                  <button onClick={() => handleDeleteOne(game)} className="text-xs text-red-700 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </div>
  );
}