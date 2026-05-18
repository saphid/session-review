import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SearchResult } from "../../../../src/types.js";
import {
  activityMetrics,
  defaultDirFor,
  displaySubtitle,
  displayTitle,
  formatMatchScore,
  formatTokens,
  isSortDir,
  isSortKey,
  projectLabel,
  relationFor,
  runtimeDisplay,
} from "../../lib/search-display.js";

const baseRow: SearchResult = {
  provider: "claude",
  sessionId: "claude:abc",
  title: "T06 perf fixture",
  startedAt: "2026-01-15T18:00:00.000Z",
  cwd: "/Users/alex/Personal/Projects/session-review",
  path: "/Users/alex/.claude/projects/x/claude_fixture-perf-200.jsonl",
  snippet: null,
  tokenEstimate: 8200,
  toolUseCount: 100,
  matchScore: 0.86,
  isBatch: true,
  isSubagent: false,
  parentSessionId: null,
  parentTitle: null,
  groupKey: "g",
  groupLabel: "g",
  groupReason: "g",
};

describe("displayTitle", () => {
  it("returns the trimmed title when present", () => {
    assert.equal(displayTitle({ ...baseRow, title: "  Hello  " }), "Hello");
  });
  it("falls back to sessionId when title is null", () => {
    assert.equal(
      displayTitle({ ...baseRow, title: null }),
      "claude:abc",
    );
  });
  it("falls back to sessionId when title is whitespace", () => {
    assert.equal(
      displayTitle({ ...baseRow, title: "   " }),
      "claude:abc",
    );
  });
});

describe("displaySubtitle", () => {
  it("prefers the FTS snippet when present", () => {
    assert.equal(
      displaySubtitle({ ...baseRow, snippet: "matched [tool] read" }),
      "matched [tool] read",
    );
  });
  it("falls back to a shortened path", () => {
    assert.equal(
      displaySubtitle({
        ...baseRow,
        snippet: null,
        path: "/Users/alex/.claude/projects/x/claude_fixture-perf-200.jsonl",
      }),
      "…/x/claude_fixture-perf-200.jsonl",
    );
  });
  it("returns the raw path when only one segment is present", () => {
    assert.equal(
      displaySubtitle({ ...baseRow, snippet: null, path: "/single" }),
      "/single",
    );
  });
});

describe("projectLabel", () => {
  it("uses the last cwd segment", () => {
    assert.equal(projectLabel(baseRow), "session-review");
  });
  it("returns em-dash when cwd is null", () => {
    assert.equal(projectLabel({ ...baseRow, cwd: null }), "—");
  });
});

describe("relationFor", () => {
  it("returns batch when isBatch is set, even if isSubagent is also true", () => {
    assert.deepEqual(
      relationFor({ ...baseRow, isBatch: true, isSubagent: true }),
      { kind: "batch" },
    );
  });
  it("returns subagent with parentTitle when isSubagent is set", () => {
    assert.deepEqual(
      relationFor({
        ...baseRow,
        isBatch: false,
        isSubagent: true,
        parentTitle: "primary fixture",
      }),
      { kind: "subagent", parentTitle: "primary fixture" },
    );
  });
  it("returns primary when neither flag is set", () => {
    assert.deepEqual(
      relationFor({ ...baseRow, isBatch: false, isSubagent: false }),
      { kind: "primary" },
    );
  });
});

describe("runtimeDisplay", () => {
  it("renders date as DD Mon YYYY (locale-independent)", () => {
    const out = runtimeDisplay({ ...baseRow });
    // The fixture stamp is 2026-01-15T18:00:00Z; the local timezone may
    // shift it forward or back by a day, so we accept the surrounding
    // calendar dates.
    assert.match(out.date, /^\d{2} (Jan|Dec) \d{4}$/);
  });
  it("renders time as HH:MM (24h)", () => {
    const out = runtimeDisplay({ ...baseRow });
    assert.match(out.time, /^\d{2}:\d{2}$/);
  });
  it("returns empty strings when startedAt is null", () => {
    assert.deepEqual(runtimeDisplay({ ...baseRow, startedAt: null }), {
      date: "",
      time: "",
    });
  });
  it("returns empty strings on an invalid date", () => {
    assert.deepEqual(runtimeDisplay({ ...baseRow, startedAt: "nope" }), {
      date: "",
      time: "",
    });
  });
});

describe("formatTokens", () => {
  it("returns plain number under 1000", () => {
    assert.equal(formatTokens(0), "0");
    assert.equal(formatTokens(42), "42");
    assert.equal(formatTokens(999), "999");
  });
  it("uses k-suffix from 1000–99,999 with 1 decimal", () => {
    assert.equal(formatTokens(1000), "1.0k");
    assert.equal(formatTokens(1234), "1.2k");
    assert.equal(formatTokens(8200), "8.2k");
    assert.equal(formatTokens(99_900), "99.9k");
  });
  it("rounds k-suffix to integer at and above 100k", () => {
    assert.equal(formatTokens(100_000), "100k");
    assert.equal(formatTokens(123_456), "123k");
    assert.equal(formatTokens(999_999), "1000k");
  });
  it("uses M-suffix at or above 1,000,000", () => {
    assert.equal(formatTokens(1_000_000), "1.0M");
    assert.equal(formatTokens(2_500_000), "2.5M");
  });
  it("returns 0 for non-finite or negative input", () => {
    assert.equal(formatTokens(NaN), "0");
    assert.equal(formatTokens(-5), "0");
    assert.equal(formatTokens(Number.POSITIVE_INFINITY), "0");
  });
});

describe("formatMatchScore", () => {
  it("formats to 2 dp", () => {
    assert.equal(formatMatchScore(0.857142), "0.86");
    assert.equal(formatMatchScore(0), "0.00");
    assert.equal(formatMatchScore(1), "1.00");
  });
  it("returns null when score is null", () => {
    assert.equal(formatMatchScore(null), null);
  });
  it("returns null when score is non-finite", () => {
    assert.equal(formatMatchScore(NaN), null);
    assert.equal(formatMatchScore(Number.POSITIVE_INFINITY), null);
  });
});

describe("activityMetrics", () => {
  it("passes through token estimate and tool count", () => {
    assert.deepEqual(activityMetrics(baseRow), {
      tokens: 8200,
      tools: 100,
    });
  });
});

describe("isSortKey / isSortDir", () => {
  it("isSortKey accepts the three valid keys", () => {
    assert.equal(isSortKey("runtime"), true);
    assert.equal(isSortKey("activity"), true);
    assert.equal(isSortKey("match"), true);
  });
  it("isSortKey rejects everything else", () => {
    assert.equal(isSortKey("foo"), false);
    assert.equal(isSortKey(""), false);
    assert.equal(isSortKey(null), false);
  });
  it("isSortDir accepts asc/desc", () => {
    assert.equal(isSortDir("asc"), true);
    assert.equal(isSortDir("desc"), true);
    assert.equal(isSortDir("up"), false);
    assert.equal(isSortDir(null), false);
  });
});

describe("defaultDirFor", () => {
  it("returns desc for every sort key", () => {
    assert.equal(defaultDirFor("runtime"), "desc");
    assert.equal(defaultDirFor("activity"), "desc");
    assert.equal(defaultDirFor("match"), "desc");
  });
});
