"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function AuthStatus() {
  const { user, logout } = useAuth();
  const router = useRouter();

  function handleLogout() {
    logout();
    router.push("/");
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-1 border-t border-sidebar-active pt-4">
        <Link href="/login" className="rounded px-3 py-2 text-sm text-sidebar-text hover:bg-sidebar-active">
          Log in
        </Link>
        <Link href="/register" className="rounded px-3 py-2 text-sm text-sidebar-text hover:bg-sidebar-active">
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="border-t border-sidebar-active pt-4">
      <p className="px-3 text-sm text-sidebar-text">{user.displayName || user.email}</p>
      <button
        onClick={handleLogout}
        className="mt-1 w-full rounded px-3 py-2 text-left text-sm text-sidebar-muted hover:bg-sidebar-active"
      >
        Log out
      </button>
    </div>
  );
}