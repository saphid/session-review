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
interface PiChat { id: string; history: ChatMessage[] }
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
let selectedChatItem: SelectedChatItem | null = null;
let excludedSourceFiles = new Set<string>();
let lastSourceSignature = "";
const transcriptLineLimitKey = "session-review-transcript-line-limit";
const piChatIdKey = "session-review-pi-chat-id";
const piChatsKey = "session-review-pi-chats";
const piSidebarWidthKey = "session-review-pi-sidebar-width";
const defaultTranscriptLineLimit = 18;
const defaultPiSidebarWidth = 460;
const minPiSidebarWidth = 340;
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
  const open = force ?? advancedFiltersPanel.hidden;
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

function searchResultNode(row: SearchResult): HTMLElement {
  const item = document.createElement("div");
  item.className = "result selectable-chat-item";
  item.tabIndex = 0;
  item.setAttribute("role", "button");
  item.setAttribute("aria-label", `Attach session result ${row.title ?? row.sessionId} as Pi source context`);
  const badges = `${row.isSubagent ? '<span class="badge">subagent</span>' : ""}${row.isBatch ? '<span class="badge">batch run</span>' : ""}`;
  item.innerHTML = `<div class="result-head"><strong><a href="/session/${encodeURIComponent(row.sessionId)}">[${escapeHtml(row.provider)}] ${escapeHtml(row.title ?? "Untitled")}</a>${badges}</strong><span class="token-count" title="Estimated from indexed transcript text">${formatNumber(row.tokenEstimate ?? estimateTokens(`${row.title ?? ""}\n${row.snippet ?? ""}`))} tokens</span></div><div class="muted">${escapeHtml(row.startedAt ?? "unknown date")}${row.cwd ? ` · ${escapeHtml(row.cwd)}` : ""}</div>${row.isSubagent ? `<div class="muted">Grouped under: ${escapeHtml(row.groupLabel ?? row.parentTitle ?? "primary session")}</div>` : ""}<div class="muted">${escapeHtml(row.path)}</div><p>${highlight(row.snippet ?? "")}</p>`;
  const selectResult = (): void => {
    setSelectedChatItem({ kind: "session result", label: row.title ?? row.sessionId, data: summarizeSearchResult(row) });
    item.classList.add("selected-for-chat");
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
  target.innerHTML = `<p><a href="/">← Back to search</a></p><h3>${escapeHtml(details.title ?? "Untitled")}</h3><p class="muted">${escapeHtml(details.provider)} · ${escapeHtml(details.startedAt ?? "unknown date")} · ${details.isBatch ? "batch run" : "standard run"}</p><p><strong>Purpose:</strong> ${escapeHtml(details.purpose ?? "Unknown")}</p><p><strong>Working directory:</strong> ${escapeHtml(details.cwd ?? "Unknown")}</p><p><strong>Path:</strong> ${escapeHtml(details.path)}</p><div class="session-meta-strip"><span class="session-meta-pill"><strong>${details.turnCount}</strong> turns</span><span class="session-meta-pill"><strong>${details.toolUseCount}</strong> tool uses</span><span class="session-meta-pill"><strong>${details.skillUseCount}</strong> skill mentions</span><span class="session-meta-pill"><strong>${details.linkedSessions.length}</strong> linked sessions</span></div><h3>Transcript</h3><div class="transcript-controls"><fieldset class="transcript-control-group"><legend>View</legend><div class="transcript-control-row"><label>Visible lines <input id="transcriptLineLimit" type="number" min="3" max="500" value="${transcriptLineLimit()}" /></label><button id="applyLineLimit">Apply</button></div></fieldset><fieldset class="transcript-control-group"><legend>All turns</legend><div class="transcript-control-row"><button id="expandAllTurns">Expand all</button><button id="collapseAllTurns">Collapse all</button></div></fieldset><fieldset class="transcript-control-group"><legend>By type</legend><div class="transcript-control-row"><label>Item type <select id="turnTypeSelect"></select></label><button id="expandTypeTurns">Expand</button><button id="collapseTypeTurns">Collapse</button></div></fieldset></div><div class="session-layout"><nav class="turn-sidebar" id="turnSidebar"></nav><div class="transcript" id="transcript"></div></div><details class="session-analysis"><summary>Turn analytics and linked sessions</summary><h3>Turn activity</h3><p class="muted">Click a bar to jump to that turn. Tool and skill bars are derived from indexed usage signals.</p><div class="chart-wrap"><canvas id="sessionTurnChart"></canvas></div><h3>Tools</h3><div id="sessionTools"></div><h3>Skills</h3><div id="sessionSkills"></div><h3>Linked subagent / nearby sessions</h3><div id="linkedSessions"></div></details>`;
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
function highlight(text: string): string { return escapeHtml(text).replaceAll("[", '<span class="hit">').replaceAll("]", "</span>"); }
