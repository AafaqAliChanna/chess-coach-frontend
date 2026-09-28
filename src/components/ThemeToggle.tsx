"use client";

import { useTheme } from "@/components/ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="mt-4 flex w-full items-center justify-between rounded border border-sidebar-active px-3 py-2 text-left text-sm text-sidebar-text transition-colors hover:bg-sidebar-active"
      aria-pressed={isDark}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
      <span className="text-xs text-sidebar-muted">{isDark ? "☼" : "☾"}</span>
    </button>
  );
}
