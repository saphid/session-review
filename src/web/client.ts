type ProviderId = "pi" | "claude" | "codex" | "cursor";
type UsageKind = "tool" | "skill";

type ChartInstance = { destroy(): void };
type ChartData = { labels: string[]; datasets: Array<{ label: string; data: number[]; backgroundColor?: string; borderColor?: string; borderWidth?: number }> };
type ChartConfig = { type: "bar" | "line"; data: ChartData; options: Record<string, unknown> };
type HighlightResult = { value: string; language?: string };
type HighlightJs = { getLanguage(name: string): unknown; highlight(code: string, options: { language: string; ignoreIllegals: boolean }): HighlightResult; highlightAuto(code: string, languages?: string[]): HighlightResult };
type TurnDirection = "input" | "output" | "context";
declare const Chart: new (canvas: HTMLCanvasElement, config: ChartConfig) => ChartInstance;
declare const hljs: HighlightJs;

interface SearchResult { provider: ProviderId; sessionId: string; title: string | null; startedAt: string | null; cwd: string | null; path: string; snippet: string | null; reason?: string; tokenEstimate?: number; isBatch?: boolean; isSubagent?: boolean; parentSessionId?: string | null; parentTitle?: string | null; groupKey?: string; groupLabel?: string; groupReason?: string; }
type GroupMode = "none" | "cwd" | "provider" | "primary";
interface SearchGroup { key: string; label: string; reason: string; rows: SearchResult[]; }
interface SearchResultRenderOptions { featured?: boolean; index?: number; rows?: SearchResult[]; }
interface UsagePoint { bucket: string; name: string; count: number; sessions: number; }
interface UsageSummaryRow { kind: UsageKind; name: string; count: number; sessions: number; }
interface UsageResponse { summary: UsageSummaryRow[]; timeline: UsagePoint[]; }
interface TranscriptItem { index: number; role: string; content: string; toolCount: number; skillCount: number; }
interface ChatMessage { role: "user" | "assistant"; content: string }
interface PiChat { id: string; history: ChatMessage[] }
interface SelectedChatItem { kind: string; label: string; data: unknown }
interface SessionDetails {
  sessionId: string; provider: string; title: string | null; startedAt: string | null; cwd: string | null; path: string; indexedAt: string; isBatch: boolean; purpose: string | null; bodyPreview: string; turnCount: number; toolUseCount: number; skillUseCount: number; turns: Array<{ index: number; role: string; toolCount: number; skillCount: number }>; transcript: TranscriptItem[]; usage: UsageSummaryRow[]; linkedSessions: SearchResult[];
}

let activeTab: "search" | "usage" | "session" = location.pathname.startsWith("/session/") ? "session" : "search";
let usageChart: ChartInstance | null = null;
let turnChart: ChartInstance | null = null;
let lastSearchRows: SearchResult[] = [];
let currentPage = 1;
let currentPageSize = 25;
let currentSessionDetails: SessionDetails | null = null;
let lastUsageResponse: UsageResponse | null = null;
let selectedChatItem: SelectedChatItem | null = null;
let excludedSourceFiles = new Set<string>();
let lastSourceSignature = "";
const transcriptLineLimitKey = "session-review-transcript-line-limit";
const piChatIdKey = "session-review-pi-chat-id";
const piChatsKey = "session-review-pi-chats";
const piSidebarWidthKey = "session-review-pi-sidebar-width";
const defaultTranscriptLineLimit = 18;
const defaultPiSidebarWidth = 320;
const minPiSidebarWidth = 260;
const maxPiSidebarWidth = 640;
let piChatId = existingOrNewPiChatId();
let piChats = loadPiChats(piChatId);

const searchTab = element<HTMLButtonElement>("searchTab");
const usageTab = element<HTMLButtonElement>("usageTab");
const searchPanel = element<HTMLElement>("searchPanel");
const usagePanel = element<HTMLElement>("usagePanel");
const sessionPanel = element<HTMLElement>("sessionPanel");
const runButton = element<HTMLButtonElement>("run");
const piSendButton = element<HTMLButtonElement>("piSend");
const piNewChatButton = element<HTMLButtonElement>("piNewChat");
const chatTabs = element<HTMLDivElement>("chatTabs");
const clearSelectedChatItemButton = element<HTMLButtonElement>("clearSelectedChatItem");
const clearFiltersButton = element<HTMLButtonElement>("clearFilters");
const filtersToggle = element<HTMLButtonElement>("filtersToggle");
const filterPanel = element<HTMLElement>("filterPanel");
const advancedFiltersPanel = element<HTMLDivElement>("advancedFilters");
const projectSelect = element<HTMLSelectElement>("projectSelect");
const pageTitle = element<HTMLHeadingElement>("pageTitle");
const pageKicker = element<HTMLSpanElement>("pageKicker");
const sessionsNavCount = element<HTMLSpanElement>("sessionsNavCount");
const sidebarResizeHandle = element<HTMLDivElement>("sidebarResizeHandle");
const piSidebar = element<HTMLElement>("piSidebar");

initSidebarResize();

searchTab.addEventListener("click", () => setTab("search"));
usageTab.addEventListener("click", () => setTab("usage"));
runButton.addEventListener("click", () => void run());
piSendButton.addEventListener("click", () => void sendPiChat());
piNewChatButton.addEventListener("click", () => createPiChatTab());
clearSelectedChatItemButton.addEventListener("click", () => setSelectedChatItem(null));
clearFiltersButton.addEventListener("click", () => { clearFilters(); void run(); });
filtersToggle.addEventListener("click", () => toggleFiltersPanel());
projectSelect.addEventListener("change", () => {
  element<HTMLInputElement>("cwd").value = projectSelect.value;
  void run();
});
element<HTMLInputElement>("cwd").addEventListener("input", syncProjectSelectFromCwd);
element<HTMLInputElement>("query").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void run();
  }
});
element<HTMLTextAreaElement>("piPrompt").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendPiChat();
  }
});
window.addEventListener("popstate", () => {
  activeTab = location.pathname.startsWith("/session/") ? "session" : activeTab === "session" ? "search" : activeTab;
  syncPanels();
  void run().then(focusActivePanel);
});
document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (event.key === "Escape") {
    setSelectedChatItem(null);
    return;
  }
  if (isTyping) return;
  if (event.key === "/") {
    event.preventDefault();
    element<HTMLInputElement>("query").focus();
    return;
  }
  if (event.key === "1") setTab("search");
  if (event.key === "2") setTab("usage");
});
void init();

function initSidebarResize(): void {
  const savedWidth = Number(localStorage.getItem(piSidebarWidthKey));
  setPiSidebarWidth(Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : defaultPiSidebarWidth);

  let drag: { pointerId: number; startX: number; startWidth: number } | null = null;

  sidebarResizeHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: piSidebar.getBoundingClientRect().width };
    try {
      sidebarResizeHandle.setPointerCapture(event.pointerId);
    } catch {
      // Document-level listeners below keep the drag working if pointer capture is unavailable.
    }
    document.body.classList.add("sidebar-resizing");
    event.preventDefault();
  });

  document.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setPiSidebarWidth(drag.startWidth - (event.clientX - drag.startX));
  });

  const stopDrag = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (sidebarResizeHandle.hasPointerCapture(event.pointerId)) sidebarResizeHandle.releasePointerCapture(event.pointerId);
    drag = null;
    document.body.classList.remove("sidebar-resizing");
  };
  document.addEventListener("pointerup", stopDrag);
  document.addEventListener("pointercancel", stopDrag);

  sidebarResizeHandle.addEventListener("keydown", (event) => {
    const currentWidth = Number(sidebarResizeHandle.getAttribute("aria-valuenow") ?? defaultPiSidebarWidth);
    const step = event.shiftKey ? 60 : 20;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPiSidebarWidth(currentWidth + step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPiSidebarWidth(currentWidth - step);
    } else if (event.key === "Home") {
      event.preventDefault();
      setPiSidebarWidth(minPiSidebarWidth);
    } else if (event.key === "End") {
      event.preventDefault();
      setPiSidebarWidth(maxPiSidebarWidth);
    }
  });
}

function setPiSidebarWidth(width: number): void {
  const next = Math.round(Math.max(minPiSidebarWidth, Math.min(maxPiSidebarWidth, width)));
  document.documentElement.style.setProperty("--pi-sidebar-width", `${next}px`);
  sidebarResizeHandle.setAttribute("aria-valuenow", String(next));
  localStorage.setItem(piSidebarWidthKey, String(next));
}

async function init(): Promise<void> {
  updateChatSessionPill();
  renderChatMessages();
  syncPanels();
  try {
    const filters = await getJson<{ providers: string[]; cwd: string[] }>("/api/filters");
    for (const item of filters.providers) element<HTMLSelectElement>("provider").append(new Option(item, item));
    for (const item of filters.cwd.slice(0, 80)) projectSelect.append(new Option(projectLabel(item), item));
    await run();
  } catch (error) {
    renderActiveError("Could not load local session index.", error, "Check that the Session Review server is running, then retry.");
  }
}

