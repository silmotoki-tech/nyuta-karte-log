// 検索タブ上部のカルテ内全文検索。
// 中央カラム（見出し・本文）、検査予定・実施履歴、薬剤の出来事を横断する。

let deps = {
  getTimelineEntries: () => [],
  getExamSearchItems: () => [],
  getMedSearchItems: () => [],
  jumpToEntry: () => {},
  jumpToExamTarget: () => {},
  jumpToMedTarget: () => {},
};

const searchInput = document.getElementById("chart-search-input");
const resultsList = document.getElementById("chart-search-results");
const resultsEmpty = document.getElementById("chart-search-empty");
const resultsHint = document.getElementById("chart-search-hint");

let debounceTimer = null;

export function initChartSearchUI(helpers = {}) {
  deps = { ...deps, ...helpers };
  searchInput?.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 120);
  });
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      runSearch();
    }
  });
  runSearch();
}

export function clearChartSearch() {
  if (searchInput) searchInput.value = "";
  runSearch();
}

/** データ更新後やタブ表示時に再検索する */
export function refreshChartSearch() {
  runSearch();
}

function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function haystack(...parts) {
  return parts
    .filter((p) => p != null && String(p).trim())
    .map((p) => String(p).toLowerCase().replace(/\s+/g, ""))
    .join("\n");
}

function runSearch() {
  const q = normalizeQuery(searchInput?.value);
  if (!resultsList) return;

  resultsList.innerHTML = "";
  if (!q) {
    if (resultsEmpty) resultsEmpty.hidden = true;
    if (resultsHint) resultsHint.hidden = false;
    return;
  }
  if (resultsHint) resultsHint.hidden = true;

  const hits = [];

  for (const entry of deps.getTimelineEntries() || []) {
    const text = haystack(entry.headline, entry.body, entry.author, entry.recordDate);
    if (!text.includes(q)) continue;
    hits.push({
      kind: "entry",
      id: entry.id,
      date: entry.recordDate || "",
      title: entry.headline || "（見出しなし）",
      snippet: snippetAround(entry.body || entry.headline || "", q),
      badge: "記録",
    });
  }

  for (const item of deps.getExamSearchItems() || []) {
    const text = haystack(item.item, item.note, item.date, item.kindLabel);
    if (!text.includes(q)) continue;
    hits.push({
      kind: "exam",
      id: item.id,
      examKind: item.kind,
      itemName: item.item || "",
      date: item.date || "",
      title: item.item || "（項目未設定）",
      snippet: snippetAround(item.note || item.kindLabel || "", q),
      badge: item.kindLabel || "検査",
    });
  }

  for (const item of deps.getMedSearchItems() || []) {
    const text = haystack(
      item.drugName,
      item.typeLabel,
      item.detail,
      item.date,
      item.changedBy
    );
    if (!text.includes(q)) continue;
    hits.push({
      kind: "med",
      drugId: item.drugId,
      eventId: item.eventId,
      date: item.date || "",
      title: item.drugName || "（薬剤名なし）",
      snippet: snippetAround(
        [item.typeLabel, item.detail].filter(Boolean).join(" · ") || "",
        q
      ),
      badge: "薬剤",
    });
  }

  hits.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (resultsEmpty) resultsEmpty.hidden = hits.length > 0;

  hits.slice(0, 80).forEach((hit) => {
    resultsList.appendChild(createResultItem(hit));
  });
}

function snippetAround(text, q) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase().replace(/\s+/g, "");
  // 表示用は元テキストを短く切る
  if (raw.length <= 72) return raw;
  const idx = lower.indexOf(q);
  if (idx < 0) return `${raw.slice(0, 72)}…`;
  // おおよその開始位置（正規化と実文字のズレは許容）
  const start = Math.max(0, Math.min(idx, Math.max(0, raw.length - 72)));
  const chunk = raw.slice(start, start + 72);
  return `${start > 0 ? "…" : ""}${chunk}${start + 72 < raw.length ? "…" : ""}`;
}

function createResultItem(hit) {
  const li = document.createElement("li");
  li.className = "chart-search-item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chart-search-item__btn";

  const top = document.createElement("div");
  top.className = "chart-search-item__top";

  const badge = document.createElement("span");
  badge.className = "chart-search-item__badge";
  badge.textContent = hit.badge;

  const date = document.createElement("span");
  date.className = "chart-search-item__date";
  date.textContent = hit.date || "";

  top.append(badge, date);

  const title = document.createElement("div");
  title.className = "chart-search-item__title";
  title.textContent = hit.title;

  btn.append(top, title);
  if (hit.snippet) {
    const snip = document.createElement("div");
    snip.className = "chart-search-item__snippet";
    snip.textContent = hit.snippet;
    btn.appendChild(snip);
  }

  btn.addEventListener("click", () => {
    if (hit.kind === "entry") {
      deps.jumpToEntry(hit.id);
      return;
    }
    if (hit.kind === "exam") {
      deps.jumpToExamTarget({
        kind: hit.examKind,
        id: hit.id,
        itemName: hit.itemName,
      });
      return;
    }
    if (hit.kind === "med") {
      deps.jumpToMedTarget({ drugId: hit.drugId, eventId: hit.eventId });
    }
  });

  li.appendChild(btn);
  return li;
}
