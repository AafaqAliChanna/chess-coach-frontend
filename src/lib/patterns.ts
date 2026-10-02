export type PatternTag = "HANGING_PIECE" | "MISSED_MATE" | "ALLOWED_MATE" | "POSITIONAL";
export type PatternTrend = "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";

export type PatternOccurrence = {
  gameId: number;
  plyNumber: number;
  san: string;
  winPercentLoss: number;
  fenBefore: string;
  bestMoveSan: string;
  pieceHung: string | null;
  gamePhase: string;
  betterLine: PatternBetterLine | null;
};

export type PatternBetterLine = {
  evalCp: number | null;
  evalMate: number | null;
  movesSan: string[];
  movesUci: string[];
  fensAfterEachMove: string[];
};

export type PatternCostEvidence = {
  gamesWithPattern: number;
  gamesWithPatternLostOrDrawnPercent: number;
  gamesWithoutPattern: number;
  gamesWithoutPatternLostOrDrawnPercent: number;
  note: string;
};

export type PatternDetail = {
  playerName: string;
  pattern: PatternTag;
  gamesAnalyzed: number;
  totalOccurrences: number;
  gamesAffected: number;
  cleanGameStreak: number;
  trend: PatternTrend;
  worstOccurrence: PatternOccurrence | null;
  mostRecentOccurrence: PatternOccurrence | null;
  costEvidence: PatternCostEvidence | null;
  occurrencesByPieceHung: Record<string, number>;
  occurrencesByPhase: Record<string, number>;
  recentOccurrences: PatternOccurrence[];
};

export type PatternFocusResponse = {
  playerName: string;
  hasEnoughData: boolean;
  recommendedFocus: PatternTag | null;
  reason: string;
  detail: PatternDetail | null;
};

export const PATTERN_LABELS: Record<PatternTag, string> = {
  HANGING_PIECE: "Hanging Piece",
  MISSED_MATE: "Missed Mate",
  ALLOWED_MATE: "Allowed Mate",
  POSITIONAL: "Positional",
};

export function humanizePattern(pattern: PatternTag): string {
  return PATTERN_LABELS[pattern];
}

export function isPatternTag(value: string | null): value is PatternTag {
  return value === "HANGING_PIECE" || value === "MISSED_MATE" || value === "ALLOWED_MATE" || value === "POSITIONAL";
}
