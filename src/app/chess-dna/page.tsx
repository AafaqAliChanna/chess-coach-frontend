"use client";

import { useState } from "react";
import { API_BASE_URL } from "@/lib/api";

type Phase = "OPENING" | "MIDDLEGAME" | "ENDGAME";
type Severity = "INACCURACY" | "MISTAKE" | "BLUNDER";

type PatternsResponse = {
  gamesFound: number;
  gamesAnalyzed: number;
  mistakesByPhase: Record<Phase, Record<Severity, number>>;
};

const PHASES: Phase[] = ["OPENING", "MIDDLEGAME", "ENDGAME"];
const SEVERITIES: Severity[] = ["INACCURACY", "MISTAKE", "BLUNDER"];
const SEVERITY_COLOR: Record<Severity, string> = {
  INACCURACY: "text-amber-700",
  MISTAKE: "text-orange-700",
  BLUNDER: "text-red-800",
};

export default function ChessDnaPage() {
  const [name, setName] = useState("");
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/players/${encodeURIComponent(name.trim())}/patterns`);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-8 py-12">
      <h1 className="mb-1 font-serif text-3xl text-foreground">My Chess DNA</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Enter the exact player name as it appears on your uploaded games (case-insensitive, must match exactly —
        not a nickname).
      </p>

      <form onSubmit={handleSearch} className="mb-8 flex max-w-md gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Aafaq"
          className="flex-1 border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {data && (
        <>
          <div className="mb-8 flex gap-8 text-sm">
            <p className="text-foreground">
              Games found: <span className="font-semibold">{data.gamesFound}</span>
            </p>
            <p className="text-foreground">
              Games analyzed: <span className="font-semibold">{data.gamesAnalyzed}</span>
            </p>
          </div>

          {data.gamesFound === 0 ? (
            <p className="text-foreground/60">
              No games found for that exact name. Double-check the spelling matches what you entered when
              uploading.
            </p>
          ) : (
            <table className="w-full max-w-2xl text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-foreground/50">
                  <th className="py-2 font-medium">Phase</th>
                  {SEVERITIES.map((s) => (
                    <th key={s} className="font-medium">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PHASES.map((phase) => (
                  <tr key={phase} className="border-b border-hairline">
                    <td className="py-2 font-medium text-foreground">{phase}</td>
                    {SEVERITIES.map((severity) => (
                      <td key={severity} className={SEVERITY_COLOR[severity]}>
                        {data.mistakesByPhase[phase]?.[severity] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}