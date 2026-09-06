"use client";

import { useState } from "react";

export default function Home() {
  const [result, setResult] = useState<string>("");

  async function testConnection() {
    setResult("Sending request...");
    try {
      const response = await fetch("http://localhost:8080/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5",
          whitePlayer: "Test White",
          blackPlayer: "Test Black",
          result: "*",
        }),
      });
      const data = await response.json();
      setResult(`Status: ${response.status}\n${JSON.stringify(data, null, 2)}`);
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-8">
      <button
        onClick={testConnection}
        className="rounded bg-black px-4 py-2 text-white"
      >
        Test Backend Connection
      </button>
      <pre className="max-w-2xl whitespace-pre-wrap rounded bg-white p-4 text-sm shadow">
        {result}
      </pre>
    </div>
  );
}