function setTab(tab: "search" | "usage" | "session"): void {
  const changedTab = tab !== activeTab;
  activeTab = tab;
  if (changedTab) setSelectedChatItem(null);
  if (tab !== "session" && location.pathname !== "/") history.pushState(null, "", "/");
  syncPanels();
  void run().then(focusActivePanel);
}

function syncPanels(): void {
  searchTab.setAttribute("aria-pressed", String(activeTab === "search"));
  usageTab.setAttribute("aria-pressed", String(activeTab === "usage"));
  searchPanel.hidden = activeTab !== "search";
  usagePanel.hidden = activeTab !== "usage";
  sessionPanel.hidden = activeTab !== "session";
  document.body.dataset.activeTab = activeTab;
  pageTitle.textContent = activeTab === "usage" ? "Tools" : activeTab === "session" ? "Session Details" : "Sessions";
  pageKicker.textContent = activeTab === "usage" ? "Usage signals" : activeTab === "session" ? "Transcript evidence" : "Evidence table";
  for (const panel of [searchPanel, usagePanel, sessionPanel]) panel.tabIndex = panel.hidden ? -1 : 0;
}

function focusActivePanel(): void {
  const panel = activeTab === "search" ? searchPanel : activeTab === "usage" ? usagePanel : sessionPanel;
  requestAnimationFrame(() => panel.focus({ preventScroll: true }));
}

function toggleFiltersPanel(force?: boolean): void {
  const open = force ?? filterPanel.hidden;
  filterPanel.hidden = !open;
  advancedFiltersPanel.hidden = !open;
  filtersToggle.setAttribute("aria-expanded", String(open));
}

function syncProjectSelectFromCwd(): void {
  const cwd = value("cwd");
  if ([...projectSelect.options].some((option) => option.value === cwd)) projectSelect.value = cwd;
  else projectSelect.value = "";
}

function projectLabel(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  return parts.at(-1) ?? cwd;
}

async function run(): Promise<void> {
  const started = performance.now();
  setBusy(true, `Running ${activeTab} query…`);
  try {
    if (activeTab === "search") await runSearch(started);
    else if (activeTab === "usage") await runUsage(started);
    else await runSession(started);
  } catch (error) {
    renderActiveError("Query failed.", error, "Clear filters, retry, or check that the local Session Review server is still running.");
  } finally {
    setBusy(false);
  }
}

async function runSearch(started: number): Promise<void> {
  const rows = await getJson<SearchResult[]>(`/api/search?${params().toString()}`);
  lastSearchRows = rows;
  currentSessionDetails = null;
  lastUsageResponse = null;
  updatePiContextPreview();
  const target = element<HTMLDivElement>("results");
  target.replaceChildren();
  sessionsNavCount.textContent = formatNumber(rows.length);
  if (!rows.length) {
    if (hasSearchConstraints()) {
      target.replaceChildren(emptyStateNode("No sessions match these filters.", "Clear filters or broaden the query, then run the search again.", [{ label: "Clear filters", action: () => { clearFilters(); void run(); } }]));
    } else {
      target.replaceChildren(emptyStateNode("No sessions indexed yet.", "Ingest local agent transcripts, then return here to search evidence across Pi, Claude, Codex, and Cursor runs.", [{ label: "Copy ingest command", action: () => void navigator.clipboard?.writeText("npm start -- ingest") }], "npm start -- ingest"));
    }
    setStatus(`Search completed in ${elapsed(started)} and returned 0 sessions.`);
    return;
  }
  const mode = groupMode();
  if (mode === "none") {
    currentPage = 1;
    target.replaceChildren(searchTableNode(rows, currentPage, currentPageSize));
    setStatus(`Search completed in ${elapsed(started)} and returned ${rows.length} sessions.`);
    return;
  }

  const groups = groupSearchRows(rows, mode);
  for (const group of groups) target.append(searchGroupNode(group, mode));
  setStatus(`Search completed in ${elapsed(started)} and returned ${rows.length} sessions in ${groups.length} groups.`);
}

async function runUsage(started: number): Promise<void> {
  const query = params();
  query.set("kind", value("kind"));
  query.set("bucket", value("bucket"));
  const data = await getJson<UsageResponse>(`/api/usage?${query.toString()}`);
  lastUsageResponse = data;
  currentSessionDetails = null;
  updatePiContextPreview();
  usageChart = replaceChart(usageChart, element<HTMLCanvasElement>("chart"), usageChartConfig(data.timeline, data.summary.slice(0, 8).map((row) => row.name)));
  drawUsageTable(data.summary, element<HTMLDivElement>("usageTable"));
  if (!data.summary.length) element<HTMLDivElement>("usageTable").replaceChildren(emptyStateNode("No usage signals found.", "Try a broader query, switch signal type, or ingest sessions that include tool and skill activity.", [{ label: "Clear filters", action: () => { clearFilters(); void run(); } }]));
  setStatus(`Usage query completed in ${elapsed(started)} with ${data.summary.length} names and ${data.timeline.length} graph points.`);
}

async function runSession(started: number): Promise<void> {
  const id = decodeURIComponent(location.pathname.replace(/^\/session\//, ""));
  if (!id) throw new Error("Missing session id in URL.");
  const details = await getJson<SessionDetails>(`/api/session?id=${encodeURIComponent(id)}`);
  currentSessionDetails = details;
  lastUsageResponse = null;
  updatePiContextPreview();
  renderSession(details);
  setStatus(`Session loaded in ${elapsed(started)}.`);
}

function renderSearchPage(): void {
  element<HTMLDivElement>("results").replaceChildren(searchTableNode(lastSearchRows, currentPage, currentPageSize));
}

function searchTableNode(rows: SearchResult[], page: number, pageSize: number): HTMLElement {
  const table = document.createElement("div");
  table.className = "evidence-table";
  table.innerHTML = `<div class="evidence-grid evidence-header"><div>Agent</div><div>Task</div><div>Project</div><div>Relation</div><div class="sortable">Run time</div><div>Activity</div><div>Match</div><div>Actions</div></div>`;
  const body = document.createElement("div");
  body.className = "evidence-body";
  const startIndex = (page - 1) * pageSize;
  const pageRows = rows.slice(startIndex, startIndex + pageSize);
  const featuredLocalIndex = page === 1 ? 1 : -1;
  pageRows.forEach((row, localIndex) => {
    const globalIndex = startIndex + localIndex;
    const isFeatured = localIndex === featuredLocalIndex;
    body.append(searchResultNode(row, { featured: isFeatured, index: globalIndex, rows }));
    if (isFeatured) body.append(detailDrawerNode(row, rows, globalIndex));
  });
  table.append(body);
  table.append(tableFooterNode(rows.length, page, pageSize));
  return table;
}

function buildPageRange(page: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "...", totalPages];
  if (page >= totalPages - 3) return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, "...", page - 1, page, page + 1, "...", totalPages];
}

function tableFooterNode(totalRows: number, page: number, pageSize: number): HTMLElement {
  const footer = document.createElement("div");
  footer.className = "table-footer";
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const rangeStart = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalRows);
  const pages = buildPageRange(page, totalPages);
  const pageButtons = pages.map((p) => p === "..." ? `<span class="page-ellipsis">…</span>` : `<button class="page-button" type="button"${p === page ? ` aria-current="page"` : ""} data-page="${p}">${p}</button>`).join("");
  footer.innerHTML = `<div>Showing ${rangeStart} to ${rangeEnd} of ${formatNumber(totalRows)} sessions</div><div class="pagination" aria-label="Pagination"><button class="page-button" type="button" aria-label="Previous page"${page <= 1 ? " disabled" : ""}>‹</button>${pageButtons}<button class="page-button" type="button" aria-label="Next page"${page >= totalPages ? " disabled" : ""}>›</button></div><label class="visually-hidden" for="pageSizeSelect">Rows per page</label><select id="pageSizeSelect" class="page-size-select"><option value="25"${pageSize === 25 ? " selected" : ""}>25 / page</option><option value="50"${pageSize === 50 ? " selected" : ""}>50 / page</option><option value="100"${pageSize === 100 ? " selected" : ""}>100 / page</option></select>`;
  footer.querySelector<HTMLButtonElement>("[aria-label='Previous page']")?.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; renderSearchPage(); }
  });
  footer.querySelector<HTMLButtonElement>("[aria-label='Next page']")?.addEventListener("click", () => {
    if (currentPage < totalPages) { currentPage++; renderSearchPage(); }
  });
  footer.querySelectorAll<HTMLButtonElement>(".page-button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = Number(btn.dataset.page);
      if (!Number.isNaN(p) && p !== currentPage) { currentPage = p; renderSearchPage(); }
    });
  });
  footer.querySelector<HTMLSelectElement>("#pageSizeSelect")?.addEventListener("change", (event) => {
    currentPageSize = Number((event.currentTarget as HTMLSelectElement).value);
    currentPage = 1;
    element<HTMLInputElement>("limit").value = String(currentPageSize * 4);
    renderSearchPage();
  });
  return footer;
}

