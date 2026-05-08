import { formatMatchScore } from "@/lib/search-display";

interface MatchPillProps {
  /** `SearchResult.matchScore` — null when the request had no query. */
  score: number | null;
}

/**
 * Match column cell. Renders a colored pill formatted to 2 d.p. when the
 * data layer returned a real BM25 score, or an em-dash with an explanatory
 * tooltip when no query was supplied.
 *
 * Color tiers (per PLAN T09):
 *   ≥ 0.7  — green (good match)
 *   ≥ 0.4  — amber (partial match)
 *   < 0.4  — grey  (weak match)
 */
export function MatchPill({ score }: MatchPillProps) {
  const formatted = formatMatchScore(score);

  if (formatted === null || score === null) {
    return (
      <span
        data-testid="match-empty"
        className="text-muted tabular-nums"
        title="No query — no relevance score."
      >
        —
      </span>
    );
  }

  return (
    <span
      data-testid="match-pill"
      className={`inline-flex min-w-[42px] items-center justify-center rounded-sm border px-1.5 py-0.5 text-xs font-medium tabular-nums ${pillTone(score)}`}
    >
      {formatted}
    </span>
  );
}

function pillTone(score: number): string {
  if (score >= 0.7) {
    return "border-[rgba(134,239,172,0.25)] bg-[rgba(134,239,172,0.08)] text-[var(--color-ok)]";
  }
  if (score >= 0.4) {
    return "border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.08)] text-[var(--color-warn)]";
  }
  return "border-border bg-surface-raised text-text-secondary";
}
