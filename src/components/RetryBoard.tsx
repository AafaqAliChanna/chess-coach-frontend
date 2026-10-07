"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Chessboard } from "react-chessboard";
import { API_BASE_URL } from "@/lib/api";

export type AttemptResult = {
  wasCorrect: boolean;
  correctMoveUci: string;
  attemptedMoveUci: string;
  betterLine: EngineLine | null;
};

type EngineLine = {
  evalCp: number | null;
  evalMate: number | null;
  movesUci: string[];
  movesSan: string[];
  fensAfterEachMove: string[];
};

type LinesResponse = { lines: EngineLine[] };

const ARROW_COLOR = "#2f4a3d";
const LINE_ARROW_COLOR = "#1d4ed8";
const LINES_REQUESTED = 3;
const DEPTH_PLY = 6;

export function PuzzleBoard({
  position,
  orientation,
  interactive,
  disabled,
  onMove,
}: {
  position: string;
  orientation: "white" | "black";
  interactive: boolean;
  disabled?: boolean;
  onMove: (moveUci: string) => void;
}) {
  const [selected, setSelected] = useState<{ square: string; pieceType: string } | null>(null);
  const squareStyles: Record<string, CSSProperties> = selected
    ? { [selected.square]: { backgroundColor: "rgba(47, 74, 61, 0.5)" } }
    : {};

  function submitMove(from: string, to: string, pieceType: string) {
    if (!interactive || disabled || from === to) return;
    const isPawn = pieceType.toLowerCase().endsWith("p");
    const promotion = isPawn && (to.endsWith("8") || to.endsWith("1")) ? "q" : "";
    setSelected(null);
    onMove(`${from}${to}${promotion}`);
  }

  function handleSquareClick({ piece, square }: { piece: { pieceType: string } | null; square: string }) {
    if (!interactive || disabled) return;
    if (!selected) {
      if (piece && piece.pieceType[0] === (orientation === "white" ? "w" : "b")) {
        setSelected({ square, pieceType: piece.pieceType });
      }
      return;
    }
    if (piece && piece.pieceType[0] === (orientation === "white" ? "w" : "b")) {
      setSelected({ square, pieceType: piece.pieceType });
      return;
    }
    if (square === selected.square) {
      setSelected(null);
      return;
    }
    submitMove(selected.square, square, selected.pieceType);
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
    if (!targetSquare || !interactive || disabled || piece.pieceType[0] !== (orientation === "white" ? "w" : "b")) return false;
    submitMove(sourceSquare, targetSquare, piece.pieceType);
    return true;
  }

  return (
    <div className="aspect-square w-full max-w-[400px]">
      <Chessboard
        options={{
          position,
          boardOrientation: orientation,
          squareStyles,
          allowDragging: interactive && !disabled,
          onSquareClick: interactive ? handleSquareClick : undefined,
          onPieceDrop: interactive ? handlePieceDrop : undefined,
        }}
      />
    </div>
  );
}

export function PuzzleReviewBoard({
  startPosition,
  orientation,
  movesSan,
  positionsAfterMoves,
  topPlayer,
  bottomPlayer,
}: {
  startPosition: string;
  orientation: "white" | "black";
  movesSan: string[];
  positionsAfterMoves: string[];
  topPlayer?: ReactNode;
  bottomPlayer?: ReactNode;
}) {
  const [step, setStep] = useState(-1);
  const position = step === -1 ? startPosition : positionsAfterMoves[step] ?? startPosition;

  const stepReview = useCallback((direction: -1 | 1) => {
    setStep((current) => Math.max(-1, Math.min(movesSan.length - 1, current + direction)));
  }, [movesSan.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName ?? "")) return;
      event.preventDefault();
      stepReview(event.key === "ArrowLeft" ? -1 : 1);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stepReview]);

  return (
    <div>
      {topPlayer}
      <div className="aspect-square w-full max-w-[400px]">
        <Chessboard
          key={position}
          options={{
            position,
            boardOrientation: orientation,
            allowDragging: false,
          }}
        />
      </div>
      {bottomPlayer}
      <div className="mt-3 border border-hairline bg-board/5 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wide text-foreground/50">Replay position</span>
          <span className="text-xs text-foreground/50">
            {step === -1 ? "Starting position" : `Move ${step + 1} of ${movesSan.length}`}
          </span>
        </div>
        <p className="mb-3 min-h-5 font-mono text-sm text-foreground">
          {step === -1 ? "â€”" : movesSan[step]}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => stepReview(-1)}
            disabled={step === -1}
            className="border border-hairline px-3 py-1.5 text-xs text-foreground disabled:opacity-40"
          >
            â† Previous
          </button>
          <button
            type="button"
            onClick={() => stepReview(1)}
            disabled={step >= movesSan.length - 1}
            className="border border-hairline px-3 py-1.5 text-xs text-foreground disabled:opacity-40"
          >
            Next â†’
          </button>
        </div>
        <p className="mt-2 text-xs text-foreground/50">Use the keyboard â† and â†’ arrow keys or the buttons to review.</p>
      </div>
    </div>
  );
}

function bestMoveSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

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
  return "â€”";
}

export default function RetryBoard({
  fenBefore,
  gameId,
  plyNumber,
  token = null,
  onAuthRequired = () => {},
  onResult,
  interactive = true,
  orientation = "white",
}: {
  fenBefore: string;
  gameId: number;
  plyNumber: number;
  token?: string | null;
  onAuthRequired?: () => void;
  onResult?: (result: AttemptResult) => void;
  interactive?: boolean;
  orientation?: "white" | "black";
}) {
  const [selected, setSelected] = useState<{ square: string; pieceType: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attemptError, setAttemptError] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);

  const [linesOpen, setLinesOpen] = useState(false);
  const [linesData, setLinesData] = useState<EngineLine[] | null>(null);
  const [linesLoading, setLinesLoading] = useState(false);
  const [linesError, setLinesError] = useState("");
  const [betterLine, setBetterLine] = useState<EngineLine | null>(null);

  // step = -1 means "before any move in the line" (the original position,
  // with an arrow for the first move). step = N means "after movesUci[N]
  // has been played" (board shows fensAfterEachMove[N], arrow â€” if any move
  // remains â€” for movesUci[N+1]).
  const [activeLine, setActiveLine] = useState<{ lineIndex: number; step: number } | null>(null);

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
        betterLine: data.betterLine ?? null,
      };
      setResult(r);
      setBetterLine(r.betterLine);
      if (r.betterLine) setActiveLine({ lineIndex: -1, step: -1 });
      onResult?.(r);
    } catch (err) {
      setAttemptError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setSelected(null);
    }
  }

  function handleSquareClick({ piece, square }: { piece: { pieceType: string } | null; square: string }) {
    if (!interactive || result || submitting || activeLine) return;
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
    if (!interactive || !targetSquare || result || submitting || activeLine) return false;
    submitAttempt(sourceSquare, targetSquare, piece.pieceType);
    return true;
  }

  function resetRetry() {
    setSelected(null);
    setResult(null);
    setBetterLine(null);
    setAttemptError("");
    setActiveLine(null);
  }

  async function toggleLines() {
    if (linesOpen) {
      setLinesOpen(false);
      setActiveLine(null);
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

  function loadLineOnBoard(lineIndex: number) {
    setActiveLine((prev) => (prev?.lineIndex === lineIndex ? null : { lineIndex, step: -1 }));
  }

  function stepLine(direction: 1 | -1, lastIndex: number) {
    setActiveLine((prev) => {
      if (!prev) return prev;
      const next = prev.step + direction;
      if (next < -1 || next > lastIndex) return prev;
      return { ...prev, step: next };
    });
  }

  let displayPosition = fenBefore;
  const squareStyles: Record<string, React.CSSProperties> = {};
  let arrows: { startSquare: string; endSquare: string; color: string }[] = [];
  const canShowLinesButton = !interactive || result !== null;
  const activeLineData =
    activeLine?.lineIndex === -1 ? betterLine : activeLine !== null ? linesData?.[activeLine.lineIndex] ?? null : null;

  if (activeLine !== null && activeLineData) {
    const { step } = activeLine;
    displayPosition = step === -1 ? fenBefore : activeLineData.fensAfterEachMove[step];
    const nextMoveUci = activeLineData.movesUci[step + 1];
    if (nextMoveUci) {
      const { from, to } = bestMoveSquares(nextMoveUci);
      arrows = [{ startSquare: from, endSquare: to, color: LINE_ARROW_COLOR }];
    }
  } else if (!interactive) {
    displayPosition = fenBefore;
  } else {
    displayPosition = fenBefore;
    if (selected) {
      squareStyles[selected.square] = { backgroundColor: "rgba(47, 74, 61, 0.5)" };
    }
    if (result) {
      if (result.wasCorrect) {
        const { from, to } = bestMoveSquares(result.correctMoveUci);
        squareStyles[from] = { backgroundColor: "rgba(47, 74, 61, 0.5)" };
        squareStyles[to] = { backgroundColor: "rgba(47, 74, 61, 0.5)" };
      } else {
        const { from, to } = bestMoveSquares(result.correctMoveUci);
        arrows = [{ startSquare: from, endSquare: to, color: ARROW_COLOR }];
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
            position: displayPosition,
            boardOrientation: orientation,
            squareStyles,
            arrows,
            allowDragging: interactive && !result && !submitting && !activeLine,
            onSquareClick: interactive ? handleSquareClick : undefined,
            onPieceDrop: interactive ? handlePieceDrop : undefined,
          }}
        />
      </div>

      {activeLineData && (
        <div className="mt-2 flex items-center justify-between border border-hairline bg-board/5 px-2 py-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => stepLine(-1, activeLineData.movesUci.length - 1)}
              disabled={activeLine!.step === -1}
              className="text-xs text-foreground hover:text-board disabled:opacity-30"
            >
              â† Prev
            </button>
            <span className="font-mono text-xs text-foreground">
              {activeLine!.step === -1 ? (activeLine!.lineIndex === -1 ? "Better line" : "Start") : activeLineData.movesSan[activeLine!.step]}
            </span>
            <button
              onClick={() => stepLine(1, activeLineData.movesUci.length - 1)}
              disabled={activeLine!.step === activeLineData.movesUci.length - 1}
              className="text-xs text-foreground hover:text-board disabled:opacity-30"
            >
              Next â†’
            </button>
          </div>
          <button onClick={() => setActiveLine(null)} className="text-xs text-foreground/50 hover:underline">
            Close
          </button>
        </div>
      )}

      {interactive && !activeLine && (
        <div className="mt-2">
          {!result && !submitting && (
            <p className="text-xs italic text-foreground/50">
              {selected ? `Selected ${selected.square} â€” click or drag to a destination.` : "Click a piece or drag it to make your move."}
            </p>
          )}
          {submitting && <p className="text-xs italic text-foreground/50">Checkingâ€¦</p>}
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
                    {bestMoveSquares(result.attemptedMoveUci).from} â†’ {bestMoveSquares(result.attemptedMoveUci).to}
                  </span>
                </p>
              )}
              <p className="text-foreground">
                Best was:{" "}
                <span className="font-mono">
                  {bestMoveSquares(result.correctMoveUci).from} â†’ {bestMoveSquares(result.correctMoveUci).to}
                </span>
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
          <div className="flex items-center justify-between">
            <button onClick={toggleLines} className="text-xs text-board hover:underline">
              {linesOpen ? "Hide engine lines" : "See engine lines â†’"}
            </button>
            <Link href={`/games/${gameId}`} className="text-xs text-foreground/50 hover:underline">
              View original game â†’
            </Link>
          </div>

          {linesOpen && (
            <div className="mt-2 max-w-[280px] space-y-1 border border-hairline p-3">
              {linesLoading && <p className="text-xs italic text-foreground/50">Running the engine â€” this can take a few secondsâ€¦</p>}
              {linesError && <p className="text-xs text-red-700">{linesError}</p>}
              {linesData && linesData.length === 0 && <p className="text-xs text-foreground/50">No lines returned for this position.</p>}
              {linesData?.map((line, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <button
                    onClick={() => loadLineOnBoard(i)}
                    title="Step through this line on the board"
                    className={`mt-0.5 shrink-0 ${activeLine?.lineIndex === i ? "text-board" : "text-foreground/40 hover:text-board"}`}
                  >
                    â–¶
                  </button>
                  <div>
                    <span className="font-mono font-semibold text-foreground">{formatEval(line)}</span>{" "}
                    <span className="text-foreground/70">{line.movesSan.join(" ")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
