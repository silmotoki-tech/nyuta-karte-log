/**
 * 手順4: 状態モード・薬剤・検査予定の入口を画面から外す。
 * データとコードは残し、右カラムの既往歴と全文検索の残す対象は動かす。
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

const appSrc = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
assert.equal(appSrc.includes("runAiSuggestAfterSave"), false, "保存後にAI提案を呼んでいる");

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

function installRoutes(page) {
  page.on("pageerror", (err) => console.warn("pageerror", String(err)));
  return Promise.all([
    page.route("**/js/db.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockDb })
    ),
    page.route("**/js/passcode-auth.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockPasscode })
    ),
    page.route("**/js/api-key.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockApiKey })
    ),
    page.route("**/js/firebase-app.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: mockFirebase })
    ),
    page.route("**/js/auth.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: MOCK_AUTH_LOGGED_IN })
    ),
  ]);
}

async function openKarte(page) {
  await installRoutes(page);
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
  await page.waitForSelector("#panel-qa:not([hidden])", { timeout: 5000 });
  await page.waitForFunction(
    () => document.getElementById("right-history-list")?.innerText.includes("僧帽弁"),
    null,
    { timeout: 5000 }
  );
}

async function searchText(page, query) {
  await page.fill("#chart-search-input", query);
  await page.waitForTimeout(200);
  return page.locator("#chart-search-results").innerText();
}

const page = await context.newPage();
await openKarte(page);

assert.equal(await page.getByRole("button", { name: "状態", exact: true }).count(), 0, "状態ボタンが見えている");
assert.equal(await page.getByRole("button", { name: "履歴", exact: true }).count(), 0, "履歴ボタンが見えている");
assert.equal(await page.locator("#screen-status").isVisible(), false, "状態モードが開いている");
await page.locator("#btn-view-status").dispatchEvent("click");
assert.equal(await page.locator("#screen-status").isVisible(), false, "隠した状態ボタンから状態モードが開いた");

assert.equal(await page.getByRole("button", { name: "一括登録", exact: true }).count(), 0, "一括登録ボタンが見えている");
await page.locator("#btn-bulk-register").dispatchEvent("click");
assert.equal(await page.locator("#bulk-register-modal").isVisible(), false, "一括登録が開いた");

const before = await page.evaluate(() => ({
  meds: document.querySelectorAll("#status-meds-list > li").length,
  exams: document.querySelectorAll("#status-exam-plan-list > li").length,
  history: document.querySelectorAll("#right-history-list > li.status-row").length,
  docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  cols: [...document.querySelectorAll("#app-shell .layout > .col")].map((el) =>
    Math.round(el.getBoundingClientRect().width)
  ),
}));
assert.ok(before.meds > 0, "薬剤データが読み込まれていない");
assert.ok(before.exams > 0, "検査予定データが読み込まれていない");
assert.ok(before.history > 0, "既往歴が右カラムに出ていない");
assert.ok(before.docOverflow <= 1, "履歴画面で横スクロール");
assert.deepEqual(before.cols, [241, 494, 445], `列幅: ${before.cols}`);

const chrome = await page.evaluate(() => {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
  };
  const compose = document.getElementById("btn-start-compose");
  const frame = document.getElementById("app-view-chrome");
  const templates = document.getElementById("btn-open-templates");
  const back = document.getElementById("btn-change-karte");
  const menu = document.getElementById("btn-app-menu");
  const migration = document.getElementById("btn-migration-progress");
  return {
    toggleHidden: frame.querySelector(".view-toggle")?.hidden === true,
    composeGap: box(compose).left - box(frame).left,
    composeTop: box(compose).top,
    templatesTop: box(templates).top,
    backTop: box(back).top,
    menuTop: box(menu).top,
    migrationTop: box(migration).top,
    composeBeforeTemplates: box(compose).right <= box(templates).left,
    templatesBeforeMigration: box(templates).right <= box(migration).left,
    migrationBeforeMenu: box(migration).right <= box(menu).left,
    backVisible: !back.hidden,
  };
});
assert.equal(chrome.toggleHidden, true, "履歴トグルの枠が残っている");
assert.ok(chrome.composeGap <= 2, `記録するボタンの左に余白が残っている (${chrome.composeGap})`);
assert.equal(chrome.composeBeforeTemplates, true, "記録すると定型文が重なっている");
assert.equal(chrome.templatesBeforeMigration, true, "定型文と移行が重なっている");
assert.equal(chrome.migrationBeforeMenu, true, "移行と設定が重なっている");
assert.equal(chrome.backVisible, true, "戻るボタンが無い");
assert.ok(Math.abs(chrome.composeTop - chrome.templatesTop) <= 8, "記録すると定型文の高さがずれている");
assert.ok(Math.abs(chrome.composeTop - chrome.menuTop) <= 8, "記録すると設定の高さがずれている");
assert.ok(Math.abs(chrome.backTop - chrome.composeTop) <= 12, "戻ると記録するの高さがずれている");

await page.locator("#right-history-list .status-row").first().click();
await page.waitForSelector("#status-detail-modal:not([hidden])", { timeout: 5000 });
await page.click("#btn-close-status-detail");

