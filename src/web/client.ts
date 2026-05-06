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
interface UsagePoint { bucket: string; name: string; count: number; sessions: number; }
interface UsageSummaryRow { kind: UsageKind; name: string; count: number; sessions: number; }
interface UsageResponse { summary: UsageSummaryRow[]; timeline: UsagePoint[]; }
interface TranscriptItem { index: number; role: string; content: string; toolCount: number; skillCount: number; }
interface ChatMessage { role: "user" | "assistant"; content: string }
interface SelectedChatItem { kind: string; label: string; data: unknown }
interface SessionDetails {
  sessionId: string; provider: string; title: string | null; startedAt: string | null; cwd: string | null; path: string; indexedAt: string; isBatch: boolean; purpose: string | null; bodyPreview: string; turnCount: number; toolUseCount: number; skillUseCount: number; turns: Array<{ index: number; role: string; toolCount: number; skillCount: number }>; transcript: TranscriptItem[]; usage: UsageSummaryRow[]; linkedSessions: SearchResult[];
}

let activeTab: "search" | "usage" | "session" = location.pathname.startsWith("/session/") ? "session" : "search";
let usageChart: ChartInstance | null = null;
let turnChart: ChartInstance | null = null;
let lastSearchRows: SearchResult[] = [];
let currentSessionDetails: SessionDetails | null = null;
let lastUsageResponse: UsageResponse | null = null;
const chatHistory: ChatMessage[] = [];
let selectedChatItem: SelectedChatItem | null = null;
const transcriptLineLimitKey = "session-review-transcript-line-limit";
const piChatIdKey = "session-review-pi-chat-id";
const defaultTranscriptLineLimit = 18;
let piChatId = existingOrNewPiChatId();

const searchTab = element<HTMLButtonElement>("searchTab");
const usageTab = element<HTMLButtonElement>("usageTab");
const searchPanel = element<HTMLElement>("searchPanel");
const usagePanel = element<HTMLElement>("usagePanel");
const sessionPanel = element<HTMLElement>("sessionPanel");
const runButton = element<HTMLButtonElement>("run");
const piSendButton = element<HTMLButtonElement>("piSend");
const piNewChatButton = element<HTMLButtonElement>("piNewChat");
const clearSelectedChatItemButton = element<HTMLButtonElement>("clearSelectedChatItem");

searchTab.addEventListener("click", () => setTab("search"));
usageTab.addEventListener("click", () => setTab("usage"));
runButton.addEventListener("click", () => void run());
piSendButton.addEventListener("click", () => void sendPiChat());
piNewChatButton.addEventListener("click", () => resetPiChat());
clearSelectedChatItemButton.addEventListener("click", () => setSelectedChatItem(null));
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
  lastSearchRows = rows;
  currentSessionDetails = null;
  lastUsageResponse = null;
  updatePiContextPreview();
  const target = element<HTMLDivElement>("results");
  target.replaceChildren();
  if (!rows.length) { target.textContent = "No matching sessions."; setStatus(`Search completed in ${elapsed(started)} and returned 0 sessions.`); return; }
  const mode = groupMode();
  if (mode === "none") {
    for (const row of rows) target.append(searchResultNode(row));
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
  setStatus(`Usage query completed in ${elapsed(started)} with ${data.summary.length} names and ${data.timeline.length} graph points.`);
}

async function runSession(started: number): Promise<void> {
  const id = decodeURIComponent(location.pathname.replace(/^\/session\//, ""));
  const details = await getJson<SessionDetails>(`/api/session?id=${encodeURIComponent(id)}`);
  currentSessionDetails = details;
  lastUsageResponse = null;
  updatePiContextPreview();
  renderSession(details);
  setStatus(`Session loaded in ${elapsed(started)}.`);
}

function searchResultNode(row: SearchResult): HTMLElement {
  const item = document.createElement("div");
  item.className = "result selectable-chat-item";
  const badges = `${row.isSubagent ? '<span class="badge">subagent</span>' : ""}${row.isBatch ? '<span class="badge">batch-like</span>' : ""}`;
  item.innerHTML = `<div class="result-head"><strong><a href="/session/${encodeURIComponent(row.sessionId)}">[${escapeHtml(row.provider)}] ${escapeHtml(row.title ?? "Untitled")}</a>${badges}</strong><span class="token-count" title="Estimated from indexed transcript text">${formatNumber(row.tokenEstimate ?? estimateTokens(`${row.title ?? ""}\n${row.snippet ?? ""}`))} tokens</span></div><div class="muted">${escapeHtml(row.startedAt ?? "unknown date")}${row.cwd ? ` · ${escapeHtml(row.cwd)}` : ""}</div>${row.isSubagent ? `<div class="muted">Grouped under: ${escapeHtml(row.groupLabel ?? row.parentTitle ?? "primary session")}</div>` : ""}<div class="muted">${escapeHtml(row.path)}</div><p>${highlight(row.snippet ?? "")}</p>`;
  item.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("a,button")) return;
    setSelectedChatItem({ kind: "session result", label: row.title ?? row.sessionId, data: summarizeSearchResult(row) });
    item.classList.add("selected-for-chat");
  });
  item.querySelector("a")?.addEventListener("click", (event) => { event.preventDefault(); history.pushState(null, "", `/session/${encodeURIComponent(row.sessionId)}`); setTab("session"); });
  return item;
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

