"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import PatternFocusCallout from "@/components/PatternFocusCallout";

type Dimension =
  | "OPENING_DISCIPLINE"
  | "TACTICAL_AWARENESS"
  | "CALCULATION"
  | "KING_SAFETY"
  | "ENDGAME_TECHNIQUE"
  | "POSITIONAL_UNDERSTANDING";
type Confidence = "LOW" | "MEDIUM" | "HIGH";
type Trend = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";

type ChessDnaSignal = {
  dimension: Dimension;
  score: number;
  confidence: Confidence;
  trend: Trend;
  sampleSize: number;
  gamesAnalyzed: number;
  recentExampleGameIds: number[];
};

type ChessDnaResponse = {
  playerName: string;
  totalGamesAnalyzed: number;
  signals: ChessDnaSignal[];
};

function humanizeDimension(dimension: Dimension): string {
  return dimension
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function trendLabel(trend: Trend): string {
  if (trend === "IMPROVING") return "↑ Improving";
  if (trend === "DECLINING") return "↓ Declining";
  if (trend === "STABLE") return "→ Stable";
  return "— Insufficient data";
}

export default function ChessDnaPage() {
  const { user } = useAuth();
  const playerName = user?.playerName ?? null;
  const [data, setData] = useState<ChessDnaResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!playerName) return;

    fetch(`${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/chess-dna`)
      .then((response) => {
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        return response.json();
      })
      .then((json: ChessDnaResponse) => setData(json))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [playerName]);

  if (!playerName) {
    return (
      <div className="px-8 py-12">
        <h1 className="mb-4 font-serif text-3xl text-foreground">My Chess DNA</h1>
        <p className="text-sm text-foreground">
          Set your player name in{" "}
          <Link href="/profile" className="text-board underline">
            Profile
          </Link>{" "}
          to see your Chess DNA.
        </p>
      </div>
    );
  }

  if (error) return <p className="p-8 text-red-700">{error}</p>;
  if (!data) return <p className="p-8 text-foreground">Loading…</p>;

  return (
    <div className="px-8 py-12">
      <h1 className="mb-1 font-serif text-3xl text-foreground">My Chess DNA</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Based on {data.totalGamesAnalyzed} analyzed game{data.totalGamesAnalyzed === 1 ? "" : "s"} as &quot;
        {data.playerName}&quot;.
      </p>
      <PatternFocusCallout playerName={playerName} />

      <div className="max-w-2xl space-y-3">
        {data.signals.map((signal) => (
          <div key={signal.dimension} className="border border-hairline p-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-serif text-lg text-foreground">{humanizeDimension(signal.dimension)}</h2>
              <span className="font-mono text-lg text-foreground">{signal.score}/100</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/60">
              <span>Confidence: {signal.confidence}</span>
              <span>{trendLabel(signal.trend)}</span>
              <span>{signal.sampleSize} sample(s)</span>
            </div>
            {signal.confidence === "LOW" && (
              <p className="mt-2 text-xs text-foreground/60">
                Based on only a few games — take this with a grain of salt.
              </p>
            )}
            {signal.recentExampleGameIds.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="text-foreground/60">Recent examples:</span>
                {signal.recentExampleGameIds.map((gameId) => (
                  <Link key={gameId} href={`/games/${gameId}`} className="text-board hover:underline">
                    Game {gameId}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