await page.click("#btn-right-history-add");
await page.waitForSelector("#history-add-modal:not([hidden])", { timeout: 5000 });
await page.fill("#history-add-title", "右カラムから追加した既往");
await page.click("#btn-history-add-save");
await page.waitForFunction(
  () => document.getElementById("right-history-list")?.innerText.includes("右カラムから追加した既往"),
  null,
  { timeout: 5000 }
);

await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
assert.equal(await page.locator("#screen-input .input-chips").isVisible(), false, "本文から検出が見えている");
assert.equal(await page.locator("#input-today").isVisible(), false, "今日の登録が見えている");
assert.equal(await page.locator("#btn-input-add-med").isVisible(), false, "＋薬が見えている");
assert.equal(await page.locator("#btn-input-add-exam").isVisible(), false, "＋検査・処置が見えている");
assert.equal(await page.locator("#input-author-row").isVisible(), true, "記入者が無い");
assert.equal(await page.locator("#btn-input-save").isVisible(), true, "保存が無い");
assert.equal(await page.locator("#btn-input-save-next").isVisible(), true, "保存して次のカルテへが無い");
await page.click("#input-author-row .author-btn");
await page.fill("#input-headline", "入口外しの記録");
await page.fill("#input-body-text", "本文だけ保存する");
await page.click("#btn-input-save");
await page.waitForFunction(
  () => document.getElementById("timeline")?.innerText.includes("入口外しの記録"),
  null,
  { timeout: 5000 }
);
assert.equal(await page.locator("#screen-input").isVisible(), false, "保存後に入力モードが残っている");
assert.equal(await page.locator("#screen-status").isVisible(), false, "保存後に状態モードへ戻った");
assert.equal(await page.locator("#center-main").isVisible(), true, "保存後に履歴画面へ戻っていない");
assert.equal(await page.locator("#ai-suggest-review-modal").isVisible(), false, "AI提案が出た");
assert.equal(await page.locator("#med-detail-sheet").isVisible(), false, "薬剤詳細が開いた");
assert.equal(await page.locator("#exam-item-sheet").isVisible(), false, "検査予定が開いた");
assert.equal(await page.locator("#input-sheet-modal").isVisible(), false, "追加シートが開いた");

const after = await page.evaluate(() => ({
  meds: document.querySelectorAll("#status-meds-list > li").length,
  exams: document.querySelectorAll("#status-exam-plan-list > li").length,
  docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));
assert.equal(after.meds, before.meds, "記録の保存で薬剤が増えた");
assert.equal(after.exams, before.exams, "記録の保存で検査予定が増えた");
assert.ok(after.docOverflow <= 1, "保存後に横スクロール");

const historyHit = await searchText(page, "僧帽弁");
assert.ok(historyHit.includes("既往歴"), `既往歴がヒットしない: ${historyHit}`);
const noteHit = await searchText(page, "ささみ");
assert.ok(noteHit.includes("特記"), `特記がヒットしない: ${noteHit}`);
const addedHit = await searchText(page, "右カラムから追加した既往");
assert.ok(addedHit.includes("既往歴"), `追加した既往歴がヒットしない: ${addedHit}`);
const recordHit = await searchText(page, "入口外しの記録");
assert.ok(recordHit.includes("記録"), `記録がヒットしない: ${recordHit}`);

const medHit = await searchText(page, "プレドニゾロン");
assert.equal(medHit.includes("薬剤"), false, `薬剤がヒットした: ${medHit}`);
assert.equal(medHit.trim(), "", `薬剤名が検索に出ている: ${medHit}`);
const examHit = await searchText(page, "腎パネル");
assert.equal(examHit.trim(), "", `検査予定がヒットした: ${examHit}`);
const procHit = await searchText(page, "皮下点滴");
assert.equal(procHit.trim(), "", `処置がヒットした: ${procHit}`);

await page.click("#contra-card-view");
await page.fill("#contra-card-input", "ペニシリン系 検索用");
await page.click("#contra-card-save");
await page.waitForFunction(
  () => document.getElementById("contra-card-text")?.innerText.includes("ペニシリン系"),
  null,
  { timeout: 5000 }
);
const contraHit = await searchText(page, "ペニシリン系");
assert.ok(contraHit.includes("禁忌"), `禁忌がヒットしない: ${contraHit}`);

await page.locator('.exam-note-wrap[data-kind="blood"] .exam-note__view').click();
await page.fill("#exam-card-input-blood", "肝スク検索用");
await page.locator('.exam-note-wrap[data-kind="blood"] .exam-note__actions .btn--primary').click();
await page.waitForFunction(
  () => document.querySelector('.exam-note-wrap[data-kind="blood"] .exam-note__text')?.textContent.includes("肝スク検索用"),
  null,
  { timeout: 5000 }
);
const cardHit = await searchText(page, "肝スク検索用");
assert.ok(cardHit.includes("検査"), `検査カードがヒットしない: ${cardHit}`);
assert.equal(cardHit.includes("腎パネル"), false, "検査カードの検索に検査予定が混ざった");

await page.locator("#chart-search-results .chart-search-item__btn").first().click();
await page.waitForSelector('.exam-note-wrap[data-kind="blood"].has-text', { timeout: 3000 });

await browser.close();
await new Promise((r) => server.close(r));
console.log("OK: 外した入口と残した検索を確認");
