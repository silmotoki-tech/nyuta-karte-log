/**
 * 本番 index.html + app.js 経路で検索タブが動くことを検証する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-full-app-free-qa.js"),
  "utf8"
);

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

const mockFirebase = `
export const app = {};
`;

const mockAuth = `
export const authReady = Promise.resolve({ uid: "test" });
`;

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
      return await chromium.launch({
        executablePath,
        headless: true,
        timeout: 30_000,
      });
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
  res.writeHead(200, {
    "Content-Type": contentType(fp),
    "Cache-Control": "no-store",
  });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

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
  route.fulfill({ contentType: "application/javascript", body: mockAuth })
);

let anthropicCalls = 0;
await page.route("https://api.anthropic.com/v1/messages", async (route) => {
  anthropicCalls += 1;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      content: [{ type: "text", text: "統合テスト回答：経過観察で問題ありません。" }],
    }),
  });
});

await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });

// Passcode already verified → karte gate
await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10000 });
for (const d of ["1", "2", "3", "4", "5"]) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click('#karte-numpad [data-karte-action="confirm"]');
await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10000 });
await page.fill("#animal-name-input", "テスト");
await page.click("#btn-animal-next");
await page.waitForSelector("#center-main:not([hidden])", { timeout: 10000 });

await page.locator('.right-tab[data-tab="qa"]').click();
await page.waitForTimeout(150);

const panelHidden = await page.locator("#panel-qa").evaluate((el) => el.hidden);
if (panelHidden) throw new Error("panel-qa hidden after 検索 in full app");

const inputVisible = await page.locator("#free-qa-input").isVisible();
const btnVisible = await page.locator("#btn-free-qa-ask").isVisible();
if (!inputVisible || !btnVisible) {
  throw new Error("free-qa UI not visible in full app");
}

await page.fill("#free-qa-input", "統合テストの質問です");
await page.click("#btn-free-qa-ask");
await page.waitForFunction(
  () => document.querySelectorAll("#free-qa-list .qa-card").length > 0,
  null,
  { timeout: 10000 }
);

const answer = await page.locator("#free-qa-list .qa-card__answer").first().innerText();
console.log("FULL_APP_ANSWER", answer);
if (!answer.includes("統合テスト回答")) {
  throw new Error("full app answer missing");
}
if (anthropicCalls < 1) throw new Error("Anthropic not called in full app");

await page.screenshot({
  path: path.join(root, "tools/free-qa-search-fullapp-verify.png"),
  fullPage: true,
});

console.log("OK: full app 検索タブ ask → answer");
await browser.close();
server.close();
