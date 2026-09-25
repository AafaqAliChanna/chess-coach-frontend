"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { API_BASE_URL } from "@/lib/api";
import { getMyPlayerName } from "@/lib/profile";

type Phase = "OPENING" | "MIDDLEGAME" | "ENDGAME";
type Classification = "INACCURACY" | "MISTAKE" | "BLUNDER";
type PatternTag = "MISSED_MATE" | "ALLOWED_MATE" | "HANGING_PIECE" | "POSITIONAL";

type MistakeEntry = {
  gameId: number;
  gameTitle: string;
  uploadedAt: string;
  plyNumber: number;
  fenBefore: string;
  playerMove: string;
  bestMoveUci: string;
  classification: Classification;
  gamePhase: Phase;
  patternTag: PatternTag;
  centipawnLoss: number;
  winPercentLoss: number;
};

type MistakeLibraryResponse = {
  playerName: string;
  totalMistakes: number;
  limit: number;
  offset: number;
  entries: MistakeEntry[];
  patternCounts: Record<PatternTag, number>;
};

const CLASSIFICATION_COLOR: Record<Classification, string> = {
  INACCURACY: "text-amber-700",
  MISTAKE: "text-orange-700",
  BLUNDER: "text-red-800",
};

// POSITIONAL is deliberately not shown as a motif name — the backend flags it
// as "mistake happened, but no specific tactical cause was detected," not a
// real pattern label, so it's presented as "Other" per that honesty.
const PATTERN_LABELS: Record<PatternTag, string> = {
  MISSED_MATE: "Missed Mate",
  ALLOWED_MATE: "Allowed Mate",
  HANGING_PIECE: "Hanging Piece",
  POSITIONAL: "Other",
};

const PATTERN_ORDER: PatternTag[] = ["HANGING_PIECE", "MISSED_MATE", "ALLOWED_MATE", "POSITIONAL"];

// Same known backend issue guarded against on the Training page: a missed
// forced mate can come back as a nonsensical huge centipawn number.
const MATE_SCORE_THRESHOLD = 5000;

function formatCpLoss(cp: number): string {
  if (cp > MATE_SCORE_THRESHOLD) return "Missed forced mate";
  return `${cp} cp lost`;
}

function bestMoveSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

const PAGE_SIZE = 20;

export default function MistakeLibraryPage() {
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<Phase | "">("");
  const [tagFilter, setTagFilter] = useState<PatternTag | "">("");

  const [data, setData] = useState<MistakeLibraryResponse | null>(null);
  const [accumulated, setAccumulated] = useState<MistakeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notDeployed, setNotDeployed] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setPlayerName(getMyPlayerName());
  }, []);

  useEffect(() => {
    if (!playerName) return;
    setOffset(0);
    fetchLibrary(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName, phaseFilter, tagFilter]);

  async function fetchLibrary(fetchOffset: number, replace: boolean) {
    if (!playerName) return;
    setLoading(true);
    setError("");
    if (replace) setNotDeployed(false);

    try {
      const params = new URLSearchParams();
      if (phaseFilter) params.set("phase", phaseFilter);
      if (tagFilter) params.set("pattern", tagFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(fetchOffset));

      const response = await fetch(
        `${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/mistake-library?${params.toString()}`
      );

      if (response.status === 404) {
        setNotDeployed(true);
        setData(null);
        setAccumulated([]);
        return;
      }
      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const json: MistakeLibraryResponse = await response.json();
      setData(json);
      setAccumulated((prev) => (replace ? json.entries : [...prev, ...json.entries]));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function loadMore() {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchLibrary(nextOffset, false);
  }

  if (!playerName) {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">My Mistake Library</h1>
        <p className="text-sm text-foreground">
          Set your player name in{" "}
          <Link href="/profile" className="text-board underline">
            Profile
          </Link>{" "}
          to see your saved lessons.
        </p>
      </div>
    );
  }

  return (
    <div className="px-8 py-12">
      <h1 className="mb-1 font-serif text-3xl text-foreground">My Mistake Library</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Your worst moves, worst first — measured by win probability lost.
      </p>

      {notDeployed ? (
        <p className="max-w-md border border-hairline bg-brass/10 p-4 text-sm text-foreground">
          This feature is waiting on a backend update — the Mistake Library endpoint isn't deployed yet.
          Check back once it's live.
        </p>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as Phase | "")}
              className="border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
            >
              <option value="">All phases</option>
              <option value="OPENING">Opening</option>
              <option value="MIDDLEGAME">Middlegame</option>
              <option value="ENDGAME">Endgame</option>
            </select>
          </div>

          {data && (
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setTagFilter("")}
                className={`border px-3 py-1 text-xs ${
                  tagFilter === "" ? "border-board bg-board text-white" : "border-hairline text-foreground hover:bg-hairline/30"
                }`}
              >
                All ({data.totalMistakes})
              </button>
              {PATTERN_ORDER.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                  className={`border px-3 py-1 text-xs ${
                    tagFilter === tag ? "border-board bg-board text-white" : "border-hairline text-foreground hover:bg-hairline/30"
                  }`}
                >
                  {PATTERN_LABELS[tag]} ({data.patternCounts[tag] ?? 0})
                </button>
              ))}
            </div>
          )}

          {error && <p className="mb-6 text-sm text-red-700">{error}</p>}

          {loading && !data && <p className="text-foreground">Loading…</p>}

          {data && (
            <>
              <p className="mb-6 text-sm text-foreground/60">{data.totalMistakes} mistakes match these filters</p>

              {accumulated.length === 0 ? (
                <p className="text-foreground/60">No mistakes match these filters yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-8">
                  {accumulated.map((entry) => {
                    const { from, to } = bestMoveSquares(entry.bestMoveUci);
                    return (
                      <div key={`${entry.gameId}-${entry.plyNumber}`} className="border border-hairline p-4">
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="text-foreground/50">
                            {entry.gamePhase} · <span className={CLASSIFICATION_COLOR[entry.classification]}>{entry.classification}</span>
                          </span>
                          <Link href={`/games/${entry.gameId}`} className="text-board hover:underline">
                            View game →
                          </Link>
                        </div>

                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground">{entry.gameTitle}</p>
                          <span className="border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/60">
                            {PATTERN_LABELS[entry.patternTag]}
                          </span>
                        </div>
                        <p className="mb-2 text-xs text-foreground/50">{new Date(entry.uploadedAt).toLocaleDateString()}</p>

                        <div className="aspect-square w-full max-w-[280px]">
                          <Chessboard
                            options={{
                              position: entry.fenBefore,
                              squareStyles: {
                                [from]: { backgroundColor: "rgba(47, 74, 61, 0.5)" },
                                [to]: { backgroundColor: "rgba(47, 74, 61, 0.5)" },
                              },
                            }}
                          />
                        </div>

                        <p className="mt-2 text-xs text-foreground/60">
                          {formatCpLoss(entry.centipawnLoss)} · {entry.winPercentLoss.toFixed(1)}% win probability lost
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          You played: <span className="font-mono">{entry.playerMove}</span> · Better:{" "}
                          <span className="font-mono">{from} → {to}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {accumulated.length < data.totalMistakes && (
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="mt-8 border border-hairline px-4 py-2 text-sm text-foreground hover:bg-hairline/30 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}