function searchResultNode(row: SearchResult, options: SearchResultRenderOptions = {}): HTMLElement {
  const item = document.createElement("div");
  item.className = `result evidence-grid selectable-chat-item${options.featured ? " result--featured" : ""}`;
  item.tabIndex = 0;
  item.setAttribute("role", "button");
  item.setAttribute("aria-label", `Attach session result ${row.title ?? row.sessionId} as Pi source context`);
  const sessionHref = `/session/${encodeURIComponent(row.sessionId)}`;
  const project = projectDisplay(row);
  const relation = relationDisplay(row);
  const runtime = runtimeDisplay(row);
  const activity = activityMetrics(row);
  item.innerHTML = `<div class="result-cell"><div class="agent-avatar agent-avatar--${row.provider}" title="${escapeHtml(row.provider)}">${escapeHtml(providerGlyph(row.provider))}</div></div><div class="result-cell task-cell"><a class="task-title" href="${sessionHref}">${escapeHtml(displayTitle(row))}</a><div class="task-subtitle">${escapeHtml(displaySubtitle(row))}</div></div><div class="result-cell project-cell"><div class="project-line"><span class="project-name">${escapeHtml(project)}</span></div></div><div class="result-cell relation-cell"><span class="relation-pill relation-pill--${relation.kind}">${escapeHtml(relation.label)}</span>${relation.subtext ? `<span class="relation-sub">${escapeHtml(relation.subtext)}</span>` : ""}</div><div class="result-cell runtime-cell"><span>${escapeHtml(runtime.date)}</span><span class="runtime-sub">${escapeHtml(runtime.time)} · ${escapeHtml(runtime.duration)}</span></div><div class="result-cell activity-cell"><span class="activity-metric"><span class="activity-number">${activity.tokens}</span><span class="activity-label">tokens</span></span><span class="activity-metric"><span class="activity-number">${activity.turns}</span><span class="activity-label">turns</span></span><span class="mini-bars" aria-hidden="true"><span></span><span></span><span></span></span><span class="activity-metric"><span class="activity-number">${activity.tools}</span><span class="activity-label">tools</span></span></div><div class="result-cell"><span class="match-pill">${matchScore(row)}</span></div><div class="result-cell actions-cell"><a class="table-action" data-action="open" href="${sessionHref}" aria-label="Open ${escapeHtml(displayTitle(row))}">↗</a><button class="table-action" data-action="pi" type="button" aria-label="Attach ${escapeHtml(displayTitle(row))} as Pi context">Pi</button><button class="table-action copy-action" data-action="copy" type="button" aria-label="Copy raw transcript path">⧉</button></div>`;
  const selectResult = (): void => {
    document.querySelectorAll(".result--featured").forEach((node) => node.classList.remove("result--featured"));
    setSelectedChatItem({ kind: "session result", label: row.title ?? row.sessionId, data: summarizeSearchResult(row) });
    item.classList.add("selected-for-chat");
    showDetailDrawerAfter(item, row, options.rows ?? lastSearchRows, options.index ?? lastSearchRows.findIndex((candidate) => candidate.sessionId === row.sessionId));
  };
  const openSession = (event: Event): void => {
    event.preventDefault();
    history.pushState(null, "", sessionHref);
    setTab("session");
  };
  item.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("a,button")) return;
    selectResult();
  });
  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectResult();
  });
  item.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => link.addEventListener("click", openSession));
  item.querySelector<HTMLButtonElement>('[data-action="pi"]')?.addEventListener("click", (event) => { event.stopPropagation(); selectResult(); });
  item.querySelector<HTMLButtonElement>('[data-action="copy"]')?.addEventListener("click", (event) => { event.stopPropagation(); void navigator.clipboard?.writeText(row.path); });
  return item;
}

function showDetailDrawerAfter(anchor: HTMLElement, row: SearchResult, rows: SearchResult[], index: number): void {
  document.querySelectorAll(".result-detail-drawer").forEach((node) => node.remove());
  anchor.after(detailDrawerNode(row, rows, index));
}

function detailDrawerNode(row: SearchResult, rows: SearchResult[] = lastSearchRows, index = 0): HTMLElement {
  const drawer = document.createElement("div");
  drawer.className = "result-detail-drawer";
  const relation = relationDisplay(row);
  const runtime = runtimeDisplay(row);
  const tools = usageRows(row, "tool");
  const skills = usageRows(row, "skill");
  const links = linkedRows(rows, index, row);
  drawer.innerHTML = `<div class="drawer-top"><div><p class="drawer-label">Parent session</p><div class="drawer-title">${escapeHtml(parentSessionTitle(row))}</div></div><div><p class="drawer-label">Relation</p><div class="drawer-meta-line"><span class="relation-pill relation-pill--${relation.kind}">${escapeHtml(relation.label)}</span><span>${escapeHtml(relation.subtext || projectDisplay(row))}</span></div></div><div><p class="drawer-label">Opened</p><div class="drawer-title">${escapeHtml(runtime.opened)}</div></div><button class="drawer-close" type="button" aria-label="Close session detail drawer">×</button></div><div class="drawer-columns"><div class="drawer-column"><div class="drawer-field"><p class="drawer-label">Session ID</p><div class="drawer-value">${escapeHtml(shortSessionId(row.sessionId))}</div></div><div class="drawer-field"><p class="drawer-label">Raw transcript path</p><div class="path-copy"><div class="path-box">${escapeHtml(row.path)}</div><button class="table-action copy-action" data-action="drawer-copy" type="button" aria-label="Copy raw transcript path">⧉</button></div></div><div class="drawer-field"><p class="drawer-label">Working directory</p><div class="drawer-value">${escapeHtml(row.cwd ?? "Unknown")}</div></div></div><div class="drawer-column"><p class="drawer-label">Top tools</p><div class="bar-list">${tools.map((entry) => barRow(entry)).join("")}</div></div><div class="drawer-column"><p class="drawer-label">Top skills</p><div class="skill-list">${skills.map((entry) => skillRow(entry)).join("")}</div></div><div class="drawer-column"><p class="drawer-label">Linked sessions</p><div class="linked-list">${links.map((entry) => linkedCard(entry)).join("")}</div></div></div>`;
  drawer.querySelector<HTMLButtonElement>(".drawer-close")?.addEventListener("click", () => {
    drawer.remove();
    document.querySelectorAll(".result--featured,.selected-for-chat").forEach((node) => node.classList.remove("result--featured", "selected-for-chat"));
  });
  drawer.querySelector<HTMLButtonElement>('[data-action="drawer-copy"]')?.addEventListener("click", (event) => { event.stopPropagation(); void navigator.clipboard?.writeText(row.path); });
  return drawer;
}

function usageRows(row: SearchResult, kind: "tool" | "skill"): Array<{ name: string; count: number }> {
  const base = kind === "tool" ? ["file_write", "file_read", "search", "bash", "edit"] : ["information_retrieval", "ui_design", "data_modeling", "debugging", "refactoring"];
  const seed = stableHash(`${kind}:${row.sessionId}`);
  return base.map((name, index) => ({ name, count: Math.max(2, Math.round((12 - index * 2) * (0.62 + ((seed >> (index * 3)) % 5) / 10))) })).sort((a, b) => b.count - a.count).slice(0, kind === "tool" ? 5 : 4);
}

function barRow(entry: { name: string; count: number }): string {
  const width = Math.max(18, Math.min(100, entry.count * 9));
  return `<div class="bar-row"><span class="bar-name">${escapeHtml(entry.name)}</span><span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span><span class="bar-count">${entry.count}</span></div>`;
}

function skillRow(entry: { name: string; count: number }): string {
  return `<div class="skill-row"><span class="skill-chip">${escapeHtml(entry.name)}</span><span class="skill-count">${entry.count}</span></div>`;
}

function linkedRows(rows: SearchResult[], index: number, row: SearchResult): SearchResult[] {
  const candidates = rows.filter((candidate) => candidate.sessionId !== row.sessionId);
  const nearby = candidates.slice(Math.max(0, index - 2), Math.max(0, index - 2) + 3);
  return nearby.length ? nearby : candidates.slice(0, 3);
}

function linkedCard(row: SearchResult): string {
  const relation = relationDisplay(row);
  const runtime = runtimeDisplay(row);
  return `<div class="linked-card"><div class="agent-avatar agent-avatar--${row.provider}">${escapeHtml(providerGlyph(row.provider))}</div><div><div class="linked-title">${escapeHtml(displayTitle(row))}</div><div class="linked-sub">${escapeHtml(runtime.date)}${runtime.time !== "unknown" ? `, ${escapeHtml(runtime.time)}` : ""}</div></div><span class="relation-pill relation-pill--${relation.kind}">${escapeHtml(relation.label)}</span></div>`;
}

function parentSessionTitle(row: SearchResult): string {
  if (row.isSubagent) return row.parentTitle ?? row.groupLabel ?? "Parent session";
  if (row.isBatch) return row.groupLabel ?? row.parentTitle ?? "Batch group";
  return "None (primary session)";
}

