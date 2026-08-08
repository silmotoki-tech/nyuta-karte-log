/**
 * 移行進捗ボタン：未設定=赤、3段階の色変更、メモ保存・再表示を本番経路で検証する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tools");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

function findChromeHeadlessShell() {
  const cacheRoot = path.join(os.tmpdir(), "cursor-sandbox-cache");
  if (!fs.existsSync(cacheRoot)) return null;
  for (const dir of fs.readdirSync(cacheRoot)) {
    for (const arch of ["mac-arm64", "mac-x64"]) {
      const c = path.join(
        cacheRoot,
        dir,
        `playwright/chromium_headless_shell-1228/chrome-headless-shell-${arch}/chrome-headless-shell`
      );
      if (fs.existsSync(c)) return c;
    }
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
  return chromium.launch({ channel: "chrome", headless: true, timeout: 30_000 });
}

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-full-app-free-qa.js"),
  "utf8"
);
const mockPasscode = `
export const PASSCODE_STORAGE_KEY = "nyutaKartePasscodeVerified";
export const PASSCODE_DATE_KEY = "nyutaKartePasscodeVerifiedDate";
export function todayDateStrLocal() { return "2026-08-02"; }
export function isPasscodeVerified() { return true; }
export function setPasscodeVerified() {}
export function clearPasscodeVerified() {}
`;
const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test"; }
export function setApiKey() {}
export function clearApiKey() {}
`;
const mockFirebase = `export const app = {};`;
const mockAuth = MOCK_AUTH_LOGGED_IN;

const RED = "rgb(217, 83, 79)";
const YELLOW_BG = "rgb(253, 243, 217)";
const GREEN = "rgb(111, 184, 43)";

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
page.on("pageerror", (e) => pageErrors.push(String(e)));

for (const [pattern, body] of [
  ["**/js/db.js", mockDb],
  ["**/js/passcode-auth.js", mockPasscode],
  ["**/js/api-key.js", mockApiKey],
  ["**/js/firebase-app.js", mockFirebase],
  ["**/js/auth.js", mockAuth],
]) {
  await page.route(pattern, (route) =>
    route.fulfill({ contentType: "application/javascript", body })
  );
}

async function enterKarte(digits = ["1", "2", "3", "4", "5"], animal = "テスト") {
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10_000 });
  for (const d of digits) {
    await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
  }
  await page.click('#karte-numpad [data-karte-action="confirm"]');
  await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10_000 });
  await page.fill("#animal-name-input", animal);
  await page.click("#btn-animal-next");
  await page.waitForSelector("#center-main:not([hidden])", { timeout: 10_000 });
  await page.waitForSelector("#btn-migration-progress", { timeout: 10_000 });
}

async function btnStyle() {
  return page.locator("#btn-migration-progress").evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      status: el.dataset.status,
      bg: cs.backgroundColor,
      color: cs.color,
      text: el.textContent.trim(),
    };
  });
}

async function shot(name) {
  fs.mkdirSync(outDir, { recursive: true });
  const fp = path.join(outDir, name);
  await page.locator(".center-toolbar").screenshot({ path: fp });
  return fp;
}

async function saveStatus(label, memo) {
  await page.click("#btn-migration-progress");
  await page.waitForFunction(
    () => document.getElementById("migration-progress-modal")?.hidden === false
  );
  await page.locator(`.migration-status-btn:has-text("${label}")`).click();
  await page.fill("#migration-progress-memo", memo);
  await page.click("#btn-migration-progress-save");
  await page.waitForFunction(
    () => document.getElementById("migration-progress-modal")?.hidden === true
  );
}

// --- 1. 未設定カルテは赤（未着手） ---
await enterKarte(["9", "9", "9", "9", "1"], "未設定ワン");
const unset = await btnStyle();
console.log("UNSET", unset);
assert.equal(unset.status, "not_started");
assert.equal(unset.bg, RED);
assert.equal(unset.text, "移行");
const shotUnset = await shot("migration-progress-unset.png");

