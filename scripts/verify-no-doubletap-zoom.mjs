/**
 * アプリ全体でダブルタップ／連続タップしても viewport ズームしないことを検証する。
 */
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tools", "no-doubletap-zoom");
fs.mkdirSync(outDir, { recursive: true });
const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
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
  for (const executablePath of [
    findChromeHeadlessShell(),
    fs.existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : null,
  ].filter(Boolean)) {
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
  return chromium.launch({ headless: true });
}

const indexSrc = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(indexSrc, /user-scalable\s*=\s*no/i);
assert.match(indexSrc, /maximum-scale\s*=\s*1/i);
assert.match(indexSrc, /minimum-scale\s*=\s*1/i);

const cssSrc = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
assert.match(cssSrc, /html\s*\{[^}]*touch-action:\s*manipulation/s);
assert.match(cssSrc, /body\s*\{[^}]*touch-action:\s*manipulation/s);

const harness = indexSrc
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.getElementById("screen-input")?.removeAttribute("hidden");

const headline = document.getElementById("input-headline");
const body = document.getElementById("input-body-text");
if (headline) headline.value = "術後経過の確認メモ";
if (body) body.value = "本日の経過は良好。食欲あり。";

const pad = document.getElementById("karte-numpad");
const karteInput = document.getElementById("karte-number-input");
pad?.querySelectorAll("[data-karte-digit], [data-karte-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const digit = btn.getAttribute("data-karte-digit");
    const action = btn.getAttribute("data-karte-action");
    if (digit != null) {
      if ((karteInput.value || "").length >= 5) return;
      karteInput.value = (karteInput.value || "") + digit;
      return;
    }
    if (action === "delete") karteInput.value = (karteInput.value || "").slice(0, -1);
  });
});

window.__ready = true;
</script>`
  );

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (
    !filePath.startsWith(root) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const browser = await launchBrowser();
const ipad = devices["iPad Pro 11"];
const context = await browser.newContext({
  ...ipad,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true);

const meta = await page.evaluate(() => {
  const vp = document.querySelector('meta[name="viewport"]')?.content || "";
  const htmlTouch = getComputedStyle(document.documentElement).touchAction;
  const bodyTouch = getComputedStyle(document.body).touchAction;
  const headline = document.getElementById("input-headline");
  const bodyEl = document.getElementById("input-body-text");
  const btn = document.querySelector("#karte-numpad .numpad__btn");
  return {
    vp,
    htmlTouch,
    bodyTouch,
    headlineTouch: headline ? getComputedStyle(headline).touchAction : "",
    bodyFieldTouch: bodyEl ? getComputedStyle(bodyEl).touchAction : "",
    numpadBtnTouch: btn ? getComputedStyle(btn).touchAction : "",
    scale: window.visualViewport?.scale ?? 1,
  };
});
console.log("meta", meta);
assert.match(meta.vp, /user-scalable\s*=\s*no/i);
assert.match(meta.vp, /maximum-scale\s*=\s*1/i);
assert.ok(meta.htmlTouch.includes("manipulation"));
assert.ok(meta.bodyTouch.includes("manipulation"));
assert.ok(meta.headlineTouch.includes("manipulation"));
assert.ok(meta.bodyFieldTouch.includes("manipulation"));
assert.ok(meta.numpadBtnTouch.includes("manipulation"));
assert.equal(meta.scale, 1);

async function doubleTap(selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, "missing " + selector);
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 24);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(60);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(120);
}

async function rapidTaps(selector, times = 6) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, "missing " + selector);
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, 24);
  for (let i = 0; i < times; i++) {
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(45);
  }
}

await page.screenshot({
  path: path.join(outDir, "01-before.png"),
  fullPage: false,
});

await doubleTap("#input-headline");
await rapidTaps("#input-headline", 5);
await doubleTap("#input-body-text");
await rapidTaps("#input-body-text", 5);

const afterFields = await page.evaluate(() => ({
  scale: window.visualViewport?.scale ?? 1,
  headline: document.getElementById("input-headline")?.value || "",
  body: document.getElementById("input-body-text")?.value || "",
}));
console.log("afterFields", afterFields);
assert.equal(afterFields.scale, 1);
assert.ok(afterFields.headline.length > 0);
assert.ok(afterFields.body.length > 0);

await page.screenshot({
  path: path.join(outDir, "02-after-composer-taps.png"),
  fullPage: false,
});

// カルテ番号テンキーも引き続きズームしない
await page.evaluate(() => {
  document.getElementById("center-main")?.setAttribute("hidden", "");
  document.getElementById("gate-karte")?.removeAttribute("hidden");
});
await page.waitForSelector("#karte-numpad .numpad__btn");
const digitBtn = page.locator('#karte-numpad .numpad__btn[data-karte-digit="1"]');
const box = await digitBtn.boundingBox();
for (let i = 0; i < 8; i++) {
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(50);
}
const afterPad = await page.evaluate(() => ({
  scale: window.visualViewport?.scale ?? 1,
  value: document.getElementById("karte-number-input")?.value || "",
}));
console.log("afterPad", afterPad);
assert.equal(afterPad.scale, 1);
assert.ok(afterPad.value.length >= 1);
await page.screenshot({
  path: path.join(outDir, "03-after-numpad-taps.png"),
  fullPage: false,
});

await browser.close();
server.close();
console.log("OK: app-wide no double-tap zoom");
console.log("shots:", outDir);
