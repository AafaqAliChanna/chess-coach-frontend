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

const CLASSIFICATION_COLORS: Record<ReportEntry["classification"], string> = {
  NONE: "text-zinc-400",
  INACCURACY: "text-yellow-600",
  MISTAKE: "text-orange-600",
  BLUNDER: "text-red-600",
  PENDING: "text-zinc-400 italic",
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

  // Mirrors `report` into a ref so the polling effect below can read the
  // *latest* value inside its setInterval callback without needing `report`
  // in its dependency array. If we depended on `report` directly, every
  // setReport() call would re-run this whole effect and fire an extra fetch
  // immediately — which is exactly the runaway loop you just saw.
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

  // Runs once per gameId. Fetches immediately, then polls every 2s ONLY
  // while reportRef.current still has a PENDING entry, checked fresh at
  // each tick — not tied to React's render/effect cycle at all.
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
    const intervalId = setInterval(() => {
      const stillPending = reportRef.current.some((r) => r.classification === "PENDING");
      if (stillPending) {
        fetchReport();
      } else {
        clearInterval(intervalId);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [gameId]);

  if (error) return <p className="min-h-screen bg-zinc-50 p-8 text-red-600">Error: {error}</p>;
  if (!game) return <p className="min-h-screen bg-zinc-50 p-8 text-zinc-900">Loading...</p>;

  const anyPending = report.some((r) => r.classification === "PENDING");
  const currentFen = selectedPly === -1 ? STARTING_FEN : moves[selectedPly]?.fenAfter ?? STARTING_FEN;

  return (
    <div className="min-h-screen bg-zinc-50 p-8 text-zinc-900">
      <h1 className="text-xl font-semibold">
        {game.whitePlayer} vs {game.blackPlayer}
      </h1>
      <p className="mb-6 text-sm text-zinc-600">
        Result: {game.result} — Uploaded: {game.uploadedAt}
      </p>

      <div className="flex items-start gap-8">
        <div className="aspect-square w-[400px] shrink-0">
          <Chessboard options={{ position: currentFen }} />
        </div>

        <div className="flex-1">
          {anyPending && (
            <p className="mb-2 text-sm italic text-zinc-500">
              Analysis in progress — updating automatically...
            </p>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-zinc-500">
                <th className="py-1">#</th>
                <th>Move</th>
                <th>Classification</th>
                <th>CP Loss</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((move, index) => {
                const reportEntry = report.find((r) => r.plyNumber === move.plyNumber);
                return (
                  <tr
                    key={move.id}
                    onClick={() => setSelectedPly(index)}
                    className={`cursor-pointer border-b hover:bg-zinc-100 ${
                      selectedPly === index ? "bg-zinc-200" : ""
                    }`}
                  >
                    <td className="py-1">{move.plyNumber}</td>
                    <td className="font-mono">{move.san}</td>
                    <td className={CLASSIFICATION_COLORS[reportEntry?.classification ?? "PENDING"]}>
                      {reportEntry?.classification ?? "PENDING"}
                    </td>
                    <td>{reportEntry?.centipawnLoss ?? "-"}</td>
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