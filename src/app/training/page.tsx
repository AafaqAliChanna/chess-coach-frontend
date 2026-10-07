"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import RetryBoard, { type AttemptResult } from "@/components/RetryBoard";

type Phase = "OPENING" | "MIDDLEGAME" | "ENDGAME";
type Classification = "INACCURACY" | "MISTAKE" | "BLUNDER";
type PatternTag = "MISSED_MATE" | "ALLOWED_MATE" | "HANGING_PIECE" | "POSITIONAL";

type MistakeEntry = {
  gameId: number;
  gameTitle: string;
  uploadedAt: string;
  whitePlayer: string;
  blackPlayer: string;
  playerColor: "WHITE" | "BLACK";
  plyNumber: number;
  fenBefore: string;
  playerMove: string;
  classification: Classification;
  gamePhase: Phase;
  patternTag: PatternTag;
  centipawnLoss: number;
  winPercentLoss: number;
};

type TrainingExercise = MistakeEntry;

const PATTERN_LABELS: Record<PatternTag, string> = {
  HANGING_PIECE: "Hanging Piece",
  MISSED_MATE: "Missed Mate",
  ALLOWED_MATE: "Allowed Mate",
  POSITIONAL: "Other",
};

// Same category-level explanations as Mistake Library — what the tag means,
// not position-specific analysis.
const PATTERN_EXPLANATIONS: Record<PatternTag, string> = {
  HANGING_PIECE: "This move left a piece where the opponent's next move could capture it for free.",
  MISSED_MATE: "A forced checkmate was available here, but a different move was played instead.",
  ALLOWED_MATE: "This move allowed the opponent to force checkmate.",
  POSITIONAL: "No specific tactical cause was detected — the engine flagged this as a mistake, but it doesn't fit the categories above.",
};

// General coaching advice for the pattern as a category — not analysis of
// any specific position on the board, and not generated per-exercise.
const PATTERN_TIPS: Record<PatternTag, string> = {
  HANGING_PIECE:
    "Before you play a move, scan every piece you have: could any of them be captured next turn for free? Make this check a habit after every move you consider, not just before you move a piece you're worried about.",
  MISSED_MATE:
    "When your opponent's king is exposed, pause and check forcing moves first — checks, captures, and threats — before anything quieter. A forced mate is correct even when it doesn't look like the most natural move.",
  ALLOWED_MATE:
    "Before playing a move, picture the position right after it: does your king still have safe squares, and can your opponent create a threat you can't answer? Be especially careful with moves that open lines toward your own king.",
  POSITIONAL: "",
};

// Only the three actionable patterns are offered as a practice target —
// "Other"/POSITIONAL has no specific tactical cause detected, so there's
// nothing coachable to build a targeted session around.
const ACTIONABLE_PATTERNS: PatternTag[] = ["HANGING_PIECE", "MISSED_MATE", "ALLOWED_MATE"];

const SESSION_SIZE = 5;

type SessionExerciseResult = { entry: MistakeEntry; result: AttemptResult | null };
type Stage = "loading" | "picking" | "session" | "summary" | "not-deployed" | "empty";

function sideToMove(fen: string): { label: "White" | "Black"; orientation: "white" | "black" } {
  return fen.split(" ")[1] === "b"
    ? { label: "Black", orientation: "black" }
    : { label: "White", orientation: "white" };
}

function playerNameForColor(entry: MistakeEntry, color: "White" | "Black"): string {
  return color === "White" ? entry.whitePlayer : entry.blackPlayer;
}

