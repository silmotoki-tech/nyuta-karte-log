/**
 * 状態モード（全画面の状態一覧）を本番 index.html + app.js 経路で検証する。
 * - 各ブロックにデータが表示されること
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

// --- 状態モードへ切り替え ------------------------------------------------
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });

const layoutHidden = await page.locator("#app-shell .layout").evaluate((el) => el.hidden);
assert.equal(layoutHidden, true, "3カラムが隠れていない");

const header = await page.locator(".status-topbar__meta").innerText();
console.log("HEADER", header.replace(/\s+/g, " "));
assert.ok(header.includes("00001"), "カルテ番号が出ていない");
assert.ok(header.includes("イチロウちゃん"), "動物名が出ていない");

const counts = await page.evaluate(() => ({
  highNotes: document.querySelectorAll("#status-high-notes-list .status-alert").length,
  meds: document.querySelectorAll("#status-meds-list .status-row").length,
  examPlans: document.querySelectorAll("#status-exam-plan-list .status-row").length,
  examHistory: document.querySelectorAll("#status-exam-history-list .status-row").length,
  histories: document.querySelectorAll("#status-history-list .status-row").length,
  procPlans: document.querySelectorAll("#status-proc-plan-list .status-row").length,
  procHistory: document.querySelectorAll("#status-proc-history-list .status-row").length,
  notes: document.querySelectorAll("#status-notes-list .status-row").length,
  medOrder: [...document.querySelectorAll("#status-meds-list .status-row")].map((el) =>
    el.innerText.replace(/\s+/g, " ").trim()
  ),
  dueClasses: [...document.querySelectorAll("#status-exam-plan-list .status-row__due")].map(
    (el) => el.className
  ),
}));
console.log(counts);

assert.equal(counts.highNotes, 2, "重要度「高」の特記が2件出ていない");
assert.equal(counts.meds, 6, "薬剤が全件（6件）出ていない");
assert.equal(counts.examPlans, 3, "検査予定が3件出ていない");
assert.equal(counts.examHistory, 3, "検査実施履歴が3件出ていない");
assert.equal(counts.histories, 4, "既往歴が4件出ていない");
assert.equal(counts.procPlans, 2, "処置予定が2件出ていない");
assert.equal(counts.procHistory, 2, "処置実施履歴が2件出ていない");
assert.equal(counts.notes, 3, "中・低の特記が3件出ていない");

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
await expectOpens(
  "#status-notes-list .status-row",
  "#special-note-modal",
  "#btn-close-special-note-modal",
  "07-note"
);
await expectOpens(
  "#status-high-notes-list .status-alert",
  "#special-note-modal",
  "#btn-close-special-note-modal",
  "08-high-note"
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

// --- 状態 ⇄ 履歴 の切り替え ---------------------------------------------
await page.click("#btn-status-view-history");
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
await shot("10-history-view");

// 既存の右カラムが壊れていないこと
const rightTabs = await page.locator("#right-tabs .right-tab").count();
assert.equal(rightTabs, 6, "右カラムのタブ数が変わっている");

// 状態へ戻す（再読み込みなしで即時）
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 3000 });
const medsStillThere = await page
  .locator("#status-meds-list .status-row")
  .count();
assert.equal(medsStillThere, 6, "切替後に薬剤一覧が消えている");
await shot("11-back-to-status");

// 「記録する」で履歴側の入力欄が開くこと
await page.click("#btn-status-compose");
await page.waitForSelector("#entry-composer:not([hidden])", { timeout: 5000 });
const statusHidden = await page.locator("#screen-status").evaluate((el) => el.hidden);
assert.equal(statusHidden, true, "記録するで履歴画面に切り替わっていない");
await shot("12-compose");

if (pageErrors.length) {
  throw new Error(`page errors:\n${pageErrors.join("\n")}`);
}

console.log("OK: 状態モードの表示・編集・切替をすべて確認");
await browser.close();
server.close();
