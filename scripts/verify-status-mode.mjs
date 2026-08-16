/**
 * 状態モード（全画面の状態一覧）を本番 index.html + app.js 経路で検証する。
 * - 各ブロックにデータが表示されること
 * - ヘッダーの「＋」から新規追加フォームが開き、保存後に状態モードと右カラムの両方へ反映されること
 * - 項目タップで既存の編集ポップアップが開くこと
 * - 状態 ⇄ 履歴 の切り替えが（再読み込みなしで）動くこと
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const mockDb = fs.readFileSync(path.join(__dirname, "mock-db-status-mode.js"), "utf8");

const mockPasscode = `
export const PASSCODE_STORAGE_KEY = "nyutaKartePasscodeVerified";
export const PASSCODE_DATE_KEY = "nyutaKartePasscodeVerifiedDate";
export function todayDateStrLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate());
}
export function isPasscodeVerified() { return true; }
export function setPasscodeVerified() {}
export function clearPasscodeVerified() {}
`;

const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test-key-for-verify"; }
export function setApiKey() {}
export function clearApiKey() {}
`;

const mockFirebase = `export const app = {};`;

function findChromeHeadlessShell() {
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(
      cacheRoot,
      dir,
      "playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function launchBrowser() {
  const candidates = [
    findChromeHeadlessShell(),
    fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null,
  ].filter(Boolean);
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  throw new Error("Could not launch browser");
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/index.html";
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(fp), "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  deviceScaleFactor: 2,
  serviceWorkers: "block",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => {
  pageErrors.push(String(e));
  console.warn("pageerror", String(e));
});

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.route("**/js/passcode-auth.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockPasscode })
);
await page.route("**/js/api-key.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockApiKey })
);
await page.route("**/js/firebase-app.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockFirebase })
);
await page.route("**/js/auth.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: MOCK_AUTH_LOGGED_IN })
);

await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });

await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10000 });
for (const d of ["0", "0", "0", "0", "1"]) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click('#karte-numpad [data-karte-action="confirm"]');
await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10000 });
await page.fill("#animal-name-input", "イチロウ");
await page.click("#btn-animal-next");
await page.waitForSelector("#center-main:not([hidden])", { timeout: 10000 });

const outDir = path.join(root, "tools/status-mode");
fs.mkdirSync(outDir, { recursive: true });
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const chromeShot = (name) =>
  page.screenshot({
    path: path.join(outDir, `${name}.png`),
    clip: { x: 220, y: 0, width: 380, height: 72 },
  });

async function chromePos() {
  return page.evaluate(() => {
    const chrome = document.getElementById("app-view-chrome");
    const toggle = chrome?.querySelector(".view-toggle");
    const compose = document.getElementById("btn-start-compose");
    const t = toggle.getBoundingClientRect();
    const c = compose.getBoundingClientRect();
    return {
      hidden: chrome.hidden,
      toggle: {
        x: Math.round(t.x),
        y: Math.round(t.y),
        w: Math.round(t.width),
        h: Math.round(t.height),
      },
      compose: {
        x: Math.round(c.x),
        y: Math.round(c.y),
        w: Math.round(c.width),
        h: Math.round(c.height),
      },
    };
  });
}

const historyChrome = await chromePos();
console.log("CHROME_HISTORY", historyChrome);
assert.equal(historyChrome.hidden, false, "履歴画面でトグルが見えない");
assert.equal(historyChrome.toggle.x, 247, `トグルの左位置が履歴基準と違う: ${historyChrome.toggle.x}`);
assert.equal(historyChrome.toggle.y, 10, `トグルの高さが履歴基準と違う: ${historyChrome.toggle.y}`);
assert.equal(historyChrome.compose.y, historyChrome.toggle.y, "記録するがトグルと高さが揃っていない");
await chromeShot("chrome-01-history");

// --- 状態モードへ切り替え ------------------------------------------------
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });

const layoutHidden = await page.locator("#app-shell .layout").evaluate((el) => el.hidden);
assert.equal(layoutHidden, true, "3カラムが隠れていない");

const statusChrome = await chromePos();
console.log("CHROME_STATUS", statusChrome);
assert.equal(statusChrome.hidden, false, "状態モードでトグルが見えない");
assert.deepEqual(statusChrome.toggle, historyChrome.toggle, "状態モードでトグルの位置が動いている");
assert.deepEqual(statusChrome.compose, historyChrome.compose, "状態モードで「記録する」の位置が動いている");
await chromeShot("chrome-02-status");

