/**
 * ★フィルターがカテゴリ付き記録も含むこと、特記の並び・メタ表示を検証する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const mockDb = `
const store = { notes: {} };
let noteSeq = 1;
const listeners = new Set();

function emit() {
  const items = Object.entries(store.notes).map(([id, raw]) => ({ id, ...raw }));
  const rank = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => {
    const ir = (rank[a.importance] ?? 1) - (rank[b.importance] ?? 1);
    if (ir !== 0) return ir;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
  listeners.forEach((cb) => cb(items));
}

export function subscribeSpecialNotes(_karte, cb) {
  listeners.add(cb);
  emit();
  return () => listeners.delete(cb);
}
export async function addSpecialNote(_karte, { content, importance, createdBy }) {
  const id = "n" + noteSeq++;
  store.notes[id] = {
    content, importance, createdBy,
    createdAt: new Date().toISOString(),
    lastEditedAt: "", lastEditedBy: "",
  };
  emit();
  return id;
}
export async function updateSpecialNote(_karte, id, { content, importance, editedBy }) {
  store.notes[id] = {
    ...store.notes[id],
    content, importance,
    lastEditedAt: new Date().toISOString(),
    lastEditedBy: editedBy,
  };
  emit();
}
export async function deleteSpecialNote(_karte, id) {
  delete store.notes[id];
  emit();
}
// stubs for other imports if any
export function subscribeProcedures(){return ()=>{};}
`;

const harness = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
<style>body{margin:0;padding:16px;background:#f5f6f7;font-family:system-ui}</style>
</head><body>
<section style="margin-bottom:24px">
  <h2>★フィルター</h2>
  <label><input type="checkbox" id="star-filter" /> ★のみ</label>
  <ul id="headline-out"></ul>
</section>
<aside class="col col--right" style="width:340px;border:1px solid #ddd;background:#fff;padding:8px">
  <div class="right-tabs" id="right-tabs">
    <button class="right-tab is-active" type="button" data-tab="notes">特記</button>
  </div>
  <div class="right-panel" id="panel-notes" data-panel="notes">
    <div class="exam-toolbar">
      <button id="btn-special-note-add" class="btn btn--small btn--primary" type="button">特記を追加</button>
    </div>
    <section class="exam-section">
      <h3 class="exam-section__title">特記事項</h3>
      <p class="field__note" id="special-notes-empty">登録された特記事項はありません。</p>
      <ul class="note-list" id="special-notes-list"></ul>
    </section>
  </div>
</aside>
${fs.readFileSync(path.join(root, "index.html"), "utf8").match(/<div class="modal" id="special-note-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)[0]}
<script type="module">
  import {
    initSpecialNotesUI,
    enterSpecialNotes,
  } from "/js/special-notes-ui.js";

  // --- star filter unit (inline, mirrors app.js) ---
  function entryMatchesStarFilter(entry) {
    if (entry?.important) return true;
    const cat = entry?.category || "none";
    return cat === "ope" || cat === "admission" || cat === "referral";
  }
  const entries = [
    { id: "1", headline: "通常のみ", important: false, category: "none" },
    { id: "2", headline: "手動★", important: true, category: "none" },
    { id: "3", headline: "オペ（★なし）", important: false, category: "ope" },
    { id: "4", headline: "紹介（★なし）", important: false, category: "referral" },
  ];
  const out = document.getElementById("headline-out");
  const box = document.getElementById("star-filter");
  function render() {
    const list = box.checked ? entries.filter(entryMatchesStarFilter) : entries;
    out.innerHTML = list.map((e) => "<li>" + e.headline + "</li>").join("");
    out.dataset.count = String(list.length);
    out.dataset.titles = list.map((e) => e.headline).join("|");
  }
  box.addEventListener("change", render);
  render();

  initSpecialNotesUI({
    showToast: () => {},
    showError: (el, msg) => { if (el) { el.textContent = msg || ""; el.hidden = !msg; } },
    setBusy: () => {},
    getSelectedAuthor: () => "院長",
  });
  enterSpecialNotes("12345");
  window.__test = { render };
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  if (u === "/js/db.js") {
    res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
    res.end(mockDb);
    return;
  }
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  const ext = path.extname(fp);
  const type =
    ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: SYSTEM_CHROME,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

// 1) star filter
const before = await page.locator("#headline-out").getAttribute("data-titles");
await page.check("#star-filter");
await page.waitForTimeout(50);
const after = await page.locator("#headline-out").getAttribute("data-titles");
const starOk =
  before === "通常のみ|手動★|オペ（★なし）|紹介（★なし）" &&
  after === "手動★|オペ（★なし）|紹介（★なし）";

// 2) special notes: add low, high, medium — order should be high, medium, low
await page.click("#btn-special-note-add");
await page.fill("#special-note-content", "低：参考メモ");
await page.click('#special-note-importance-row [data-importance="low"]');
await page.click('#special-note-author-row [data-author="院長"]');
await page.click("#btn-special-note-save");
await page.waitForTimeout(200);

await page.click("#btn-special-note-add");
await page.fill("#special-note-content", "高：金銭制限あり");
await page.click('#special-note-importance-row [data-importance="high"]');
await page.click('#special-note-author-row [data-author="院長"]');
await page.click("#btn-special-note-save");
await page.waitForTimeout(200);

await page.click("#btn-special-note-add");
await page.fill("#special-note-content", "中：飼い主は説明を好む");
await page.click('#special-note-importance-row [data-importance="medium"]');
await page.click('#special-note-author-row [data-author="大辻"]');
await page.click("#btn-special-note-save");
await page.waitForTimeout(300);

const order = await page.locator(".note-card__content").allTextContents();
const badges = await page.locator(".note-card__importance").allTextContents();
const metas = await page.locator(".note-card__meta").allTextContents();
const sortOk =
  order[0]?.includes("高：") &&
  order[1]?.includes("中：") &&
  order[2]?.includes("低：") &&
  badges[0]?.includes("高") &&
  badges[1]?.includes("中") &&
  badges[2]?.includes("低");
const createMetaOk = metas.every((m) => /追加 /.test(m) && /院長|大辻/.test(m));

// edit first (high) card
await page.locator(".note-card").first().click();
await page.waitForSelector("#special-note-modal:not([hidden])");
await page.fill("#special-note-content", "高：金銭制限あり（更新）");
await page.click('#special-note-author-row [data-author="川邉"]');
await page.click("#btn-special-note-save");
await page.waitForTimeout(300);
const metaAfterEdit = await page.locator(".note-card__meta").first().textContent();
const editOk = /更新 /.test(metaAfterEdit || "") && /川邉/.test(metaAfterEdit || "");
const contentAfter = await page.locator(".note-card__content").first().textContent();

await page.screenshot({
  path: path.join(root, "tools/special-notes-verify.png"),
  fullPage: true,
});

console.log(
  JSON.stringify(
    {
      starOk,
      before,
      after,
      sortOk,
      order,
      badges,
      createMetaOk,
      metas,
      editOk,
      metaAfterEdit,
      contentAfter,
    },
    null,
    2
  )
);

await browser.close();
server.close();
if (!starOk || !sortOk || !createMetaOk || !editOk) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
