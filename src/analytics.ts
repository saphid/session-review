import type { ProviderId } from "./types.js";

export type UsageKind = "tool" | "skill";
export type BatchMode = "include" | "exclude" | "only";
export type TimeBucket = "day" | "week";

export interface UsageSignal {
  kind: UsageKind;
  name: string;
  count: number;
}

export interface ExtensionUsageSignal {
  packageName: string;
  kind: string;
  name: string;
  event: string;
  count: number;
}

const knownSkills = [
  "ai-tdd",
  "btw",
  "cli-error-retry-discipline",
  "create-taskplane-task",
  "deep-module-architecture",
  "displayr-stack-investigation",
  "evidence-backed-review-replies",
  "github-ci-run-triage",
  "grill-me",
  "intentional-prd",
  "librarian",
  "personal-project-routing-preflight",
  "pi-interactive-shell",
  "pi-subagents",
  "proof-lane-sizing",
  "resume-claude",
  "subagent-review-hygiene",
  "twitter-reader-auth",
  "ubiquitous-language",
  "vision-image-prep",
  "work-preflight-scope",
];

const genericToolPattern = /(?:^|\n)tool:\s*([A-Za-z0-9_.:/-]+)/g;
const toolResultPattern = /(?:^|\n)tool_result:\s*([A-Za-z0-9_.:/-]+)/g;
const shellPattern = /(?:^|\n)\$\s+([A-Za-z0-9_.:/-]+)/g;
const functionToolPattern = /(?:function_call|custom_tool_call|toolCall)[^\n]{0,120}?(?:name|toolName)["':\s]+([A-Za-z0-9_.:/-]+)/g;

export function extractExtensionUsageSignals(text: string): ExtensionUsageSignal[] {
  const signals = new Map<string, ExtensionUsageSignal>();
  const addSignal = (signal: Omit<ExtensionUsageSignal, "count">): void => {
    const key = `${signal.packageName}\t${signal.kind}\t${signal.name}\t${signal.event}`;
    const existing = signals.get(key);
    if (existing) existing.count += 1;
    else signals.set(key, { ...signal, count: 1 });
  };

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("custom:pi-opentelemetry.")) continue;
    const match = /^custom:(\S+)\s+(.*)$/.exec(line);
    if (!match) continue;
    try {
      const payload = JSON.parse(match[2] ?? "{}") as { activeTools?: Array<{ name?: string; sourcePackage?: string }>; allTools?: Array<{ name?: string; sourcePackage?: string }>; kind?: string; name?: string; event?: string; sourcePackage?: string };
      if (match[1] === "pi-opentelemetry.resource_snapshot") {
        for (const tool of [...(payload.activeTools ?? []), ...(payload.allTools ?? [])]) {
          if (!tool.name) continue;
          addSignal({ packageName: tool.sourcePackage ?? "unknown", kind: "tool", name: tool.name, event: "available" });
        }
      }
      if (match[1] === "pi-opentelemetry.resource_usage" && payload.kind && payload.name && payload.event) {
        addSignal({ packageName: payload.sourcePackage ?? "unknown", kind: payload.kind, name: payload.name, event: payload.event });
      }
    } catch {
      // Ignore malformed telemetry payloads.
    }
  }

  return [...signals.values()];
}

export function extractUsageSignals(text: string): UsageSignal[] {
  const tools = new Map<string, number>();
  const skills = new Map<string, number>();

  collectMatches(text, genericToolPattern, tools);
  collectMatches(text, toolResultPattern, tools);
  collectMatches(text, functionToolPattern, tools);
  for (const match of text.matchAll(shellPattern)) {
    const raw = match[1];
    if (raw) add(tools, normalizeToolName(raw));
  }

  const lower = text.toLowerCase();
  for (const skill of knownSkills) {
    const count = countOccurrences(lower, skill.toLowerCase());
    if (count > 0) skills.set(skill, count);
  }

  return [
    ...[...tools.entries()].map(([name, count]) => ({ kind: "tool" as const, name, count })),
    ...[...skills.entries()].map(([name, count]) => ({ kind: "skill" as const, name, count })),
  ];
}

export function classifyBatchSession(input: { provider: ProviderId; path: string; title: string | null; cwd: string | null; body: string }): boolean {
  const haystack = `${input.provider}\n${input.path}\n${input.title ?? ""}\n${input.cwd ?? ""}\n${input.body.slice(0, 20_000)}`.toLowerCase();
  return /\b(orch|taskplane|subagent|lane-[0-9]+|batch|worker|reviewer|delegate)\b/.test(haystack);
}

export function bucketDate(isoDate: string | null, bucket: TimeBucket): string {
  const date = isoDate ? new Date(isoDate) : new Date(0);
  if (Number.isNaN(date.getTime())) return "unknown";
  if (bucket === "day") return date.toISOString().slice(0, 10);
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy.toISOString().slice(0, 10);
}

function collectMatches(text: string, pattern: RegExp, target: Map<string, number>): void {
  for (const match of text.matchAll(pattern)) {
    const raw = match[1];
    if (raw) add(target, normalizeToolName(raw));
  }
}

function normalizeToolName(raw: string): string {
  return raw.replace(/^functions\./, "").replace(/^multi_tool_use\./, "").replace(/[^A-Za-z0-9_.:/-].*$/, "").toLowerCase();
}

function add(map: Map<string, number>, key: string, amount = 1): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    index = text.indexOf(needle, index);
    if (index < 0) return count;
    count += 1;
    index += needle.length;
  }
}