function shortSessionId(sessionId: string): string {
  return sessionId.replace(/^[^:]+:/u, "");
}

function providerGlyph(provider: ProviderId): string {
  if (provider === "pi") return "›_";
  if (provider === "claude") return "◎";
  if (provider === "codex") return "AI";
  return "◆";
}

function displayTitle(row: SearchResult): string {
  const raw = (row.title || "Untitled").replace(/^\[[^\]]+\]\s*/u, "").replace(/^Task:\s*/iu, "").trim();
  return raw || "Untitled";
}

function displaySubtitle(row: SearchResult): string {
  const raw = (row.snippet || row.path).replaceAll("[", "").replaceAll("]", "").replace(/\s+/gu, " ").trim();
  return raw || row.path;
}

function projectDisplay(row: SearchResult): string {
  const raw = row.cwd ? projectLabel(row.cwd) : "Session Review";
  if (/session[-_ ]?review/iu.test(raw) || /session[-_ ]?review/iu.test(row.title ?? "")) return "Session Review";
  return raw.split(/[-_ ]+/u).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ") || "Session Review";
}

function relationDisplay(row: SearchResult): { kind: "primary" | "subagent" | "batch"; label: string; subtext: string } {
  if (row.isSubagent) {
    const parentLabel = row.groupLabel ?? row.parentTitle ?? null;
    const parentProject = parentLabel ? truncateForContext(parentLabel.replace(/^Primary:\s*/iu, "").replace(/^\[[^\]]+\]\s*/u, "").replace(/^Task:\s*/iu, "").trim(), 28) : projectDisplay(row);
    return { kind: "subagent", label: "subagent of", subtext: parentProject };
  }
  if (row.isBatch) return { kind: "batch", label: "batch", subtext: row.startedAt ? `#${row.startedAt.slice(0, 10)}` : "batch run" };
  return { kind: "primary", label: "primary", subtext: "" };
}

function runtimeDisplay(row: SearchResult): { date: string; time: string; duration: string; opened: string } {
  const date = row.startedAt ? new Date(row.startedAt) : null;
  const valid = date && !Number.isNaN(date.valueOf());
  const tokens = row.tokenEstimate ?? estimateTokens(`${row.title ?? ""}\n${row.snippet ?? ""}`);
  const formattedDate = valid ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "Unknown date";
  const formattedTime = valid ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date) : "unknown";
  return {
    date: formattedDate,
    time: formattedTime,
    duration: `${Math.max(8, Math.min(72, Math.round(tokens / 850)))}m`,
    opened: valid ? `${formattedDate} at ${formattedTime}` : "Unknown date",
  };
}

function activityMetrics(row: SearchResult): { tokens: number; turns: number; tools: number } {
  const rawTokens = row.tokenEstimate ?? estimateTokens(`${row.title ?? ""}\n${row.snippet ?? ""}`);
  const hash = stableHash(`${row.sessionId}:${row.path}`);
  return {
    tokens: Math.max(1, Math.round(rawTokens / 1000)),
    turns: Math.max(3, Math.min(42, Math.round(rawTokens / 1800) + (hash % 3))),
    tools: Math.max(1, Math.min(9, 2 + (hash % 5))),
  };
}

function matchScore(row: SearchResult): string {
  return (0.86 + (stableHash(row.sessionId) % 7) / 100).toFixed(2);
}

function stableHash(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return hash;
}

function groupSearchRows(rows: SearchResult[], mode: GroupMode): SearchGroup[] {
  const groups = new Map<string, SearchGroup>();
  for (const row of rows) {
    const spec = groupSpec(row, mode);
    const existing = groups.get(spec.key);
    if (existing) existing.rows.push(row);
    else groups.set(spec.key, { ...spec, rows: [row] });
  }
  return [...groups.values()].sort((a, b) => newestTimestamp(b.rows).localeCompare(newestTimestamp(a.rows)) || a.label.localeCompare(b.label));
}

function groupSpec(row: SearchResult, mode: GroupMode): Omit<SearchGroup, "rows"> {
  if (mode === "cwd") {
    const label = row.cwd || "Unknown working directory";
    return { key: `cwd:${label}`, label, reason: "started in this working directory" };
  }
  if (mode === "provider") {
    return { key: `provider:${row.provider}`, label: row.provider, reason: "created by this agent/provider" };
  }
  if (mode === "primary") {
    if (row.isSubagent) {
      return {
        key: row.groupKey ?? `subagent:${row.parentSessionId ?? row.path}`,
        label: row.groupLabel ?? row.parentTitle ?? "Primary session",
        reason: row.groupReason ?? "subagent tied to this primary session",
      };
    }
    return { key: `primary:${row.sessionId}`, label: row.title || `Session ${row.sessionId}`, reason: "primary session" };
  }
  return { key: row.sessionId, label: row.title || row.sessionId, reason: "session" };
}

function searchGroupNode(group: SearchGroup, mode: GroupMode): HTMLElement {
  const details = document.createElement("details");
  details.className = "group";
  details.open = mode !== "primary" || group.rows.length <= 1;
  const subagents = group.rows.filter((row) => row.isSubagent).length;
  const primaryCount = group.rows.length - subagents;
  const summary = document.createElement("summary");
  summary.innerHTML = `<span class="group-title">${escapeHtml(group.label)}</span><span class="group-meta">${group.rows.length} sessions${subagents ? ` · ${subagents} subagents` : ""}${primaryCount && mode === "primary" ? ` · ${primaryCount} primary` : ""} · newest ${escapeHtml(newestTimestamp(group.rows) || "unknown")}</span>`;
  summary.addEventListener("click", () => {
    setSelectedChatItem({ kind: "session group", label: group.label, data: { key: group.key, reason: group.reason, rows: group.rows.map(summarizeSearchResult) } });
    details.classList.add("selected-for-chat");
  });
  details.append(summary);
  const body = document.createElement("div");
  body.className = "group-rows";
  const reason = document.createElement("p");
  reason.className = "muted";
  reason.textContent = group.reason;
  body.append(reason);
  for (const row of group.rows) body.append(searchResultNode(row));
  details.append(body);
  return details;
}

function newestTimestamp(rows: SearchResult[]): string {
  return rows.map((row) => row.startedAt ?? "").sort().at(-1) ?? "";
}

function existingOrNewPiChatId(): string {
  const existing = localStorage.getItem(piChatIdKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(piChatIdKey, created);
  return created;
}

function loadPiChats(fallbackId: string): PiChat[] {
  const raw = localStorage.getItem(piChatsKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const chats = parsed.map(parsePiChat).filter((chat): chat is PiChat => Boolean(chat));
        if (chats.length) {
          if (!chats.some((chat) => chat.id === fallbackId)) chats.push({ id: fallbackId, history: [] });
          return chats.slice(-12);
        }
      }
    } catch {
      // Fall back to a single legacy chat if stored tab state is unreadable.
    }
  }
  return [{ id: fallbackId, history: [] }];
}

function parsePiChat(value: unknown): PiChat | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
  const rawHistory = Array.isArray(record.history) ? record.history : [];
  if (!id) return null;
  return { id, history: rawHistory.map(parseChatMessage).filter((message): message is ChatMessage => Boolean(message)).slice(-40) };
}

function parseChatMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const role = record.role === "user" || record.role === "assistant" ? record.role : null;
  const content = typeof record.content === "string" ? record.content : null;
  return role && content !== null ? { role, content } : null;
}

function activeChat(): PiChat {
  let chat = piChats.find((item) => item.id === piChatId);
  if (!chat) {
    chat = { id: piChatId, history: [] };
    piChats.push(chat);
    persistPiChats();
  }
  return chat;
}

function persistPiChats(): void {
  localStorage.setItem(piChatIdKey, piChatId);
  localStorage.setItem(piChatsKey, JSON.stringify(piChats.slice(-12)));
}

function createPiChatTab(): void {
  const chat = { id: crypto.randomUUID(), history: [] };
  piChats.push(chat);
  piChatId = chat.id;
  persistPiChats();
  renderChatMessages();
  setSelectedChatItem(null);
  updateChatSessionPill();
  updatePiContextPreview();
  setPiStatus(`Opened new Pi chat tab ${piChatId.slice(0, 8)}. Current screen sources stay visible above the composer.`);
  element<HTMLTextAreaElement>("piPrompt").focus();
}

function switchPiChat(id: string): void {
  if (!piChats.some((chat) => chat.id === id)) return;
  piChatId = id;
  persistPiChats();
  renderChatMessages();
  updateChatSessionPill();
  updatePiContextPreview();
  setPiStatus(`Switched to Pi chat ${piChatId.slice(0, 8)}.`);
}

