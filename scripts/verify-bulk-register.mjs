/**
 * 一括登録：貼り付け検出 → チップ即時登録 → 状態モード反映・時系列非記録を検証する。
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

const outDir = path.join(root, "tools/bulk-register");
fs.mkdirSync(outDir, { recursive: true });
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

const timelineBefore = await page.locator("#timeline .tl-item").count();
console.log("TIMELINE_BEFORE", timelineBefore);

assert.ok(await page.locator("#btn-bulk-register").count(), "一括登録ボタンがない");
await page.click("#btn-bulk-register");
await page.waitForSelector("#bulk-register-modal:not([hidden])", { timeout: 5000 });

const PASTE = [
  "プレドニゾロン 0.5mg",
  "エンロフロキサシンを継続",
  "CBC 再検",
  "既往：糖尿病",
].join("\n");

await page.fill("#bulk-register-text", PASTE);
await page.dispatchEvent("#bulk-register-text", "paste");
await page.waitForFunction(
  () => document.querySelectorAll("#bulk-register-chip-list .input-chip").length >= 3,
  null,
  { timeout: 3000 }
);
await shot("01-chips");

const chips = await page.evaluate(() =>
  [...document.querySelectorAll("#bulk-register-chip-list .input-chip")].map((el) => ({
    kind: el.dataset.chipKind,
    label: el.dataset.chipLabel,
    registered: el.dataset.chipRegistered === "true",
    text: el.innerText.replace(/\s+/g, " ").trim(),
  }))
);
console.log("CHIPS", chips);

assert.ok(
  chips.some((c) => c.kind === "med" && c.label.includes("エンロフロキサシン")),
  "薬剤チップが検出されていない"
);
assert.ok(
  chips.some((c) => c.kind === "exam" && c.label.includes("CBC")),
  "検査チップが検出されていない"
);
assert.ok(
  chips.some((c) => c.kind === "history" && c.label.includes("糖尿病")),
  "既往歴チップが検出されていない"
);

const pred = chips.find((c) => c.label.includes("プレドニゾロン"));
if (pred) {
  assert.equal(pred.registered, true, "登録済みのプレドニゾロンが未登録扱いになっている");
}

async function tapChip(label) {
  const chip = page.locator("#bulk-register-chip-list .input-chip", { hasText: label }).first();
  await chip.click();
  await page.waitForFunction(
    (name) => {
      const el = [...document.querySelectorAll("#bulk-register-chip-list .input-chip")].find(
        (n) => (n.dataset.chipLabel || "").includes(name)
      );
      return el?.dataset.chipRegistered === "true";
    },
    label,
    { timeout: 4000 }
  );
}

await tapChip("エンロフロキサシン");
await tapChip("CBC");
await tapChip("糖尿病");
await shot("02-after-tap");

const confirmOpen = await page.evaluate(() => {
  const ids = [
    "med-add-modal",
    "exam-plan-modal",
    "exam-item-sheet",
    "history-add-modal",
    "input-sheet-modal",
  ];
  return ids.filter((id) => {
    const el = document.getElementById(id);
    return el && !el.hidden;
  });
});
assert.deepEqual(confirmOpen, [], `確認画面が開いている: ${confirmOpen.join(",")}`);

const afterChips = await page.evaluate(() =>
  [...document.querySelectorAll("#bulk-register-chip-list .input-chip")]
    .filter((el) =>
      ["エンロフロキサシン", "CBC", "糖尿病"].some((n) =>
        (el.dataset.chipLabel || "").includes(n)
      )
    )
    .map((el) => ({
      label: el.dataset.chipLabel,
      registered: el.dataset.chipRegistered,
      cls: el.className,
    }))
);
console.log("AFTER_TAP", afterChips);
assert.ok(
  afterChips.every((c) => c.registered === "true" && c.cls.includes("is-registered")),
  "登録後のチップ見た目が変わっていない"
);

await page.click("#btn-close-bulk-register");
await page.waitForFunction(
  () => document.getElementById("bulk-register-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 3000 }
);

const timelineAfter = await page.locator("#timeline .tl-item").count();
console.log("TIMELINE_AFTER", timelineAfter);
assert.equal(timelineAfter, timelineBefore, "一括登録が時系列に記録されている");

await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
await shot("03-status");

const status = await page.evaluate(() => ({
  meds: [...document.querySelectorAll("#status-meds-list .status-row")].map((el) =>
    el.innerText.replace(/\s+/g, " ").trim()
  ),
  exams: [...document.querySelectorAll("#status-exam-plan-list .status-row")].map((el) =>
    el.innerText.replace(/\s+/g, " ").trim()
  ),
  history: [...document.querySelectorAll("#status-history-list .status-row")].map((el) =>
    el.innerText.replace(/\s+/g, " ").trim()
  ),
}));
console.log("STATUS", status);

assert.ok(
  status.meds.some((t) => t.includes("エンロフロキサシン")),
  "薬剤が一括登録後に状態モードに出ていない"
);
assert.ok(
  status.exams.some((t) => t.includes("CBC")),
  "検査が一括登録後に状態モードに出ていない"
);
assert.ok(
  status.history.some((t) => t.includes("糖尿病")),
  "既往歴が一括登録後に状態モードに出ていない"
);

if (pageErrors.length) {
  throw new Error(`page errors:\n${pageErrors.join("\n")}`);
}

console.log("OK: 一括登録の検出・即時登録・状態反映・時系列非記録を確認");
await browser.close();
server.close();
