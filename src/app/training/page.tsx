"use client";

import { useState } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { API_BASE_URL } from "@/lib/api";

type Phase = "OPENING" | "MIDDLEGAME" | "ENDGAME";
type Classification = "INACCURACY" | "MISTAKE" | "BLUNDER";

type Exercise = {
  gameId: number;
  plyNumber: number;
  fenBefore: string;
  playerMove: string;
  bestMoveUci: string;
  classification: Classification;
  gamePhase: Phase;
  centipawnLoss: number;
};

const CLASSIFICATION_COLOR: Record<Classification, string> = {
  INACCURACY: "text-amber-700",
  MISTAKE: "text-orange-700",
  BLUNDER: "text-red-800",
};

// Known backend bug: centipawnLoss on missed-forced-mate positions can come
// back as a nonsensical huge number (e.g. 999032) due to mate-score scaling
// that isn't fixed yet. Anything above this threshold almost certainly
// isn't a real centipawn value, so we show a clearer label instead.
const MATE_SCORE_THRESHOLD = 5000;

function formatCpLoss(cp: number): string {
  if (cp > MATE_SCORE_THRESHOLD) return "Missed forced mate";
  return `${cp} cp lost`;
}

function bestMoveSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export default function TrainingPage() {
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase | "">("");
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    setExercises(null);
    setRevealed(new Set());
    try {
      const params = new URLSearchParams();
      if (phase) params.set("phase", phase);
      const url = `${API_BASE_URL}/api/players/${encodeURIComponent(name.trim())}/training${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      setExercises(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleReveal(index: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="px-8 py-12">
      <h1 className="mb-1 font-serif text-3xl text-foreground">Training</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Self-quiz on your worst moves. Study the position, then reveal Stockfish's suggestion.
      </p>

      <form onSubmit={handleSearch} className="mb-8 flex max-w-lg gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Exact player name, e.g. Aafaq"
          className="flex-1 border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
        />
        <select
          value={phase}
          onChange={(e) => setPhase(e.target.value as Phase | "")}
          className="border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
        >
          <option value="">All phases</option>
          <option value="OPENING">Opening</option>
          <option value="MIDDLEGAME">Middlegame</option>
          <option value="ENDGAME">Endgame</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark disabled:opacity-50"
        >
          {loading ? "Loading…" : "Get exercises"}
        </button>
      </form>

      {error && <p className="mb-6 text-sm text-red-700">{error}</p>}

      {exercises && exercises.length === 0 && (
        <p className="text-foreground/60">No mistakes found for that name{phase ? ` in the ${phase.toLowerCase()}` : ""}.</p>
      )}

      {exercises && exercises.length > 0 && (
        <div className="grid grid-cols-2 gap-8">
          {exercises.map((ex, index) => {
            const isRevealed = revealed.has(index);
            const { from, to } = bestMoveSquares(ex.bestMoveUci);
            const squareStyles = isRevealed
              ? {
                  [from]: { backgroundColor: "rgba(47, 74, 61, 0.5)" },
                  [to]: { backgroundColor: "rgba(47, 74, 61, 0.5)" },
                }
              : {};

            return (
              <div key={index} className="border border-hairline p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-foreground/50">
                    {ex.gamePhase} · <span className={CLASSIFICATION_COLOR[ex.classification]}>{ex.classification}</span>
                  </span>
                  <Link href={`/games/${ex.gameId}`} className="text-board hover:underline">
                    View game →
                  </Link>
                </div>

                <div className="aspect-square w-full max-w-[280px]">
                  <Chessboard options={{ position: ex.fenBefore, squareStyles }} />
                </div>

                <p className="mt-2 text-xs text-foreground/60">{formatCpLoss(ex.centipawnLoss)}</p>

                {isRevealed ? (
                  <div className="mt-2 text-sm">
                    <p className="text-foreground">
                      You played: <span className="font-mono">{ex.playerMove}</span>
                    </p>
                    <p className="text-foreground">
                      Better: <span className="font-mono">{from} → {to}</span> (highlighted above)
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => toggleReveal(index)}
                    className="mt-2 border border-hairline px-3 py-1 text-xs text-foreground hover:bg-hairline/30"
                  >
                    Reveal answer
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}