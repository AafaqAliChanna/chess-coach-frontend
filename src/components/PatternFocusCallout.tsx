"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";
import { humanizePattern, type PatternFocusResponse } from "@/lib/patterns";

export default function PatternFocusCallout({ playerName }: { playerName: string | null }) {
  const [data, setData] = useState<PatternFocusResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!playerName) return;
    fetch(`${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/patterns/focus`)
      .then((response) => {
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        return response.json() as Promise<PatternFocusResponse>;
      })
      .then((response) => {
        setError("");
        setData(response);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [playerName]);

  return (
    <section className="mb-10 border border-board/30 bg-board/5 p-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/50">Today&apos;s biggest opportunity</p>
      {!playerName ? (
        <p className="text-sm text-foreground/70">Set your player name in Profile to see your current focus.</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !data || data.playerName !== playerName ? (
        <p className="text-sm text-foreground/70">Loading your current focus…</p>
      ) : !data.hasEnoughData || !data.recommendedFocus || !data.detail ? (
        <p className="text-sm text-foreground/70">{data.reason}</p>
      ) : (
        <>
          <p className="mb-4 text-lg text-foreground">
            {humanizePattern(data.recommendedFocus)}. {data.reason}
          </p>
          <Link
            href={`/patterns/${data.recommendedFocus}`}
            className="inline-block bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark"
          >
            Explore this pattern
          </Link>
        </>
      )}
    </section>
  );
}
