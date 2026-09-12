"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getAuth, saveAuth, clearAuth, type AuthUser } from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getAuth());
  }, []);

  function login(newUser: AuthUser) {
    saveAuth(newUser);
    setUser(newUser);
  }

  function logout() {
    clearAuth();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}