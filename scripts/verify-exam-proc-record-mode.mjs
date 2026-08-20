/**
 * 検査・処置の「実施記録を追加」画面（本日実施した内容の記録）に追加した
 * 「継続として記録」／「単発として記録」トグルを検証する。
 * - 継続: これまで通りその項目の実施履歴として蓄積され、状態モードの
 *   検査／処置ブロックに表示される
 * - 単発: 実施履歴には残さず、中央カラムの時系列にその日の出来事として
 *   記録される
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
  serviceWorkers: "block",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => {
  pageErrors.push(String(e));
  console.warn("pageerror", String(e));
});
page.on("dialog", (d) => d.accept());

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

await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });

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

async function timelineHeadlines() {
  return page.locator("#timeline .tl-item__headline").allTextContents();
}

async function timelineBodyFor(headlineText) {
  return page.evaluate((needle) => {
    const items = [...document.querySelectorAll("#timeline .tl-item")];
    const hit = items.find((li) =>
      (li.querySelector(".tl-item__headline")?.textContent || "").includes(needle)
    );
    return hit ? hit.querySelector(".tl-item__body")?.textContent || "" : null;
  }, headlineText);
}

// ---------------------------------------------------------------------
// 1) 検査: 単発として記録 → 実施履歴には残らず、時系列にのみ記録される
// ---------------------------------------------------------------------
const examHistBefore = await page
  .locator("#status-exam-history-list .status-row")
  .count();

await page.click("#btn-status-exam-add");
await page.waitForSelector("#exam-plan-modal:not([hidden])", { timeout: 5000 });
await clickLinear("#exam-plan-col-category-list", "血液");
await clickLinear("#exam-plan-col-leaf-list", "CBC");
await page.check("#exam-plan-done-check");
await page.waitForFunction(
  () => document.getElementById("exam-plan-done-date")?.disabled === false
);
await page.fill("#exam-plan-done-date", "2026-08-18");
await page.dispatchEvent("#exam-plan-done-date", "change");

const examModeDefault = await page.evaluate(() => ({
  continuousActive: document
    .getElementById("btn-exam-done-mode-continuous")
    ?.classList.contains("is-active"),
  singleActive: document
    .getElementById("btn-exam-done-mode-single")
    ?.classList.contains("is-active"),
}));
console.log("EXAM_MODE_DEFAULT", examModeDefault);
assert.equal(examModeDefault.continuousActive, true, "検査: 既定は「継続として記録」ではない");
assert.equal(examModeDefault.singleActive, false, "検査: 既定で「単発」が選ばれている");

await page.click("#btn-exam-done-mode-single");
await page.fill("#exam-plan-done-note", "単発検証メモ（CBC）");
await page.click("#btn-exam-plan-save");
await page.waitForFunction(
  () => document.getElementById("exam-plan-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);

const examHistAfterSingle = await page
  .locator("#status-exam-history-list .status-row")
  .count();
console.log("EXAM_HIST_COUNT after single", examHistAfterSingle, "before", examHistBefore);
assert.equal(
  examHistAfterSingle,
  examHistBefore,
  "検査: 単発として記録したのに実施履歴（状態モード）が増えている"
);

await goHistoryView();
const headlinesAfterExamSingle = await timelineHeadlines();
console.log("TIMELINE after exam single", headlinesAfterExamSingle);
assert.ok(
  headlinesAfterExamSingle.some((t) => t.includes("CBC実施")),
  "検査: 単発として記録した内容が中央カラムの時系列に出ていない"
);
const examSingleBody = await timelineBodyFor("CBC実施");
assert.ok(
  (examSingleBody || "").includes("単発検証メモ"),
  "検査: 時系列エントリに実施メモが反映されていない"
);
await goStatusView();

// ---------------------------------------------------------------------
// 2) 検査: 継続として記録（既定） → これまで通り実施履歴に蓄積される
// ---------------------------------------------------------------------
await page.click("#btn-status-exam-add");
await page.waitForSelector("#exam-plan-modal:not([hidden])", { timeout: 5000 });
await clickLinear("#exam-plan-col-category-list", "血液");
await clickLinear("#exam-plan-col-leaf-list", "CBC");
await page.check("#exam-plan-done-check");
await page.waitForFunction(
  () => document.getElementById("exam-plan-done-date")?.disabled === false
);
await page.fill("#exam-plan-done-date", "2026-08-19");
await page.dispatchEvent("#exam-plan-done-date", "change");
// 「継続として記録」は既定のままクリックしない
await page.fill("#exam-plan-done-note", "継続検証メモ（CBC）");
await page.click("#btn-exam-plan-save");
await page.waitForFunction(
  () => document.getElementById("exam-plan-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);

const examHistAfterContinuous = await page
  .locator("#status-exam-history-list .status-row")
  .count();
console.log(
  "EXAM_HIST_COUNT after continuous",
  examHistAfterContinuous,
  "before",
  examHistBefore
);
assert.equal(
  examHistAfterContinuous,
  examHistBefore + 1,
  "検査: 継続として記録したのに実施履歴（状態モード）が増えていない"
);
const examHistText = await page.locator("#status-exam-history-list").innerText();
assert.ok(
  examHistText.includes("継続検証メモ"),
  "検査: 継続として記録した内容が状態モードの検査ブロックに出ていない"
);

// ---------------------------------------------------------------------
// 3) 処置: 単発として記録 → 実施履歴には残らず、時系列にのみ記録される
// ---------------------------------------------------------------------
const procHistBefore = await page
  .locator("#status-proc-history-list .status-row")
  .count();

const PROC_SINGLE = "処置単発検証テスト";
await page.click("#btn-status-proc-add");
await page.waitForSelector("#procedure-plan-modal:not([hidden])", { timeout: 5000 });
await page.fill("#procedure-plan-content", PROC_SINGLE);
await page.check("#procedure-plan-done-check");
await page.waitForFunction(
  () => document.getElementById("procedure-plan-done-date")?.disabled === false
);
await page.fill("#procedure-plan-done-date", "2026-08-18");
await page.dispatchEvent("#procedure-plan-done-date", "change");

const procModeDefault = await page.evaluate(() => ({
  continuousActive: document
    .getElementById("btn-procedure-done-mode-continuous")
    ?.classList.contains("is-active"),
  singleActive: document
    .getElementById("btn-procedure-done-mode-single")
    ?.classList.contains("is-active"),
}));
console.log("PROC_MODE_DEFAULT", procModeDefault);
assert.equal(procModeDefault.continuousActive, true, "処置: 既定は「継続として記録」ではない");
assert.equal(procModeDefault.singleActive, false, "処置: 既定で「単発」が選ばれている");

await page.click("#btn-procedure-done-mode-single");
await page.fill("#procedure-plan-done-note", "単発処置検証メモ");
await page.click("#btn-procedure-plan-save");
await page.waitForFunction(
  () => document.getElementById("procedure-plan-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);

const procHistAfterSingle = await page
  .locator("#status-proc-history-list .status-row")
  .count();
console.log("PROC_HIST_COUNT after single", procHistAfterSingle, "before", procHistBefore);
assert.equal(
  procHistAfterSingle,
  procHistBefore,
  "処置: 単発として記録したのに実施履歴（状態モード）が増えている"
);
const procStatusText = await page.locator("#status-proc-history-list").innerText();
assert.ok(
  !procStatusText.includes(PROC_SINGLE),
  "処置: 単発として記録した内容が状態モードの処置ブロックに出てしまっている"
);

await goHistoryView();
const headlinesAfterProcSingle = await timelineHeadlines();
console.log("TIMELINE after proc single", headlinesAfterProcSingle);
assert.ok(
  headlinesAfterProcSingle.some((t) => t.includes(`${PROC_SINGLE}実施`)),
  "処置: 単発として記録した内容が中央カラムの時系列に出ていない"
);
const procSingleBody = await timelineBodyFor(`${PROC_SINGLE}実施`);
assert.ok(
  (procSingleBody || "").includes("単発処置検証メモ"),
  "処置: 時系列エントリに実施メモが反映されていない"
);
await goStatusView();

// ---------------------------------------------------------------------
// 4) 処置: 継続として記録（既定） → これまで通り実施履歴に蓄積される
// ---------------------------------------------------------------------
const PROC_CONTINUOUS = "処置継続検証テスト";
await page.click("#btn-status-proc-add");
await page.waitForSelector("#procedure-plan-modal:not([hidden])", { timeout: 5000 });
await page.fill("#procedure-plan-content", PROC_CONTINUOUS);
await page.check("#procedure-plan-done-check");
await page.waitForFunction(
  () => document.getElementById("procedure-plan-done-date")?.disabled === false
);
await page.fill("#procedure-plan-done-date", "2026-08-19");
await page.dispatchEvent("#procedure-plan-done-date", "change");
// 「継続として記録」は既定のままクリックしない
await page.fill("#procedure-plan-done-note", "継続処置検証メモ");
await page.click("#btn-procedure-plan-save");
await page.waitForFunction(
  () => document.getElementById("procedure-plan-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);

const procHistAfterContinuous = await page
  .locator("#status-proc-history-list .status-row")
  .count();
console.log(
  "PROC_HIST_COUNT after continuous",
  procHistAfterContinuous,
  "before",
  procHistBefore
);
assert.equal(
  procHistAfterContinuous,
  procHistBefore + 1,
  "処置: 継続として記録したのに実施履歴（状態モード）が増えていない"
);
const procStatusTextAfter = await page.locator("#status-proc-history-list").innerText();
assert.ok(
  procStatusTextAfter.includes(PROC_CONTINUOUS),
  "処置: 継続として記録した内容が状態モードの処置ブロックに出ていない"
);

const outDir = path.join(root, "tools");
fs.mkdirSync(outDir, { recursive: true });
await goStatusView();
await page.screenshot({
  path: path.join(outDir, "exam-proc-record-mode-status.png"),
});
await goHistoryView();
await page.screenshot({
  path: path.join(outDir, "exam-proc-record-mode-timeline.png"),
});

if (pageErrors.length) {
  throw new Error(`page errors:\n${pageErrors.join("\n")}`);
}

console.log("OK: 検査・処置の「継続として記録／単発として記録」を確認");
await browser.close();
server.close();
