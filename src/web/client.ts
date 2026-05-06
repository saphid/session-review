type ProviderId = "pi" | "claude" | "codex" | "cursor";
type UsageKind = "tool" | "skill";

type ChartInstance = { destroy(): void };
type ChartData = { labels: string[]; datasets: Array<{ label: string; data: number[]; backgroundColor?: string; borderColor?: string; borderWidth?: number }> };
type ChartConfig = { type: "bar" | "line"; data: ChartData; options: Record<string, unknown> };
declare const Chart: new (canvas: HTMLCanvasElement, config: ChartConfig) => ChartInstance;

interface SearchResult { provider: ProviderId; sessionId: string; title: string | null; startedAt: string | null; cwd: string | null; path: string; snippet: string | null; reason?: string; }
interface UsagePoint { bucket: string; name: string; count: number; sessions: number; }
interface UsageSummaryRow { kind: UsageKind; name: string; count: number; sessions: number; }
interface UsageResponse { summary: UsageSummaryRow[]; timeline: UsagePoint[]; }
interface TranscriptItem { index: number; role: string; content: string; toolCount: number; skillCount: number; }
interface SessionDetails {
  sessionId: string; provider: string; title: string | null; startedAt: string | null; cwd: string | null; path: string; indexedAt: string; isBatch: boolean; purpose: string | null; bodyPreview: string; turnCount: number; toolUseCount: number; skillUseCount: number; turns: Array<{ index: number; role: string; toolCount: number; skillCount: number }>; transcript: TranscriptItem[]; usage: UsageSummaryRow[]; linkedSessions: SearchResult[];
}

let activeTab: "search" | "usage" | "session" = location.pathname.startsWith("/session/") ? "session" : "search";
let usageChart: ChartInstance | null = null;
let turnChart: ChartInstance | null = null;

const searchTab = element<HTMLButtonElement>("searchTab");
const usageTab = element<HTMLButtonElement>("usageTab");
const searchPanel = element<HTMLElement>("searchPanel");
const usagePanel = element<HTMLElement>("usagePanel");
const sessionPanel = element<HTMLElement>("sessionPanel");
const runButton = element<HTMLButtonElement>("run");

searchTab.addEventListener("click", () => setTab("search"));
usageTab.addEventListener("click", () => setTab("usage"));
runButton.addEventListener("click", () => void run());
window.addEventListener("popstate", () => { activeTab = location.pathname.startsWith("/session/") ? "session" : activeTab === "session" ? "search" : activeTab; void run(); });
void init();

async function init(): Promise<void> {
  const filters = await getJson<{ providers: string[]; cwd: string[] }>("/api/filters");
  for (const item of filters.providers) element<HTMLSelectElement>("provider").append(new Option(item, item));
  syncPanels();
  await run();
}

function setTab(tab: "search" | "usage" | "session"): void {
  activeTab = tab;
  if (tab !== "session" && location.pathname !== "/") history.pushState(null, "", "/");
  syncPanels();
  void run();
}

function syncPanels(): void {
  searchTab.setAttribute("aria-pressed", String(activeTab === "search"));
  usageTab.setAttribute("aria-pressed", String(activeTab === "usage"));
  searchPanel.hidden = activeTab !== "search";
  usagePanel.hidden = activeTab !== "usage";
  sessionPanel.hidden = activeTab !== "session";
}