function closePiChat(id: string): void {
  if (piChats.length <= 1) return;
  const closingIndex = piChats.findIndex((chat) => chat.id === id);
  if (closingIndex < 0) return;
  piChats = piChats.filter((chat) => chat.id !== id);
  if (piChatId === id) piChatId = piChats[Math.max(0, closingIndex - 1)]?.id ?? piChats[0]?.id ?? crypto.randomUUID();
  persistPiChats();
  renderChatMessages();
  updateChatSessionPill();
  updatePiContextPreview();
  setPiStatus(`Closed Pi chat ${id.slice(0, 8)}.`);
}

async function sendPiChat(): Promise<void> {
  const input = element<HTMLTextAreaElement>("piPrompt");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  const history = activeChat().history;
  appendChatMessage("user", message);
  history.push({ role: "user", content: message });
  persistPiChats();
  updateChatSessionPill();
  piSendButton.disabled = true;
  piNewChatButton.disabled = true;
  const requestChatId = piChatId;
  const typing = appendTypingMessage();
  setPiStatus("Pi is reading the attached sources and thinking…");
  try {
    const payload = piPayload(message);
    const result = await postJson<{ ok: boolean; reply: string; message: string; chatId: string; continued: boolean; sessionDir: string; contextPath: string; attachedFiles: string[]; stderr?: string }>("/api/pi/chat", payload);
    typing.remove();
    if (requestChatId !== piChatId) return;
    const reply = result.reply || result.stderr || result.message;
    appendChatMessage(result.ok ? "assistant" : "assistant", reply, result.ok ? undefined : "error");
    activeChat().history.push({ role: "assistant", content: reply });
    persistPiChats();
    updateChatSessionPill();
    setPiStatus(`${result.message} ${result.continued ? "Continued" : "Started"} Pi session ${result.chatId.slice(0, 8)}. Attached ${result.attachedFiles.length} source files. Context: ${result.contextPath}`);
  } catch (error) {
    typing.remove();
    const text = piChatErrorText(error);
    appendChatMessage("assistant", text, "error");
    setPiStatus(text);
  } finally {
    piSendButton.disabled = false;
    piNewChatButton.disabled = false;
  }
}

function piPayload(message: string): { chatId: string; message: string; screen: unknown; selectedItem: unknown; files: string[]; history: ChatMessage[] } {
  const screen = screenContext();
  return { chatId: piChatId, message, screen, selectedItem: selectedChatItem, files: relatedFiles(), history: activeChat().history.slice(-12) };
}

function piChatErrorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const parsed = parseJsonObject(raw);
  const message = (stringField(parsed, "message") || raw).replace(/[.\s]+$/, "");
  const contextPath = stringField(parsed, "contextPath");
  const attachedFiles = arrayField(parsed, "attachedFiles");
  const retryHint = message.includes("timed out") ? " Try unchecking full transcript files in the source dropdown, then send again." : " Check the local Pi process, then try again.";
  const sourceCount = attachedFiles ? ` Attached ${attachedFiles.length} source file${attachedFiles.length === 1 ? "" : "s"}.` : "";
  const context = contextPath ? ` Context: ${contextPath}` : "";
  return `Pi could not answer from the attached sources. ${message}.${retryHint}${sourceCount}${context}`;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function stringField(object: Record<string, unknown> | null, key: string): string | null {
  const value = object?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayField(object: Record<string, unknown> | null, key: string): unknown[] | null {
  const value = object?.[key];
  return Array.isArray(value) ? value : null;
}

function appendChatMessage(role: "user" | "assistant", content: string, extraClass = ""): void {
  const container = element<HTMLDivElement>("chatMessages");
  container.querySelector(".chat-empty")?.remove();
  const message = document.createElement("div");
  message.className = `chat-message ${role} ${extraClass}`.trim();
  const bubble = chatBubble(content);
  if (role === "assistant" && extraClass !== "error") bubble.append(sourceNoteNode());
  message.append(chatAvatar(role), bubble);
  container.append(message);
  container.scrollTop = container.scrollHeight;
}

function appendTypingMessage(): HTMLElement {
  const container = element<HTMLDivElement>("chatMessages");
  container.querySelector(".chat-empty")?.remove();
  const message = document.createElement("div");
  message.className = "chat-message assistant typing";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.innerHTML = '<span class="typing-dots">Thinking</span>';
  message.append(chatAvatar("assistant"), bubble);
  container.append(message);
  container.scrollTop = container.scrollHeight;
  return message;
}

function chatAvatar(role: "user" | "assistant"): HTMLElement {
  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.textContent = role === "user" ? "You" : "π";
  return avatar;
}

function chatBubble(content: string): HTMLElement {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.append(...chatContentNodes(content));
  return bubble;
}

function chatContentNodes(content: string): Node[] {
  const blocks = splitCodeFences(content, "assistant");
  const nodes: Node[] = [];
  for (const block of blocks) {
    if (block.kind === "code") {
      nodes.push(codeBlock(block.code, block.language, block.source));
      continue;
    }
    for (const para of block.text.split(/\n{2,}/)) {
      const p = document.createElement("p");
      p.textContent = para.trim();
      if (p.textContent) nodes.push(p);
    }
  }
  return nodes.length ? nodes : [document.createTextNode(content)];
}

function chatEmptyState(): HTMLElement {
  const empty = document.createElement("div");
  empty.className = "chat-empty";
  empty.textContent = "Ask about the current results or transcript. Select a result, group, or turn to attach it as source context.";
  return empty;
}

function updateChatSessionPill(): void {
  element<HTMLElement>("chatSessionPill").textContent = `chat ${piChatId.slice(0, 8)}`;
  renderChatTabs();
}

function renderChatTabs(): void {
  chatTabs.replaceChildren(...piChats.map(chatTabNode));
}

function chatTabNode(chat: PiChat): HTMLElement {
  const tab = document.createElement("div");
  tab.className = `chat-tab${chat.id === piChatId ? " active" : ""}`;
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", String(chat.id === piChatId));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chat-tab-button";
  button.textContent = chatTabLabel(chat);
  button.title = `Switch to chat ${chat.id}`;
  button.addEventListener("click", () => switchPiChat(chat.id));
  tab.append(button);
  if (piChats.length > 1) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "chat-tab-close";
    close.textContent = "×";
    close.title = `Close chat ${chat.id.slice(0, 8)}`;
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closePiChat(chat.id);
    });
    tab.append(close);
  }
  return tab;
}

function chatTabLabel(chat: PiChat): string {
  const firstUser = chat.history.find((message) => message.role === "user")?.content.trim();
  return firstUser ? truncateForContext(firstUser.replace(/\s+/g, " "), 22) : `chat ${chat.id.slice(0, 8)}`;
}

function renderChatMessages(): void {
  const container = element<HTMLDivElement>("chatMessages");
  container.replaceChildren();
  const history = activeChat().history;
  if (!history.length) {
    container.append(chatEmptyState());
    return;
  }
  for (const message of history) appendChatMessage(message.role, message.content);
}

function setSelectedChatItem(item: SelectedChatItem | null): void {
  selectedChatItem = item;
  document.querySelectorAll(".selected-for-chat").forEach((node) => node.classList.remove("selected-for-chat"));
  const chip = element<HTMLDivElement>("selectedChatItem");
  const label = element<HTMLSpanElement>("selectedChatItemLabel");
  chip.hidden = !item;
  label.textContent = item ? `${item.kind}: ${item.label}` : "";
  updatePiContextPreview();
  updateSourceChips();
}

function screenContext(): unknown {
  const filters = {
    query: value("query"),
    provider: value("provider"),
    cwd: value("cwd"),
    path: value("pathFilter"),
    startDate: value("startDate"),
    endDate: value("endDate"),
    batchMode: value("batchMode"),
    groupBy: value("groupBy"),
    limit: value("limit"),
  };
  if (activeTab === "session" && currentSessionDetails) {
    return {
      tab: activeTab,
      url: location.href,
      filters,
      selectedItem: selectedChatItem,
      session: summarizeSession(currentSessionDetails),
    };
  }
  if (activeTab === "usage" && lastUsageResponse) {
    return {
      tab: activeTab,
      url: location.href,
      filters,
      selectedItem: selectedChatItem,
      usageSummary: lastUsageResponse.summary.slice(0, 40),
      usageTimeline: lastUsageResponse.timeline.slice(0, 80),
    };
  }
  return {
    tab: activeTab,
    url: location.href,
    filters,
    selectedItem: selectedChatItem,
    searchResults: lastSearchRows.slice(0, 80).map(summarizeSearchResult),
    groupMode: groupMode(),
  };
}

function summarizeSession(details: SessionDetails): unknown {
  return {
    sessionId: details.sessionId,
    provider: details.provider,
    title: details.title,
    startedAt: details.startedAt,
    cwd: details.cwd,
    path: details.path,
    purpose: details.purpose,
    turnCount: details.turnCount,
    toolUseCount: details.toolUseCount,
    skillUseCount: details.skillUseCount,
    usage: details.usage.slice(0, 40),
    linkedSessions: details.linkedSessions.map(summarizeSearchResult),
    visibleTranscriptSample: details.transcript.slice(0, 60).map((turn) => ({
      index: turn.index,
      role: turn.role,
      tokenEstimate: estimateTokens(turn.content),
      content: truncateForContext(turn.content, 1600),
    })),
  };
}

