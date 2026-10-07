"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { PuzzleReviewBoard } from "@/components/RetryBoard";

type PackSummary = { id: number; title: string; description: string; imageUrl: string | null; tracking: boolean };
type RelatedPuzzle = {
  id: string;
  rating: number;
  difficulty: string;
  themes: string;
  openingTags: string | null;
};
type PackDetail = PackSummary & {
  youtubeUrl: string | null;
  videoWatched: boolean;
  games: {
    id: number;
    title: string;
    description: string;
    pgn?: string | null;
    white?: string | null;
    black?: string | null;
    whitePlayer?: string | null;
    blackPlayer?: string | null;
    result?: string | null;
    whiteElo?: string | number | null;
    blackElo?: string | number | null;
  }[];
  relatedPuzzles: RelatedPuzzle[];
};
type Replay = {
  id: number;
  title: string;
  description: string;
  movesSan: string[];
  fensAfterEachMove: string[];
  pgn?: string | null;
  white?: string | null;
  black?: string | null;
  whitePlayer?: string | null;
  blackPlayer?: string | null;
  result?: string | null;
  whiteElo?: string | number | null;
  blackElo?: string | number | null;
  headers?: Record<string, string | number | null>;
  game?: { pgn?: string | null; whitePlayer?: string | null; blackPlayer?: string | null; result?: string | null; whiteElo?: string | number | null; blackElo?: string | number | null };
};
type Progress = {
  packId: number;
  packTitle: string;
  gamesPlayedInOpening: number;
  wins: number;
  losses: number;
  draws: number;
  winRatePercent: number;
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function pgnTag(pgn: string | null | undefined, tag: string): string | null {
  if (!pgn) return null;
  const match = pgn.match(new RegExp(`^\\[${tag}\\s+"([^"]*)"\\]$`, "mi"));
  return match?.[1] || null;
}

function replayHeader(replay: Replay, field: "white" | "black" | "result" | "whiteElo" | "blackElo"): string | null {
  const directValue = replay[field];
  if (directValue !== null && directValue !== undefined && String(directValue).trim()) return String(directValue);
  const nestedValue = replay.game?.[field === "white" ? "whitePlayer" : field === "black" ? "blackPlayer" : field];
  if (nestedValue !== null && nestedValue !== undefined && String(nestedValue).trim()) return String(nestedValue);
  const headerName = field === "white" ? "White" : field === "black" ? "Black" : field === "whiteElo" ? "WhiteElo" : field === "blackElo" ? "BlackElo" : "Result";
  const headerValue = replay.headers?.[headerName];
  if (headerValue !== null && headerValue !== undefined && String(headerValue).trim()) return String(headerValue);
  const pgn = replay.pgn || replay.game?.pgn;
  if (field === "white") {
    return replay.whitePlayer || pgnTag(pgn, "White");
  }
  if (field === "black") {
    return replay.blackPlayer || pgnTag(pgn, "Black");
  }
  return pgnTag(pgn, headerName);
}

function PlayerBar({ replay, color, result }: { replay: Replay; color: "white" | "black"; result?: string | null }) {
  const name = replayHeader(replay, color) || (color === "white" ? "White" : "Black");
  const elo = replayHeader(replay, color === "white" ? "whiteElo" : "blackElo");
  return (
    <div className="flex items-center justify-between gap-3 border border-hairline bg-foreground/[0.04] px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-board text-xs font-semibold text-white">
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="truncate font-medium">{name}</span>
        {elo && <span className="shrink-0 text-foreground/55">({elo})</span>}
      </div>
      {result && <span className="shrink-0 font-mono text-xs text-foreground/60">{result}</span>}
    </div>
  );
}

function authHeaders(): Record<string, string> {
  const auth = getAuth();
  return auth ? { Authorization: `Bearer ${auth.token}` } : {};
}

export default function ResourcesPage() {
  const [query, setQuery] = useState("");
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [detail, setDetail] = useState<PackDetail | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [replayOrientation, setReplayOrientation] = useState<"white" | "black">("white");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const search = useCallback(async (value: string) => {
    setLoading(true);
    setError("");
    try {
      const suffix = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : "";
      const response = await fetch(`${API_BASE_URL}/api/learning-packs${suffix}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`Failed to load resources: ${response.status}`);
      setPacks((await response.json()) as PackSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load resources.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void search("");
    const auth = getAuth();
    if (!auth) return;
    fetch(`${API_BASE_URL}/api/learning-packs/my-progress`, { headers: authHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load progress: ${response.status}`);
        return response.json() as Promise<Progress[]>;
      })
      .then(setProgress)
      .catch(() => setProgress([]));
  }, [search]);

  async function openPack(id: number) {
    setReplay(null);
    setActionMessage("");
    setError("");
    const response = await fetch(`${API_BASE_URL}/api/learning-packs/${id}`, { headers: authHeaders() });
    if (!response.ok) {
      setError(`Failed to load resource: ${response.status}`);
      return;
    }
    setDetail((await response.json()) as PackDetail);
  }

  async function trackPack() {
    if (!detail) return;
    const response = await fetch(`${API_BASE_URL}/api/learning-packs/${detail.id}/track`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setError(`Could not start learning this pack: ${response.status}`);
      return;
    }
    setDetail({ ...detail, tracking: true });
    setPacks((current) => current.map((pack) => (pack.id === detail.id ? { ...pack, tracking: true } : pack)));
    setActionMessage("You are now learning this pack.");
  }

  async function markVideoWatched() {
    if (!detail) return;
    const response = await fetch(`${API_BASE_URL}/api/learning-packs/${detail.id}/video-watched`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      setError(`Could not mark the video watched: ${response.status}`);
      return;
    }
    setDetail({ ...detail, videoWatched: true });
    setActionMessage("Video marked as watched.");
  }

  async function openReplay(gameId: number) {
    setError("");
    const response = await fetch(`${API_BASE_URL}/api/learning-packs/games/${gameId}`, { headers: authHeaders() });
    if (!response.ok) {
      setError(`Failed to load replay: ${response.status}`);
      return;
    }
    const replayData = (await response.json()) as Replay;
    const selectedGame = detail?.games.find((game) => game.id === gameId);
    setReplay(selectedGame ? { ...selectedGame, ...replayData, pgn: replayData.pgn || selectedGame.pgn } : replayData);
    setReplayOrientation("white");
  }

  return (
    <div className="px-8 py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-foreground">Resources</h1>
          <p className="mt-1 text-sm text-foreground/60">Learn openings through guided videos, master games, and puzzles.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search(query);
          }}
          className="flex gap-2"
        >
          <input
            aria-label="Search resources"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search learning packs"
            className="w-64 border border-hairline bg-background px-3 py-2 text-sm"
          />
          <button className="border border-board px-3 py-2 text-sm text-board">Search</button>
        </form>
      </div>

      {error && <p className="mb-5 text-sm text-red-700">{error}</p>}
      {detail ? (
        <section>
          <button type="button" onClick={() => { setDetail(null); setReplay(null); }} className="mb-5 text-sm text-board hover:underline">
            ← Back to resources
          </button>
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border border-hairline p-5">
            {detail.imageUrl && <img src={detail.imageUrl} alt="" className="h-28 w-44 shrink-0 object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
            <div>
              <h2 className="font-serif text-2xl text-foreground">{detail.title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-foreground/70">{detail.description}</p>
            </div>
            <button type="button" onClick={() => void trackPack()} disabled={detail.tracking} className="bg-board px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {detail.tracking ? "Already learning" : "I’m learning this"}
            </button>
          </div>
          {actionMessage && <p className="mb-5 text-sm text-board">{actionMessage}</p>}
          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h3 className="mb-3 font-serif text-xl">Video</h3>
              {detail.youtubeUrl ? (
                <div className="flex flex-wrap items-center gap-3">
                  <a href={detail.youtubeUrl} target="_blank" rel="noreferrer" className="text-sm text-board underline">Watch on YouTube</a>
                  <button type="button" onClick={() => void markVideoWatched()} disabled={detail.videoWatched} className="border border-hairline px-3 py-1.5 text-xs disabled:opacity-50">
                    {detail.videoWatched ? "Video watched" : "Mark video watched"}
                  </button>
                </div>
              ) : <p className="text-sm text-foreground/50">No video added yet.</p>}
            </section>
            <section>
              <h3 className="mb-3 font-serif text-xl">GM games</h3>
              <div className="space-y-2">
                {detail.games.map((game) => (
                  <button key={game.id} type="button" onClick={() => void openReplay(game.id)} className="block w-full border border-hairline p-3 text-left hover:border-board">
                    <span className="block text-sm font-medium">{game.title}</span>
                    <span className="mt-1 block text-xs text-foreground/60">{game.description}</span>
                  </button>
                ))}
                {detail.games.length === 0 && <p className="text-sm text-foreground/50">No games added yet.</p>}
              </div>
            </section>
          </div>
          {replay && (
            <section className="mt-8 max-w-md">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl">{replay.title}</h3>
                  {replay.description && <p className="mt-1 text-sm text-foreground/60">{replay.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setReplayOrientation((current) => current === "white" ? "black" : "white")}
                  className="shrink-0 border border-hairline px-3 py-1.5 text-xs text-foreground hover:border-board"
                  aria-label="Rotate board"
                >
                  Rotate board
                </button>
              </div>
              <PuzzleReviewBoard
                key={replay.id}
                startPosition={STARTING_FEN}
                orientation={replayOrientation}
                movesSan={replay.movesSan}
                positionsAfterMoves={replay.fensAfterEachMove}
                topPlayer={
                  <PlayerBar
                    replay={replay}
                    color={replayOrientation === "white" ? "black" : "white"}
                    result={replayHeader(replay, "result")}
                  />
                }
                bottomPlayer={
                  <PlayerBar replay={replay} color={replayOrientation === "white" ? "white" : "black"} />
                }
              />
            </section>
          )}
          <section className="mt-8">
            <h3 className="mb-3 font-serif text-xl">Related Puzzles</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {detail.relatedPuzzles.map((puzzle) => (
                <Link key={puzzle.id} href={`/puzzles?puzzleId=${encodeURIComponent(puzzle.id)}`} className="border border-hairline p-3 hover:border-board">
                  <span className="block text-sm font-medium">Puzzle {puzzle.id}</span>
                  <span className="text-xs text-foreground/60">{puzzle.difficulty} · {puzzle.rating}</span>
                </Link>
              ))}
              {detail.relatedPuzzles.length === 0 && <p className="text-sm text-foreground/50">No related puzzles yet.</p>}
            </div>
          </section>
        </section>
      ) : (
        <>
          {progress.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 font-serif text-xl">Your progress</h2>
              <div className="space-y-2">
                {progress.map((item) => (
                  <p key={item.packId} className="border border-hairline p-3 text-sm">
                    Your {item.packTitle} games: {item.wins}-{item.losses}-{item.draws} ({item.winRatePercent}% win rate)
                  </p>
                ))}
              </div>
            </section>
          )}
          {loading ? <p className="text-sm text-foreground/60">Loading resources…</p> : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {packs.map((pack) => (
                <button key={pack.id} type="button" onClick={() => void openPack(pack.id)} className="border border-hairline p-5 text-left hover:border-board">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    {pack.imageUrl && <img src={pack.imageUrl} alt="" className="h-16 w-24 shrink-0 object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                    <h2 className="font-serif text-xl">{pack.title}</h2>
                    {pack.tracking && <span className="shrink-0 bg-board/10 px-2 py-1 text-[10px] uppercase tracking-wide text-board">Learning</span>}
                  </div>
                  <p className="text-sm text-foreground/65">{pack.description}</p>
                </button>
              ))}
              {!packs.length && <p className="text-sm text-foreground/60">No learning packs found.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
