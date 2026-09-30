"use client";

type ReportEntry = {
  plyNumber: number;
  san: string;
  scoreCentipawns: number | null;
  mateInMoves: number | null;
  centipawnLoss: number;
  classification: "NONE" | "INACCURACY" | "MISTAKE" | "BLUNDER" | "PENDING";
  gamePhase?: "OPENING" | "MIDDLEGAME" | "ENDGAME";
};

type EvaluationEntry = {
  plyNumber: number;
  whiteWinPercent: number;
  whiteCentipawns: number | null;
  whiteMateIn: number | null;
};

type Props = {
  whitePlayer: string;
  blackPlayer: string;
  whiteAccuracy: number | null;
  blackAccuracy: number | null;
  accuracyStillAnalyzing: boolean;
  analysisStatus: string | null;
  evaluationSeries: EvaluationEntry[];
  report: ReportEntry[];
  onJumpToPly: (plyNumber: number) => void;
};

const CLASSIFICATION_DOT_COLOR: Record<ReportEntry["classification"], string> = {
  NONE: "#a8a29e",
  INACCURACY: "#b45309",
  MISTAKE: "#c2410c",
  BLUNDER: "#991b1b",
  PENDING: "#a8a29e",
};

const PHASES: NonNullable<ReportEntry["gamePhase"]>[] = ["OPENING", "MIDDLEGAME", "ENDGAME"];

// Our own defined tiering for "how clean was this phase" — not an
// industry-standard metric, just a simple mistake-density heuristic so the
// phase rows have some visual signal instead of raw numbers only.
function tierForMistakeRate(rate: number | null): { symbol: string; color: string } {
  if (rate === null) return { symbol: "–", color: "#a8a29e" };
  if (rate < 0.15) return { symbol: "▲", color: "#2f4a3d" };
  if (rate < 0.35) return { symbol: "●", color: "#b45309" };
  return { symbol: "▼", color: "#991b1b" };
}

function tallyForSide(report: ReportEntry[], isWhiteSide: boolean) {
  const sideEntries = report.filter(
    (r) => r.classification !== "PENDING" && (isWhiteSide ? r.plyNumber % 2 === 1 : r.plyNumber % 2 === 0)
  );
  return {
    none: sideEntries.filter((r) => r.classification === "NONE").length,
    inaccuracy: sideEntries.filter((r) => r.classification === "INACCURACY").length,
    mistake: sideEntries.filter((r) => r.classification === "MISTAKE").length,
    blunder: sideEntries.filter((r) => r.classification === "BLUNDER").length,
  };
}

function phaseRateForSide(report: ReportEntry[], phase: string, isWhiteSide: boolean): number | null {
  const entries = report.filter(
    (r) =>
      r.gamePhase === phase &&
      r.classification !== "PENDING" &&
      (isWhiteSide ? r.plyNumber % 2 === 1 : r.plyNumber % 2 === 0)
  );
  if (entries.length === 0) return null;
  const mistakes = entries.filter((r) => ["INACCURACY", "MISTAKE", "BLUNDER"].includes(r.classification)).length;
  return mistakes / entries.length;
}

const GRAPH_WIDTH = 400;
const GRAPH_HEIGHT = 100;

