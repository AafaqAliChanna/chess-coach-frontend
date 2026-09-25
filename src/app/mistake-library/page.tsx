"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { getMyPlayerName } from "@/lib/profile";
import { useAuth } from "@/components/AuthProvider";
import RetryBoard from "@/components/RetryBoard";

type Phase = "OPENING" | "MIDDLEGAME" | "ENDGAME";
type Classification = "INACCURACY" | "MISTAKE" | "BLUNDER";
type PatternTag = "MISSED_MATE" | "ALLOWED_MATE" | "HANGING_PIECE" | "POSITIONAL";

type MistakeEntry = {
  gameId: number;
  gameTitle: string;
  uploadedAt: string;
  plyNumber: number;
  fenBefore: string;
  playerMove: string;
  bestMoveUci: string;
  classification: Classification;
  gamePhase: Phase;
  patternTag: PatternTag;
  centipawnLoss: number;
  winPercentLoss: number;
};

type MistakeLibraryResponse = {
  playerName: string;
  totalMistakes: number;
  limit: number;
  offset: number;
  entries: MistakeEntry[];
  patternCounts: Record<PatternTag, number>;
};

const CLASSIFICATION_COLOR: Record<Classification, string> = {
  INACCURACY: "text-amber-700",
  MISTAKE: "text-orange-700",
  BLUNDER: "text-red-800",
};

const PATTERN_LABELS: Record<PatternTag, string> = {
  MISSED_MATE: "Missed Mate",
  ALLOWED_MATE: "Allowed Mate",
  HANGING_PIECE: "Hanging Piece",
  POSITIONAL: "Other",
};

// Category-level explanations, not position-specific analysis — honest about
// what these are: what the pattern tag itself means, not AI-generated
// reasoning about this exact position (that only exists via the separate,
// slow, per-game AI Coaching feature, which isn't feasible to call per card).
const PATTERN_EXPLANATIONS: Record<PatternTag, string> = {
  HANGING_PIECE: "This move left a piece where the opponent's next move could capture it for free.",
  MISSED_MATE: "A forced checkmate was available here, but a different move was played instead.",
  ALLOWED_MATE: "This move allowed the opponent to force checkmate.",
  POSITIONAL: "No specific tactical cause was detected — the engine flagged this as a mistake, but it doesn't fit the categories above.",
};

const PATTERN_ORDER: PatternTag[] = ["HANGING_PIECE", "MISSED_MATE", "ALLOWED_MATE", "POSITIONAL"];

const MATE_SCORE_THRESHOLD = 5000;

function formatCpLoss(cp: number): string {
  if (cp > MATE_SCORE_THRESHOLD) return "Missed forced mate";
  return `${cp} cp lost`;
}