function resetPiChat(): void {
  piChatId = crypto.randomUUID();
  localStorage.setItem(piChatIdKey, piChatId);
  chatHistory.length = 0;
  element<HTMLDivElement>("chatMessages").replaceChildren();
  setSelectedChatItem(null);
  setPiStatus(`Started new persistent Pi chat ${piChatId.slice(0, 8)}.`);
  updatePiContextPreview();
}

async function sendPiChat(): Promise<void> {
  const input = element<HTMLTextAreaElement>("piPrompt");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  appendChatMessage("user", message);
  chatHistory.push({ role: "user", content: message });
  piSendButton.disabled = true;
  setPiStatus("Pi is reading the loaded files and thinking…");
  try {
    const payload = piPayload(message);
    const result = await postJson<{ ok: boolean; reply: string; message: string; chatId: string; continued: boolean; sessionDir: string; contextPath: string; attachedFiles: string[]; stderr?: string }>("/api/pi/chat", payload);
    const reply = result.reply || result.stderr || result.message;
    appendChatMessage(result.ok ? "assistant" : "assistant", reply, result.ok ? undefined : "error");
    chatHistory.push({ role: "assistant", content: reply });
    setPiStatus(`${result.message} ${result.continued ? "Continued" : "Started"} persistent Pi session ${result.chatId.slice(0, 8)}. Attached ${result.attachedFiles.length} files. Context: ${result.contextPath}`);
  } catch (error) {
    const text = `Failed to chat with Pi: ${error instanceof Error ? error.message : String(error)}`;
    appendChatMessage("assistant", text, "error");
    setPiStatus(text);
  } finally {
    piSendButton.disabled = false;
  }
}

function piPayload(message: string): { chatId: string; message: string; screen: unknown; selectedItem: unknown; files: string[]; history: ChatMessage[] } {
  const screen = screenContext();
  return { chatId: piChatId, message, screen, selectedItem: selectedChatItem, files: relatedFiles(), history: chatHistory.slice(-12) };
}

function appendChatMessage(role: "user" | "assistant", content: string, extraClass = ""): void {
  const container = element<HTMLDivElement>("chatMessages");
  const message = document.createElement("div");
  message.className = `chat-message ${role} ${extraClass}`.trim();
  message.textContent = content;
  container.append(message);
  container.scrollTop = container.scrollHeight;
}