export default function GameReportPanel({
  whitePlayer,
  blackPlayer,
  whiteAccuracy,
  blackAccuracy,
  accuracyStillAnalyzing,
  analysisStatus,
  evaluationSeries,
  report,
  onJumpToPly,
}: Props) {
  const whiteTally = tallyForSide(report, true);
  const blackTally = tallyForSide(report, false);

  const points = evaluationSeries.map((entry, i) => {
    const x = (i / Math.max(evaluationSeries.length - 1, 1)) * GRAPH_WIDTH;
    const y = GRAPH_HEIGHT - (entry.whiteWinPercent / 100) * GRAPH_HEIGHT;
    return { x, y, entry: report.find((r) => r.plyNumber === entry.plyNumber) };
  });
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const flaggedPoints = points.filter(
    (p): p is { x: number; y: number; entry: ReportEntry } =>
      p.entry !== undefined && !["NONE", "PENDING"].includes(p.entry.classification)
  );

  return (
    <div className="mt-8 border-t border-hairline pt-6">
      <h2 className="mb-4 font-serif text-lg text-foreground">Game report</h2>
      {analysisStatus && <p className="mb-4 text-sm italic text-foreground/60">{analysisStatus}</p>}

      {/* Player comparison */}
      <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="font-medium text-foreground">{whitePlayer}</p>
          <p className="mb-2 text-foreground/60">
            {accuracyStillAnalyzing || whiteAccuracy === null
              ? "Analyzing..."
              : `${whiteAccuracy.toFixed(1)}% approx. accuracy`}
          </p>
          <ul className="space-y-1 text-xs">
            <li className="text-foreground/60">Clean moves: {whiteTally.none}</li>
            <li style={{ color: CLASSIFICATION_DOT_COLOR.INACCURACY }}>Inaccuracies: {whiteTally.inaccuracy}</li>
            <li style={{ color: CLASSIFICATION_DOT_COLOR.MISTAKE }}>Mistakes: {whiteTally.mistake}</li>
            <li style={{ color: CLASSIFICATION_DOT_COLOR.BLUNDER }}>Blunders: {whiteTally.blunder}</li>
          </ul>
        </div>
        <div>
          <p className="font-medium text-foreground">{blackPlayer}</p>
          <p className="mb-2 text-foreground/60">
            {accuracyStillAnalyzing || blackAccuracy === null
              ? "Analyzing..."
              : `${blackAccuracy.toFixed(1)}% approx. accuracy`}
          </p>
          <ul className="space-y-1 text-xs">
            <li className="text-foreground/60">Clean moves: {blackTally.none}</li>
            <li style={{ color: CLASSIFICATION_DOT_COLOR.INACCURACY }}>Inaccuracies: {blackTally.inaccuracy}</li>
            <li style={{ color: CLASSIFICATION_DOT_COLOR.MISTAKE }}>Mistakes: {blackTally.mistake}</li>
            <li style={{ color: CLASSIFICATION_DOT_COLOR.BLUNDER }}>Blunders: {blackTally.blunder}</li>
          </ul>
        </div>
      </div>

      {/* Evaluation graph */}
      {points.length > 1 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-medium uppercase text-foreground/50">Evaluation over the game</p>
          <svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT} className="max-w-full">
            <line
              x1={0}
              y1={GRAPH_HEIGHT / 2}
              x2={GRAPH_WIDTH}
              y2={GRAPH_HEIGHT / 2}
              stroke="#dad4c8"
              strokeWidth={1}
            />
            <polyline points={polylinePoints} fill="none" stroke="#2f4a3d" strokeWidth={1.5} />
            {flaggedPoints.map((p) => (
              <circle
                key={p.entry.plyNumber}
                cx={p.x}
                cy={p.y}
                r={3.5}
                fill={CLASSIFICATION_DOT_COLOR[p.entry.classification]}
                className="cursor-pointer"
                onClick={() => onJumpToPly(p.entry.plyNumber)}
              >
                <title>
                  Move {p.entry.plyNumber} ({p.entry.san}) — {p.entry.classification}
                </title>
              </circle>
            ))}
          </svg>
          <p className="mt-1 text-xs text-foreground/40">
            Above the line favors White, below favors Black. Colored dots are flagged moves — click to jump there.
          </p>
        </div>
      )}

      {/* Phase performance */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase text-foreground/50">Phase performance</p>
        <table className="w-full max-w-xs text-sm">
          <tbody>
            {PHASES.map((phase) => {
              const whiteTier = tierForMistakeRate(phaseRateForSide(report, phase, true));
              const blackTier = tierForMistakeRate(phaseRateForSide(report, phase, false));
              return (
                <tr key={phase} className="border-b border-hairline">
                  <td className="py-1 text-center" style={{ color: whiteTier.color }}>
                    {whiteTier.symbol}
                  </td>
                  <td className="py-1 text-foreground/70">{phase.charAt(0) + phase.slice(1).toLowerCase()}</td>
                  <td className="py-1 text-center" style={{ color: blackTier.color }}>
                    {blackTier.symbol}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-foreground/40">
          ▲ clean · ● some mistakes · ▼ mistake-heavy — our own rough tiering, not an official rating.
        </p>
      </div>
    </div>
  );
}