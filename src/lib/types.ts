// Canonical Game shape returned by the backend on every endpoint that
// returns a Game object: GET /api/games, GET /api/games/{id}, POST /api/games,
// PATCH /api/games/{id}. Previously this was redefined separately in four
// page files, which meant a new backend field (like timeControl) had to be
// added in four places by hand and could silently drift out of sync.
export type Game = {
  id: number;
  pgn: string;
  title: string | null;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  uploadedAt: string;
  timeControl: string | null;
};