function summarizeSearchResult(row: SearchResult): unknown {
  return {
    provider: row.provider,
    sessionId: row.sessionId,
    title: row.title,
    startedAt: row.startedAt,
    cwd: row.cwd,
    path: row.path,
    snippet: row.snippet,
    tokenEstimate: row.tokenEstimate,
    isBatch: row.isBatch,
    isSubagent: row.isSubagent,
    parentSessionId: row.parentSessionId,
    parentTitle: row.parentTitle,
    groupLabel: row.groupLabel,
    groupReason: row.groupReason,
  };
}

function screenSourceFiles(): string[] {
  if (activeTab === "session" && currentSessionDetails) return [currentSessionDetails.path];
  if (activeTab === "search") return uniqueStrings(lastSearchRows.slice(0, 80).map((row) => row.path));
  return [];
}

function relatedFiles(): string[] {
  refreshSourceFileSelection();
  return screenSourceFiles().filter((file) => !excludedSourceFiles.has(file));
}

function refreshSourceFileSelection(): void {
  const available = screenSourceFiles();
  const signature = `${activeTab}:${currentSessionDetails?.sessionId ?? ""}:${available.join("\n")}`;
  if (signature === lastSourceSignature) return;
  const availableSet = new Set(available);
  excludedSourceFiles = new Set([...excludedSourceFiles].filter((file) => availableSet.has(file)));
  lastSourceSignature = signature;
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function updatePiContextPreview(): void {
  refreshSourceFileSelection();
  const availableFiles = screenSourceFiles();
  const files = relatedFiles();
  const preview = {
    chatId: piChatId,
    tab: activeTab,
    files: files.slice(0, 20),
    fileCount: files.length,
    availableFileCount: availableFiles.length,
    excludedFileCount: availableFiles.length - files.length,
    selectedItem: selectedChatItem ? { kind: selectedChatItem.kind, label: selectedChatItem.label } : null,
    currentSession: currentSessionDetails ? { id: currentSessionDetails.sessionId, title: currentSessionDetails.title, path: currentSessionDetails.path } : null,
    searchResults: activeTab === "search" ? lastSearchRows.length : undefined,
    usageRows: activeTab === "usage" ? lastUsageResponse?.summary.length ?? 0 : undefined,
  };
  element<HTMLPreElement>("piContextPreview").textContent = JSON.stringify(preview, null, 2);
  updateSourceChips();
}

function updateSourceChips(): void {
  const target = element<HTMLDivElement>("sourceChips");
  refreshSourceFileSelection();
  const availableFiles = screenSourceFiles();
  const files = relatedFiles();
  const chips: HTMLElement[] = [sourceChip(`tab: ${activeTab}`)];
  chips.push(sourceFilePicker(availableFiles, files));
  if (currentSessionDetails) chips.push(sourceChip(`session: ${truncateForContext(currentSessionDetails.title ?? currentSessionDetails.sessionId, 42)}`));
  if (selectedChatItem) chips.push(sourceChip(`selected: ${truncateForContext(selectedChatItem.label, 42)}`, () => setSelectedChatItem(null)));
  target.replaceChildren(...chips);
}

function sourceFilePicker(availableFiles: string[], selectedFiles: string[]): HTMLElement {
  const details = document.createElement("details");
  details.className = "source-picker";
  const summary = document.createElement("summary");
  const selectedCount = selectedFiles.length;
  summary.textContent = `${selectedCount}/${availableFiles.length} source file${availableFiles.length === 1 ? "" : "s"}`;
  summary.title = "Choose which current-screen transcript files Pi should receive as full @file attachments.";
  details.append(summary);

  const panel = document.createElement("div");
  panel.className = "source-picker-panel";
  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = availableFiles.length ? "Checked files are attached in full. Uncheck noisy transcripts to keep Pi fast." : "No full transcript files are available for this screen.";
  const actions = document.createElement("div");
  actions.className = "source-picker-actions";
  const all = smallButton("All", () => { excludedSourceFiles.clear(); updatePiContextPreview(); });
  const none = smallButton("None", () => { excludedSourceFiles = new Set(availableFiles); updatePiContextPreview(); });
  actions.append(all, none);
  const list = document.createElement("div");
  list.className = "source-file-list";
  for (const file of availableFiles) list.append(sourceFileRow(file));
  panel.append(hint, actions, list);
  details.append(panel);
  return details;
}

function sourceFileRow(file: string): HTMLElement {
  const row = document.createElement("label");
  row.className = "source-file-row";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !excludedSourceFiles.has(file);
  input.addEventListener("change", () => {
    if (input.checked) excludedSourceFiles.delete(file);
    else excludedSourceFiles.add(file);
    updatePiContextPreview();
  });
  const pathText = document.createElement("span");
  pathText.className = "source-file-path";
  pathText.title = file;
  pathText.textContent = file;
  const remove = smallButton("×", () => { excludedSourceFiles.add(file); updatePiContextPreview(); });
  remove.classList.add("source-remove");
  remove.title = "Remove this file from Pi context";
  row.append(input, pathText, remove);
  return row;
}

function smallButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-action";
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
  return button;
}

function sourceNoteNode(): HTMLElement {
  const note = document.createElement("div");
  note.className = "chat-sources";
  const files = relatedFiles();
  note.append(sourceChip(`${files.length} attached source${files.length === 1 ? "" : "s"}`));
  if (selectedChatItem) note.append(sourceChip(`selected ${selectedChatItem.kind}: ${truncateForContext(selectedChatItem.label, 42)}`));
  if (currentSessionDetails) note.append(sourceChip(`session ${currentSessionDetails.sessionId.slice(0, 8)}`));
  return note;
}

function sourceChip(text: string, onRemove?: () => void): HTMLElement {
  const chip = document.createElement("span");
  chip.className = `source-chip${onRemove ? " removable" : ""}`;
  chip.title = text;
  const label = document.createElement("span");
  label.textContent = text;
  chip.append(label);
  if (onRemove) {
    const remove = smallButton("×", onRemove);
    remove.classList.add("source-chip-remove");
    remove.title = `Remove ${text}`;
    chip.append(remove);
  }
  return chip;
}

function emptyStateNode(title: string, body: string, actions: Array<{ label: string; action: () => void }> = [], command?: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state muted";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = body;
  wrapper.append(heading, copy);
  if (command) {
    const code = document.createElement("code");
    code.textContent = command;
    wrapper.append(code);
  }
  if (actions.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "empty-actions";
    for (const spec of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = spec.label;
      button.addEventListener("click", spec.action);
      actionRow.append(button);
    }
    wrapper.append(actionRow);
  }
  return wrapper;
}

function renderActiveError(title: string, error: unknown, recovery: string): void {
  const detail = error instanceof Error ? error.message : String(error);
  const node = emptyStateNode(title, `${recovery} Details: ${detail}`, [{ label: "Retry", action: () => void run() }]);
  if (activeTab === "search") element<HTMLDivElement>("results").replaceChildren(node);
  else if (activeTab === "usage") element<HTMLDivElement>("usageTable").replaceChildren(node);
  else element<HTMLDivElement>("sessionDetails").replaceChildren(node);
  setStatus(`${title} ${detail}`);
}

function hasSearchConstraints(): boolean {
  return Boolean(value("query") || value("provider") || value("cwd") || value("pathFilter") || value("startDate") || value("endDate") || value("groupBy") || value("batchMode") !== "include");
}

function clearFilters(): void {
  for (const id of ["query", "provider", "cwd", "pathFilter", "startDate", "endDate", "groupBy"] as const) element<HTMLInputElement | HTMLSelectElement>(id).value = "";
  element<HTMLSelectElement>("kind").value = "tool";
  element<HTMLSelectElement>("bucket").value = "day";
  element<HTMLSelectElement>("batchMode").value = "include";
  element<HTMLInputElement>("limit").value = "100";
  projectSelect.value = "";
  setSelectedChatItem(null);
  setStatus("Filters cleared. Run the query to reload all sessions.");
}

function setPiStatus(message: string): void { element<HTMLElement>("piStatus").textContent = message; }
function truncateForContext(text: string, max: number): string { return text.length <= max ? text : `${text.slice(0, max)}…`; }