function TrainingPageContent() {
  const { user } = useAuth();
  const playerName = user?.playerName ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameId = searchParams.get("gameId");
  const isGameTraining = Boolean(gameId);

  const [patternCounts, setPatternCounts] = useState<Record<PatternTag, number> | null>(null);
  const [countsError, setCountsError] = useState("");

  const [stage, setStage] = useState<Stage>("loading");
  const [selectedPattern, setSelectedPattern] = useState<PatternTag | null>(null);
  const [historyExercises, setHistoryExercises] = useState<MistakeEntry[]>([]);
  const [session, setSession] = useState<SessionExerciseResult[]>([]);
  const [index, setIndex] = useState(0);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    if (!playerName && !isGameTraining) return;
    if (isGameTraining && gameId) {
      fetch(`${API_BASE_URL}/api/games/${encodeURIComponent(gameId)}/training?limit=3`)
        .then((res) => {
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
          return res.json() as Promise<TrainingExercise[]>;
        })
        .then((exercises) => {
          setSession(exercises.map((entry) => ({ entry, result: null })));
          setIndex(0);
          setStage(exercises.length > 0 ? "session" : "empty");
        })
        .catch((err) => setCountsError(err instanceof Error ? err.message : String(err)));
      return;
    }
    if (!playerName) return;
    fetch(`${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/training`)
      .then((res) => {
        if (res.status === 404) {
          setStage("not-deployed");
          return null;
        }

        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json() as Promise<TrainingExercise[]>;
      })
      .then((exercises) => {
        if (!exercises) return;
        setHistoryExercises(exercises);
        const counts = exercises.reduce<Record<PatternTag, number>>(
          (result, entry) => {
            const tag = entry.patternTag;
            if (tag) result[tag] = (result[tag] ?? 0) + 1;
            return result;
          },
          { HANGING_PIECE: 0, MISSED_MATE: 0, ALLOWED_MATE: 0, POSITIONAL: 0 }
        );
        setPatternCounts(counts);
        const hasAny = ACTIONABLE_PATTERNS.some((tag) => (counts[tag] ?? 0) > 0);
        setStage(hasAny ? "picking" : "empty");
      })
      .catch((err) => setCountsError(err instanceof Error ? err.message : String(err)));
  }, [gameId, isGameTraining, playerName]);

  async function startSession(pattern: PatternTag) {
    setSelectedPattern(pattern);
    setSessionError("");
    const entries = historyExercises.filter((entry) => entry.patternTag === pattern).slice(0, SESSION_SIZE);
    setSession(entries.map((entry) => ({ entry, result: null })));
    setIndex(0);
    setStage("session");
  }

  function recordResult(result: AttemptResult) {
    setSession((prev) => prev.map((s, i) => (i === index ? { ...s, result } : s)));
  }

  function goNext() {
    if (index < session.length - 1) {
      setIndex((i) => i + 1);
    } else {
      setStage("summary");
    }
  }

  function backToPicker() {
    if (isGameTraining && gameId) {
      router.push(`/games/${gameId}`);
      return;
    }
    setStage("picking");
    setSelectedPattern(null);
    setSession([]);
    setIndex(0);
  }

  function restartSession() {
    if (selectedPattern) {
      startSession(selectedPattern);
      return;
    }
    setSession(historyExercises.slice(0, SESSION_SIZE).map((entry) => ({ entry, result: null })));
    setIndex(0);
    setStage("session");
  }

  function requireAuth() {
    router.push("/login");
  }

  if (!playerName && !isGameTraining) {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">Training</h1>
        <p className="text-sm text-foreground">
          Set your player name in{" "}
          <Link href="/profile" className="text-board underline">
            Profile
          </Link>{" "}
          to start a practice session.
        </p>
      </div>
    );
  }

  if (stage === "not-deployed") {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">Training</h1>
        <p className="max-w-md border border-hairline bg-brass/10 p-4 text-sm text-foreground">
          This feature is waiting on a backend update. Check back once it&apos;s live.
        </p>
      </div>
    );
  }

  if (countsError) return <p className="p-8 text-red-700">{countsError}</p>;

  if (stage === "loading") {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">Training</h1>
        <p className="text-foreground">Loading…</p>
      </div>
    );
  }

  if (stage === "empty") {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">Training</h1>
        <p className="text-sm text-foreground/70">
          No pattern-tagged mistakes yet to build a practice session from — upload or import a few more games first.
        </p>
      </div>
    );
  }

  if (stage === "picking" && patternCounts) {
    const ranked = ACTIONABLE_PATTERNS.filter((t) => (patternCounts[t] ?? 0) > 0).sort(
      (a, b) => (patternCounts[b] ?? 0) - (patternCounts[a] ?? 0)
    );

    return (
      <div className="px-8 py-12">
        <h1 className="mb-1 font-serif text-3xl text-foreground">Training</h1>
        <p className="mb-8 text-sm text-foreground/60">
          A focused {SESSION_SIZE}-position session built from your worst instances of one pattern. Pick a target.
        </p>

        {sessionError && <p className="mb-6 text-sm text-red-700">{sessionError}</p>}

        <div className="grid max-w-lg grid-cols-1 gap-3">
          {ranked.map((tag, i) => (
            <button
              key={tag}
              onClick={() => startSession(tag)}
              className={`flex items-center justify-between border p-4 text-left hover:bg-hairline/30 disabled:opacity-50 ${
                i === 0 ? "border-board bg-board/5" : "border-hairline"
              }`}
            >
              <div>
                <p className="font-serif text-lg text-foreground">{PATTERN_LABELS[tag]}</p>
                {i === 0 && <p className="text-xs text-board">Your most frequent — recommended</p>}
              </div>
              <span className="text-sm text-foreground/60">{patternCounts[tag]} on record</span>
            </button>
          ))}
        </div>

      </div>
    );
  }

  if (stage === "session" && (selectedPattern || isGameTraining)) {
    const current = session[index];
    if (!current) return null;
    const pattern = selectedPattern;

    return (
      <div className="px-8 py-12">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-serif text-2xl text-foreground">
            {pattern ? PATTERN_LABELS[pattern] : "Game mistakes"} — {index + 1}/{session.length}
          </h1>
          <button onClick={backToPicker} className="text-xs text-foreground/60 hover:underline">
            {selectedPattern ? "Choose a different pattern" : "Back to training"}
          </button>
        </div>

        <div className="grid grid-cols-[minmax(0,340px)_minmax(0,320px)] gap-10">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-foreground/50">
                {current.entry.gamePhase} · {current.entry.classification}
              </span>
              <Link href={`/games/${current.entry.gameId}`} className="text-board hover:underline">
                View game →
              </Link>
            </div>
            <p className="mb-4 text-sm font-semibold text-foreground">{current.entry.gameTitle}</p>
            <div className="mb-3 border border-board/40 bg-board/5 px-3 py-2 text-xs text-foreground">
              <p className="font-semibold text-board">
                Play as {current.entry.playerColor === "WHITE" ? "White" : "Black"} —{" "}
                {playerNameForColor(current.entry, current.entry.playerColor === "WHITE" ? "White" : "Black")}
              </p>
              <p className="mt-1 text-foreground/70">
                White: {current.entry.whitePlayer} · Black: {current.entry.blackPlayer}
              </p>
              <p className="mt-1 text-foreground/60">
                {sideToMove(current.entry.fenBefore).label} to move — find the best move for this position.
              </p>
            </div>

            <RetryBoard
              key={`${current.entry.gameId}-${current.entry.plyNumber}`}
              fenBefore={current.entry.fenBefore}
              gameId={current.entry.gameId}
              plyNumber={current.entry.plyNumber}
              orientation={sideToMove(current.entry.fenBefore).orientation}
              token={user?.token ?? null}
              onAuthRequired={requireAuth}
              onResult={recordResult}
            />

            {current.result && (
              <>
                {pattern && <p className="mt-3 text-xs text-foreground/60">{PATTERN_EXPLANATIONS[pattern]}</p>}
                <button onClick={goNext} className="mt-4 bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark">
                  {index < session.length - 1 ? "Next position →" : "See session results →"}
                </button>
              </>
            )}
          </div>

          <div className="space-y-6">
            {pattern && PATTERN_TIPS[pattern] && (
              <div className="border border-hairline p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/50">
                  How to avoid this pattern
                </p>
                <p className="text-sm text-foreground/80">{PATTERN_TIPS[pattern]}</p>
              </div>
            )}

            <div className="border border-hairline p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-foreground/50">This session</p>
              <div className="space-y-1">
                {session.map((s, i) => (
                  <div
                    key={`${s.entry.gameId}-${s.entry.plyNumber}`}
                    className={`flex items-center justify-between px-2 py-1.5 text-sm ${
                      i === index ? "bg-board/10 font-medium text-foreground" : "text-foreground/60"
                    }`}
                  >
                    <span>
                      Position {i + 1} · {s.entry.gamePhase.toLowerCase()}
                    </span>
                    <span>
                      {i === index
                        ? "Current"
                        : s.result
                        ? s.result.wasCorrect
                          ? "✓ Correct"
                          : "✗ Missed"
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "summary" && (selectedPattern || isGameTraining)) {
    const correctCount = session.filter((s) => s.result?.wasCorrect).length;
    return (
      <div className="px-8 py-12">
        <h1 className="mb-1 font-serif text-3xl text-foreground">Session complete</h1>
        <p className="mb-8 text-sm text-foreground/60">{selectedPattern ? PATTERN_LABELS[selectedPattern] : "Game mistakes"} practice</p>

        <div className="mb-8 max-w-sm border border-hairline bg-board/5 p-6">
          <p className="text-3xl font-serif text-foreground">
            {correctCount}/{session.length}
          </p>
          <p className="text-sm text-foreground/70">correct this session</p>
        </div>

        <div className="mb-8 max-w-sm space-y-2">
          {session.map((s, i) => (
            <Link
              key={i}
              href={`/games/${s.entry.gameId}`}
              className="flex items-center justify-between border border-hairline p-2 text-sm hover:bg-hairline/30"
            >
              <span className="text-foreground">Position {i + 1}</span>
              <span className={s.result?.wasCorrect ? "text-board" : "text-red-800"}>
                {s.result?.wasCorrect ? "Correct" : "Missed"}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={restartSession}
            className="bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark"
          >
            Practice again
          </button>
          <button
            onClick={backToPicker}
            className="border border-hairline px-4 py-2 text-sm text-foreground hover:bg-hairline/30"
          >
            Choose a different pattern
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default function TrainingPage() {
  return (
    <Suspense fallback={<div className="px-8 py-12 text-foreground">Loading…</div>}>
      <TrainingPageContent />
    </Suspense>
  );
}