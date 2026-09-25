"use client";

import { useState } from "react";
import { Chessboard } from "react-chessboard";
import { API_BASE_URL } from "@/lib/api";

export type AttemptResult = {
  wasCorrect: boolean;
  correctMoveUci: string;
  attemptedMoveUci: string;
};

// Same color used on the Game Detail page's "Show better move" arrow —
// keeping this consistent across the app rather than inventing a new one.
const ARROW_COLOR = "#2f4a3d";

function bestMoveSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

// Auto-promotes to queen when a pawn reaches the back rank. There's no
// promotion-piece picker in this version, so an underpromotion attempt can't
// be represented — flagged as a known gap rather than silently wrong.
function computeAttemptedUci(from: string, to: string, pieceType: string): string {
  const isPawn = pieceType.toLowerCase().endsWith("p");
  const reachesBackRank = to.endsWith("8") || to.endsWith("1");
  return isPawn && reachesBackRank ? `${from}${to}q` : `${from}${to}`;
}

export default function RetryBoard({
  fenBefore,
  bestMoveUci,
  gameId,
  plyNumber,
  token = null,
  onAuthRequired = () => {},
  onResult,
  interactive = true,
}: {
  fenBefore: string;
  bestMoveUci: string;
  gameId: number;
  plyNumber: number;
  token?: string | null;
  onAuthRequired?: () => void;
  onResult?: (result: AttemptResult) => void;
  interactive?: boolean;
}) {
  const [selected, setSelected] = useState<{ square: string; pieceType: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attemptError, setAttemptError] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);

  const { from: bestFrom, to: bestTo } = bestMoveSquares(bestMoveUci);

  async function submitAttempt(sourceSquare: string, targetSquare: string, pieceType: string) {
    if (!token) {
      onAuthRequired();
      return;
    }
    const attemptedMoveUci = computeAttemptedUci(sourceSquare, targetSquare, pieceType);
    setSubmitting(true);
    setAttemptError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/training/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gameId, plyNumber, attemptedMoveUci }),
      });
      if (response.status === 401) {
        onAuthRequired();
        return;
      }
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      const r: AttemptResult = {
        wasCorrect: data.wasCorrect,
        correctMoveUci: data.correctMoveUci,
        attemptedMoveUci: data.attemptedMoveUci,
      };
      setResult(r);
      onResult?.(r);
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setSelected(null);
    }
  }

  function handleSquareClick({ piece, square }: { piece: { pieceType: string } | null; square: string }) {
    if (!interactive || result || submitting) return;
    if (!selected) {
      if (piece) setSelected({ square, pieceType: piece.pieceType });
      return;
    }
    if (square === selected.square) {
      setSelected(null);
      return;
    }
    submitAttempt(selected.square, square, selected.pieceType);
  }

  function handlePieceDrop({
    piece,
    sourceSquare,
    targetSquare,
  }: {
    piece: { pieceType: string };
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean {
    if (!interactive || !targetSquare || result || submitting) return false;
    submitAttempt(sourceSquare, targetSquare, piece.pieceType);
    return true;
  }

  function resetRetry() {
    setSelected(null);
    setResult(null);
    setAttemptError("");
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  let arrows: { startSquare: string; endSquare: string; color: string }[] = [];

  if (!interactive) {
    // Static preview: an arrow reads instantly as "this is the better move" —
    // two same-colored squares with no directionality don't, which was the
    // actual bug here, not just a styling nitpick.
    arrows = [{ startSquare: bestFrom, endSquare: bestTo, color: ARROW_COLOR }];
  } else {
    if (selected) {
      squareStyles[selected.square] = { backgroundColor: "rgba(47, 74, 61, 0.5)" };
    }
    if (result) {
      if (result.wasCorrect) {
        squareStyles[bestFrom] = { backgroundColor: "rgba(47, 74, 61, 0.5)" };
        squareStyles[bestTo] = { backgroundColor: "rgba(47, 74, 61, 0.5)" };
      } else {
        arrows = [{ startSquare: bestFrom, endSquare: bestTo, color: ARROW_COLOR }];
        const { from: attFrom, to: attTo } = bestMoveSquares(result.attemptedMoveUci);
        squareStyles[attFrom] = { backgroundColor: "rgba(153, 27, 27, 0.4)" };
        squareStyles[attTo] = { backgroundColor: "rgba(153, 27, 27, 0.4)" };
      }
    }
  }

  return (
    <div>
      <div className="aspect-square w-full max-w-[280px]">
        <Chessboard
          options={{
            position: fenBefore,
            squareStyles,
            arrows,
            allowDragging: interactive && !result && !submitting,
            onSquareClick: interactive ? handleSquareClick : undefined,
            onPieceDrop: interactive ? handlePieceDrop : undefined,
          }}
        />
      </div>

      {interactive && (
        <div className="mt-2">
          {!result && !submitting && (
            <p className="text-xs italic text-foreground/50">
              {selected ? `Selected ${selected.square} — click or drag to a destination.` : "Click a piece or drag it to make your move."}
            </p>
          )}
          {submitting && <p className="text-xs italic text-foreground/50">Checking…</p>}
          {attemptError && <p className="text-xs text-red-700">{attemptError}</p>}
          {result && (
            <div className="text-sm">
              <p className={result.wasCorrect ? "font-semibold text-board" : "font-semibold text-red-800"}>
                {result.wasCorrect ? "Correct!" : "Not quite."}
              </p>
              {!result.wasCorrect && (
                <p className="text-foreground">
                  You played:{" "}
                  <span className="font-mono">
                    {bestMoveSquares(result.attemptedMoveUci).from} → {bestMoveSquares(result.attemptedMoveUci).to}
                  </span>
                </p>
              )}
              <p className="text-foreground">
                Best was: <span className="font-mono">{bestFrom} → {bestTo}</span>
              </p>
              <button onClick={resetRetry} className="mt-1 text-xs text-board hover:underline">
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}