function bestMoveSquares(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function isPatternTag(value: string | null): value is PatternTag {
  return value === "MISSED_MATE" || value === "ALLOWED_MATE" || value === "HANGING_PIECE" || value === "POSITIONAL";
}

const PAGE_SIZE = 20;

function MistakeCard({
  entry,
  isRetryActive,
  onToggleRetry,
  token,
  onAuthRequired,
}: {
  entry: MistakeEntry;
  isRetryActive: boolean;
  onToggleRetry: () => void;
  token: string | null;
  onAuthRequired: () => void;
}) {
  const { from: bestFrom, to: bestTo } = bestMoveSquares(entry.bestMoveUci);

  return (
    <div className="border border-hairline p-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-foreground/50">
          {entry.gamePhase} · <span className={CLASSIFICATION_COLOR[entry.classification]}>{entry.classification}</span>
        </span>
        <Link href={`/games/${entry.gameId}`} className="text-board hover:underline">
          View game →
        </Link>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{entry.gameTitle}</p>
        <span className="border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/60">
          {PATTERN_LABELS[entry.patternTag]}
        </span>
      </div>
      <p className="mb-2 text-xs text-foreground/50">{new Date(entry.uploadedAt).toLocaleDateString()}</p>

      <RetryBoard
        fenBefore={entry.fenBefore}
        bestMoveUci={entry.bestMoveUci}
        gameId={entry.gameId}
        plyNumber={entry.plyNumber}
        token={token}
        onAuthRequired={onAuthRequired}
        interactive={isRetryActive}
      />

      <p className="mt-2 text-xs text-foreground/60">
        {formatCpLoss(entry.centipawnLoss)} · {entry.winPercentLoss.toFixed(1)}% win probability lost
      </p>

      {!isRetryActive && (
        <>
          <p className="mt-1 text-sm text-foreground">
            You played: <span className="font-mono">{entry.playerMove}</span> · Better:{" "}
            <span className="font-mono">{bestFrom} → {bestTo}</span>
          </p>
          <p className="mt-1 text-xs text-foreground/60">{PATTERN_EXPLANATIONS[entry.patternTag]}</p>
        </>
      )}

      <button
        onClick={onToggleRetry}
        className="mt-3 border border-hairline px-3 py-1 text-xs text-foreground hover:bg-hairline/30"
      >
        {isRetryActive ? "Close" : "Retry"}
      </button>
    </div>
  );
}

function MistakeLibraryContent() {
  const searchParams = useSearchParams();

  const [playerName, setPlayerName] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<Phase | "">("");
  const [tagFilter, setTagFilter] = useState<PatternTag | "">("");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const [data, setData] = useState<MistakeLibraryResponse | null>(null);
  const [accumulated, setAccumulated] = useState<MistakeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notDeployed, setNotDeployed] = useState(false);
  const [offset, setOffset] = useState(0);

  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setPlayerName(getMyPlayerName());
  }, []);

  useEffect(() => {
    const paramPattern = searchParams.get("pattern");
    if (isPatternTag(paramPattern)) {
      setTagFilter(paramPattern);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playerName) return;
    setOffset(0);
    setActiveKey(null);
    fetchLibrary(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName, phaseFilter, tagFilter]);

  async function fetchLibrary(fetchOffset: number, replace: boolean) {
    if (!playerName) return;
    setLoading(true);
    setError("");
    if (replace) setNotDeployed(false);

    try {
      const params = new URLSearchParams();
      if (phaseFilter) params.set("phase", phaseFilter);
      if (tagFilter) params.set("pattern", tagFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(fetchOffset));

      const response = await fetch(
        `${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/mistake-library?${params.toString()}`
      );

      if (response.status === 404) {
        setNotDeployed(true);
        setData(null);
        setAccumulated([]);
        return;
      }
      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const json: MistakeLibraryResponse = await response.json();
      setData(json);
      setAccumulated((prev) => (replace ? json.entries : [...prev, ...json.entries]));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function loadMore() {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchLibrary(nextOffset, false);
  }

  function requireAuth() {
    router.push("/login");
  }

  if (!playerName) {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">My Mistake Library</h1>
        <p className="text-sm text-foreground">
          Set your player name in{" "}
          <Link href="/profile" className="text-board underline">
            Profile
          </Link>{" "}
          to see your saved lessons.
        </p>
      </div>
    );
  }

  return (
    <div className="px-8 py-12">
      <h1 className="mb-1 font-serif text-3xl text-foreground">My Mistake Library</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Your worst moves, worst first — measured by win probability lost.
      </p>

      {notDeployed ? (
        <p className="max-w-md border border-hairline bg-brass/10 p-4 text-sm text-foreground">
          This feature is waiting on a backend update — the Mistake Library endpoint isn't deployed yet.
          Check back once it's live.
        </p>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value as Phase | "")}
              className="border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
            >
              <option value="">All phases</option>
              <option value="OPENING">Opening</option>
              <option value="MIDDLEGAME">Middlegame</option>
              <option value="ENDGAME">Endgame</option>
            </select>
          </div>

          {data && (
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                onClick={() => setTagFilter("")}
                className={`border px-3 py-1 text-xs ${
                  tagFilter === "" ? "border-board bg-board text-white" : "border-hairline text-foreground hover:bg-hairline/30"
                }`}
              >
                All ({data.totalMistakes})
              </button>
              {PATTERN_ORDER.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                  className={`border px-3 py-1 text-xs ${
                    tagFilter === tag ? "border-board bg-board text-white" : "border-hairline text-foreground hover:bg-hairline/30"
                  }`}
                >
                  {PATTERN_LABELS[tag]} ({data.patternCounts[tag] ?? 0})
                </button>
              ))}
            </div>
          )}

          {error && <p className="mb-6 text-sm text-red-700">{error}</p>}

          {loading && !data && <p className="text-foreground">Loading…</p>}

          {data && (
            <>
              <p className="mb-6 text-sm text-foreground/60">{data.totalMistakes} mistakes match these filters</p>

              {accumulated.length === 0 ? (
                <p className="text-foreground/60">No mistakes match these filters yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-8">
                  {accumulated.map((entry) => {
                    const key = `${entry.gameId}-${entry.plyNumber}`;
                    return (
                      <MistakeCard
                        key={key}
                        entry={entry}
                        isRetryActive={activeKey === key}
                        onToggleRetry={() => setActiveKey((prev) => (prev === key ? null : key))}
                        token={user?.token ?? null}
                        onAuthRequired={requireAuth}
                      />
                    );
                  })}
                </div>
              )}

              {accumulated.length < data.totalMistakes && (
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="mt-8 border border-hairline px-4 py-2 text-sm text-foreground hover:bg-hairline/30 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function MistakeLibraryPage() {
  return (
    <Suspense fallback={<div className="px-8 py-12 text-foreground">Loading…</div>}>
      <MistakeLibraryContent />
    </Suspense>
  );
}