const header = await page.locator("#screen-status .status-topbar__meta").innerText();
console.log("HEADER", header.replace(/\s+/g, " "));
assert.ok(header.includes("00001"), "カルテ番号が出ていない");
assert.ok(header.includes("イチロウちゃん"), "動物名が出ていない");

const counts = await page.evaluate(() => ({
  meds: document.querySelectorAll("#status-meds-list .status-row").length,
  examPlans: document.querySelectorAll("#status-exam-plan-list .status-row").length,
  examHistory: document.querySelectorAll("#status-exam-history-list .status-row").length,
  histories: document.querySelectorAll("#status-history-list .status-row").length,
  procPlans: document.querySelectorAll("#status-proc-plan-list .status-row").length,
  procHistory: document.querySelectorAll("#status-proc-history-list .status-row").length,
  notes: document.querySelectorAll("#status-notes-list .status-row").length,
  notesHigh: document.querySelectorAll(
    "#status-notes-list .note-card__importance--high"
  ).length,
  medOrder: [...document.querySelectorAll("#status-meds-list .status-row")].map((el) =>
    el.innerText.replace(/\s+/g, " ").trim()
  ),
  dueClasses: [...document.querySelectorAll("#status-exam-plan-list .status-row__due")].map(
    (el) => el.className
  ),
}));
console.log(counts);

assert.equal(counts.meds, 6, "薬剤が全件（6件）出ていない");
assert.equal(counts.examPlans, 3, "検査予定が3件出ていない");
assert.equal(counts.examHistory, 3, "検査実施履歴が3件出ていない");
assert.equal(counts.histories, 4, "既往歴が4件出ていない");
assert.equal(counts.procPlans, 2, "処置予定が2件出ていない");
assert.equal(counts.procHistory, 2, "処置実施履歴が2件出ていない");
assert.equal(counts.notes, 5, "重要度に関わらず特記が全件（5件）出ていない");
assert.equal(counts.notesHigh, 2, "重要度「高」の特記が特記ブロックに含まれていない");

// 並び順: 継続 → 一時的 → 投与難 → 休薬中 → 中止
const statusSeq = counts.medOrder.map((t) =>
  ["継続", "一時的", "投与難", "休薬中", "中止"].find((s) => t.includes(s))
);
console.log("MED_STATUS_ORDER", statusSeq);
assert.deepEqual(
  statusSeq,
  ["継続", "継続", "一時的", "投与難", "休薬中", "中止"],
  "薬剤の並び順が使用状況→カテゴリになっていない"
);

// 残日数の色分けが付いていること（超過を含む）
assert.ok(
  counts.dueClasses.some((c) => c.includes("exam-due-text--overdue")),
  "超過の色分けが付いていない"
);
assert.ok(
  counts.dueClasses.some((c) => c.includes("exam-due-text--far")),
  "余裕ありの色分けが付いていない"
);

// --- 4列固定レイアウト: 既往歴 → 検査＋処置 → 薬剤 → 特記 -------------------
const layout = await page.evaluate(() => {
  const rectOf = (id) => document.getElementById(id)?.getBoundingClientRect();
  return {
    cols: ["status-col-history", "status-col-exam-proc", "status-col-meds", "status-col-notes"].map(
      (id) => rectOf(id)?.x
    ),
    examTop: rectOf("status-block-exam")?.y,
    procTop: rectOf("status-block-proc")?.y,
  };
});
console.log("LAYOUT", layout);
const [xHistory, xExamProc, xMeds, xNotes] = layout.cols;
assert.ok(
  xHistory < xExamProc && xExamProc < xMeds && xMeds < xNotes,
  `4列の左右順が指示通りでない: ${JSON.stringify(layout.cols)}`
);
assert.ok(
  layout.examTop < layout.procTop,
  "同じ列内で検査が処置より上に来ていない"
);

const ADD_HISTORY = "状態モード検証紹介先";
const ADD_EXAM = "CBC";
const ADD_MED = "状態モード検証薬";
const ADD_PROC = "状態モード検証処置";
const ADD_NOTE = "状態モード検証特記";

async function clickLinear(listSelector, label) {
  await page
    .locator(`${listSelector} .med-linear-picker__item .med-linear-picker__item-label`, {
      hasText: label,
    })
    .first()
    .click();
}

