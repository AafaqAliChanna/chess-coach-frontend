"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { getAuth } from "@/lib/auth";
import { PuzzleBoard, PuzzleReviewBoard } from "@/components/RetryBoard";

type Difficulty = "EASY" | "MEDIUM" | "HARD";
type FilterOption = { tag: string; count: number };

type BrowsePuzzle = {
  id: string;
  rating: number;
  difficulty: Difficulty;
  themes: string;
  openingTags: string | null;
};

type Puzzle = BrowsePuzzle & {
  fen: string;
  setupMoveUci: string;
};

type SolvedPuzzle = {
  puzzleId: string;
  rating: number;
  themes: string;
  openingTags: string | null;
  solvedAt: string;
};

type Entitlements = {
  dailyPuzzleLimit: number;
  puzzlesUsedToday: number;
  puzzlesRemainingToday: number;
};

type ReviewMove = {
  uci: string;
  position: string;
};

type PuzzleReview = {
  id: string;
  fen: string;
  solutionSan: string[];
  solutionUci: string[];
  fensAfterEachMove: string[];
  rating: number;
  themes: string;
  openingTags: string | null;
};

const BROWSE_LIMIT = 20;
const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

function applyUciToFen(fen: string, uci: string): string {
  if (!uci || !fen) return fen;
  const fields = fen.split(" ");
  const board = fields[0].split("/").map((rank) => {
    const expanded: string[] = [];
    for (const char of rank) {
      if (/\d/.test(char)) expanded.push(...Array(Number(char)).fill(""));
      else expanded.push(char);
    }
    return expanded;
  });

  const fromFile = uci.charCodeAt(0) - 97;
  const fromRank = 8 - Number(uci[1]);
  const toFile = uci.charCodeAt(2) - 97;
  const toRank = 8 - Number(uci[3]);
  const piece = board[fromRank]?.[fromFile];
  if (!piece) return fen;

  const capture = board[toRank]?.[toFile] ?? "";
  board[fromRank][fromFile] = "";
  board[toRank][toFile] = uci.length > 4 ? (piece === piece.toUpperCase() ? uci[4].toUpperCase() : uci[4]) : piece;

  if (piece.toLowerCase() === "k" && Math.abs(toFile - fromFile) === 2) {
    const rookFrom = toFile > fromFile ? 7 : 0;
    const rookTo = toFile > fromFile ? 5 : 3;
    board[toRank][rookTo] = board[toRank][rookFrom];
    board[toRank][rookFrom] = "";
  }

  if (piece.toLowerCase() === "p" && capture === "" && fromFile !== toFile) {
    board[fromRank][toFile] = "";
  }

  const nextBoard = board
    .map((rank) => {
      let empty = 0;
      let result = "";
      for (const square of rank) {
        if (!square) empty++;
        else {
          if (empty) result += empty;
          empty = 0;
          result += square;
        }
      }
      return result + (empty ? empty : "");
    })
    .join("/");

  const turn = fields[1] === "w" ? "b" : "w";
  const halfmove = String(Number(fields[4] ?? 0) + (piece.toLowerCase() === "p" || capture ? 1 : 0));
  const fullmove = String(Number(fields[5] ?? 1) + (turn === "w" ? 1 : 0));

  return [nextBoard, turn, "-", "-", halfmove, fullmove].join(" ");
}

function parseErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
  }
  return fallback;
}

