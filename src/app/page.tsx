"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

function extractPgnHeader(pgn: string, tag: string): string {
  const match = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return match ? match[1] : "";
}

function stripPgnHeaders(pgn: string): string {
  return pgn
    .split("\n")
    .filter((line) => !line.trim().startsWith("["))
    .join("\n")
    .trim();
}

type TimeClass = "rapid" | "blitz" | "bullet" | "daily";

type ImportResult = {
  gamesFoundForTimeClass: number;
  imported: number;
  skippedAsDuplicate: number;
};

export default function Home() {
  const [pgn, setPgn] = useState("");
  const [title, setTitle] = useState("");
  const [whitePlayer, setWhitePlayer] = useState("");
  const [blackPlayer, setBlackPlayer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { user } = useAuth();

  const [chesscomUsername, setChesscomUsername] = useState("");
  const [timeClass, setTimeClass] = useState<TimeClass>("rapid");
  // "YYYY-MM" or "" (empty means: let the backend use its default, the
  // previous calendar month). Native <input type="month"> already gives us
  // this exact format, so no parsing needed.
  const [month, setMonth] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");

  function handlePgnChange(value: string) {
    setPgn(value);
    const parsedWhite = extractPgnHeader(value, "White");
    const parsedBlack = extractPgnHeader(value, "Black");
    if (parsedWhite && !whitePlayer) setWhitePlayer(parsedWhite);
    if (parsedBlack && !blackPlayer) setBlackPlayer(parsedBlack);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      router.push("/login");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/games`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          pgn: stripPgnHeaders(pgn),
          title: title || null,
          whitePlayer: whitePlayer || "White",
          blackPlayer: blackPlayer || "Black",
          result: "*",
        }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || `Server returned ${response.status}`);
      }
      const data = await response.json();
      router.push(`/games/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      router.push("/login");
      return;
    }
    if (!chesscomUsername.trim()) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const params = new URLSearchParams({
        username: chesscomUsername.trim(),
        timeClass,
      });
      if (month) params.set("month", month);

      const response = await fetch(`${API_BASE_URL}/api/games/import/chesscom?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (response.status === 502) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Chess.com import failed — check the username and try again.");
      }
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const data = await response.json();
      setImportResult(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-8 py-16">
      {!user && (
        <p className="mb-6 border border-hairline bg-brass/10 p-3 text-sm text-foreground">
          You need to be logged in to upload or import games.{" "}
          <a href="/login" className="text-board underline">
            Log in
          </a>{" "}
          or{" "}
          <a href="/register" className="text-board underline">
            sign up
          </a>
          .
        </p>
      )}

      {/* Chess.com import */}
      <div className="mb-12 border border-hairline p-6">
        <h2 className="mb-1 font-serif text-xl text-foreground">Import from Chess.com</h2>
        <p className="mb-4 text-sm text-foreground/60">
          Pulls a month of games for a Chess.com username. Safe to run repeatedly — duplicates are skipped
          automatically.
        </p>
        <form onSubmit={handleImport} className="flex flex-wrap gap-2">
          <input
            value={chesscomUsername}
            onChange={(e) => setChesscomUsername(e.target.value)}
            placeholder="Chess.com username"
            className="min-w-[180px] flex-1 border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
          />
          <select
            value={timeClass}
            onChange={(e) => setTimeClass(e.target.value as TimeClass)}
            className="border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
          >
            <option value="rapid">Rapid</option>
            <option value="blitz">Blitz</option>
            <option value="bullet">Bullet</option>
            <option value="daily">Daily</option>
          </select>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            title="Defaults to last month if left blank"
            className="border border-hairline bg-background p-2 text-sm text-foreground focus:border-board focus:outline-none"
          />
          <button
            type="submit"
            disabled={importing}
            className="bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </form>
        <p className="mt-2 text-xs text-foreground/40">
          Leave the month blank to default to last calendar month — pick the current month explicitly if you've
          played recently and want this month's games.
        </p>

        {importError && <p className="mt-3 text-sm text-red-700">{importError}</p>}

        {importResult && (
          <div className="mt-3 text-sm text-foreground">
            <p>
              Found {importResult.gamesFoundForTimeClass} {timeClass} game
              {importResult.gamesFoundForTimeClass === 1 ? "" : "s"} on Chess.com for that month · imported{" "}
              {importResult.imported} new
              {importResult.skippedAsDuplicate > 0 && ` (${importResult.skippedAsDuplicate} already had them)`}.
            </p>
            {importResult.gamesFoundForTimeClass === 0 && (
              <p className="mt-1 text-xs text-foreground/50">
                Zero games found — double-check the username's exact spelling/case, the time class matches what you
                actually played, and the month is right (nothing selected defaults to last month, not this one).
              </p>
            )}
            {importResult.imported > 0 && (
              <p className="mt-1">
                <a href="/games" className="text-board underline">
                  View your games
                </a>{" "}
                — analysis is still running in the background for new ones.
              </p>
            )}
          </div>
        )}
        {importResult && importResult.imported > 0 && (
          <p className="mt-2 text-xs text-foreground/40">
            Note: Chess DNA and Training key off the exact player name — use your Chess.com username there too.
          </p>
        )}
      </div>

      <div className="mb-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-hairline" />
        <span className="text-xs uppercase tracking-wide text-foreground/40">or upload a PGN</span>
        <div className="h-px flex-1 bg-hairline" />
      </div>

      <h1 className="mb-1 font-serif text-3xl text-foreground">Upload a game</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Paste a PGN below. We'll parse it and queue it for Stockfish analysis.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          Title <span className="font-normal text-foreground/50">(optional)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. My Sunday blitz game"
            className="border border-hairline bg-background p-2 text-foreground focus:border-board focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          PGN
          <textarea
            value={pgn}
            onChange={(e) => handlePgnChange(e.target.value)}
            rows={8}
            required
            className="border border-hairline bg-background p-3 font-mono text-sm text-foreground focus:border-board focus:outline-none"
            placeholder='[White "Player 1"]&#10;[Black "Player 2"]&#10;&#10;1. e4 e5 2. Nf3 ...'
          />
        </label>

        <div className="flex gap-6">
          <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-foreground">
            White
            <input
              value={whitePlayer}
              onChange={(e) => setWhitePlayer(e.target.value)}
              className="border border-hairline bg-background p-2 text-foreground focus:border-board focus:outline-none"
            />
          </label>
          <label className="flex flex-1 flex-col gap-2 text-sm font-medium text-foreground">
            Black
            <input
              value={blackPlayer}
              onChange={(e) => setBlackPlayer(e.target.value)}
              className="border border-hairline bg-background p-2 text-foreground focus:border-board focus:outline-none"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="self-start bg-board px-6 py-2 text-sm font-medium text-white hover:bg-board-dark disabled:opacity-50"
        >
          {submitting ? "Uploading…" : "Upload game"}
        </button>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}