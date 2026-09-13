"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { getMyPlayerName, setMyPlayerName } from "@/lib/profile";

// Deterministic color from a string so the same user always gets the same
// avatar color across sessions, without needing to store a color choice
// anywhere. Palette chosen to sit with the existing board/brass theme
// rather than clashing with it.
const AVATAR_COLORS = ["#2f4a3d", "#b08968", "#7c2d12", "#1e3a5f", "#5b21b6", "#92400e"];

function colorForString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsFor(displayName: string | null, email: string): string {
  const source = displayName?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [playerName, setPlayerNameState] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!user) router.push("/login");
    }, 100);
    return () => clearTimeout(timeout);
  }, [user, router]);

  useEffect(() => {
    setPlayerNameState(getMyPlayerName() || "");
  }, []);

  function handleSave() {
    setMyPlayerName(playerName.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!user) return <p className="p-8 text-foreground">Loading…</p>;

  const avatarColor = colorForString(user.email);
  const initials = initialsFor(user.displayName, user.email);

  return (
    <div className="mx-auto w-full max-w-2xl px-8 py-16">
      {/* Identity header */}
      <div className="mb-8 flex items-center gap-5 border border-hairline p-6">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>
        <div>
          <h1 className="font-serif text-2xl text-foreground">{user.displayName || "Chess player"}</h1>
          <p className="text-sm text-foreground/60">{user.email}</p>
        </div>
      </div>

      {/* Account details */}
      <div className="mb-6 border border-hairline p-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-foreground/50">Account</p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-foreground/50">Display name</p>
            <p className="text-foreground">{user.displayName || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-foreground/50">Account ID</p>
            <p className="font-mono text-foreground">{user.userId}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-foreground/40">
          Editable display name and profile photos are coming once the backend adds account-editing support.
        </p>
      </div>

      {/* Player name (the one thing that's actually editable and functional) */}
      <div className="border border-hairline p-6">
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-foreground/50">Chess identity</p>
        <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
          Your player name
          <span className="font-normal text-foreground/50">
            Exactly as it appears in the White/Black fields on your uploaded games — used to compute your Dashboard
            stats, win rate, and Chess DNA patterns. Case-insensitive, but must match exactly.
          </span>
          <input
            value={playerName}
            onChange={(e) => setPlayerNameState(e.target.value)}
            placeholder="e.g. AafaqAliChanna"
            className="border border-hairline bg-background p-2 text-foreground focus:border-board focus:outline-none"
          />
        </label>
        <button
          onClick={handleSave}
          className="mt-3 bg-board px-4 py-2 text-sm font-medium text-white hover:bg-board-dark"
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      <p className="mt-6 text-xs text-foreground/40">
        Games aren't linked to your account yet — that's coming once the backend adds ownership. The player name
        above is stored locally in your browser, not on the server.
      </p>
    </div>
  );
}