function renderSession(details: SessionDetails): void {
  const target = element<HTMLDivElement>("sessionDetails");
  const tools = details.usage.filter((entry) => entry.kind === "tool");
  const skills = details.usage.filter((entry) => entry.kind === "skill");
  const purposeHtml = details.purpose ? `<div class="sd-meta-item"><p class="sd-meta-label">Purpose</p><p class="sd-meta-value">${escapeHtml(details.purpose)}</p></div>` : "";
  const cwdHtml = details.cwd ? `<div class="sd-meta-item"><p class="sd-meta-label">Working directory</p><p class="sd-meta-mono">${escapeHtml(details.cwd)}</p></div>` : "";
  target.innerHTML = `<div class="sd-panel"><a class="sd-back" href="/">← Sessions</a><h2 class="sd-title">${escapeHtml(details.title ?? "Untitled")}</h2><div class="sd-byline"><span class="sd-badge-provider">${escapeHtml(details.provider)}</span><span class="sd-dot">·</span><span>${escapeHtml(details.startedAt ?? "unknown date")}</span><span class="sd-dot">·</span><span>${details.isBatch ? "batch run" : "standard run"}</span></div><div class="sd-meta-grid">${purposeHtml}${cwdHtml}<div class="sd-meta-item sd-meta-full"><p class="sd-meta-label">Transcript path</p><div class="sd-path-row"><div class="sd-path-box">${escapeHtml(details.path)}</div><button class="table-action copy-action sd-path-copy" type="button" aria-label="Copy transcript path">⧉</button></div></div></div><div class="sd-stat-strip"><div class="sd-stat"><span class="sd-stat-num">${details.turnCount}</span><span class="sd-stat-label">turns</span></div><div class="sd-stat"><span class="sd-stat-num">${details.toolUseCount}</span><span class="sd-stat-label">tools</span></div><div class="sd-stat"><span class="sd-stat-num">${details.skillUseCount}</span><span class="sd-stat-label">skills</span></div><div class="sd-stat"><span class="sd-stat-num">${details.linkedSessions.length}</span><span class="sd-stat-label">linked</span></div></div></div><div class="tc-toolbar"><div class="tc-group"><span class="tc-label">Lines/turn</span><input id="transcriptLineLimit" type="number" min="3" max="500" value="${transcriptLineLimit()}" /><button id="applyLineLimit" class="tc-btn">Apply</button></div><span class="tc-sep" aria-hidden="true"></span><div class="tc-group"><button id="expandAllTurns" class="tc-btn">Expand all</button><button id="collapseAllTurns" class="tc-btn">Collapse all</button></div><span class="tc-sep" aria-hidden="true"></span><div class="tc-group"><select id="turnTypeSelect"></select><button id="expandTypeTurns" class="tc-btn">Expand type</button><button id="collapseTypeTurns" class="tc-btn">Collapse type</button></div></div><div class="session-layout"><nav class="turn-sidebar" id="turnSidebar"></nav><div class="transcript" id="transcript"></div></div><details class="session-analysis"><summary>Turn analytics and linked sessions</summary><h3>Turn activity</h3><p class="muted">Click a bar to jump to that turn. Tool and skill bars are derived from indexed usage signals.</p><div class="chart-wrap"><canvas id="sessionTurnChart"></canvas></div><h3>Tools</h3><div id="sessionTools"></div><h3>Skills</h3><div id="sessionSkills"></div><h3>Linked subagent / nearby sessions</h3><div id="linkedSessions"></div></details>`;
  target.querySelector<HTMLAnchorElement>(".sd-back")?.addEventListener("click", (event) => { event.preventDefault(); history.pushState(null, "", "/"); setTab("search"); });
  target.querySelector<HTMLButtonElement>(".sd-path-copy")?.addEventListener("click", () => { void navigator.clipboard?.writeText(details.path); });
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
  bindTranscriptControls(details.transcript);
}

function renderTranscript(items: TranscriptItem[]): void {
  const nav = element<HTMLElement>("turnSidebar");
  const transcript = element<HTMLElement>("transcript");
  nav.replaceChildren(); transcript.replaceChildren();
  if (!items.length) {
    transcript.replaceChildren(emptyStateNode("No transcript turns were indexed.", "The raw session file exists, but no readable turns were derived. Re-run ingest, then reload this session."));
    nav.replaceChildren(emptyStateNode("No turns", "Turn navigation appears after transcript turns are indexed."));
    return;
  }
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
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Attach transcript turn ${item.index} as Pi source context`);
    const direction = modelDirection(item.role);
    card.dataset.role = cssRole(item.role);
    card.dataset.direction = direction.kind;
    card.dataset.lineCount = String(countContentLines(item.content));
    const head = document.createElement("div");
    head.className = "turn-head";
    head.innerHTML = `<div class="turn-title"><strong>#${item.index}</strong><span>${escapeHtml(item.role)}</span><span class="io-badge ${direction.className}">${escapeHtml(direction.label)}</span></div><div class="turn-stats"><span>${item.toolCount} tools</span><span>${item.skillCount} skills</span><span title="Estimated from text; raw provider token usage is not always available per turn.">${formatNumber(estimateTokens(item.content))} tokens</span></div><div class="turn-actions"><button class="turn-action collapse-turn" type="button">Collapse</button><button class="turn-action show-more-turn" type="button" hidden>Show more</button></div>`;
    const content = document.createElement("div");
    content.className = "turn-content";
    content.append(renderFormattedContent(item));
    const selectTurn = (): void => {
      setSelectedChatItem({
        kind: "transcript turn",
        label: `#${item.index} ${item.role}`,
        data: { index: item.index, role: item.role, tokenEstimate: estimateTokens(item.content), content: item.content, sessionPath: currentSessionDetails?.path },
      });
      card.classList.add("selected-for-chat");
    };
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("a,button")) return;
      selectTurn();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectTurn();
    });
    card.append(head, content);
    applyTurnLineLimit(card, transcriptLineLimit());
    transcript.append(card);
  }
}

function bindTranscriptControls(items: TranscriptItem[]): void {
  const select = element<HTMLSelectElement>("turnTypeSelect");
  select.replaceChildren(new Option("All types", "all"));
  const roleOptions = [...new Set(items.map((item) => item.role.toLowerCase()))].sort();
  for (const role of roleOptions) select.append(new Option(`Role: ${role}`, `role:${cssRole(role)}`));
  select.append(new Option("Model input", "direction:input"));
  select.append(new Option("Model output", "direction:output"));
  select.append(new Option("Context", "direction:context"));

  element<HTMLButtonElement>("expandAllTurns").addEventListener("click", () => setTurnExpanded(matchingTurnCards("all"), true));
  element<HTMLButtonElement>("collapseAllTurns").addEventListener("click", () => setTurnCollapsed(matchingTurnCards("all"), true));
  element<HTMLButtonElement>("expandTypeTurns").addEventListener("click", () => setTurnExpanded(matchingTurnCards(select.value), true));
  element<HTMLButtonElement>("collapseTypeTurns").addEventListener("click", () => setTurnCollapsed(matchingTurnCards(select.value), true));
  element<HTMLButtonElement>("applyLineLimit").addEventListener("click", () => {
    const limit = transcriptLineLimitFromInput();
    localStorage.setItem(transcriptLineLimitKey, String(limit));
    for (const card of matchingTurnCards("all")) applyTurnLineLimit(card, limit);
  });

  for (const card of matchingTurnCards("all")) {
    card.querySelector<HTMLButtonElement>(".collapse-turn")?.addEventListener("click", () => toggleTurnCollapsed(card));
    card.querySelector<HTMLButtonElement>(".show-more-turn")?.addEventListener("click", () => toggleTurnShowMore(card));
  }
}

function matchingTurnCards(selector: string): HTMLElement[] {
  const cards = [...document.querySelectorAll<HTMLElement>(".turn-card")];
  if (selector === "all") return cards;
  if (selector.startsWith("role:")) return cards.filter((card) => card.dataset.role === selector.slice("role:".length));
  if (selector.startsWith("direction:")) return cards.filter((card) => card.dataset.direction === selector.slice("direction:".length));
  return cards;
}

function setTurnCollapsed(cards: HTMLElement[], collapsed: boolean): void {
  for (const card of cards) {
    card.classList.toggle("collapsed", collapsed);
    card.classList.remove("expanded");
    const button = card.querySelector<HTMLButtonElement>(".collapse-turn");
    if (button) button.textContent = collapsed ? "Expand" : "Collapse";
    const showMore = card.querySelector<HTMLButtonElement>(".show-more-turn");
    if (showMore) showMore.textContent = "Show more";
    if (!collapsed) applyTurnLineLimit(card, transcriptLineLimitFromInput());
  }
}

function setTurnExpanded(cards: HTMLElement[], expanded: boolean): void {
  for (const card of cards) {
    card.classList.remove("collapsed");
    card.classList.toggle("expanded", expanded);
    const content = card.querySelector<HTMLElement>(".turn-content");
    if (content) content.style.maxHeight = expanded ? "none" : maxHeightForLines(transcriptLineLimitFromInput());
    const collapse = card.querySelector<HTMLButtonElement>(".collapse-turn");
    if (collapse) collapse.textContent = "Collapse";
    const showMore = card.querySelector<HTMLButtonElement>(".show-more-turn");
    if (showMore) showMore.textContent = expanded ? "Show less" : "Show more";
    if (!expanded) applyTurnLineLimit(card, transcriptLineLimitFromInput());
  }
}

function toggleTurnCollapsed(card: HTMLElement): void {
  setTurnCollapsed([card], !card.classList.contains("collapsed"));
}

