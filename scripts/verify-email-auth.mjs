/**
 * メール/パスワード認証の起動フローを検証する。
 * - 未ログイン → ログイン画面
 * - 誤パスワード → エラー、パスコードに進まない
 * - 正パスワード → パスコード画面
 * - パスコード後 → カルテゲート
 * - サインアウトは設定メニューのみ（パスコード画面には無い）
 * - サインアウト時は管理者パスコード（oono）が必要
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_AUTH_EMAIL } from "./mock-auth-email.js";

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
      return await chromium.launch({
        executablePath,
        headless: true,
        timeout: 30_000,
      });
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
export function todayDateStrLocal() { return "2026-08-08"; }
export function isPasscodeVerified() {
  return localStorage.getItem(PASSCODE_STORAGE_KEY) === "1" &&
    localStorage.getItem(PASSCODE_DATE_KEY) === todayDateStrLocal();
}
export function setPasscodeVerified() {
  localStorage.setItem(PASSCODE_STORAGE_KEY, "1");
  localStorage.setItem(PASSCODE_DATE_KEY, todayDateStrLocal());
}
export function clearPasscodeVerified() {
  localStorage.removeItem(PASSCODE_STORAGE_KEY);
  localStorage.removeItem(PASSCODE_DATE_KEY);
}
`;
const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test"; }
export function setApiKey() {}
export function clearApiKey() {}
`;
const mockFirebase = `export const app = {};`;

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
  ["**/js/auth.js", MOCK_AUTH_EMAIL],
  ["**/js/passcode-auth.js", mockPasscode],
  ["**/js/api-key.js", mockApiKey],
  ["**/js/firebase-app.js", mockFirebase],
]) {
  await page.route(pattern, (route) =>
    route.fulfill({ contentType: "application/javascript", body })
  );
}

async function visibleGates() {
  return page.evaluate(() => ({
    login: !document.getElementById("screen-login")?.hidden,
    lock: !document.getElementById("screen-lock")?.hidden,
    app: !document.getElementById("app-shell")?.hidden,
    karte: !document.getElementById("gate-karte")?.hidden,
    main: !document.getElementById("center-main")?.hidden,
    passcodeSignOut: Boolean(document.getElementById("btn-firebase-sign-out")),
  }));
}

fs.mkdirSync(outDir, { recursive: true });

await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector("#screen-login:not([hidden])", { timeout: 10_000 });
let gates = await visibleGates();
console.log("START", gates);
assert.equal(gates.login, true, "未ログイン時はログイン画面");
assert.equal(gates.lock, false);
assert.equal(gates.app, false);
assert.equal(gates.passcodeSignOut, false, "パスコード画面にサインアウトボタンが残っています");
await page.locator("#screen-login .lock-screen__card").screenshot({
  path: path.join(outDir, "email-auth-login.png"),
});

// 誤パスワード
await page.fill("#login-email", "clinic@example.com");
await page.fill("#login-password", "wrong-password");
await page.click("#btn-login");
await page.waitForFunction(() => {
  const el = document.getElementById("login-error");
  return el && !el.hidden && (el.textContent || "").length > 0;
});
const wrongMsg = await page.locator("#login-error").innerText();
console.log("WRONG", wrongMsg);
assert.match(wrongMsg, /メールアドレスまたはパスワード/);
gates = await visibleGates();
assert.equal(gates.login, true, "誤パスワードではログイン画面のまま");
assert.equal(gates.lock, false);
await page.locator("#screen-login .lock-screen__card").screenshot({
  path: path.join(outDir, "email-auth-wrong-password.png"),
});

// 正パスワード → パスコード
await page.fill("#login-password", "correct-password");
await page.click("#btn-login");
await page.waitForSelector("#screen-lock:not([hidden])", { timeout: 10_000 });
gates = await visibleGates();
console.log("AFTER_LOGIN", gates);
assert.equal(gates.login, false);
assert.equal(gates.lock, true);
assert.equal(gates.passcodeSignOut, false, "パスコード画面にサインアウトを置いてはいけない");
await page.locator("#screen-lock .lock-screen__card").screenshot({
  path: path.join(outDir, "email-auth-passcode.png"),
});

// パスコード → カルテ → 本編（設定メニューを出すため）
for (const d of ["2", "2", "1", "1"]) {
  await page.click(`#passcode-numpad [data-pass-digit="${d}"]`);
}
await page.click('#passcode-numpad [data-pass-action="confirm"]');
await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10_000 });
for (const d of ["1", "2", "3", "4", "5"]) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click('#karte-numpad [data-karte-action="confirm"]');
await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10_000 });
await page.fill("#animal-name-input", "テスト");
await page.click("#btn-animal-next");
await page.waitForSelector("#center-main:not([hidden])", { timeout: 10_000 });
gates = await visibleGates();
console.log("AFTER_MAIN", gates);
assert.equal(gates.main, true);
await page.screenshot({ path: path.join(outDir, "email-auth-main.png") });

// サインアウト: 誤った管理者パスコードでは抜けない
page.once("dialog", (d) => d.accept());
await page.click("#btn-app-menu");
await page.click('[data-app-menu-action="signout-account"]');
await page.waitForFunction(
  () => document.getElementById("master-delete-modal")?.hidden === false
);
const adminTitle = await page.locator("#master-delete-modal-title").innerText();
assert.match(adminTitle, /サインアウト/);
await page.fill("#master-delete-passcode", "wrong");
await page.click("#btn-master-delete-confirm");
await page.waitForFunction(() => {
  const el = document.getElementById("master-delete-error");
  return el && !el.hidden && (el.textContent || "").includes("違います");
});
gates = await visibleGates();
assert.equal(gates.main, true, "管理者パスコード誤りではサインアウトしない");
await page.locator("#master-delete-modal .modal__panel").screenshot({
  path: path.join(outDir, "email-auth-signout-admin-wrong.png"),
});

// 正しい管理者パスコードでサインアウト
await page.fill("#master-delete-passcode", "oono");
await page.click("#btn-master-delete-confirm");
await page.waitForSelector("#screen-login:not([hidden])", { timeout: 10_000 });
gates = await visibleGates();
console.log("AFTER_SIGNOUT", gates);
assert.equal(gates.login, true);
assert.equal(gates.app, false);
await page.locator("#screen-login .lock-screen__card").screenshot({
  path: path.join(outDir, "email-auth-after-signout.png"),
});

// 再ログイン後はまたパスコード
await page.fill("#login-email", "clinic@example.com");
await page.fill("#login-password", "correct-password");
await page.click("#btn-login");
await page.waitForSelector("#screen-lock:not([hidden])", { timeout: 10_000 });

assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join("\n")}`);

const rules = fs.readFileSync(path.join(root, "database.rules.json"), "utf8");
assert.match(rules, /REPLACE_WITH_CLINIC_UID/);
assert.ok(fs.existsSync(path.join(root, "firebase.json")));
assert.ok(fs.existsSync(path.join(root, "docs/AUTH-ROLLOUT.md")));

console.log("OK: email/password auth gate + protected sign-out");
await browser.close();
server.close();
