"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
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

type Move = {
  id: number;
  plyNumber: number;
  san: string;
  fenAfter: string;
};

type ReportEntry = {
  plyNumber: number;
  san: string;
  bestMoveUci: string | null;
  scoreCentipawns: number | null;
  mateInMoves: number | null;
  centipawnLoss: number;
  classification: "NONE" | "INACCURACY" | "MISTAKE" | "BLUNDER" | "PENDING";
};

const CLASSIFICATION_STYLES: Record<ReportEntry["classification"], string> = {
  NONE: "border-l-transparent text-foreground/40",
  INACCURACY: "border-l-amber-600 text-amber-700",
  MISTAKE: "border-l-orange-700 text-orange-700",
  BLUNDER: "border-l-red-800 text-red-800",
  PENDING: "border-l-transparent text-foreground/40 italic",
};

const CLASSIFICATION_SQUARE_COLOR: Record<ReportEntry["classification"], string | null> = {
  NONE: null,
  INACCURACY: "rgba(217, 119, 6, 0.5)",
  MISTAKE: "rgba(194, 65, 12, 0.5)",
  BLUNDER: "rgba(153, 27, 27, 0.55)",
  PENDING: null,
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function getChangedSquares(fenBefore: string, fenAfter: string): string[] {
  const boardBefore = fenBefore.split(" ")[0];
  const boardAfter = fenAfter.split(" ")[0];

  function expandRank(rank: string): string[] {
    const squares: string[] = [];
    for (const char of rank) {
      if (/\d/.test(char)) {
        squares.push(...Array(Number(char)).fill(""));
      } else {
        squares.push(char);
      }
    }
    return squares;
  }

  const ranksBefore = boardBefore.split("/").map(expandRank);
  const ranksAfter = boardAfter.split("/").map(expandRank);

  const changed: string[] = [];
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      if (ranksBefore[rankIndex][fileIndex] !== ranksAfter[rankIndex][fileIndex]) {
        const square = `${FILES[fileIndex]}${8 - rankIndex}`;
        changed.push(square);
      }
    }
  }
  return changed;
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id;

  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [error, setError] = useState("");
  const [selectedPly, setSelectedPly] = useState(-1);

  const reportRef = useRef<ReportEntry[]>([]);
  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/games/${gameId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load game: ${res.status}`);
        return res.json();
      })
      .then(setGame)
      .catch((err) => setError(err.message));

    fetch(`${API_BASE_URL}/api/games/${gameId}/moves`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load moves: ${res.status}`);
        return res.json();
      })
      .then(setMoves)
      .catch((err) => setError(err.message));
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;

    function fetchReport() {
      fetch(`${API_BASE_URL}/api/games/${gameId}/report`)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load report: ${res.status}`);
          return res.json();
        })
        .then((data: ReportEntry[]) => {
          if (cancelled) return;
          setReport(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
    }

    fetchReport();
    let pollCount = 0;
    const MAX_POLLS = 30;
    const intervalId = setInterval(() => {
      pollCount++;
      const stillPending = reportRef.current.some((r) => r.classification === "PENDING");
      if (stillPending && pollCount < MAX_POLLS) {
        fetchReport();
      } else {
        clearInterval(intervalId);
        if (stillPending) setError("Analysis is taking longer than expected. Refresh to check again.");
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [gameId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") {
        setSelectedPly((prev) => Math.min(prev + 1, moves.length - 1));
      } else if (e.key === "ArrowLeft") {
        setSelectedPly((prev) => Math.max(prev - 1, -1));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moves.length]);

  async function handleDelete() {
    if (!game) return;
    const displayName = game.title || `${game.whitePlayer} vs ${game.blackPlayer}`;
    const confirmed = window.confirm(
      `Delete "${displayName}"? This permanently removes the game and its analysis — it cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/games/${gameId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to delete: ${response.status}`);
      }
      router.push("/games");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!game) return <p className="p-8 text-foreground">Loading…</p>;

  const anyPending = report.some((r) => r.classification === "PENDING");
  const currentFen = selectedPly === -1 ? STARTING_FEN : moves[selectedPly]?.fenAfter ?? STARTING_FEN;
  const previousFen = selectedPly <= 0 ? STARTING_FEN : moves[selectedPly - 1]?.fenAfter ?? STARTING_FEN;

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selectedPly >= 0) {
    const currentReportEntry = report.find((r) => r.plyNumber === moves[selectedPly]?.plyNumber);
    const color = currentReportEntry ? CLASSIFICATION_SQUARE_COLOR[currentReportEntry.classification] : null;
    if (color) {
      const changedSquares = getChangedSquares(previousFen, currentFen);
      for (const square of changedSquares) {
        squareStyles[square] = { backgroundColor: color };
      }
    }
  }

  return (
    <div className="px-8 py-12">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl text-foreground">
            {game.title || `${game.whitePlayer} vs ${game.blackPlayer}`}
          </h1>
          <p className="text-sm text-foreground/60">
            {game.result} · {new Date(game.uploadedAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleDelete}
          className="text-xs text-red-700 hover:underline"
        >
          Delete game
        </button>
      </div>

      <div className="flex items-start gap-12">
        <div className="shrink-0">
          <div className="aspect-square w-[400px]">
            <Chessboard options={{ position: currentFen, squareStyles }} />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setSelectedPly((p) => Math.max(p - 1, -1))}
              disabled={selectedPly === -1}
              className="border border-hairline px-3 py-1 text-sm text-foreground hover:bg-hairline/30 disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              onClick={() => setSelectedPly((p) => Math.min(p + 1, moves.length - 1))}
              disabled={selectedPly === moves.length - 1}
              className="border border-hairline px-3 py-1 text-sm text-foreground hover:bg-hairline/30 disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>

        <div className="max-w-md flex-1">
          {anyPending && (
            <p className="mb-3 text-sm italic text-foreground/50">
              Analysis in progress — updating automatically…
            </p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-foreground/50">
                <th className="py-2 font-medium">#</th>
                <th className="font-medium">Move</th>
                <th className="font-medium">Classification</th>
                <th className="font-medium">CP loss</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((move, index) => {
                const reportEntry = report.find((r) => r.plyNumber === move.plyNumber);
                const classification = reportEntry?.classification ?? "PENDING";
                return (
                  <tr
                    key={move.id}
                    onClick={() => setSelectedPly(index)}
                    className={`cursor-pointer border-b border-hairline border-l-4 ${CLASSIFICATION_STYLES[classification]} ${
                      selectedPly === index ? "bg-brass/20" : "hover:bg-hairline/30"
                    }`}
                  >
                    <td className="py-2 pl-2 text-foreground/60">{move.plyNumber}</td>
                    <td className="font-mono text-foreground">{move.san}</td>
                    <td>{classification}</td>
                    <td className="text-foreground/70">{reportEntry?.centipawnLoss ?? "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}