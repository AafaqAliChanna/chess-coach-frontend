"use client";

import { useState } from "react";

// PGN headers look like: [White "Magnus Carlsen"]
// This regex captures whatever's inside the quotes for a given tag name.
function extractPgnHeader(pgn: string, tag: string): string {
  const match = pgn.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
  return match ? match[1] : "";
}

// The backend's parser rejects header lines outright (it expects pure
// movetext), so we strip any line starting with "[" before sending —
// we only use headers client-side, for auto-filling the name fields.
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

  // Runs on every keystroke/paste in the PGN textarea. We only auto-fill a
  // name field if the user hasn't already typed something into it manually —
  // otherwise pasting a new PGN would silently overwrite a name they just edited.
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
      // Temporary — once we build the game view page, this becomes a redirect
      // to /games/[id] instead of an alert.
      alert(`Uploaded! Game ID: ${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xl flex-col gap-4 rounded bg-white p-6 shadow"
      >
        <h1 className="text-xl font-semibold text-zinc-900">Upload Game</h1>

        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-900">
          PGN
          <textarea
            value={pgn}
            onChange={(e) => handlePgnChange(e.target.value)}
            rows={8}
            required
            className="rounded border border-zinc-300 p-2 font-mono text-sm text-zinc-900"
            placeholder='[White "Player 1"]&#10;[Black "Player 2"]&#10;&#10;1. e4 e5 2. Nf3 ...'
          />
        </label>

        <div className="flex gap-4">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-zinc-900">
            White
            <input
              value={whitePlayer}
              onChange={(e) => setWhitePlayer(e.target.value)}
              className="rounded border border-zinc-300 p-2 text-zinc-900"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-zinc-900">
            Black
            <input
              value={blackPlayer}
              onChange={(e) => setBlackPlayer(e.target.value)}
              className="rounded border border-zinc-300 p-2 text-zinc-900"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Uploading..." : "Upload Game"}
        </button>

        {error && <p className="text-sm text-red-600">Error: {error}</p>}
      </form>
    </div>
  );
}