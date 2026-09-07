"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

export default function Home() {
  const [pgn, setPgn] = useState("");
  const [whitePlayer, setWhitePlayer] = useState("");
  const [blackPlayer, setBlackPlayer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function handlePgnChange(value: string) {
    setPgn(value);
    const parsedWhite = extractPgnHeader(value, "White");
    const parsedBlack = extractPgnHeader(value, "Black");
    if (parsedWhite && !whitePlayer) setWhitePlayer(parsedWhite);
    if (parsedBlack && !blackPlayer) setBlackPlayer(parsedBlack);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("http://localhost:8080/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pgn: stripPgnHeaders(pgn),
          whitePlayer: whitePlayer || "White",
          blackPlayer: blackPlayer || "Black",
          result: "*",
        }),
      });
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

  return (
    <div className="mx-auto w-full max-w-xl px-8 py-16">
      <h1 className="mb-1 font-serif text-3xl text-foreground">Upload a game</h1>
      <p className="mb-8 text-sm text-foreground/60">
        Paste a PGN below. We'll parse it and queue it for Stockfish analysis.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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