function setSelectedChatItem(item: SelectedChatItem | null): void {
  selectedChatItem = item;
  document.querySelectorAll(".selected-for-chat").forEach((node) => node.classList.remove("selected-for-chat"));
  const chip = element<HTMLDivElement>("selectedChatItem");
  const label = element<HTMLSpanElement>("selectedChatItemLabel");
  chip.hidden = !item;
  label.textContent = item ? `${item.kind}: ${item.label}` : "";
  updatePiContextPreview();
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

function relatedFiles(): string[] {
  const files = new Set<string>();
  for (const row of lastSearchRows.slice(0, 80)) files.add(row.path);
  if (currentSessionDetails) {
    files.add(currentSessionDetails.path);
    for (const row of currentSessionDetails.linkedSessions) files.add(row.path);
  }
  return [...files].filter(Boolean);
}

function updatePiContextPreview(): void {
  const files = relatedFiles();
  const preview = {
    chatId: piChatId,
    tab: activeTab,
    files: files.slice(0, 20),
    fileCount: files.length,
    selectedItem: selectedChatItem ? { kind: selectedChatItem.kind, label: selectedChatItem.label } : null,
    currentSession: currentSessionDetails ? { id: currentSessionDetails.sessionId, title: currentSessionDetails.title, path: currentSessionDetails.path } : null,
    searchResults: activeTab === "search" ? lastSearchRows.length : undefined,
    usageRows: activeTab === "usage" ? lastUsageResponse?.summary.length ?? 0 : undefined,
  };
  element<HTMLPreElement>("piContextPreview").textContent = JSON.stringify(preview, null, 2);
}

function setPiStatus(message: string): void { element<HTMLElement>("piStatus").textContent = message; }
function truncateForContext(text: string, max: number): string { return text.length <= max ? text : `${text.slice(0, max)}…`; }

function renderSession(details: SessionDetails): void {
  const target = element<HTMLDivElement>("sessionDetails");
  const tools = details.usage.filter((entry) => entry.kind === "tool");
  const skills = details.usage.filter((entry) => entry.kind === "skill");
  target.innerHTML = `<p><a href="/">← Back to search</a></p><h3>${escapeHtml(details.title ?? "Untitled")}</h3><p class="muted">${escapeHtml(details.provider)} · ${escapeHtml(details.startedAt ?? "unknown date")} · ${details.isBatch ? "batch-like" : "non-batch"}</p><p><strong>Purpose:</strong> ${escapeHtml(details.purpose ?? "Unknown")}</p><p><strong>CWD:</strong> ${escapeHtml(details.cwd ?? "Unknown")}</p><p><strong>Path:</strong> ${escapeHtml(details.path)}</p><div class="cards"><div class="card"><strong>${details.turnCount}</strong><br />turns</div><div class="card"><strong>${details.toolUseCount}</strong><br />tool uses</div><div class="card"><strong>${details.skillUseCount}</strong><br />skill mentions</div><div class="card"><strong>${details.linkedSessions.length}</strong><br />linked sessions</div></div><h3>Turn activity</h3><p class="muted">Click a bar to jump to that turn. Tool/skill bars are heuristic; tables use indexed usage signals.</p><div class="chart-wrap"><canvas id="sessionTurnChart"></canvas></div><h3>Tools</h3><div id="sessionTools"></div><h3>Skills</h3><div id="sessionSkills"></div><h3>Linked subagent / nearby sessions</h3><div id="linkedSessions"></div><h3>Transcript</h3><div class="transcript-controls"><label>Default visible lines <input id="transcriptLineLimit" type="number" min="3" max="500" value="${transcriptLineLimit()}" /></label><button id="expandAllTurns">Expand all</button><button id="collapseAllTurns">Collapse all</button><label>Item type <select id="turnTypeSelect"></select></label><button id="expandTypeTurns">Expand type</button><button id="collapseTypeTurns">Collapse type</button><button id="applyLineLimit">Apply line limit</button></div><div class="session-layout"><nav class="turn-sidebar" id="turnSidebar"></nav><div class="transcript" id="transcript"></div></div>`;
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
  bindTranscriptControls(details.transcript);
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
    card.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("a,button")) return;
      setSelectedChatItem({
        kind: "transcript turn",
        label: `#${item.index} ${item.role}`,
        data: { index: item.index, role: item.role, tokenEstimate: estimateTokens(item.content), content: item.content, sessionPath: currentSessionDetails?.path },
      });
      card.classList.add("selected-for-chat");
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

function drawUsageTable(rows: UsageSummaryRow[], target: HTMLDivElement): void { if (!rows.length) { target.textContent = "No usage signals found."; return; } target.innerHTML = `<table><thead><tr><th>Name</th><th>Uses</th><th>Sessions</th></tr></thead><tbody>${rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.count}</td><td>${row.sessions}</td></tr>`).join("")}</tbody></table>`; }
function renderLinked(rows: SearchResult[], target: HTMLDivElement): void { if (!rows.length) { target.textContent = "No explicit linked or same-run subagent sessions found."; return; } target.innerHTML = rows.map((row) => `<div class="result"><a href="/session/${encodeURIComponent(row.sessionId)}">[${escapeHtml(row.provider)}] ${escapeHtml(row.title ?? "Untitled")}</a><div class="muted">${escapeHtml(row.reason ?? "linked")} · ${escapeHtml(row.startedAt ?? "unknown")} · ${escapeHtml(row.path)}</div></div>`).join(""); target.querySelectorAll("a").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); history.pushState(null, "", (event.currentTarget as HTMLAnchorElement).pathname); setTab("session"); })); }
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
function highlight(text: string): string { return escapeHtml(text).replaceAll("[", '<span class="hit">').replaceAll("]", "</span>"); }
