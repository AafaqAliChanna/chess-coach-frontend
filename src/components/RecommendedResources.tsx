"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type ResourceType = "COURSE" | "VIDEO" | "ARTICLE" | "PRACTICE";
type InteractionType = "SAVED" | "SKIPPED" | "HELPFUL";

type Recommendation = {
  resource: {
    id: string;
    title: string;
    url: string;
    type: ResourceType;
    description: string;
    providerName: string;
  };
  goalName: string;
  reason: string;
  evidence: {
    dimension: string;
    score: number;
    confidence: "LOW" | "MEDIUM" | "HIGH";
    trend: "IMPROVING" | "STABLE" | "DECLINING" | "INSUFFICIENT_DATA";
    sampleSize: number;
    recentExampleGameIds: number[];
  };
};

type RecommendationsResponse = {
  playerName: string;
  hasEnoughData: boolean;
  recommendations: Recommendation[];
};

type ActionState = {
  type: InteractionType;
  message: string;
};

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  COURSE: "Course",
  VIDEO: "Video",
  ARTICLE: "Article",
  PRACTICE: "Practice",
};

function humanizeConfidence(confidence: Recommendation["evidence"]["confidence"]): string {
  if (confidence === "LOW") return "Building confidence";
  if (confidence === "MEDIUM") return "Growing confidence";
  return "High confidence";
}

function recommendationKey(recommendation: Recommendation): string {
  return `${recommendation.goalName}:${recommendation.resource.id}`;
}

export default function RecommendedResources({ playerName }: { playerName: string | null }) {
  const { user } = useAuth();
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!playerName) {
      setData(null);
      setRecommendations([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${API_BASE_URL}/api/players/${encodeURIComponent(playerName)}/recommendations`)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load recommendations: ${response.status}`);
        return response.json() as Promise<RecommendationsResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setRecommendations(json.recommendations);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playerName]);

  async function trackInteraction(recommendation: Recommendation, interactionType: InteractionType) {
    if (!user?.token) {
      setActionErrors((current) => ({
        ...current,
        [recommendationKey(recommendation)]: "Please sign in to save feedback.",
      }));
      return;
    }

    const key = recommendationKey(recommendation);
    setActionErrors((current) => ({ ...current, [key]: "" }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/resources/${encodeURIComponent(recommendation.resource.id)}/interaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({ interactionType }),
      });

      if (!response.ok) throw new Error(`Could not record feedback: ${response.status}`);

      setActionStates((current) => ({
        ...current,
        [key]: {
          type: interactionType,
          message: interactionType === "SAVED" ? "Saved" : interactionType === "HELPFUL" ? "Thanks for the feedback" : "Skipped",
        },
      }));

      if (interactionType === "SKIPPED") {
        setRecommendations((current) => current.filter((item) => recommendationKey(item) !== key));
      }
    } catch (err) {
      setActionErrors((current) => ({
        ...current,
        [key]: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  return (
    <section className="mb-10" aria-labelledby="recommended-resources-heading">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="recommended-resources-heading" className="font-serif text-xl text-foreground">
          Recommended for You
        </h2>
        {data?.recommendations.length ? (
          <span className="text-xs text-foreground/50">{data.recommendations.length} picked for your games</span>
        ) : null}
      </div>

      {!playerName ? (
        <p className="border border-hairline p-4 text-sm text-foreground/60">
          Set your player name in Profile to unlock personalized recommendations.
        </p>
      ) : loading ? (
        <p className="border border-hairline p-4 text-sm text-foreground/60">Loading recommendations…</p>
      ) : error ? (
        <p className="border border-hairline p-4 text-sm text-red-700">{error}</p>
      ) : !data?.hasEnoughData ? (
        <p className="border border-hairline bg-brass/10 p-4 text-sm text-foreground">
          Upload a few more games and we&apos;ll have personalized recommendations for you.
        </p>
      ) : recommendations.length === 0 ? (
        <p className="border border-hairline p-4 text-sm text-foreground/60">
          You&apos;re all caught up for now. Check back after your next analyzed games.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {recommendations.map((recommendation) => {
            const key = recommendationKey(recommendation);
            const actionState = actionStates[key];
            return (
              <article key={key} className={`border border-hairline p-4 transition-opacity ${actionState ? "opacity-85" : ""}`}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="font-serif text-lg text-foreground">{recommendation.goalName}</h3>
                  <span className="shrink-0 border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/60">
                    {RESOURCE_TYPE_LABELS[recommendation.resource.type]}
                  </span>
                </div>
                <a
                  href={recommendation.resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-board hover:underline"
                >
                  {recommendation.resource.title} ↗
                </a>
                <p className="mt-2 text-sm text-foreground/70">{recommendation.reason}</p>
                {recommendation.evidence.confidence !== "HIGH" && (
                  <p className="mt-2 text-xs text-foreground/50">{humanizeConfidence(recommendation.evidence.confidence)}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => trackInteraction(recommendation, "SAVED")}
                    className="border border-hairline px-3 py-1 text-xs text-foreground hover:bg-hairline/30"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => trackInteraction(recommendation, "SKIPPED")}
                    className="border border-hairline px-3 py-1 text-xs text-foreground hover:bg-hairline/30"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={() => trackInteraction(recommendation, "HELPFUL")}
                    className="border border-hairline px-3 py-1 text-xs text-foreground hover:bg-hairline/30"
                  >
                    Mark Helpful
                  </button>
                  {actionState && <span className="text-xs text-board">✓ {actionState.message}</span>}
                </div>
                {actionErrors[key] && <p className="mt-2 text-xs text-red-700">{actionErrors[key]}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