async function goHistoryView() {
  await page.click("#btn-view-history");
  await page.waitForFunction(
    () => document.getElementById("screen-status")?.hasAttribute("hidden"),
    null,
    { timeout: 5000 }
  );
}

async function goStatusView() {
  await page.click("#btn-view-status");
  await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
}

async function assertContains(selector, text, label) {
  const body = await page.locator(selector).innerText();
  assert.ok(body.includes(text), `${label}: ${selector} に「${text}」がない`);
}

// --- 各ブロックの「＋」から新規追加 ---------------------------------------
const addBtnIds = [
  "btn-status-history-add",
  "btn-status-exam-add",
  "btn-status-meds-add",
  "btn-status-proc-add",
  "btn-status-notes-add",
];
for (const id of addBtnIds) {
  assert.ok(await page.locator(`#${id}`).count(), `状態モードに ${id} がない`);
}

// 既往歴
await page.click("#btn-status-history-add");
await page.waitForSelector("#history-add-modal:not([hidden])", { timeout: 5000 });
await page
  .locator("#history-add-type-buttons .exam-item-btn", { hasText: "紹介・専門治療歴" })
  .click();
await page.click("#btn-history-add-toggle");
await page.fill("#history-add-new-item", ADD_HISTORY);
await page.click("#btn-history-add-new-item");
await page.click("#btn-history-add-save");
await page.waitForFunction(
  () => document.getElementById("history-add-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);
await assertContains("#status-history-list", ADD_HISTORY, "既往歴・状態モード");

// 検査（予定として登録。モード切替も利用可能）
await page.click("#btn-status-exam-add");
await page.waitForSelector("#exam-plan-modal:not([hidden])", { timeout: 5000 });
assert.ok(
  await page.locator("#exam-plan-mode-toggle").isVisible(),
  "検査追加モーダルに登録方法トグルが出ていない"
);
await clickLinear("#exam-plan-col-category-list", "血液");
await clickLinear("#exam-plan-col-leaf-list", ADD_EXAM);
await page.locator('#exam-plan-fasting-buttons [data-fasting="none"]').click();
await page.fill("#exam-plan-due-date", "2026-09-01");
await page.click("#btn-exam-plan-save");
await page.waitForFunction(
  () => document.getElementById("exam-plan-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);
await assertContains("#status-exam-plan-list", ADD_EXAM, "検査予定・状態モード");

// 薬剤
await page.click("#btn-status-meds-add");
await page.waitForSelector("#med-add-modal:not([hidden])", { timeout: 5000 });
await page.locator("#med-add-col-category-list .med-linear-picker__item").first().click();
await page.click("#btn-med-add-toggle");
await page.fill("#med-add-new-item", ADD_MED);
await page.click("#btn-med-add-new-item");
await page.click("#btn-med-add-save");
await page.waitForFunction(
  () => document.getElementById("med-add-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);
await assertContains("#status-meds-list", ADD_MED, "薬剤・状態モード");

// 処置
await page.click("#btn-status-proc-add");
await page.waitForSelector("#procedure-plan-modal:not([hidden])", { timeout: 5000 });
await page.fill("#procedure-plan-content", ADD_PROC);
await page.fill("#procedure-plan-due-date", "2026-09-15");
await page.click("#btn-procedure-plan-save");
await page.waitForFunction(
  () => document.getElementById("procedure-plan-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);
await assertContains("#status-proc-plan-list", ADD_PROC, "処置予定・状態モード");

// 処置:「実施を記録」への切替（予定を経由せず実施履歴にだけ追加する）
const ADD_PROC_HIST = "状態モード検証処置（実施のみ）";
await page.click("#btn-status-proc-add");
await page.waitForSelector("#procedure-plan-modal:not([hidden])", { timeout: 5000 });
assert.ok(
  await page.locator("#procedure-plan-mode-toggle").isVisible(),
  "処置追加モーダルに登録方法トグルが出ていない"
);
await page.click("#btn-procedure-mode-history");
assert.ok(
  await page.locator("#procedure-plan-due-field").isHidden(),
  "実施を記録モードで予定日欄が隠れていない"
);
assert.ok(
  await page.locator("#procedure-plan-history-date-field").isVisible(),
  "実施を記録モードで実施日欄が出ていない"
);
await page.fill("#procedure-plan-content", ADD_PROC_HIST);
await page.fill("#procedure-plan-history-date", "2026-08-20");
await page.click("#btn-procedure-plan-save");
await page.waitForFunction(
  () => document.getElementById("procedure-plan-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);
await assertContains(
  "#status-proc-history-list",
  ADD_PROC_HIST,
  "処置実施履歴・状態モード（実施を記録トグル）"
);
const procPlansAfterHistOnly = await page
  .locator("#status-proc-plan-list .status-row")
  .count();
assert.equal(procPlansAfterHistOnly, 3, "「実施を記録」モードなのに処置予定が増えている");

// 特記
await page.click("#btn-status-notes-add");
await page.waitForSelector("#special-note-modal:not([hidden])", { timeout: 5000 });
await page.fill("#special-note-content", ADD_NOTE);
await page.locator("#special-note-author-row .author-btn").first().click();
await page.click("#btn-special-note-save");
await page.waitForFunction(
  () => document.getElementById("special-note-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);
await assertContains("#status-notes-list", ADD_NOTE, "特記・状態モード");

const countsAfterAdd = await page.evaluate(() => ({
  meds: document.querySelectorAll("#status-meds-list .status-row").length,
  examPlans: document.querySelectorAll("#status-exam-plan-list .status-row").length,
  histories: document.querySelectorAll("#status-history-list .status-row").length,
  procPlans: document.querySelectorAll("#status-proc-plan-list .status-row").length,
  notes: document.querySelectorAll("#status-notes-list .status-row").length,
}));
console.log("COUNTS_AFTER_ADD", countsAfterAdd);
assert.equal(countsAfterAdd.histories, 5, "既往歴が1件増えていない");
assert.equal(countsAfterAdd.examPlans, 4, "検査予定が1件増えていない");
assert.equal(countsAfterAdd.meds, 7, "薬剤が1件増えていない");
assert.equal(countsAfterAdd.procPlans, 3, "処置予定が1件増えていない");
assert.equal(countsAfterAdd.notes, 6, "特記が1件増えていない");

// --- 右カラム: 5タブ・5パネルが削除され、検索専用スペースになっていること ---
await goHistoryView();
assert.equal(await page.locator("#right-tabs").count(), 0, "右カラムに旧タブが残っている");
for (const panelId of ["panel-history", "panel-exam", "panel-meds", "panel-proc", "panel-notes"]) {
  assert.equal(await page.locator(`#${panelId}`).count(), 0, `右カラムに旧パネル #${panelId} が残っている`);
}
assert.equal(await page.locator(".right-panel").count(), 1, "右カラムの検索パネル以外に .right-panel が残っている");
await page.waitForSelector("#panel-qa:not([hidden])", { timeout: 5000 });

// 検索は検査予定・薬剤の出来事を横断できること（既往歴・処置・特記は対象外）
await page.fill("#chart-search-input", ADD_EXAM);
await page.waitForTimeout(150);
await assertContains("#chart-search-results", ADD_EXAM, "検索結果・検査予定");
await page.fill("#chart-search-input", ADD_MED);
await page.waitForTimeout(150);
await assertContains("#chart-search-results", ADD_MED, "検索結果・薬剤");
await page.fill("#chart-search-input", "");
await page.waitForTimeout(150);

await goStatusView();
await shot("08-after-status-adds");

await shot("01-overview");
await page.screenshot({
  path: path.join(outDir, "01-overview-full.png"),
  fullPage: true,
});

// --- タップで既存の編集ポップアップが開くこと ----------------------------
async function expectOpens(rowSelector, modalSelector, closeSelector, label) {
  await page.locator(rowSelector).first().click();
  await page.waitForSelector(`${modalSelector}:not([hidden])`, { timeout: 5000 });
  console.log(`OK tap ${label} → ${modalSelector}`);
  const shotName = `edit-${label}`;
  await shot(shotName);
  await page.click(closeSelector);
  await page.waitForFunction(
    (sel) => document.querySelector(sel)?.hasAttribute("hidden"),
    modalSelector,
    { timeout: 5000 }
  );
  return shotName;
}

await expectOpens(
  "#status-meds-list .status-row",
  "#med-detail-sheet",
  "#btn-close-med-detail-sheet",
  "02-med"
);
await expectOpens(
  "#status-exam-plan-list .status-row",
  "#exam-item-sheet",
  "#btn-close-exam-item-sheet",
  "03-exam-plan"
);
await expectOpens(
  "#status-history-list .status-row",
  "#status-detail-modal",
  "#btn-close-status-detail",
  "04-history"
);
await expectOpens(
  "#status-proc-plan-list .status-row",
  "#procedure-plan-modal",
  "#btn-close-procedure-plan-modal",
  "05-proc-plan"
);
await expectOpens(
  "#status-proc-history-list .status-row",
  "#procedure-modal",
  "#btn-close-procedure-modal",
  "06-proc-history"
);
// 特記は重要度に関わらず1つのブロックに入る（DB側で高→中→低の順にソート
// されているため、先頭は重要度「高」のはず）。そのタップで編集ポップアップが
// 開くことを確認する
const firstNoteBadge = await page
  .locator("#status-notes-list .status-row .note-card__importance")
  .first()
  .innerText();
assert.ok(firstNoteBadge.includes("高"), "特記ブロックの先頭が重要度「高」になっていない");
await expectOpens(
  "#status-notes-list .status-row",
  "#special-note-modal",
  "#btn-close-special-note-modal",
  "07-note-high"
);

// --- 実際に編集して反映されること ---------------------------------------
await page.locator("#status-notes-list .status-row").first().click();
await page.waitForSelector("#special-note-modal:not([hidden])", { timeout: 5000 });
await page.fill("#special-note-content", "自宅では飼い主さんが薬を潰して缶詰に混ぜている。（状態モードから編集）");
await page.locator("#special-note-author-row .author-btn").first().click();
await page.click("#btn-special-note-save");
await page.waitForFunction(
  () => document.getElementById("special-note-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);
const editedText = await page.locator("#status-notes-list .status-row").first().innerText();
console.log("EDITED", editedText.replace(/\s+/g, " "));
assert.ok(editedText.includes("状態モードから編集"), "特記の編集結果が状態モードに反映されない");
await shot("09-after-edit");

// --- スワイプ削除アイコンが前面に透けないこと ----------------------------
function parseAlpha(color) {
  const m = String(color || "").match(/rgba?\(([^)]+)\)/);
  if (!m) return 1;
  const parts = m[1].split(",").map((s) => s.trim());
  return parts.length === 4 ? Number(parts[3]) : 1;
}

async function swipeOpen(rowSelector, side) {
  const row = page.locator(rowSelector).first();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  assert.ok(box, `${rowSelector} の行が見つからない`);
  const y = box.y + box.height / 2;
  if (side === "delete") {
    await page.mouse.move(box.x + 16, y);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(box.width - 8, 120), y, { steps: 12 });
  } else {
    await page.mouse.move(box.x + box.width - 16, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 10, y, { steps: 12 });
  }
  await page.mouse.up();
  await page.waitForTimeout(180);
}

async function closeOpenSwipe() {
  await page.mouse.click(8, 80);
  await page.waitForTimeout(120);
}

async function assertSwipeOpaque(rowSelector, shotName, label, side) {
  await swipeOpen(rowSelector, side);
  const scoped = await page.locator(rowSelector).first().evaluate((row, openSide) => {
    const front = row.querySelector(".swipeable__front");
    const panelSel =
      openSide === "delete" ? ".swipeable__actions--delete" : ".swipeable__actions--edit";
    const btnSel =
      openSide === "delete" ? ".icon-btn--delete" : ".icon-btn--refresh, .icon-btn--edit";
    const panel = row.querySelector(panelSel);
    const btn = panel?.querySelector(btnSel);
    if (!front || !panel || !btn) return { ok: false, reason: "swipe action DOM missing" };
    const frontCs = getComputedStyle(front);
    const btnCs = getComputedStyle(btn);
    const panelCs = getComputedStyle(panel);
    const rowBox = row.getBoundingClientRect();
    const frontBox = front.getBoundingClientRect();
    return {
      ok: true,
      frontBg: frontCs.backgroundColor,
      frontTransform: frontCs.transform,
      btnOpacity: btnCs.opacity,
      btnBg: btnCs.backgroundColor,
      panelBg: panelCs.backgroundColor,
      shift: Math.round(frontBox.left - rowBox.left),
      open: row.classList.contains(
        openSide === "delete" ? "is-actions-open-delete" : "is-actions-open-edit"
      ),
    };
  }, side);
  console.log("SWIPE", label, scoped);
  assert.equal(scoped.ok, true, `${label}: ${scoped.reason || "スワイプ操作DOMがない"}`);
  assert.equal(scoped.open, true, `${label}: スワイプで操作が開いていない`);
  assert.ok(parseAlpha(scoped.frontBg) >= 1, `${label}: 前面が透明でアイコンが透ける (${scoped.frontBg})`);
  assert.equal(Number(scoped.btnOpacity), 1, `${label}: アイコンの opacity が 1 ではない`);
  if (side === "delete") {
    assert.ok(parseAlpha(scoped.btnBg) >= 1, `${label}: ゴミ箱の背景が透明 (${scoped.btnBg})`);
    assert.ok(parseAlpha(scoped.panelBg) >= 1, `${label}: 削除パネルの背景が透明 (${scoped.panelBg})`);
  }
  if (side === "delete") {
    assert.ok(scoped.shift >= 50, `${label}: 前面が右にずれていない (shift=${scoped.shift})`);
  } else {
    assert.ok(scoped.shift <= -50, `${label}: 前面が左にずれていない (shift=${scoped.shift})`);
  }
  const modalOpen = await page.evaluate(() =>
    [...document.querySelectorAll(".modal")].some((el) => !el.hidden)
  );
  assert.equal(modalOpen, false, `${label}: スワイプ後に編集モーダルが開いている`);
  const box = await page.locator(rowSelector).first().boundingBox();
  await page.screenshot({
    path: path.join(outDir, `${shotName}.png`),
    clip: {
      x: Math.max(0, box.x - 8),
      y: Math.max(0, box.y - 8),
      width: Math.min(360, box.width + 16),
      height: box.height + 16,
    },
  });
  await closeOpenSwipe();
}

await assertSwipeOpaque("#status-history-list .status-row", "swipe-01-history", "既往歴", "delete");
await assertSwipeOpaque(
  "#status-exam-history-list .status-row",
  "swipe-02-exam-history",
  "検査実施履歴",
  "edit"
);
await assertSwipeOpaque("#status-meds-list .status-row", "swipe-03-meds", "薬剤", "delete");
await assertSwipeOpaque(
  "#status-proc-history-list .status-row",
  "swipe-04-proc-history",
  "処置実施履歴",
  "delete"
);
await assertSwipeOpaque("#status-notes-list .status-row", "swipe-05-notes", "特記", "delete");

// --- 状態 ⇄ 履歴 の切り替え ---------------------------------------------
await page.click("#btn-view-history");
await page.waitForFunction(
  () => document.getElementById("screen-status")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);
const layoutBack = await page.locator("#app-shell .layout").evaluate((el) => el.hidden);
assert.equal(layoutBack, false, "履歴に戻っても3カラムが表示されない");
const toggleState = await page.evaluate(() => ({
  status: document.getElementById("btn-view-status")?.className,
  history: document.getElementById("btn-view-history")?.className,
}));
assert.ok(toggleState.history.includes("is-active"), "トグルが履歴側に戻っていない");
const historyChromeBack = await chromePos();
assert.deepEqual(historyChromeBack.toggle, historyChrome.toggle, "履歴に戻したらトグルの位置が変わっている");
assert.deepEqual(historyChromeBack.compose, historyChrome.compose, "履歴に戻したら「記録する」の位置が変わっている");
await chromeShot("chrome-03-history-back");
await shot("10-history-view");

// 右カラムはタブなしの検索専用スペースのままであること
const rightTabsAfter = await page.locator("#right-tabs").count();
assert.equal(rightTabsAfter, 0, "右カラムに旧タブが復活している");
await page.waitForSelector("#panel-qa:not([hidden])", { timeout: 5000 });

// 状態へ戻す（再読み込みなしで即時）
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 3000 });
const medsStillThere = await page
  .locator("#status-meds-list .status-row")
  .count();
assert.equal(medsStillThere, 7, "切替後に薬剤一覧が消えている");
await shot("11-back-to-status");

// 「記録する」で入力モードが開くこと
await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
const statusHidden = await page.locator("#screen-status").evaluate((el) => el.hidden);
assert.equal(statusHidden, true, "記録するで入力モードに切り替わっていない");
await shot("12-compose");

if (pageErrors.length) {
  throw new Error(`page errors:\n${pageErrors.join("\n")}`);
}

console.log("OK: 状態モードの表示・編集・切替をすべて確認");
await browser.close();
server.close();