await page.click("#btn-migration-progress");
await page.waitForFunction(
  () => document.getElementById("migration-progress-modal")?.hidden === false
);
const modalUnset = await page.evaluate(() => ({
  selected: document.querySelector(".migration-status-btn.is-selected")?.textContent,
  memo: document.getElementById("migration-progress-memo")?.value,
  updated: document.getElementById("migration-progress-updated-at")?.textContent,
}));
assert.equal(modalUnset.selected, "未着手");
assert.equal(modalUnset.memo, "");
assert.match(modalUnset.updated, /まだ保存されていません/);
await page.locator("#migration-progress-modal .modal__panel").screenshot({
  path: path.join(outDir, "migration-progress-modal-unset.png"),
});
await page.click("#btn-migration-progress-cancel");

// --- 2. 途中（黄） ---
await saveStatus("途中", "既往歴と現在の薬まで入力済み。過去の検査歴は未着手");
const mid = await btnStyle();
console.log("IN_PROGRESS", mid);
assert.equal(mid.status, "in_progress");
assert.equal(mid.bg, YELLOW_BG);
const shotMid = await shot("migration-progress-in-progress.png");

await page.click("#btn-migration-progress");
await page.waitForFunction(
  () => document.getElementById("migration-progress-modal")?.hidden === false
);
const modalMid = await page.evaluate(() => ({
  selected: document.querySelector(".migration-status-btn.is-selected")?.textContent,
  memo: document.getElementById("migration-progress-memo")?.value,
  updated: document.getElementById("migration-progress-updated-at")?.textContent,
}));
assert.equal(modalMid.selected, "途中");
assert.equal(
  modalMid.memo,
  "既往歴と現在の薬まで入力済み。過去の検査歴は未着手"
);
assert.ok(!modalMid.updated.includes("まだ保存されていません"), modalMid.updated);
await page.locator("#migration-progress-modal .modal__panel").screenshot({
  path: path.join(outDir, "migration-progress-modal-in-progress.png"),
});
await page.click("#btn-migration-progress-cancel");

// --- 3. 完了（緑） ---
await saveStatus("完了", "紙カルテ・既存電子カルテから移行完了");
const done = await btnStyle();
console.log("DONE", done);
assert.equal(done.status, "done");
assert.equal(done.bg, GREEN);
const shotDone = await shot("migration-progress-done.png");

await page.click("#btn-migration-progress");
const modalDone = await page.evaluate(() => ({
  selected: document.querySelector(".migration-status-btn.is-selected")?.textContent,
  memo: document.getElementById("migration-progress-memo")?.value,
}));
assert.equal(modalDone.selected, "完了");
assert.equal(modalDone.memo, "紙カルテ・既存電子カルテから移行完了");
await page.locator("#migration-progress-modal .modal__panel").screenshot({
  path: path.join(outDir, "migration-progress-modal-done.png"),
});
await page.click("#btn-migration-progress-cancel");

// --- 4. 明示的に未着手へ戻すと赤 ---
await saveStatus("未着手", "いったん戻す");
const back = await btnStyle();
console.log("BACK_TO_NOT_STARTED", back);
assert.equal(back.status, "not_started");
assert.equal(back.bg, RED);
const shotBack = await shot("migration-progress-not-started.png");

// --- 5. 別カルテは独立して未着手（赤）のまま ---
await page.click("#btn-change-karte");
await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10_000 });
for (const d of ["8", "8", "8", "8", "2"]) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click('#karte-numpad [data-karte-action="confirm"]');
await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10_000 });
await page.fill("#animal-name-input", "別カルテ");
await page.click("#btn-animal-next");
await page.waitForSelector("#center-main:not([hidden])", { timeout: 10_000 });
const other = await btnStyle();
console.log("OTHER_KARTE", other);
assert.equal(other.status, "not_started");
assert.equal(other.bg, RED);
const shotOther = await shot("migration-progress-other-karte.png");

assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join("\n")}`);

console.log("OK screenshots:");
for (const p of [
  shotUnset,
  shotMid,
  shotDone,
  shotBack,
  shotOther,
  path.join(outDir, "migration-progress-modal-unset.png"),
  path.join(outDir, "migration-progress-modal-in-progress.png"),
  path.join(outDir, "migration-progress-modal-done.png"),
]) {
  console.log(" -", p);
}

await browser.close();
server.close();
