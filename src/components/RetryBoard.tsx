"use client";

import { useState } from "react";
import { Chessboard } from "react-chessboard";
import { API_BASE_URL } from "@/lib/api";

export type AttemptResult = {
  wasCorrect: boolean;
  correctMoveUci: string;
  attemptedMoveUci: string;
};

type EngineLine = {
  evalCp: number | null;
  evalMate: number | null;
  movesUci: string[];
  movesSan: string[];
  fenAfterFirstMove: string;
};

type LinesResponse = { lines: EngineLine[] };

// Same color used on the Game Detail page's "Show better move" arrow —
// keeping this consistent across the app rather than inventing a new one.
const ARROW_COLOR = "#2f4a3d";
const LINES_REQUESTED = 3;
const DEPTH_PLY = 6;

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

function formatEval(line: EngineLine): string {
  if (line.evalMate !== null) {
    return line.evalMate > 0 ? `Mate in ${line.evalMate}` : `Getting mated in ${Math.abs(line.evalMate)}`;
  }
  if (line.evalCp !== null) {
    const pawns = line.evalCp / 100;
    return `${pawns > 0 ? "+" : ""}${pawns.toFixed(1)}`;
  }
  return "—";
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

  const [linesOpen, setLinesOpen] = useState(false);
  const [linesData, setLinesData] = useState<EngineLine[] | null>(null);
  const [linesLoading, setLinesLoading] = useState(false);
  const [linesError, setLinesError] = useState("");

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

  async function toggleLines() {
    if (linesOpen) {
      setLinesOpen(false);
      return;
    }
    setLinesOpen(true);
    if (linesData || linesLoading) return;
    setLinesLoading(true);
    setLinesError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/games/${gameId}/moves/${plyNumber}/lines?lines=${LINES_REQUESTED}&depthPly=${DEPTH_PLY}`
      );
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const json: LinesResponse = await response.json();
      setLinesData(json.lines);
    } catch (err) {
      setLinesError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinesLoading(false);
    }
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  let arrows: { startSquare: string; endSquare: string; color: string }[] = [];
  const canShowLinesButton = !interactive || result !== null;

  if (!interactive) {
    // Static preview: an arrow reads instantly as "this is the better move" —
    // two same-colored squares with no directionality don't.
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

      {canShowLinesButton && (
        <div className="mt-3">
          <button onClick={toggleLines} className="text-xs text-board hover:underline">
            {linesOpen ? "Hide engine lines" : "See engine lines →"}
          </button>

          {linesOpen && (
            <div className="mt-2 max-w-[280px] space-y-2 border border-hairline p-3">
              {linesLoading && <p className="text-xs italic text-foreground/50">Running the engine — this can take a few seconds…</p>}
              {linesError && <p className="text-xs text-red-700">{linesError}</p>}
              {linesData && linesData.length === 0 && <p className="text-xs text-foreground/50">No lines returned for this position.</p>}
              {linesData?.map((line, i) => (
                <div key={i} className="text-xs">
                  <span className="font-mono font-semibold text-foreground">{formatEval(line)}</span>{" "}
                  <span className="text-foreground/70">{line.movesSan.join(" ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}