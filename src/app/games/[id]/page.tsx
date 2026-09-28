"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import GameReportPanel from "@/components/GameReportPanel";
import type { Game } from "@/lib/types";

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

type AccuracyResponse = {
  gameId: number;
  stillAnalyzing: boolean;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  evaluationSeries: {
    plyNumber: number;
    whiteWinPercent: number;
    whiteCentipawns: number | null;
    whiteMateIn: number | null;
  }[];
};

type CoachingKeyMoment = { plyNumber: number; comment: string };
type CoachingResponse = {
  strengths: string[];
  weaknesses: string[];
  keyMoments: CoachingKeyMoment[];
  recommendation: string;
};

type HighlightTag = "BRILLIANT" | "GREAT";
type HighlightEntry = {
  plyNumber: number;
  san: string;
  fenBefore: string;
  tag: HighlightTag;
  sacrificeMargin: number | null;
};
type HighlightsResponse = {
  gameId: number;
  totalMovesChecked: number;
  brilliantCount: number;
  greatCount: number;
  goodCount: number;
  highlights: HighlightEntry[];
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

const CLASSIFICATION_BADGE: Record<ReportEntry["classification"], { symbol: string; color: string } | null> = {
  NONE: null,
  INACCURACY: { symbol: "?!", color: "#b45309" },
  MISTAKE: { symbol: "?", color: "#c2410c" },
  BLUNDER: { symbol: "??", color: "#991b1b" },
  PENDING: null,
};

const HIGHLIGHT_ROW_STYLES: Record<HighlightTag, string> = {
  BRILLIANT: "border-l-purple-600 text-purple-700",
  GREAT: "border-l-blue-600 text-blue-700",
};
const HIGHLIGHT_SQUARE_COLOR: Record<HighlightTag, string> = {
  BRILLIANT: "rgba(124, 58, 237, 0.35)",
  GREAT: "rgba(37, 99, 235, 0.3)",
};
const HIGHLIGHT_BADGE: Record<HighlightTag, { symbol: string; color: string }> = {
  BRILLIANT: { symbol: "!!", color: "#7c3aed" },
  GREAT: { symbol: "!", color: "#2563eb" },
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const BOARD_SIZE_PX = 400;
const AUTOPLAY_INTERVAL_MS = 800;
const ARROW_COLOR = "var(--board)";

function getChangedSquares(fenBefore: string, fenAfter: string): string[] {
  const boardBefore = fenBefore.split(" ")[0];
  const boardAfter = fenAfter.split(" ")[0];
  function expandRank(rank: string): string[] {
    const squares: string[] = [];
    for (const char of rank) {
      if (/\d/.test(char)) squares.push(...Array(Number(char)).fill(""));
      else squares.push(char);
    }
    return squares;
  }
  const ranksBefore = boardBefore.split("/").map(expandRank);
  const ranksAfter = boardAfter.split("/").map(expandRank);
  const changed: string[] = [];
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      if (ranksBefore[rankIndex][fileIndex] !== ranksAfter[rankIndex][fileIndex]) {
        changed.push(`${FILES[fileIndex]}${8 - rankIndex}`);
      }
    }
  }
  return changed;
}

function findDestinationSquare(fenAfter: string, changedSquares: string[]): string | null {
  const boardAfter = fenAfter.split(" ")[0];
  const ranks = boardAfter.split("/");
  function pieceAt(square: string): string {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - Number(square[1]);
    let col = 0;
    for (const char of ranks[rank]) {
      if (/\d/.test(char)) {
        col += Number(char);
      } else {
        if (col === file) return char;
        col += 1;
      }
      if (col > file) break;
    }
    return "";
  }
  return changedSquares.find((sq) => pieceAt(sq) !== "") ?? null;
}

function squareToPixel(square: string): { left: number; top: number; size: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const size = BOARD_SIZE_PX / 8;
  return { left: file * size, top: (8 - rank) * size, size };
}

function parseUciSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id;
  const { user } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null);
  const [error, setError] = useState("");
  const [selectedPly, setSelectedPly] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [showAlternative, setShowAlternative] = useState(false);
  const [expandedExplanationPly, setExpandedExplanationPly] = useState<number | null>(null);

  const [coaching, setCoaching] = useState<CoachingResponse | null>(null);
  const [coachingLoading, setCoachingLoading] = useState(false);
  const [coachingError, setCoachingError] = useState("");

  const [highlights, setHighlights] = useState<HighlightsResponse | null>(null);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightsError, setHighlightsError] = useState("");

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
      Promise.all([
        fetch(`${API_BASE_URL}/api/games/${gameId}/report`).then((res) => {
          if (!res.ok) throw new Error(`Failed to load report: ${res.status}`);
          return res.json() as Promise<ReportEntry[]>;
        }),
        fetch(`${API_BASE_URL}/api/games/${gameId}/accuracy`).then((res) => {
          if (!res.ok) throw new Error(`Failed to load accuracy: ${res.status}`);
          return res.json() as Promise<AccuracyResponse>;
        }),
      ])
        .then(([reportData, accuracyData]) => {
          if (cancelled) return;
          setReport(reportData);
          setAccuracy(accuracyData);
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
    if (!isPlaying) return;
    const intervalId = setInterval(() => {
      setSelectedPly((prev) => {
        if (prev >= moves.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isPlaying, moves.length]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") {
        setIsPlaying(false);
        setSelectedPly((prev) => Math.min(prev + 1, moves.length - 1));
      } else if (e.key === "ArrowLeft") {
        setIsPlaying(false);
        setSelectedPly((prev) => Math.max(prev - 1, -1));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moves.length]);

  useEffect(() => {
    setShowAlternative(false);
  }, [selectedPly]);

  async function handleDelete() {
    if (!game) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const displayName = game.title || `${game.whitePlayer} vs ${game.blackPlayer}`;
    const confirmed = window.confirm(
      `Delete "${displayName}"? This permanently removes the game and its analysis — it cannot be undone.`
    );
    if (!confirmed) return;

    setDeleteError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/games/${gameId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (response.status === 403) {
        setDeleteError("You don't have permission to delete this game — it belongs to a different account.");
        return;
      }
      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to delete: ${response.status}`);
      }
      router.push("/games");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  }

  function startEditingTitle() {
    if (!game) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setTitleDraft(game.title || "");
    setEditingTitle(true);
    setTitleError("");
  }

  async function saveTitle() {
    if (!game || !user) return;
    setSavingTitle(true);
    setTitleError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/games/${gameId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ title: titleDraft || null }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (response.status === 403) {
        setTitleError("You don't have permission to edit this game — it belongs to a different account.");
        return;
      }
      if (!response.ok) throw new Error(`Failed to save title: ${response.status}`);
      const updated = await response.json();
      setGame(updated);
      setEditingTitle(false);
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleGetCoaching() {
    setCoachingLoading(true);
    setCoachingError("");
    setCoaching(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/games/${gameId}/coaching`);
      if (response.status === 503) {
        throw new Error("Coaching isn't ready yet — analysis may still be running, or the AI service is temporarily unavailable. Try again in a moment.");
      }
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data: CoachingResponse = await response.json();
      setCoaching(data);
    } catch (err) {
      setCoachingError(err instanceof Error ? err.message : String(err));
    } finally {
      setCoachingLoading(false);
    }
  }

  async function handleGetHighlights() {
    setHighlightsLoading(true);
    setHighlightsError("");
    setHighlights(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/games/${gameId}/highlights`);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data: HighlightsResponse = await response.json();
      setHighlights(data);
    } catch (err) {
      setHighlightsError(err instanceof Error ? err.message : String(err));
    } finally {
      setHighlightsLoading(false);
    }
  }

  function jumpToPly(plyNumber: number) {
    const index = moves.findIndex((m) => m.plyNumber === plyNumber);
    if (index === -1) return;
    setIsPlaying(false);
    setSelectedPly(index);
  }

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!game) return <p className="p-8 text-foreground">Loading…</p>;

  const anyPending = report.some((r) => r.classification === "PENDING");
  const afterFen = selectedPly === -1 ? STARTING_FEN : moves[selectedPly]?.fenAfter ?? STARTING_FEN;
  const beforeFen = selectedPly <= 0 ? STARTING_FEN : moves[selectedPly - 1]?.fenAfter ?? STARTING_FEN;

  const currentReportEntry =
    selectedPly >= 0 ? report.find((r) => r.plyNumber === moves[selectedPly]?.plyNumber) : undefined;
  const classification = currentReportEntry?.classification;
  const hasAlternative =
    !!currentReportEntry?.bestMoveUci &&
    !!classification &&
    ["INACCURACY", "MISTAKE", "BLUNDER"].includes(classification);

  const highlightsByPly = new Map((highlights?.highlights ?? []).map((h) => [h.plyNumber, h]));
  const currentHighlight =
    selectedPly >= 0 ? highlightsByPly.get(moves[selectedPly]?.plyNumber) : undefined;

  const displayFen = showAlternative ? beforeFen : afterFen;

  const squareStyles: Record<string, React.CSSProperties> = {};
  let badge: { left: number; top: number; size: number; symbol: string; color: string } | null = null;
  let arrows: { startSquare: string; endSquare: string; color: string }[] = [];

  if (selectedPly >= 0 && !showAlternative) {
    const changedSquares = getChangedSquares(beforeFen, afterFen);
    const squareColor = currentHighlight
      ? HIGHLIGHT_SQUARE_COLOR[currentHighlight.tag]
      : classification
      ? CLASSIFICATION_SQUARE_COLOR[classification]
      : null;
    if (squareColor) {
      for (const square of changedSquares) squareStyles[square] = { backgroundColor: squareColor };
    }
    const badgeInfo = currentHighlight
      ? HIGHLIGHT_BADGE[currentHighlight.tag]
      : classification
      ? CLASSIFICATION_BADGE[classification]
      : null;
    if (badgeInfo) {
      const destSquare = findDestinationSquare(afterFen, changedSquares);
      if (destSquare) badge = { ...squareToPixel(destSquare), ...badgeInfo };
    }
  }

  if (selectedPly >= 0 && showAlternative && currentReportEntry?.bestMoveUci) {
    const { from, to } = parseUciSquares(currentReportEntry.bestMoveUci);
    arrows = [{ startSquare: from, endSquare: to, color: ARROW_COLOR }];
  }

  const whiteAccuracy = accuracy?.whiteAccuracy ?? null;
  const blackAccuracy = accuracy?.blackAccuracy ?? null;

  const explanationByPly = new Map((coaching?.keyMoments ?? []).map((km) => [km.plyNumber, km.comment]));

  return (
    <div className="px-8 py-12">
      <div className="mb-8 flex items-start justify-between">
        <div>
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder={`${game.whitePlayer} vs ${game.blackPlayer}`}
                className="border border-hairline bg-background px-2 py-1 font-serif text-xl text-foreground focus:border-board focus:outline-none"
                autoFocus
              />
              <button onClick={saveTitle} disabled={savingTitle} className="text-xs text-board hover:underline disabled:opacity-50">
                {savingTitle ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setEditingTitle(false)} className="text-xs text-foreground/60 hover:underline">
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="group font-serif text-2xl text-foreground">
              {game.title || `${game.whitePlayer} vs ${game.blackPlayer}`}{" "}
              <button onClick={startEditingTitle} className="text-xs font-sans text-foreground/40 hover:text-board hover:underline">
                edit
              </button>
            </h1>
          )}
          {titleError && <p className="mt-1 text-xs text-red-700">{titleError}</p>}
          <p className="text-sm text-foreground/60">
            {game.result}
            {game.timeControl && <> · {game.timeControl}</>} · {new Date(game.uploadedAt).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <button onClick={handleDelete} className="text-xs text-red-700 hover:underline">
            Delete game
          </button>
          {deleteError && <p className="mt-1 max-w-[200px] text-xs text-red-700">{deleteError}</p>}
        </div>
      </div>

      {accuracy && (
        <div className="mb-8 flex gap-8 border-y border-hairline py-3 text-sm">
          <p className="text-foreground">
            {game.whitePlayer} approx. accuracy:{" "}
            <span className="font-semibold">
              {accuracy.stillAnalyzing || whiteAccuracy === null ? "Analyzing..." : `${whiteAccuracy.toFixed(1)}%`}
            </span>
          </p>
          <p className="text-foreground">
            {game.blackPlayer} approx. accuracy:{" "}
            <span className="font-semibold">
              {accuracy.stillAnalyzing || blackAccuracy === null ? "Analyzing..." : `${blackAccuracy.toFixed(1)}%`}
            </span>
          </p>
        </div>
      )}

      <div className="flex items-start gap-10">
        <div className="w-[400px] shrink-0">
          <div className="mb-2 flex items-center justify-between border-b border-hairline px-1 pb-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/45">Black</p>
              <p className="truncate font-serif text-base text-foreground" title={game.blackPlayer}>
                {game.blackPlayer}
              </p>
            </div>
            <span className="ml-3 h-3 w-3 shrink-0 rounded-full border border-foreground/30 bg-[#2b2b2b] shadow-sm" aria-hidden="true" />
          </div>
          <div className="relative aspect-square w-[400px]">
            <Chessboard
              options={{
                position: displayFen,
                squareStyles,
                arrows,
                animationDurationInMs: 300,
                darkSquareStyle: { backgroundColor: "var(--chess-dark-square)" },
                lightSquareStyle: { backgroundColor: "var(--chess-light-square)" },
              }}
            />
            {badge && (
              <div
                className="pointer-events-none absolute flex items-center justify-center"
                style={{ left: badge.left, top: badge.top, width: badge.size, height: badge.size }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white shadow"
                  style={{ backgroundColor: badge.color }}
                >
                  {badge.symbol}
                </span>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-hairline px-1 pt-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/45">White</p>
              <p className="truncate font-serif text-base text-foreground" title={game.whitePlayer}>
                {game.whitePlayer}
              </p>
            </div>
            <span className="ml-3 h-3 w-3 shrink-0 rounded-full border border-foreground/30 bg-[#f5f1e8] shadow-sm" aria-hidden="true" />
          </div>

          {hasAlternative && (
            <button
              onClick={() => setShowAlternative((v) => !v)}
              className="mt-2 border border-hairline px-3 py-1 text-xs text-foreground hover:bg-hairline/30"
            >
              {showAlternative ? "← Back to what was played" : "Show better move instead →"}
            </button>
          )}
          {selectedPly >= 0 && classification && ["INACCURACY", "MISTAKE", "BLUNDER"].includes(classification) && !currentReportEntry?.bestMoveUci && (
            <p className="mt-2 text-xs text-foreground/40">
              No alternative move available for this ply (this happens on move 1, which isn't evaluated).
            </p>
          )}
          {showAlternative && (
            <p className="mt-2 text-xs text-foreground/50">
              Position before the move — green arrow is the engine's suggestion instead of{" "}
              <span className="font-mono">{moves[selectedPly]?.san}</span>.
            </p>
          )}
          {currentHighlight && (
            <p className="mt-2 text-xs text-foreground/60">
              {currentHighlight.tag === "BRILLIANT" ? "Brilliant" : "Great"} move
              {currentHighlight.tag === "BRILLIANT" && currentHighlight.sacrificeMargin !== null
                ? ` — sacrificed material (margin: ${currentHighlight.sacrificeMargin}) and it worked.`
                : "."}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setIsPlaying(false); setSelectedPly((p) => Math.max(p - 1, -1)); }}
              disabled={selectedPly === -1}
              className="border border-hairline px-3 py-1 text-sm text-foreground hover:bg-hairline/30 disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              onClick={() => setIsPlaying((p) => !p)}
              disabled={moves.length === 0}
              className="border border-hairline px-3 py-1 text-sm text-foreground hover:bg-hairline/30 disabled:opacity-30"
            >
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              onClick={() => { setIsPlaying(false); setSelectedPly((p) => Math.min(p + 1, moves.length - 1)); }}
              disabled={selectedPly === moves.length - 1}
              className="border border-hairline px-3 py-1 text-sm text-foreground hover:bg-hairline/30 disabled:opacity-30"
            >
              Next →
            </button>
          </div>

          <div className="mt-8 border-t border-hairline pt-4">
            <h2 className="mb-2 font-serif text-lg text-foreground">AI Coaching</h2>

            {!coaching && !coachingLoading && (
              <button
                onClick={handleGetCoaching}
                disabled={anyPending}
                className="bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark disabled:opacity-50"
              >
                Get AI Coaching
              </button>
            )}
            {coachingLoading && (
              <p className="text-sm italic text-foreground/60">
                Generating coaching insights — this can take a few minutes on first run…
              </p>
            )}
            {coachingError && (
              <div>
                <p className="mb-2 text-sm text-red-700">{coachingError}</p>
                <button onClick={handleGetCoaching} className="text-xs text-board hover:underline">
                  Retry
                </button>
              </div>
            )}

            {coaching && (
              <div className="w-full max-w-[400px] space-y-4 text-sm">
                {coaching.strengths.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-foreground/50">Strengths</p>
                    <ul className="list-inside list-disc text-foreground">
                      {coaching.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {coaching.weaknesses.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-foreground/50">Weaknesses</p>
                    <ul className="list-inside list-disc text-foreground">
                      {coaching.weaknesses.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {coaching.keyMoments.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-foreground/50">Key moments</p>
                    <ul className="space-y-2">
                      {coaching.keyMoments.map((km) => (
                        <li key={km.plyNumber} className="border-l-2 border-board pl-2">
                          <button
                            onClick={() => jumpToPly(km.plyNumber)}
                            className="font-mono text-xs text-board hover:underline"
                          >
                            Move {km.plyNumber}
                          </button>
                          <p className="text-foreground/80">{km.comment}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-foreground/50">Recommendation</p>
                  <p className="text-foreground">{coaching.recommendation}</p>
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="w-[340px] shrink-0">
          <GameReportPanel
            whitePlayer={game.whitePlayer}
            blackPlayer={game.blackPlayer}
            whiteAccuracy={whiteAccuracy}
            blackAccuracy={blackAccuracy}
            accuracyStillAnalyzing={accuracy?.stillAnalyzing ?? true}
            evaluationSeries={accuracy?.evaluationSeries ?? []}
            report={report}
            onJumpToPly={jumpToPly}
          />

          <div className="mt-8 border-t border-hairline pt-4">
            <h2 className="mb-2 font-serif text-lg text-foreground">Game Highlights</h2>
            <p className="mb-2 text-xs text-foreground/50">
              Chess.com-style Brilliant/Great move detection. This scans most of the game, so it's noticeably slower
              than other analysis here — expect it to take a while, not a quick spinner.
            </p>

            {!highlights && !highlightsLoading && (
              <button
                onClick={handleGetHighlights}
                disabled={anyPending}
                className="bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark disabled:opacity-50"
              >
                Find Highlights
              </button>
            )}
            {highlightsLoading && (
              <p className="text-sm italic text-foreground/60">
                Checking your best moves across the game — this can take a while…
              </p>
            )}
            {highlightsError && (
              <div>
                <p className="mb-2 text-sm text-red-700">{highlightsError}</p>
                <button onClick={handleGetHighlights} className="text-xs text-board hover:underline">
                  Retry
                </button>
              </div>
            )}

            {highlights && (
              <div className="max-w-md text-sm">
                <p className="mb-3 text-foreground/70">
                  {highlights.brilliantCount} brilliant · {highlights.greatCount} great · {highlights.goodCount} good
                  (of {highlights.totalMovesChecked} moves checked)
                </p>
                {highlights.highlights.length === 0 ? (
                  <p className="text-foreground/50">No standout moves this game — still could've been solid throughout.</p>
                ) : (
                  <ul className="space-y-1">
                    {highlights.highlights.map((h) => (
                      <li key={h.plyNumber}>
                        <button onClick={() => jumpToPly(h.plyNumber)} className="text-left hover:underline">
                          <span
                            className="mr-2 font-mono text-xs font-bold"
                            style={{ color: HIGHLIGHT_BADGE[h.tag].color }}
                          >
                            {HIGHLIGHT_BADGE[h.tag].symbol}
                          </span>
                          <span className="font-mono text-foreground">{h.san}</span>{" "}
                          <span className="text-foreground/50">
                            ({h.tag === "BRILLIANT" ? "Brilliant" : "Great"}
                            {h.sacrificeMargin !== null ? `, sac margin ${h.sacrificeMargin}` : ""})
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-[280px] shrink-0">
          {anyPending && (
            <p className="mb-3 text-sm italic text-foreground/50">Analysis in progress — updating automatically…</p>
          )}
          {!coaching && (
            <p className="mb-3 text-xs italic text-foreground/40">
              Click "Get AI Coaching" to see a "Why?" explanation on flagged moves below.
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
                const moveClassification = reportEntry?.classification ?? "PENDING";
                const highlight = highlightsByPly.get(move.plyNumber);
                const explanation = explanationByPly.get(move.plyNumber);
                const isExpanded = expandedExplanationPly === move.plyNumber;
                const rowStyle = highlight ? HIGHLIGHT_ROW_STYLES[highlight.tag] : CLASSIFICATION_STYLES[moveClassification];
                return (
                  <React.Fragment key={move.id}>
                    <tr
                      onClick={() => { setIsPlaying(false); setSelectedPly(index); }}
                      className={`cursor-pointer border-b border-hairline border-l-4 ${rowStyle} ${
                        selectedPly === index ? "bg-brass/20" : "hover:bg-hairline/30"
                      }`}
                    >
                      <td className="py-2 pl-2 text-foreground/60">{move.plyNumber}</td>
                      <td className="font-mono text-foreground">{move.san}</td>
                      <td className="flex items-center gap-2">
                        {highlight ? (highlight.tag === "BRILLIANT" ? "Brilliant" : "Great") : moveClassification}
                        {explanation && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedExplanationPly(isExpanded ? null : move.plyNumber);
                            }}
                            className="text-xs text-board underline"
                          >
                            {isExpanded ? "Hide" : "Why?"}
                          </button>
                        )}
                      </td>
                      <td className="text-foreground/70">{reportEntry?.centipawnLoss ?? "–"}</td>
                    </tr>
                    {isExpanded && explanation && (
                      <tr className="border-b border-hairline bg-hairline/10">
                        <td colSpan={4} className="px-2 py-2 text-xs text-foreground/80">
                          {explanation}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}