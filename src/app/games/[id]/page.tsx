"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Chessboard } from "react-chessboard";

type Game = {
  id: number;
  pgn: string;
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

// Each classification maps to a left-border "tag" color (scoresheet-annotation
// style) plus a matching text color — kept separate from the core brand
// palette since these are functional/status colors, not identity colors.
const CLASSIFICATION_STYLES: Record<ReportEntry["classification"], string> = {
  NONE: "border-l-transparent text-foreground/40",
  INACCURACY: "border-l-amber-600 text-amber-700",
  MISTAKE: "border-l-orange-700 text-orange-700",
  BLUNDER: "border-l-red-800 text-red-800",
  PENDING: "border-l-transparent text-foreground/40 italic",
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function GamePage() {
  const params = useParams();
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
    fetch(`http://localhost:8080/api/games/${gameId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load game: ${res.status}`);
        return res.json();
      })
      .then(setGame)
      .catch((err) => setError(err.message));

    fetch(`http://localhost:8080/api/games/${gameId}/moves`)
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
      fetch(`http://localhost:8080/api/games/${gameId}/report`)
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

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!game) return <p className="p-8 text-foreground">Loading…</p>;

  const anyPending = report.some((r) => r.classification === "PENDING");
  const currentFen = selectedPly === -1 ? STARTING_FEN : moves[selectedPly]?.fenAfter ?? STARTING_FEN;

  return (
    <div className="px-8 py-12">
      <h1 className="font-serif text-2xl text-foreground">
        {game.whitePlayer} vs {game.blackPlayer}
      </h1>
      <p className="mb-8 text-sm text-foreground/60">
        {game.result} · {new Date(game.uploadedAt).toLocaleString()}
      </p>

      <div className="flex items-start gap-12">
        <div className="aspect-square w-[400px] shrink-0">
          <Chessboard options={{ position: currentFen }} />
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