/**
 * 認証の関門を検証する。
 *
 * js/auth.js は本物を読み込み、Firebase Auth SDK だけを差し替えて
 * 起動時の認証状態（未ログイン／匿名／ログイン済み）を作り分ける。
 * 匿名セッションを「ログイン済み」と誤認して素通りする不具合の再発を防ぐ。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";
import {
  AUTH_DELAY_MS,
  AUTH_USERS,
  PASSCODE,
  applyAuthStub,
  enterPasscode,
  readMockDb,
  visibleScreens as screens,
} from "./auth-stub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const mockDb = readMockDb("mock-db-status-mode.js");

function contentType(fp) {
  if (fp.endsWith(".html")) return "text/html; charset=utf-8";
  if (fp.endsWith(".css")) return "text/css; charset=utf-8";
  if (fp.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (fp.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
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
const failures = [];

function check(label, ok, detail = "") {
  if (ok) {
    console.log(`  OK   ${label}`);
  } else {
    console.log(`  NG   ${label} ${detail}`);
    failures.push(`${label} ${detail}`.trim());
  }
}

/** 認証状態と当日パスコード状態を指定してアプリを開く */
async function openApp({ initialUser, passcodeVerifiedToday = false }) {
  const context = await browser.newContext({
    viewport: { width: 1180, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await applyAuthStub(page, {
    user: initialUser,
    passcodeVerifiedToday,
    dbMock: mockDb,
  });

  await page.goto(base, { waitUntil: "domcontentloaded" });
  return { context, page, pageErrors };
}


// --- 1. 一度もログインしていない端末 -------------------------------------
{
  console.log("1. 未ログインの端末");
  const { context, page, pageErrors } = await openApp({ initialUser: null });

  await page.waitForTimeout(AUTH_DELAY_MS / 3);
  const during = await screens(page);
  check("判定中はログイン画面を出さない", during.login === false, JSON.stringify(during));
  check("判定中は読み込み中を表示する", during.pending === true, JSON.stringify(during));

  await page.waitForSelector("#screen-login:not([hidden])", { timeout: 5000 });
  await page.waitForTimeout(150);
  const after = await screens(page);
  check("確定後はログイン画面に留まる", after.login === true, JSON.stringify(after));
  check("パスコード画面へ進まない", after.lock === false, JSON.stringify(after));
  check("本編を表示しない", after.app === false, JSON.stringify(after));
  check("読み込み中は解除される", after.pending === false, JSON.stringify(after));
  check("ページエラーなし", pageErrors.length === 0, pageErrors.join(" / "));

  await page.screenshot({ path: path.join(root, "tools/auth-gate-01-fresh.png") });
  await context.close();
}

// --- 2. 匿名セッションが残っている端末 -----------------------------------
{
  console.log("2. 匿名セッションが残る端末（当日パスコード済み）");
  const { context, page, pageErrors } = await openApp({
    initialUser: AUTH_USERS.anonymous,
    passcodeVerifiedToday: true,
  });

  await page.waitForSelector("#screen-login:not([hidden])", { timeout: 5000 });
  await page.waitForTimeout(200);
  const after = await screens(page);
  check("匿名でもログイン画面に留まる", after.login === true, JSON.stringify(after));
  check("パスコード画面へ進まない", after.lock === false, JSON.stringify(after));
  check("本編を表示しない", after.app === false, JSON.stringify(after));

  const calls = await page.evaluate(() => globalThis.__authCalls);
  check("匿名セッションを破棄する", calls.signOut >= 1, JSON.stringify(calls));
  check("ページエラーなし", pageErrors.length === 0, pageErrors.join(" / "));

  // ログインボタンが他の要素に覆われていないこと（覆われると無反応に見える）
  const hit = await page.evaluate(() => {
    const btn = document.getElementById("btn-login");
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { id: top?.id || "", tag: top?.tagName || "", isButton: top === btn };
  });
  check("ログインボタンが最前面にある", hit.isButton === true, JSON.stringify(hit));

  // 匿名セッションを破棄した直後でもログインできること
  await page.fill("#login-email", "clinic@example.com");
  await page.fill("#login-password", "correct-password");
  await page.click("#btn-login");
  await page.waitForTimeout(400);
  const afterLogin = await screens(page);
  check("匿名破棄のあともログインできる", afterLogin.lock === true, JSON.stringify(afterLogin));

  await page.screenshot({ path: path.join(root, "tools/auth-gate-02-anonymous.png") });
  await context.close();
}

// --- 3. ログインしてパスコードを通り、カルテまで進む ----------------------
{
  console.log("3. ログイン → パスコード → カルテ");
  const { context, page, pageErrors } = await openApp({ initialUser: null });
  await page.waitForSelector("#screen-login:not([hidden])", { timeout: 5000 });

  await page.fill("#login-email", "clinic@example.com");
  await page.fill("#login-password", "wrong-password");
  await page.click("#btn-login");
  await page.waitForTimeout(250);
  const afterWrong = await screens(page);
  check("誤ったパスワードでは進まない", afterWrong.login === true, JSON.stringify(afterWrong));

  // 無反応に見えないよう、失敗理由を必ず画面に出す
  const errText = await page.evaluate(() => {
    const el = document.getElementById("login-error");
    return { hidden: !!el?.hidden, text: (el?.textContent || "").trim() };
  });
  check("失敗理由を画面に表示する", errText.hidden === false && errText.text.length > 0, JSON.stringify(errText));

  // 処理中はボタンを無効化して二重押しを防ぐ
  const busy = await page.evaluate(async () => {
    const btn = document.getElementById("btn-login");
    const seen = { disabled: false, label: "" };
    const observer = new MutationObserver(() => {
      if (btn.disabled) {
        seen.disabled = true;
        seen.label = btn.textContent.trim();
      }
    });
    observer.observe(btn, { attributes: true, childList: true, subtree: true });
    btn.click();
    await new Promise((r) => setTimeout(r, 60));
    observer.disconnect();
    return seen;
  });
  check("処理中はボタンを無効化する", busy.disabled === true, JSON.stringify(busy));
  check("処理中が分かる表示になる", busy.label.includes("ログイン中"), JSON.stringify(busy));
  await page.waitForTimeout(200);

  // コードを持たない想定外の例外でも、無反応にせずメッセージを出す
  await page.fill("#login-password", "boom");
  await page.click("#btn-login");
  await page.waitForTimeout(250);
  const boom = await page.evaluate(() => {
    const el = document.getElementById("login-error");
    const btn = document.getElementById("btn-login");
    return {
      hidden: !!el?.hidden,
      text: (el?.textContent || "").trim(),
      disabled: !!btn?.disabled,
      label: (btn?.textContent || "").trim(),
    };
  });
  check("想定外の例外でもメッセージを出す", boom.hidden === false && boom.text.length > 0, JSON.stringify(boom));
  check("失敗後はボタンが押せる状態に戻る", boom.disabled === false && boom.label === "ログイン", JSON.stringify(boom));

  await page.fill("#login-password", "correct-password");
  await page.click("#btn-login");
  await page.waitForSelector("#screen-lock:not([hidden])", { timeout: 5000 });
  const afterLogin = await screens(page);
  check("ログイン後はパスコード画面", afterLogin.lock === true, JSON.stringify(afterLogin));
  check("本編はまだ出さない", afterLogin.app === false, JSON.stringify(afterLogin));

  await enterPasscode(page, PASSCODE);
  const afterPass = await screens(page);
  check("パスコード通過で本編を表示", afterPass.app === true, JSON.stringify(afterPass));

  await page.waitForSelector("#karte-number-input", { timeout: 5000 });
  check("カルテ番号入力に到達", true);
  check("ページエラーなし", pageErrors.length === 0, pageErrors.join(" / "));

  await page.screenshot({ path: path.join(root, "tools/auth-gate-03-after-login.png") });
  await context.close();
}

// --- 4. セッションが切れた状態でのパスコード通過を拒む --------------------
{
  console.log("4. 認証が切れた状態でパスコードだけ入力する");
  const { context, page, pageErrors } = await openApp({ initialUser: AUTH_USERS.signedIn });
  await page.waitForSelector("#screen-lock:not([hidden])", { timeout: 5000 });

  // パスコード画面のまま認証だけ失われた状況を作る
  await page.evaluate(() => globalThis.__authControl.emit(null));
  await page.waitForTimeout(100);

  await enterPasscode(page, PASSCODE);
  const after = await screens(page);
  check("本編を開かない", after.app === false, JSON.stringify(after));
  check("ログイン画面へ戻す", after.login === true, JSON.stringify(after));
  check("ページエラーなし", pageErrors.length === 0, pageErrors.join(" / "));

  await page.screenshot({ path: path.join(root, "tools/auth-gate-04-session-lost.png") });
  await context.close();
}

// --- 5. ログイン済みセッションの復元（ブラウザを開き直した想定） ----------
{
  console.log("5. ログイン済みセッションの復元");
  const { context, page, pageErrors } = await openApp({
    initialUser: AUTH_USERS.signedIn,
    passcodeVerifiedToday: true,
  });
  await page.waitForSelector("#karte-number-input", { timeout: 5000 });
  const after = await screens(page);
  check("ログイン画面を出さない", after.login === false, JSON.stringify(after));
  check("本編まで復元する", after.app === true, JSON.stringify(after));
  check("ページエラーなし", pageErrors.length === 0, pageErrors.join(" / "));

  await page.screenshot({ path: path.join(root, "tools/auth-gate-05-restored.png") });
  await context.close();
}

await browser.close();
server.close();

if (failures.length) {
  console.error(`\nVERIFY_FAILED (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("\nOK: 認証の関門が期待どおり動作しています");
