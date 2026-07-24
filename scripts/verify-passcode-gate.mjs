/**
 * 起動時のパスコード判定・両画面テンキーの検証。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PASSCODE_STORAGE_KEY,
  PASSCODE_DATE_KEY,
  isPasscodeVerified,
  setPasscodeVerified,
  clearPasscodeVerified,
  todayDateStrLocal,
} from "../js/passcode-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  if (ext === ".json") return "application/json";
  if (ext === ".png") return "image/png";
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
  res.writeHead(200, {
    "Content-Type": contentType(fp),
    "Cache-Control": "no-store",
  });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

// --- 単体: 認証判定ロジック -------------------------------------------------
const unit = [];
{
  // mock storages via real localStorage isn't available in node — use jsdom-less direct tests
  // by injecting temporary Storage polyfill on globalThis
  class MemStorage {
    constructor() {
      this.map = new Map();
    }
    getItem(k) {
      return this.map.has(k) ? this.map.get(k) : null;
    }
    setItem(k, v) {
      this.map.set(k, String(v));
    }
    removeItem(k) {
      this.map.delete(k);
    }
  }
  globalThis.localStorage = new MemStorage();
  globalThis.sessionStorage = new MemStorage();

  const today = todayDateStrLocal();
  clearPasscodeVerified();
  unit.push(["clear→false", isPasscodeVerified() === false]);

  // session だけの残骸では認証済みにしない
  sessionStorage.setItem(PASSCODE_STORAGE_KEY, "1");
  unit.push(["session-only→false", isPasscodeVerified() === false]);
  unit.push([
    "session-only cleared",
    sessionStorage.getItem(PASSCODE_STORAGE_KEY) == null,
  ]);

  // flag のみ（日付なし）
  localStorage.setItem(PASSCODE_STORAGE_KEY, "1");
  unit.push(["flag-no-date→false", isPasscodeVerified() === false]);

  // 昨日の日付
  localStorage.setItem(PASSCODE_STORAGE_KEY, "1");
  localStorage.setItem(PASSCODE_DATE_KEY, "2000-01-01");
  unit.push(["stale-date→false", isPasscodeVerified() === false]);

  setPasscodeVerified();
  unit.push(["set→true", isPasscodeVerified() === true]);
  unit.push([
    "date-saved",
    localStorage.getItem(PASSCODE_DATE_KEY) === today,
  ]);
}

console.log(
  "UNIT",
  JSON.stringify(
    unit.map(([n, ok]) => ({ n, ok })),
    null,
    2
  )
);
if (!unit.every(([, ok]) => ok)) {
  console.error("UNIT_FAILED");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: SYSTEM_CHROME,
  headless: true,
});

async function openFresh() {
  const context = await browser.newContext({
    viewport: { width: 1180, height: 900 },
  });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  return { context, page, errors };
}

function filterErr(errors) {
  return errors.filter(
    (e) => !/Firebase|gstatic|googleapis|network-request|Failed to fetch/i.test(e)
  );
}

const results = [];

// 1) クリア状態 → パスコード画面 + テンキー
{
  const { context, page, errors } = await openFresh();
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => ({
    lockHidden: document.getElementById("screen-lock")?.hidden === true,
    lockDisplay: getComputedStyle(document.getElementById("screen-lock")).display,
    appHidden: document.getElementById("app-shell")?.hidden === true,
    isUnlocked: document.documentElement.classList.contains("is-unlocked"),
    passBtn: document.querySelectorAll("#passcode-numpad .numpad__btn").length,
    passH: document.getElementById("passcode-numpad")?.getBoundingClientRect().height || 0,
  }));
  const ok =
    info.lockDisplay !== "none" &&
    !info.isUnlocked &&
    info.appHidden &&
    info.passBtn === 12 &&
    info.passH > 100 &&
    filterErr(errors).length === 0;
  await page.locator("#screen-lock .lock-screen__card").screenshot({
    path: path.join(root, "tools/passcode-gate-cleared.png"),
  });
  results.push({ label: "cleared-shows-passcode-numpad", ok, info });
  await context.close();
}

// 2) パスコード入力 → カルテ画面テンキー
{
  const { context, page, errors } = await openFresh();
  await page.waitForTimeout(300);
  for (const d of ["2", "2", "1", "1"]) {
    await page.click(`#passcode-numpad [data-pass-digit="${d}"]`);
  }
  await page.click('#passcode-numpad [data-pass-action="confirm"]');
  await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 8000 });
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => ({
    lockHidden: document.getElementById("screen-lock")?.hidden === true,
    gateHidden: document.getElementById("gate-karte")?.hidden === true,
    karteBtn: document.querySelectorAll("#karte-numpad .numpad__btn").length,
    karteH: document.getElementById("karte-numpad")?.getBoundingClientRect().height || 0,
    storedFlag: localStorage.getItem("nyutaKartePasscodeVerified"),
    storedDate: localStorage.getItem("nyutaKartePasscodeVerifiedDate"),
  }));
  const today = todayDateStrLocal();
  const ok =
    info.lockHidden &&
    !info.gateHidden &&
    info.karteBtn === 12 &&
    info.karteH > 100 &&
    info.storedFlag === "1" &&
    info.storedDate === today &&
    filterErr(errors).length === 0;
  await page.locator("#gate-karte .gate-card").screenshot({
    path: path.join(root, "tools/karte-gate-after-pass.png"),
  });
  results.push({ label: "passcode-then-karte-numpad", ok, info });
  await context.close();
}

// 3) 同日再起動 → パスコード省略
{
  const context = await browser.newContext({
    viewport: { width: 1180, height: 900 },
  });
  const today = todayDateStrLocal();
  await context.addInitScript(
    ([flagKey, dateKey, todayStr]) => {
      localStorage.setItem(flagKey, "1");
      localStorage.setItem(dateKey, todayStr);
      sessionStorage.clear();
    },
    [PASSCODE_STORAGE_KEY, PASSCODE_DATE_KEY, today]
  );
  const page = await context.newPage();
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => ({
    lockDisplay: getComputedStyle(document.getElementById("screen-lock")).display,
    gateHidden: document.getElementById("gate-karte")?.hidden === true,
    karteBtn: document.querySelectorAll("#karte-numpad .numpad__btn").length,
    isUnlocked: document.documentElement.classList.contains("is-unlocked"),
  }));
  const ok =
    info.lockDisplay === "none" &&
    !info.gateHidden &&
    info.karteBtn === 12 &&
    info.isUnlocked;
  results.push({ label: "same-day-skip-passcode", ok, info });
  await context.close();
}

// 4) sessionStorage のみ → スキップしない
{
  const context = await browser.newContext({
    viewport: { width: 1180, height: 900 },
  });
  await context.addInitScript(([flagKey]) => {
    localStorage.clear();
    sessionStorage.setItem(flagKey, "1");
  }, [PASSCODE_STORAGE_KEY]);
  const page = await context.newPage();
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => ({
    lockDisplay: getComputedStyle(document.getElementById("screen-lock")).display,
    isUnlocked: document.documentElement.classList.contains("is-unlocked"),
    passBtn: document.querySelectorAll("#passcode-numpad .numpad__btn").length,
    sessionLeft: sessionStorage.getItem("nyutaKartePasscodeVerified"),
  }));
  const ok =
    info.lockDisplay !== "none" &&
    !info.isUnlocked &&
    info.passBtn === 12 &&
    info.sessionLeft == null;
  results.push({ label: "session-only-does-not-skip", ok, info });
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();

if (!results.every((r) => r.ok)) {
  console.error("VERIFY_FAILED");
  process.exit(1);
}
console.log("VERIFY_OK");
