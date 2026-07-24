/**
 * 検索タブ（自由質問）の表示・送信・Anthropic 呼び出しを検証する。
 * AI提案フラグ OFF でも自由質問は動くことを確認する。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENABLE_AI_SUGGEST_AFTER_SAVE } from "../js/feature-flags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (ENABLE_AI_SUGGEST_AFTER_SAVE) {
  console.warn("NOTE: AI suggest flag is true; free-qa must still work");
}

const freeQaSrc = fs.readFileSync(path.join(root, "js/free-qa-ui.js"), "utf8");
if (!freeQaSrc.includes("askClaude")) {
  throw new Error("free-qa-ui.js missing askClaude");
}
if (/ENABLE_AI_SUGGEST/.test(freeQaSrc)) {
  throw new Error("free-qa must not depend on AI suggest flag");
}
console.log("OK: free-qa source uses askClaude and is independent of suggest flag");

const featureFlags = fs.readFileSync(
  path.join(root, "js/feature-flags.js"),
  "utf8"
);
if (!featureFlags.includes("自由質問欄には影響しない")) {
  throw new Error("feature-flags.js should document free-qa independence");
}
console.log("OK: feature flag comment keeps free-qa enabled");

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

const mockDb = `
const store = { freeQA: {} };
const qaListeners = new Map();
let seq = 0;
const nid = (p) => p + (++seq);

function notifyQa(k) {
  const items = Object.entries(store.freeQA[k] || {}).map(([id, row]) => ({ id, ...row }));
  (qaListeners.get(k) || []).forEach((cb) => cb(items.map((x) => structuredClone(x))));
}

export function subscribeFreeQA(karte, cb) {
  if (!store.freeQA[karte]) store.freeQA[karte] = {};
  const list = qaListeners.get(karte) || [];
  list.push(cb);
  qaListeners.set(karte, list);
  notifyQa(karte);
  return () => qaListeners.set(karte, (qaListeners.get(karte)||[]).filter((x) => x !== cb));
}
export async function addFreeQA(karte, { question, answer, askedBy }) {
  if (!store.freeQA[karte]) store.freeQA[karte] = {};
  const id = nid("qa");
  store.freeQA[karte][id] = {
    schemaVersion: 1,
    question: question || "",
    answer: answer || "",
    askedAt: new Date().toISOString(),
    askedBy: askedBy || "",
  };
  notifyQa(karte);
  return id;
}
export async function updateFreeQAAnswer(karte, id, { answer, askedBy }) {
  const row = store.freeQA[karte]?.[id];
  if (!row) throw new Error("missing qa");
  row.answer = answer || "";
  if (askedBy != null) row.askedBy = askedBy;
  notifyQa(karte);
}
export async function deleteFreeQA(karte, id) {
  if (store.freeQA[karte]) delete store.freeQA[karte][id];
  notifyQa(karte);
}
`;

const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test-key-for-verify"; }
export function setApiKey() {}
export function clearApiKey() {}
`;

const mockSettings = `
export function initSettingsUI() {}
export function openSettings() {}
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
  if (u === "/") u = "/tools/free-qa-search-harness.html";
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
  viewport: { width: 1100, height: 800 },
  serviceWorkers: "block",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.route("**/js/api-key.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockApiKey })
);
await page.route("**/js/settings-ui.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockSettings })
);

let anthropicCalls = 0;
let lastAnthropicBody = null;
await page.route("https://api.anthropic.com/v1/messages", async (route) => {
  anthropicCalls += 1;
  lastAnthropicBody = route.request().postDataJSON();
  console.log("ANTHROPIC_CALL", {
    model: lastAnthropicBody?.model,
    hasSystem: Boolean(lastAnthropicBody?.system),
    userPreview: String(lastAnthropicBody?.messages?.[0]?.content || "").slice(
      0,
      100
    ),
  });
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      content: [
        {
          type: "text",
          text: "カルテ上では腎数値の悪化は確認できません。経過観察の記載が中心です。",
        },
      ],
    }),
  });
});

await page.goto(`${base}/tools/free-qa-search-harness.html`, {
  waitUntil: "networkidle",
});
await page.waitForFunction(() => window.__freeQaHarness?.ready === true, null, {
  timeout: 10000,
});

const flag = await page.evaluate(() => window.__freeQaHarness.flag);
if (flag !== false) {
  throw new Error("AI suggest flag should be false in harness");
}
console.log("OK: AI suggest flag is false while free-qa runs");

// Click 検索 tab
await page.locator('.right-tab[data-tab="qa"]').click();
await page.waitForTimeout(100);

const panelHidden = await page.locator("#panel-qa").evaluate((el) => el.hidden);
console.log("panel-qa hidden?", panelHidden);
if (panelHidden) throw new Error("panel-qa still hidden after clicking 検索");

const inputVisible = await page.locator("#free-qa-input").isVisible();
const btnVisible = await page.locator("#btn-free-qa-ask").isVisible();
console.log("UI", { inputVisible, btnVisible });
if (!inputVisible || !btnVisible) {
  throw new Error("free-qa input/button not visible");
}

const inputAttrs = await page.locator("#free-qa-input").evaluate((el) => ({
  readOnly: el.readOnly,
  disabled: el.disabled,
  inputmode: el.getAttribute("inputmode"),
  tag: el.tagName,
}));
console.log("INPUT_ATTRS", inputAttrs);
if (inputAttrs.readOnly || inputAttrs.disabled) {
  throw new Error("free-qa input must be editable");
}
if (inputAttrs.inputmode === "none") {
  throw new Error("free-qa must not use inputmode=none");
}

const focused = await page.evaluate(() => {
  const el = document.getElementById("free-qa-input");
  el.focus();
  return document.activeElement === el;
});
if (!focused) throw new Error("free-qa input cannot receive focus");

await page.fill("#free-qa-input", "腎臓の経過で注意すべき点は？");
await page.click("#btn-free-qa-ask");

await page.waitForFunction(
  () => document.querySelectorAll("#free-qa-list .qa-card").length > 0,
  null,
  { timeout: 10000 }
);

const answerText = await page
  .locator("#free-qa-list .qa-card__answer")
  .first()
  .innerText();
console.log("ANSWER", answerText);
if (!answerText.includes("腎")) {
  throw new Error("answer not shown in list");
}
if (anthropicCalls < 1) {
  throw new Error("Anthropic API was not called");
}
if (!String(lastAnthropicBody?.messages?.[0]?.content || "").includes("腎臓")) {
  throw new Error("Anthropic request missing question text");
}

if (pageErrors.length) {
  throw new Error("page errors: " + pageErrors.join("; "));
}

await page.screenshot({
  path: path.join(root, "tools/free-qa-search-verify.png"),
  fullPage: true,
});

console.log("OK: 検索タブ UI + Anthropic call + answer save");
await browser.close();
server.close();
