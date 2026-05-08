/**
 * Returns a middle-truncated form of a path that preserves the first and
 * last few segments while collapsing the middle with an ellipsis. The
 * result fits a small column without wrapping; the original path stays
 * available to the caller for an `aria-label` so assistive tech reads it
 * in full.
 *
 * Examples:
 *   truncatePathMiddle("/Users/alex/Personal/Projects/session-review/foo", 36)
 *     → "/Users/alex/.../session-review/foo"
 *   truncatePathMiddle("/short", 36) → "/short"
 *
 * The algorithm is intentionally simple — keep at most `headSegments`
 * leading segments and `tailSegments` trailing segments, drop the
 * middle. If the result is still longer than `maxLength`, truncate the
 * tail with a leading ellipsis.
 */
export function truncatePathMiddle(
  pathValue: string,
  maxLength = 64,
  options: { headSegments?: number; tailSegments?: number } = {},
): string {
  const headSegments = options.headSegments ?? 2;
  const tailSegments = options.tailSegments ?? 1;
  if (pathValue.length <= maxLength) return pathValue;

  const segments = pathValue.split("/");
  // Detect a leading slash so the rebuilt string keeps it.
  const isAbsolute = segments[0] === "";
  const meaningful = isAbsolute ? segments.slice(1) : segments;
  if (meaningful.length <= headSegments + tailSegments) {
    return collapseString(pathValue, maxLength);
  }

  const head = meaningful.slice(0, headSegments).join("/");
  const tail = meaningful.slice(meaningful.length - tailSegments).join("/");
  const prefix = isAbsolute ? "/" : "";
  const candidate = `${prefix}${head}/.../${tail}`;
  if (candidate.length <= maxLength) return candidate;
  return collapseString(candidate, maxLength);
}

/**
 * Last-resort string-level truncate when the segment-based truncation
 * still leaves us over budget — e.g. a path with one ridiculously long
 * leaf segment.
 */
function collapseString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const ellipsis = "...";
  const keep = Math.max(1, Math.floor((maxLength - ellipsis.length) / 2));
  return `${value.slice(0, keep)}${ellipsis}${value.slice(value.length - keep)}`;
}