async function run(): Promise<void> {
  const started = performance.now();
  setBusy(true, `Running ${activeTab} query…`);
  try {
    if (activeTab === "search") await runSearch(started);
    else if (activeTab === "usage") await runUsage(started);
    else await runSession(started);
  } catch (error) {
    setStatus(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    setBusy(false);
  }
}

async function runSearch(started: number): Promise<void> {
  const rows = await getJson<SearchResult[]>(`/api/search?${params().toString()}`);
  const target = element<HTMLDivElement>("results");
  target.replaceChildren();
  if (!rows.length) { target.textContent = "No matching sessions."; setStatus(`Search completed in ${elapsed(started)} and returned 0 sessions.`); return; }
  for (const row of rows) target.append(searchResultNode(row));
  setStatus(`Search completed in ${elapsed(started)} and returned ${rows.length} sessions.`);
}

async function runUsage(started: number): Promise<void> {
  const query = params();
  query.set("kind", value("kind"));
  query.set("bucket", value("bucket"));
  const data = await getJson<UsageResponse>(`/api/usage?${query.toString()}`);
  usageChart = replaceChart(usageChart, element<HTMLCanvasElement>("chart"), usageChartConfig(data.timeline, data.summary.slice(0, 8).map((row) => row.name)));
  drawUsageTable(data.summary, element<HTMLDivElement>("usageTable"));
  setStatus(`Usage query completed in ${elapsed(started)} with ${data.summary.length} names and ${data.timeline.length} graph points.`);
}

async function runSession(started: number): Promise<void> {
  const id = decodeURIComponent(location.pathname.replace(/^\/session\//, ""));
  const details = await getJson<SessionDetails>(`/api/session?id=${encodeURIComponent(id)}`);
  renderSession(details);
  setStatus(`Session loaded in ${elapsed(started)}.`);
}

function searchResultNode(row: SearchResult): HTMLElement {
  const item = document.createElement("div");
  item.className = "result";
  item.innerHTML = `<strong><a href="/session/${encodeURIComponent(row.sessionId)}">[${escapeHtml(row.provider)}] ${escapeHtml(row.title ?? "Untitled")}</a></strong><div class="muted">${escapeHtml(row.startedAt ?? "unknown date")}${row.cwd ? ` · ${escapeHtml(row.cwd)}` : ""}</div><div class="muted">${escapeHtml(row.path)}</div><p>${highlight(row.snippet ?? "")}</p>`;
  item.querySelector("a")?.addEventListener("click", (event) => { event.preventDefault(); history.pushState(null, "", `/session/${encodeURIComponent(row.sessionId)}`); setTab("session"); });
  return item;
}

function renderSession(details: SessionDetails): void {
  const target = element<HTMLDivElement>("sessionDetails");
  const tools = details.usage.filter((entry) => entry.kind === "tool");
  const skills = details.usage.filter((entry) => entry.kind === "skill");
  target.innerHTML = `<p><a href="/">← Back to search</a></p><h3>${escapeHtml(details.title ?? "Untitled")}</h3><p class="muted">${escapeHtml(details.provider)} · ${escapeHtml(details.startedAt ?? "unknown date")} · ${details.isBatch ? "batch-like" : "non-batch"}</p><p><strong>Purpose:</strong> ${escapeHtml(details.purpose ?? "Unknown")}</p><p><strong>CWD:</strong> ${escapeHtml(details.cwd ?? "Unknown")}</p><p><strong>Path:</strong> ${escapeHtml(details.path)}</p><div class="cards"><div class="card"><strong>${details.turnCount}</strong><br />turns</div><div class="card"><strong>${details.toolUseCount}</strong><br />tool uses</div><div class="card"><strong>${details.skillUseCount}</strong><br />skill mentions</div><div class="card"><strong>${details.linkedSessions.length}</strong><br />linked sessions</div></div><h3>Turn activity</h3><p class="muted">Click a bar to jump to that turn. Tool/skill bars are heuristic; tables use indexed usage signals.</p><div class="chart-wrap"><canvas id="sessionTurnChart"></canvas></div><h3>Tools</h3><div id="sessionTools"></div><h3>Skills</h3><div id="sessionSkills"></div><h3>Linked subagent / nearby sessions</h3><div id="linkedSessions"></div><h3>Transcript</h3><div class="session-layout"><nav class="turn-sidebar" id="turnSidebar"></nav><div class="transcript" id="transcript"></div></div>`;
  target.querySelector("a")?.addEventListener("click", (event) => { event.preventDefault(); history.pushState(null, "", "/"); setTab("search"); });
  const turnCanvas = element<HTMLCanvasElement>("sessionTurnChart");
  turnChart = replaceChart(turnChart, turnCanvas, turnChartConfig(details.transcript));
  turnCanvas.addEventListener("click", (event) => {
    const rect = turnCanvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    highlightTurn(Math.max(1, Math.min(details.transcript.length, Math.round(ratio * details.transcript.length))));
  });
  drawUsageTable(tools, element<HTMLDivElement>("sessionTools"));
  drawUsageTable(skills, element<HTMLDivElement>("sessionSkills"));
  renderLinked(details.linkedSessions, element<HTMLDivElement>("linkedSessions"));
  renderTranscript(details.transcript);
}

function renderTranscript(items: TranscriptItem[]): void {
  const nav = element<HTMLElement>("turnSidebar");
  const transcript = element<HTMLElement>("transcript");
  nav.replaceChildren(); transcript.replaceChildren();
  for (const item of items) {
    const id = `turn-${item.index}`;
    const link = document.createElement("a");
    link.href = `#${id}`;
    link.innerHTML = `<span class="muted">#${item.index}</span> ${escapeHtml(item.role)}<br><span>${escapeHtml(item.content.slice(0, 90))}</span>`;
    link.addEventListener("click", (event) => { event.preventDefault(); highlightTurn(item.index); });
    nav.append(link);
    const card = document.createElement("article");
    card.id = id;
    card.className = `turn-card ${cssRole(item.role)}`;
    card.innerHTML = `<div class="turn-head"><strong>#${item.index}</strong><span>${escapeHtml(item.role)}</span><span>${item.toolCount} tools</span><span>${item.skillCount} skills</span></div><div class="turn-content">${escapeHtml(item.content)}</div>`;
    transcript.append(card);
  }
}

function usageChartConfig(points: UsagePoint[], names: string[]): ChartConfig {
  const labels = [...new Set(points.map((point) => point.bucket))].sort();
  return { type: "bar", data: { labels, datasets: names.map((name, index) => ({ label: name, data: labels.map((label) => points.find((point) => point.bucket === label && point.name === name)?.count ?? 0), backgroundColor: palette(index) })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "bottom" }, tooltip: { enabled: true } }, scales: { x: { title: { display: true, text: "Time bucket" }, stacked: false }, y: { title: { display: true, text: "Uses" }, beginAtZero: true } } } };
}

function turnChartConfig(items: TranscriptItem[]): ChartConfig {
  return { type: "bar", data: { labels: items.map((item) => `#${item.index}`), datasets: [{ label: "Tool signals", data: items.map((item) => item.toolCount), backgroundColor: "#66d9ef" }, { label: "Skill signals", data: items.map((item) => item.skillCount), backgroundColor: "#a6e22e" }] }, options: { responsive: true, maintainAspectRatio: false, onClick: (_event: unknown, elements: Array<{ index: number }>) => { const first = elements[0]; if (first) highlightTurn(first.index + 1); }, plugins: { legend: { display: true, position: "bottom" }, tooltip: { enabled: true } }, scales: { x: { title: { display: true, text: "Turn number" }, ticks: { maxTicksLimit: 20 } }, y: { title: { display: true, text: "Signals" }, beginAtZero: true } } } };
}

function replaceChart(current: ChartInstance | null, canvas: HTMLCanvasElement, config: ChartConfig): ChartInstance { current?.destroy(); return new Chart(canvas, config); }
function highlightTurn(index: number): void { document.querySelectorAll(".turn-card.highlight,.turn-sidebar a.active").forEach((node) => node.classList.remove("highlight", "active")); const card = document.getElementById(`turn-${index}`); card?.classList.add("highlight"); card?.scrollIntoView({ behavior: "auto", block: "center" }); element<HTMLElement>("turnSidebar").querySelectorAll("a")[index - 1]?.classList.add("active"); }
function palette(index: number): string { return `hsl(${(index * 47) % 360} 75% 62%)`; }
function cssRole(role: string): string { return role.toLowerCase().replace(/[^a-z0-9_-]/g, ""); }

function drawUsageTable(rows: UsageSummaryRow[], target: HTMLDivElement): void { if (!rows.length) { target.textContent = "No usage signals found."; return; } target.innerHTML = `<table><thead><tr><th>Name</th><th>Uses</th><th>Sessions</th></tr></thead><tbody>${rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.count}</td><td>${row.sessions}</td></tr>`).join("")}</tbody></table>`; }
function renderLinked(rows: SearchResult[], target: HTMLDivElement): void { if (!rows.length) { target.textContent = "No explicit linked or same-run subagent sessions found."; return; } target.innerHTML = rows.map((row) => `<div class="result"><a href="/session/${encodeURIComponent(row.sessionId)}">[${escapeHtml(row.provider)}] ${escapeHtml(row.title ?? "Untitled")}</a><div class="muted">${escapeHtml(row.reason ?? "linked")} · ${escapeHtml(row.startedAt ?? "unknown")} · ${escapeHtml(row.path)}</div></div>`).join(""); target.querySelectorAll("a").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); history.pushState(null, "", (event.currentTarget as HTMLAnchorElement).pathname); setTab("session"); })); }
function params(): URLSearchParams { const query = new URLSearchParams(); for (const key of ["query", "provider", "cwd", "startDate", "endDate", "batchMode", "limit"] as const) { const val = value(key); if (val) query.set(key, val); } const pathFilter = value("pathFilter"); if (pathFilter) query.set("path", pathFilter); return query; }
async function getJson<T>(url: string): Promise<T> { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30_000); try { const response = await fetch(url, { signal: controller.signal }); if (!response.ok) throw new Error(await response.text()); return response.json() as Promise<T>; } finally { clearTimeout(timeout); } }
function setBusy(busy: boolean, message?: string): void { runButton.disabled = busy; if (message) setStatus(message); }
function setStatus(message: string): void { element<HTMLElement>("statusLine").textContent = message; }
function elapsed(started: number): string { return `${Math.round(performance.now() - started)}ms`; }
function value(id: string): string { return element<HTMLInputElement | HTMLSelectElement>(id).value.trim(); }
function element<T extends HTMLElement>(id: string): T { const found = document.getElementById(id); if (!found) throw new Error(`Missing element ${id}`); return found as T; }
function escapeHtml(text: string): string { return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function highlight(text: string): string { return escapeHtml(text).replaceAll("[", '<span class="hit">').replaceAll("]", "</span>"); }
