"use client";

import { Chessboard } from "react-chessboard";

// Temporary hardcoded FEN for testing — this is the standard starting position.
// Once the board itself is confirmed working, we'll replace this with real
// data from the backend's fenAfter field.
const TEST_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-[400px]">
        <Chessboard options={{ position: TEST_FEN }} />
      </div>
    </div>
  );
}