"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { getAuth } from "@/lib/auth";

// Shape of POST /api/users/me/check-in. The message is built server-side from
// real data and must be shown exactly as received.
type CheckInResponse = {
  currentStreak: number;
  longestStreak: number;
  newDay: boolean;
  message: string;
};

function isCheckInResponse(value: unknown): value is CheckInResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.currentStreak === "number" &&
    typeof v.longestStreak === "number" &&
    typeof v.newDay === "boolean" &&
    typeof v.message === "string"
  );
}

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: CheckInResponse };

export default function DailyCheckInCard() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ status: "loading" });
  // Guards React strict mode's double-invoked effects in dev so we send one
  // check-in per Dashboard load. The ref is only flipped once a request is
  // actually sent, so a not-yet-hydrated token doesn't burn the single attempt.
  const hasCheckedIn = useRef(false);

  const token = user?.token ?? getAuth()?.token ?? null;

  useEffect(() => {
    if (!token || hasCheckedIn.current) return;
    hasCheckedIn.current = true;

    // No "cancelled" flag on purpose: under strict mode the first effect run is
    // cleaned up and the second is skipped by the ref, so a cancel flag would
    // discard the only response we ever get. React 18+ ignores setState on an
    // unmounted component, so letting it land is harmless.
    fetch(`${API_BASE_URL}/api/users/me/check-in`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Check-in failed: ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((data) => {
        if (!isCheckInResponse(data)) throw new Error("Unexpected check-in response");
        setState({ status: "ready", data });
      })
      .catch(() => setState({ status: "error" }));
  }, [token]);

  // Check-in is a nicety, never a blocker: on failure show nothing at all.
  if (state.status === "error") return null;

  // Fixed min-height keeps the page from jumping when the response arrives.
  if (state.status === "loading") {
    return <div className="mb-8 min-h-[76px] border border-hairline bg-board/5" aria-hidden="true" />;
  }

  const { currentStreak, longestStreak, newDay, message } = state.data;

  return (
    <section
      className={`mb-8 flex min-h-[76px] flex-wrap items-center gap-4 border p-4 ${
        newDay ? "border-brass bg-brass/10" : "border-hairline bg-board/5"
      }`}
      aria-label="Daily check-in"
    >
      <div className="shrink-0 text-center">
        <p className="font-serif text-3xl leading-none text-foreground">{currentStreak}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-foreground/50">day streak</p>
        {longestStreak > currentStreak && (
          <p className="mt-0.5 text-xs text-foreground/50">Best: {longestStreak}</p>
        )}
      </div>
      <p className="min-w-0 flex-1 text-sm text-foreground">{message}</p>
    </section>
  );
}