/**
 * 薬剤追加の開始日・期限が、iPad幅でも重ならないことを検証する。
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
const outDir = path.join(root, "tools", "med-add-dates-layout");
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
assert.ok(indexSrc.includes('id="med-add-expiry"'), "expiry field missing");
assert.ok(indexSrc.includes('id="med-add-note"'), "note field missing");
assert.ok(!indexSrc.includes('id="med-add-date"'), "start date still in add modal");
assert.ok(!indexSrc.includes('id="med-add-freq-picker"'), "freq picker still in add modal");
assert.ok(!indexSrc.includes('id="med-add-dose-picker"'), "dose picker still in add modal");

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-med-hierarchy.js"),
  "utf8"
);
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harness = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
import { initMedsUI, enterMeds, openMedicationAddModal } from "/js/meds-ui.js";
initMedsUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
  getSelectedAuthor: () => "院長",
});
enterMeds("karte-med");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
openMedicationAddModal();
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
  if (urlPath === "/js/db.js") {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(mockDb);
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

async function check(label, contextOpts, shotName) {
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__ready === true);
  await page.waitForSelector("#med-add-modal:not([hidden])");
  await page.locator("#med-add-expiry").scrollIntoViewIfNeeded();

  const metrics = await page.evaluate(() => {
    const exp = document.getElementById("med-add-expiry");
    const note = document.getElementById("med-add-note");
    return {
      hasStart: Boolean(document.getElementById("med-add-date")),
      hasFreq: Boolean(document.getElementById("med-add-freq-picker")),
      hasDose: Boolean(document.getElementById("med-add-dose")),
      expVisible: Boolean(exp) && exp.type === "date",
      noteVisible: Boolean(note),
    };
  });
  console.log(label, metrics);
  assert.equal(metrics.hasStart, false, `${label}: start date still present`);
  assert.equal(metrics.hasFreq, false, `${label}: freq picker still present`);
  assert.equal(metrics.hasDose, false, `${label}: dose picker still present`);
  assert.ok(metrics.expVisible, `${label}: expiry missing`);
  assert.ok(metrics.noteVisible, `${label}: note missing`);

  await page.screenshot({
    path: path.join(outDir, `${shotName}-modal.png`),
    fullPage: false,
  });
  await context.close();
  return metrics;
}

await check(
  "ipad-landscape",
  { ...devices["iPad Pro 11 landscape"], hasTouch: true },
  "10-after-ipad-landscape"
);
await check(
  "ipad-portrait",
  { ...devices["iPad Pro 11"], hasTouch: true },
  "11-after-ipad-portrait"
);
await check(
  "desktop",
  { viewport: { width: 1280, height: 900 } },
  "12-after-desktop"
);
await check(
  "narrow",
  { viewport: { width: 700, height: 900 } },
  "13-after-narrow"
);

await browser.close();
server.close();
console.log("OK: med-add keeps expiry/note and drops freq/dose/start");
console.log("shots:", outDir);
