"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const hasHydrated = useRef(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("chess-coach-theme");
    const nextTheme: Theme =
      savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = nextTheme;
    const timer = window.setTimeout(() => {
      hasHydrated.current = true;
      setTheme(nextTheme);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (hasHydrated.current) window.localStorage.setItem("chess-coach-theme", theme);
  }, [theme, hasHydrated]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme((current) => (current === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
