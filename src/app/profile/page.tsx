"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function ProfilePage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // user starts as null on first render even when logged in (auth state
    // loads from localStorage asynchronously) — this effect waits one tick
    // rather than redirecting a logged-in user who just hasn't hydrated yet.
    const timeout = setTimeout(() => {
      if (!user) router.push("/login");
    }, 100);
    return () => clearTimeout(timeout);
  }, [user, router]);

  if (!user) return <p className="p-8 text-foreground">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-md px-8 py-16">
      <h1 className="mb-8 font-serif text-3xl text-foreground">Profile</h1>

      <div className="flex flex-col gap-4 border border-hairline p-6">
        <div>
          <p className="text-xs text-foreground/50">Display name</p>
          <p className="text-foreground">{user.displayName || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">Email</p>
          <p className="text-foreground">{user.email}</p>
        </div>
        <div>
          <p className="text-xs text-foreground/50">Account ID</p>
          <p className="font-mono text-foreground">{user.userId}</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-foreground/50">
        Games aren't linked to your account yet — that's coming once the backend adds ownership. For now, all
        uploaded games are visible to everyone, regardless of who's logged in.
      </p>
    </div>
  );
}