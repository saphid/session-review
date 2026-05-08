// Predicate for "bootstrap context" turns — the agent boilerplate that
// almost no human reader cares about (review #04, fail #3). The Pi
// transcripts open with a `pi-opentelemetry.resource_snapshot` JSON
// payload that lists every available tool; Claude/Codex/Cursor sometimes
// open with a `custom`/`context` role carrying similar harness wiring.
// We collapse those by default and let the user opt back in.
//
// The match is intentionally narrow: we only fold the items that
// actually look like bootstrap noise. A real `user` or `assistant` turn
// that happens to mention `pi-opentelemetry` in prose stays expanded.

export interface TranscriptNoiseInput {
  /** Lowercased role token from the transcript split. */
  role: string;
  /** Raw content body — only the leading run is inspected. */
  content: string;
}

const ROLE_BOOTSTRAP = /^(custom|context|pi-opentelemetry\.resource_snapshot)/i;
const CONTENT_BOOTSTRAP_PREFIX = "pi-opentelemetry.resource_snapshot";

/**
 * Returns `true` when the turn is bootstrap context that should render
 * collapsed by default. Either the role itself matches the harness
 * pattern, or the content opens with the resource-snapshot marker (the
 * shape Pi emits after the `custom:` role prefix is stripped at split).
 */
export function isBootstrapContext(input: TranscriptNoiseInput): boolean {
  if (ROLE_BOOTSTRAP.test(input.role)) return true;
  // `trimStart` so a single leading newline or space does not defeat the
  // detector; we still anchor on a literal prefix so prose mentions
  // ("…the pi-opentelemetry.resource_snapshot is…") are not folded.
  return input.content.trimStart().startsWith(CONTENT_BOOTSTRAP_PREFIX);
}
