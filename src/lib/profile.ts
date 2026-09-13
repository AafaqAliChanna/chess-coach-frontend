const PLAYER_NAME_KEY = "chess_coach_player_name";

export function getMyPlayerName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLAYER_NAME_KEY);
}

export function setMyPlayerName(name: string) {
  localStorage.setItem(PLAYER_NAME_KEY, name);
}