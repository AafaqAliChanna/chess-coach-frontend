"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getAuth, saveAuth, clearAuth, type AuthUser } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  updateUser: (user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const storedUser = getAuth();
    if (!storedUser) return;

    setUser(storedUser);

    fetch(`${API_BASE_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${storedUser.token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load account: ${response.status}`);
        return response.json();
      })
      .then((account) => {
        const refreshedUser = {
          ...storedUser,
          userId: account.id,
          email: account.email,
          displayName: account.displayName,
          playerName: account.playerName,
        };
        saveAuth(refreshedUser);
        setUser(refreshedUser);
      })
      .catch(() => {
        // Keep the cached authenticated user if the refresh is unavailable.
      });
  }, []);

  function login(newUser: AuthUser) {
    saveAuth(newUser);
    setUser(newUser);
  }

  function updateUser(updatedUser: AuthUser) {
    saveAuth(updatedUser);
    setUser(updatedUser);
  }

  function logout() {
    clearAuth();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, updateUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}