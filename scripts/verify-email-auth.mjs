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
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";
import {
  AUTH_EMAIL,
  AUTH_PASSWORD,
  AUTH_USERS,
  applyAuthStub,
  enterPasscode,
  readMockDb,
} from "./auth-stub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tools");

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

const mockDb = readMockDb("mock-db-full-app-free-qa.js");

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

await applyAuthStub(page, {
  user: AUTH_USERS.none,
  dbMock: mockDb,
  stubApiKey: false,
});

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
await page.fill("#login-email", AUTH_EMAIL);
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
await page.fill("#login-password", AUTH_PASSWORD);
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
await enterPasscode(page);
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
await page.fill("#login-email", AUTH_EMAIL);
await page.fill("#login-password", AUTH_PASSWORD);
await page.click("#btn-login");
await page.waitForSelector("#screen-lock:not([hidden])", { timeout: 10_000 });

assert.deepEqual(pageErrors, [], `page errors:\n${pageErrors.join("\n")}`);

// ルールは中身の UID ではなく形（1アカウントに限定しているか）を見る。
// 実際の UID をここに書くと、医院ごとに差し替えるたびに検証が落ちる。
const rules = JSON.parse(
  fs.readFileSync(path.join(root, "database.rules.json"), "utf8")
);
const uidGuard = /^auth != null && auth\.uid === '[^']+'$/;
assert.match(rules.rules[".read"], uidGuard, "読み取りが単一アカウントに限定されていない");
assert.match(rules.rules[".write"], uidGuard, "書き込みが単一アカウントに限定されていない");
assert.equal(
  rules.rules[".read"],
  rules.rules[".write"],
  "読み取りと書き込みで許可アカウントが違う"
);
assert.ok(fs.existsSync(path.join(root, "firebase.json")));
assert.ok(fs.existsSync(path.join(root, "docs/AUTH-ROLLOUT.md")));

console.log("OK: email/password auth gate + protected sign-out");
await browser.close();
server.close();