function formatTagLabel(tag: string): string {
  return tag
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatThemeList(themes: string | null): string[] {
  if (!themes) return [];
  return themes
    .split(" ")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function getSolvedPlayerColor(fen: string): "White" | "Black" {
  const setupSideToMove = fen.split(" ")[1];
  return setupSideToMove === "b" ? "White" : "Black";
}

export default function PuzzlesPage() {
  const [tab, setTab] = useState<"solve" | "solved">("solve");
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [selectedOpening, setSelectedOpening] = useState("");

  const [themeOptions, setThemeOptions] = useState<FilterOption[]>([]);
  const [openingOptions, setOpeningOptions] = useState<FilterOption[]>([]);
  const [browsePuzzles, setBrowsePuzzles] = useState<BrowsePuzzle[]>([]);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [loadingPuzzle, setLoadingPuzzle] = useState(false);
  const [moveLoading, setMoveLoading] = useState(false);
  const [setupAnimating, setSetupAnimating] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "try-again" | "success">("idle");
  const [showHint, setShowHint] = useState(false);

  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [boardPosition, setBoardPosition] = useState("");
  const [playerColor, setPlayerColor] = useState<"White" | "Black">("White");
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
  const [moveIndex, setMoveIndex] = useState(1);
  const [reviewMoves, setReviewMoves] = useState<ReviewMove[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [reviewPuzzle, setReviewPuzzle] = useState<PuzzleReview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [solved, setSolved] = useState<SolvedPuzzle[]>([]);
  const [solvedLoaded, setSolvedLoaded] = useState(false);

  const authorizedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const auth = getAuth();
    if (!auth) throw new Error("Please sign in to solve puzzles.");
    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${auth.token}`,
      },
    });
  }, []);

  const loadEntitlements = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/me/entitlements");
      if (!response.ok) {
        if (response.status === 429) {
          const body = await response.json().catch(() => null);
          if (body && body.code === "DAILY_LIMIT_REACHED") {
            setLimitReached(true);
          }
        }
        return;
      }
      const data = (await response.json()) as Entitlements;
      setEntitlements(data);
    } catch {
      setEntitlements(null);
    }
  }, [authorizedFetch]);

  const loadSolved = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/puzzles/solved");
      if (!response.ok) throw new Error("Unable to load solved puzzles.");
      const data = (await response.json()) as SolvedPuzzle[];
      setSolved(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load solved puzzles.");
    } finally {
      setSolvedLoaded(true);
    }
  }, [authorizedFetch]);

  const applySetupMove = useCallback((puzzleData: Puzzle) => {
    const positionAfterSetup = applyUciToFen(puzzleData.fen, puzzleData.setupMoveUci);
    const sideToMove = positionAfterSetup.split(" ")[1] === "b" ? "black" : "white";
    setCurrentPuzzle(puzzleData);
    setBoardPosition(puzzleData.fen);
    setPlayerColor(sideToMove === "black" ? "Black" : "White");
    setBoardOrientation(sideToMove);
    setMoveIndex(1);
    setReviewMoves([{ uci: puzzleData.setupMoveUci, position: positionAfterSetup }]);
    setReviewIndex(null);
    setStatus("idle");
    setShowHint(false);
    setSetupAnimating(true);
    window.setTimeout(() => {
      setBoardPosition(positionAfterSetup);
      setSetupAnimating(false);
    }, 250);
  }, []);

  const loadDiscovery = useCallback(async () => {
    setLoadingDiscovery(true);
    setError("");
    try {
      const response = await Promise.all([
        authorizedFetch(`/api/puzzles/themes?difficulty=${difficulty}`),
        authorizedFetch(`/api/puzzles/openings?difficulty=${difficulty}`),
      ]);

      const [themesResponse, openingsResponse] = response;
      if (themesResponse.status === 429 || openingsResponse.status === 429) {
        const body = await Promise.all([themesResponse.clone().json().catch(() => null), openingsResponse.clone().json().catch(() => null)]);
        if (body.some((entry) => entry && entry.code === "DAILY_LIMIT_REACHED")) {
          setLimitReached(true);
          return;
        }
      }

      if (!themesResponse.ok || !openingsResponse.ok) {
        throw new Error("Unable to load puzzle discovery filters.");
      }

      const themeData = (await themesResponse.json()) as FilterOption[];
      const openingData = (await openingsResponse.json()) as FilterOption[];

      setThemeOptions(themeData);
      setOpeningOptions(openingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load puzzle discovery filters.");
    } finally {
      setLoadingDiscovery(false);
    }
  }, [authorizedFetch, difficulty]);

  const loadBrowse = useCallback(async () => {
    setLoadingBrowse(true);
    setError("");
    try {
      const params = new URLSearchParams({ difficulty, limit: String(BROWSE_LIMIT) });
      if (selectedTheme) params.set("theme", selectedTheme);
      if (selectedOpening) params.set("opening", selectedOpening);
      const response = await authorizedFetch(`/api/puzzles?${params.toString()}`);
      const body = await response.json().catch(() => null);
      if (response.status === 429 && body && body.code === "DAILY_LIMIT_REACHED") {
        setLimitReached(true);
        setBrowsePuzzles([]);
        return;
      }
      if (!response.ok) {
        throw new Error(parseErrorMessage(body, "Unable to load puzzles."));
      }
      setBrowsePuzzles((body as BrowsePuzzle[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load puzzles.");
    } finally {
      setLoadingBrowse(false);
    }
  }, [authorizedFetch, difficulty, selectedOpening, selectedTheme]);

  const openPuzzle = useCallback(
    async (id: string): Promise<boolean> => {
      setLoadingPuzzle(true);
      setError("");
      setLimitReached(false);
      try {
        const response = await authorizedFetch(`/api/puzzles/${encodeURIComponent(id)}`);
        const body = await response.json().catch(() => null);
        if (response.status === 429 && body && body.code === "DAILY_LIMIT_REACHED") {
          setLimitReached(true);
          return false;
        }
        if (!response.ok) {
          throw new Error(parseErrorMessage(body, "Unable to open that puzzle."));
        }
        const puzzleData = body as Puzzle;
        applySetupMove(puzzleData);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to open that puzzle.");
        return false;
      } finally {
        setLoadingPuzzle(false);
      }
    },
    [applySetupMove, authorizedFetch]
  );

  const openSolvedPuzzle = useCallback(
    async (puzzleId: string) => {
      setReviewLoading(true);
      setError("");
      try {
        const response = await authorizedFetch(`/api/puzzles/${encodeURIComponent(puzzleId)}/review`);
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(parseErrorMessage(body, "Unable to load the solved puzzle review."));
        }
        setReviewPuzzle(body as PuzzleReview);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load the solved puzzle review.");
      } finally {
        setReviewLoading(false);
      }
    },
    [authorizedFetch]
  );

  const loadNextPuzzle = useCallback(async () => {
    setLoadingPuzzle(true);
    setError("");
    setLimitReached(false);
    try {
      const params = new URLSearchParams({ difficulty });
      if (selectedTheme) params.set("theme", selectedTheme);
      if (selectedOpening) params.set("opening", selectedOpening);
      const response = await authorizedFetch(`/api/puzzles/next?${params.toString()}`);
      const body = await response.json().catch(() => null);
      if (response.status === 429 && body && body.code === "DAILY_LIMIT_REACHED") {
        setLimitReached(true);
        return;
      }
      if (!response.ok) {
        throw new Error(parseErrorMessage(body, "Unable to load a new puzzle."));
      }
      const puzzleData = body as Puzzle;
      applySetupMove(puzzleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load a puzzle.");
    } finally {
      setLoadingPuzzle(false);
    }
  }, [applySetupMove, authorizedFetch, difficulty, selectedOpening, selectedTheme]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("daily") !== "1") return;
    const raw = window.sessionStorage.getItem("chess_coach_daily_puzzle");
    if (!raw) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      applySetupMove(JSON.parse(raw) as Puzzle);
      window.sessionStorage.removeItem("chess_coach_daily_puzzle");
    } catch {
      setError("Unable to load today's puzzle.");
    }
  }, [applySetupMove]);

  useEffect(() => {
    const puzzleId = new URLSearchParams(window.location.search).get("puzzleId");
    if (!puzzleId) return;
    let cancelled = false;
    void authorizedFetch(`/api/puzzles/${encodeURIComponent(puzzleId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load puzzle: ${response.status}`);
        return (await response.json()) as Puzzle;
      })
      .then((puzzle) => {
        if (!cancelled) applySetupMove(puzzle);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load puzzle.");
      });
    return () => {
      cancelled = true;
    };
  }, [applySetupMove, authorizedFetch]);

  const handleSubmitMove = useCallback(
    async (moveUci: string) => {
      if (!currentPuzzle || moveLoading || status === "success") return;
      setMoveLoading(true);
      setError("");
      setLimitReached(false);
      try {
        const response = await authorizedFetch(`/api/puzzles/${encodeURIComponent(currentPuzzle.id)}/moves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moveIndex, moveUci }),
        });
        const body = await response.json().catch(() => null);
        if (response.status === 429 && body && body.code === "DAILY_LIMIT_REACHED") {
          setLimitReached(true);
          return;
        }
        if (!response.ok) {
          throw new Error(parseErrorMessage(body, "Unable to submit that move."));
        }

        if (!body.correct) {
          setStatus("try-again");
          return;
        }

        const playerPosition = applyUciToFen(boardPosition || currentPuzzle.fen, moveUci);
        const updatedMoves = [...reviewMoves, { uci: moveUci, position: playerPosition }];

        if (body.puzzleComplete) {
          setBoardPosition(playerPosition);
          setReviewMoves(updatedMoves);
          setReviewIndex(updatedMoves.length - 1);
          setStatus("success");
          await loadEntitlements();
          await loadSolved();
          return;
        }

        let nextPosition = playerPosition;
        if (body.opponentReplyUci) {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          nextPosition = applyUciToFen(playerPosition, body.opponentReplyUci);
          updatedMoves.push({ uci: body.opponentReplyUci, position: nextPosition });
        }

        setBoardPosition(nextPosition);
        setReviewMoves(updatedMoves);
        setMoveIndex((current) => current + 2);
        setStatus("idle");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to submit that move.");
      } finally {
        setMoveLoading(false);
      }
    },
    [
      authorizedFetch,
      boardPosition,
      currentPuzzle,
      loadEntitlements,
      loadSolved,
      moveIndex,
      moveLoading,
      reviewMoves,
      status,
    ]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadEntitlements(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadEntitlements]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadDiscovery(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadDiscovery]);

  useEffect(() => {
    if (!getAuth()) return;
    const timeout = window.setTimeout(() => void loadBrowse(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadBrowse]);

  useEffect(() => {
    if (tab !== "solved") return;
    const timeout = window.setTimeout(() => {
      setSolvedLoaded(false);
      void loadSolved();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadSolved, tab]);

  const browseSummary = useMemo(() => {
    if (browsePuzzles.length === 0) return "No puzzles match these filters.";
    return `${browsePuzzles.length} puzzles available`;
  }, [browsePuzzles.length]);

  function handleDifficultyChange(nextDifficulty: Difficulty) {
    setDifficulty(nextDifficulty);
    setSelectedTheme("");
    setSelectedOpening("");
    setCurrentPuzzle(null);
    setBoardPosition("");
    setReviewMoves([]);
    setReviewIndex(null);
    setStatus("idle");
    setShowHint(false);
    setError("");
  }

  function retryPuzzle() {
    const setupPosition = reviewMoves[0]?.position;
    if (!setupPosition) return;
    setBoardPosition(setupPosition);
    setMoveIndex(1);
    setReviewMoves([reviewMoves[0]]);
    setReviewIndex(null);
    setStatus("idle");
    setError("");
  }

  const moveReview = useCallback((direction: -1 | 1) => {
    if (reviewIndex === null) return;
    const nextIndex = reviewIndex + direction;
    if (nextIndex < 0 || nextIndex >= reviewMoves.length) return;
    setReviewIndex(nextIndex);
    setBoardPosition(reviewMoves[nextIndex].position);
  }, [reviewIndex, reviewMoves]);

  useEffect(() => {
    if (status !== "success") return;

    function handleReviewKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target?.tagName ?? "")) return;
      event.preventDefault();
      moveReview(event.key === "ArrowLeft" ? -1 : 1);
    }

    window.addEventListener("keydown", handleReviewKeyDown);
    return () => window.removeEventListener("keydown", handleReviewKeyDown);
  }, [moveReview, status]);

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-foreground">Puzzles</h1>
          <p className="mt-1 text-sm text-foreground/60">Practice tactical positions and build your solving streak.</p>
        </div>
        <div className="flex border-b border-hairline">
          {(["solve", "solved"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`px-4 py-2 text-sm ${tab === item ? "border-b-2 border-board text-board" : "text-foreground/60"}`}
            >
              {item === "solve" ? "Solve" : "Solved"}
            </button>
          ))}
        </div>
      </div>

      {reviewPuzzle ? (
        <section className="max-w-5xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground/50">Read-only replay</p>
              <h2 className="font-serif text-2xl text-foreground">Reviewing solved puzzle {reviewPuzzle.id}</h2>
            </div>
            <button
              type="button"
              onClick={() => setReviewPuzzle(null)}
              className="border border-hairline px-3 py-2 text-sm text-foreground"
            >
              Back to Solved
            </button>
          </div>
          <div className="mb-4 border border-board/30 bg-board/5 p-3 text-sm text-foreground/70">
            This is a read-only replay. You cannot submit moves or change the result.
          </div>
          <div className="mb-4 border border-board/40 bg-board/10 p-3 text-sm text-foreground">
            <p className="font-medium text-board">Puzzle solved! Great work.</p>
            <p className="mt-1 text-foreground/70">
              You solved this puzzle as {getSolvedPlayerColor(reviewPuzzle.fen)}.
            </p>
          </div>
          <div className="max-w-[420px]">
            <PuzzleReviewBoard
              startPosition={reviewPuzzle.fen}
              orientation={getSolvedPlayerColor(reviewPuzzle.fen) === "Black" ? "black" : "white"}
              movesSan={reviewPuzzle.solutionSan}
              positionsAfterMoves={reviewPuzzle.fensAfterEachMove}
            />
          </div>
        </section>
      ) : tab === "solved" ? (
        <section className="max-w-5xl">
          {error && <p className="mb-4 border border-amber-600/40 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
          {reviewLoading && <p className="mb-4 text-sm italic text-foreground/60">Loading solved puzzle review…</p>}
          {solvedLoaded && solved.length === 0 && <p className="text-sm text-foreground/60">No solved puzzles yet.</p>}
          {!solvedLoaded && <p className="text-sm italic text-foreground/60">Loading solved puzzles…</p>}
          {solved.length > 0 && (
            <div className="overflow-x-auto border border-hairline">
              <table className="w-full text-left text-sm">
                <thead className="bg-board/5 text-xs uppercase text-foreground/50">
                  <tr>
                    <th className="px-4 py-3">Puzzle</th>
                    <th className="px-4 py-3">Rating</th>
                    <th className="px-4 py-3">Themes</th>
                    <th className="px-4 py-3">Opening</th>
                    <th className="px-4 py-3">Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {solved.map((item) => (
                    <tr key={`${item.puzzleId}-${item.solvedAt}`} className="border-t border-hairline">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void openSolvedPuzzle(item.puzzleId)}
                          className="font-mono text-board underline decoration-board/40 underline-offset-2 hover:decoration-board"
                        >
                          {item.puzzleId}
                        </button>
                      </td>
                      <td className="px-4 py-3">{item.rating}</td>
                      <td className="px-4 py-3">{item.themes || "—"}</td>
                      <td className="px-4 py-3">{item.openingTags || "—"}</td>
                      <td className="px-4 py-3">{new Date(item.solvedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <div className="grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <section>
            <div className="mb-4 flex flex-wrap gap-2">
              {(["EASY", "MEDIUM", "HARD"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleDifficultyChange(item)}
                  className={`border px-3 py-1.5 text-xs ${difficulty === item ? "border-board bg-board/10 text-board" : "border-hairline text-foreground/70"}`}
                >
                  {DIFFICULTY_LABELS[item]}
                </button>
              ))}
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void loadNextPuzzle()}
                className="border border-board bg-board/5 px-3 py-2 text-xs font-medium text-board hover:bg-board/10"
              >
                Surprise Me
              </button>
              {entitlements && (
                <span className="text-xs text-foreground/60">
                  {entitlements.puzzlesUsedToday}/{entitlements.dailyPuzzleLimit} puzzles today
                </span>
              )}
            </div>

            {loadingPuzzle ? <p className="mb-3 text-sm italic text-foreground/60">Loading puzzle…</p> : null}
            {limitReached && (
              <div className="mb-4 border border-amber-600/40 bg-amber-50 p-3 text-sm text-amber-900">
                You&apos;ve reached today&apos;s puzzle limit. Come back tomorrow for more puzzles.
              </div>
            )}
            {error && !limitReached && <p className="mb-4 text-sm text-red-700">{error}</p>}

            {currentPuzzle ? (
              <div className="space-y-3">
                <p className="text-base font-semibold text-foreground">You are playing: {playerColor}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => setShowHint((current) => !current)} className="border border-hairline px-3 py-1.5 text-sm text-foreground">
                    {showHint ? "Hide hint" : "Show hint"}
                  </button>
                  {showHint && <span className="text-sm text-foreground/70">{formatThemeList(currentPuzzle.themes).map(formatTagLabel).join(", ") || "No themes provided."}</span>}
                </div>
                <PuzzleBoard
                  position={boardPosition || currentPuzzle.fen}
                  orientation={boardOrientation}
                  interactive={!setupAnimating && !moveLoading && status !== "success"}
                  disabled={loadingPuzzle || setupAnimating || moveLoading || status === "success"}
                  onMove={handleSubmitMove}
                />
                {moveLoading && <p className="text-sm italic text-foreground/60">Checking your move…</p>}
                {status === "try-again" && (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-medium text-amber-700">Incorrect</p>
                    <button type="button" onClick={retryPuzzle} className="border border-hairline px-3 py-1.5 text-sm text-foreground">Try again</button>
                  </div>
                )}
                {status === "success" && (
                  <div className="space-y-3">
                    <p className="font-medium text-board">Puzzle solved! Great work.</p>
                    <div className="border border-hairline p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-wide text-foreground/50">Review moves</p>
                        <span className="text-xs text-foreground/50">
                          Move {(reviewIndex ?? reviewMoves.length - 1) + 1} of {reviewMoves.length}
                        </span>
                      </div>
                      <p className="mb-3 text-xs text-foreground/50">Use the keyboard ? and ? arrow keys or the buttons to review.</p>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {reviewMoves.map((move, index) => (
                          <button
                            key={`${move.uci}-${index}`}
                            type="button"
                            onClick={() => {
                              setReviewIndex(index);
                              setBoardPosition(move.position);
                            }}
                            className={`border px-2 py-1 font-mono text-xs ${
                              index === reviewIndex ? "border-board bg-board/10 text-board" : "border-hairline text-foreground/70"
                            }`}
                          >
                            {index === 0 ? "Setup" : `${index}. ${move.uci}`}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => moveReview(-1)}
                          disabled={reviewIndex === null || reviewIndex === 0}
                          className="border border-hairline px-3 py-1.5 text-xs text-foreground disabled:opacity-40"
                        >
                          ? Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => moveReview(1)}
                          disabled={reviewIndex === null || reviewIndex >= reviewMoves.length - 1}
                          className="border border-hairline px-3 py-1.5 text-xs text-foreground disabled:opacity-40"
                        >
                          Next ?
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void loadNextPuzzle()} className="bg-board px-4 py-2 text-sm font-medium text-white">
                        Next puzzle
                      </button>
                      <button type="button" onClick={() => setCurrentPuzzle(null)} className="border border-hairline px-4 py-2 text-sm text-foreground">
                        Back to browse
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex aspect-square max-w-[400px] items-center justify-center border border-dashed border-hairline text-sm text-foreground/50">
                Choose filters and load a puzzle.
              </div>
            )}
          </section>

          <section className="max-w-xl">
            <div className="space-y-5 border border-hairline p-5">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-foreground/50">Discovery</p>
                {loadingDiscovery ? (
                  <p className="text-sm text-foreground/60">Loading themes and openings…</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs uppercase text-foreground/50">Themes</p>
                      <div className="flex flex-wrap gap-2">
                        {themeOptions.length === 0 ? (
                          <span className="text-sm text-foreground/60">No themes available for this difficulty.</span>
                        ) : (
                          themeOptions.map((item) => (
                            <button
                              key={item.tag}
                              type="button"
                              onClick={() => setSelectedTheme((value) => (value === item.tag ? "" : item.tag))}
                              className={`rounded-full border px-3 py-1.5 text-xs ${selectedTheme === item.tag ? "border-board bg-board text-white" : "border-hairline text-foreground/70 hover:bg-board/5"}`}
                            >
                              {formatTagLabel(item.tag)} ({item.count})
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs uppercase text-foreground/50">Openings</p>
                      <div className="flex flex-wrap gap-2">
                        {openingOptions.length === 0 ? (
                          <span className="text-sm text-foreground/60">No openings available for this difficulty.</span>
                        ) : (
                          openingOptions.map((item) => (
                            <button
                              key={item.tag}
                              type="button"
                              onClick={() => setSelectedOpening((value) => (value === item.tag ? "" : item.tag))}
                              className={`rounded-full border px-3 py-1.5 text-xs ${selectedOpening === item.tag ? "border-board bg-board text-white" : "border-hairline text-foreground/70 hover:bg-board/5"}`}
                            >
                              {formatTagLabel(item.tag)} ({item.count})
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => setCurrentPuzzle(null)} className="border border-hairline px-3 py-2 text-sm text-foreground/80">
                  Browse
                </button>
                <button type="button" onClick={() => void loadNextPuzzle()} className="bg-board px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={loadingPuzzle}>
                  {loadingPuzzle ? "Loading…" : "New Puzzle"}
                </button>
              </div>

              <div className="border-t border-hairline pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-serif text-lg text-foreground">Browse puzzles</h2>
                  <span className="text-xs text-foreground/50">{browseSummary}</span>
                </div>

                {loadingBrowse ? (
                  <p className="text-sm italic text-foreground/60">Loading puzzle list…</p>
                ) : browsePuzzles.length === 0 ? (
                  <p className="text-sm text-foreground/60">No puzzles match these filters right now.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {browsePuzzles.map((item) => {
                      const topThemes = formatThemeList(item.themes);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => void openPuzzle(item.id)}
                          className="border border-hairline bg-background p-3 text-left transition-colors hover:border-board hover:bg-board/5"
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <p className="text-xs uppercase tracking-wide text-foreground/50">{item.difficulty}</p>
                            <span className="text-sm font-semibold text-foreground">Rating: {item.rating}</span>
                          </div>
                          <p className="mb-2 font-mono text-xs text-foreground/50">{item.id}</p>
                          {topThemes.length > 0 ? (
                            <p className="text-sm text-foreground/70">{topThemes.join(" · ")}</p>
                          ) : (
                            <p className="text-sm text-foreground/40">No theme tags</p>
                          )}
                          {item.openingTags ? <p className="mt-2 text-xs text-foreground/50">Opening: {formatTagLabel(item.openingTags)}</p> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