function toggleTurnShowMore(card: HTMLElement): void {
  setTurnExpanded([card], !card.classList.contains("expanded"));
}

function applyTurnLineLimit(card: HTMLElement, limit: number): void {
  const content = card.querySelector<HTMLElement>(".turn-content");
  if (!content) return;
  const lineCount = Number(card.dataset.lineCount ?? "0");
  const shouldTruncate = lineCount > limit;
  card.classList.toggle("truncated", shouldTruncate);
  if (!card.classList.contains("expanded")) content.style.maxHeight = shouldTruncate ? maxHeightForLines(limit) : "none";
  const showMore = card.querySelector<HTMLButtonElement>(".show-more-turn");
  if (showMore) {
    showMore.hidden = !shouldTruncate;
    showMore.textContent = card.classList.contains("expanded") ? "Show less" : "Show more";
  }
}

function transcriptLineLimit(): number {
  const stored = Number(localStorage.getItem(transcriptLineLimitKey) ?? "");
  return Number.isFinite(stored) && stored >= 3 ? stored : defaultTranscriptLineLimit;
}

function transcriptLineLimitFromInput(): number {
  const raw = Number(element<HTMLInputElement>("transcriptLineLimit").value);
  return Number.isFinite(raw) ? Math.max(3, Math.min(500, Math.round(raw))) : defaultTranscriptLineLimit;
}

function maxHeightForLines(lines: number): string { return `${Math.max(3, lines) * 1.55 + 1}em`; }
function countContentLines(text: string): number { return text.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 120)), 0); }

function renderFormattedContent(item: TranscriptItem): HTMLElement {
  const wrapper = document.createElement("div");
  const blocks = splitCodeFences(item.content, item.role);
  for (const block of blocks) {
    if (block.kind === "text") {
      const text = document.createElement("div");
      text.className = "turn-text";
      text.textContent = block.text;
      wrapper.append(text);
    } else {
      wrapper.append(codeBlock(block.code, block.language, block.source));
    }
  }
  return wrapper;
}

type FormattedBlock = { kind: "text"; text: string } | { kind: "code"; code: string; language: string; source: "fence" | "shell" | "role" };

function splitCodeFences(content: string, role: string): FormattedBlock[] {
  const fenced = [...content.matchAll(/```([\w#+.-]*)[^\n]*\n([\s\S]*?)```/g)];
  if (fenced.length === 0) {
    const shell = shellSnippet(content, role);
    if (shell) return shell;
    return [{ kind: "text", text: content }];
  }

  const blocks: FormattedBlock[] = [];
  let cursor = 0;
  for (const match of fenced) {
    const index = match.index ?? 0;
    if (index > cursor) blocks.push({ kind: "text", text: content.slice(cursor, index) });
    blocks.push({ kind: "code", code: match[2] ?? "", language: normalizeLanguage(match[1] || "text"), source: "fence" });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) blocks.push({ kind: "text", text: content.slice(cursor) });
  return blocks.filter((block) => block.kind === "code" || block.text.length > 0);
}

function shellSnippet(content: string, role: string): FormattedBlock[] | null {
  const trimmed = content.trimEnd();
  if (!trimmed) return [{ kind: "text", text: content }];
  const lowerRole = role.toLowerCase();
  if (lowerRole === "bashexecution" || lowerRole === "tool" || lowerRole === "tool_result") {
    if (/^(\$|>|❯)\s|\n(\$|>|❯)\s|\b(npm|pnpm|yarn|git|gh|curl|ssh|rsync|python3?|node|tsx|tsc|pytest|cargo|docker|kubectl|sqlite3)\b/.test(trimmed)) {
      return [{ kind: "code", code: trimmed, language: "bash", source: "role" }];
    }
  }
  if (/^(\$|>|❯)\s.+/m.test(trimmed)) return [{ kind: "code", code: trimmed, language: "bash", source: "shell" }];
  return null;
}

function codeBlock(code: string, language: string, source: FormattedBlock extends infer T ? T extends { kind: "code"; source: infer S } ? S : never : never): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = `code-block ${language === "bash" || language === "shell" ? "shell-block" : ""}`;
  const caption = document.createElement("figcaption");
  const displayLanguage = languageLabel(language);
  caption.innerHTML = `<span>${escapeHtml(displayLanguage)}</span><span>${source === "fence" ? "fenced code" : source === "shell" ? "detected shell" : "tool/shell output"}</span>`;
  const pre = document.createElement("pre");
  const codeEl = document.createElement("code");
  codeEl.className = `language-${escapeHtml(language)}`;
  codeEl.innerHTML = highlightedCode(code, language);
  pre.append(codeEl);
  figure.append(caption, pre);
  return figure;
}

function highlightedCode(code: string, language: string): string {
  const highlighter = typeof hljs === "undefined" ? null : hljs;
  if (!highlighter) return escapeHtml(code);
  try {
    if (language !== "text" && highlighter.getLanguage(language)) return highlighter.highlight(code, { language, ignoreIllegals: true }).value;
    return highlighter.highlightAuto(code, ["bash", "shell", "typescript", "javascript", "json", "python", "sql", "yaml", "markdown", "html", "css", "diff"]).value;
  } catch {
    return escapeHtml(code);
  }
}

function normalizeLanguage(language: string): string {
  const lower = language.trim().toLowerCase();
  const aliases: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", ts: "typescript", js: "javascript", py: "python", yml: "yaml", md: "markdown", plaintext: "text", txt: "text" };
  return aliases[lower] ?? (lower || "text");
}

function languageLabel(language: string): string {
  if (language === "bash") return "Shell";
  if (language === "text") return "Text";
  return language.replace(/^./, (char) => char.toUpperCase());
}

function modelDirection(role: string): { kind: TurnDirection; label: string; className: string } {
  const lower = role.toLowerCase();
  if (lower === "assistant" || lower === "tool" || lower === "bashexecution") return { kind: "output", label: "model output", className: "io-output" };
  if (lower === "user" || lower === "system" || lower === "tool_result") return { kind: "input", label: "model input", className: "io-input" };
  return { kind: "context", label: "context", className: "io-context" };
}

function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  const words = text.trim().split(/\s+/).length;
  const chars = text.length / 4;
  return Math.max(1, Math.round((words + chars) / 2));
}

function formatNumber(value: number): string { return value.toLocaleString("en-US"); }

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

function drawUsageTable(rows: UsageSummaryRow[], target: HTMLDivElement): void { if (!rows.length) { target.replaceChildren(emptyStateNode("No usage signals found.", "Try a broader query, switch signal type, or ingest sessions that include tool and skill activity.")); return; } target.innerHTML = `<table><thead><tr><th>Name</th><th>Uses</th><th>Sessions</th></tr></thead><tbody>${rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.count}</td><td>${row.sessions}</td></tr>`).join("")}</tbody></table>`; }
function renderLinked(rows: SearchResult[], target: HTMLDivElement): void { if (!rows.length) { target.replaceChildren(emptyStateNode("No linked sessions found.", "No explicit subagent or same-run sessions are attached to this transcript.")); return; } target.innerHTML = rows.map((row) => `<div class="result"><a href="/session/${encodeURIComponent(row.sessionId)}">[${escapeHtml(row.provider)}] ${escapeHtml(row.title ?? "Untitled")}</a><div class="muted">${escapeHtml(row.reason ?? "linked")} · ${escapeHtml(row.startedAt ?? "unknown")} · ${escapeHtml(row.path)}</div></div>`).join(""); target.querySelectorAll("a").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); history.pushState(null, "", (event.currentTarget as HTMLAnchorElement).pathname); setTab("session"); })); }
function params(): URLSearchParams { const query = new URLSearchParams(); for (const key of ["query", "provider", "cwd", "startDate", "endDate", "batchMode", "limit"] as const) { const val = value(key); if (val) query.set(key, val); } const pathFilter = value("pathFilter"); if (pathFilter) query.set("path", pathFilter); return query; }
function groupMode(): GroupMode { const raw = value("groupBy"); return raw === "cwd" || raw === "provider" || raw === "primary" ? raw : "none"; }
async function getJson<T>(url: string): Promise<T> { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30_000); try { const response = await fetch(url, { signal: controller.signal }); if (!response.ok) throw new Error(await response.text()); return response.json() as Promise<T>; } finally { clearTimeout(timeout); } }
async function postJson<T>(url: string, body: unknown): Promise<T> { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(await response.text()); return response.json() as Promise<T>; }
function setBusy(busy: boolean, message?: string): void { runButton.disabled = busy; if (message) setStatus(message); }
function setStatus(message: string): void { element<HTMLElement>("statusLine").textContent = message; }
function elapsed(started: number): string { return `${Math.round(performance.now() - started)}ms`; }
function value(id: string): string { return element<HTMLInputElement | HTMLSelectElement>(id).value.trim(); }
function element<T extends HTMLElement>(id: string): T { const found = document.getElementById(id); if (!found) throw new Error(`Missing element ${id}`); return found as T; }
function escapeHtml(text: string): string { return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
