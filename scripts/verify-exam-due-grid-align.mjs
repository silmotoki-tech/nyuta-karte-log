/**
 * 検査登録: 相対日数の左4タイルと右テンキーの行高さが揃うことを検証する。
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tools", "exam-due-grid-align");
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

const mockDb = fs.readFileSync(
  path.join(__dirname, "mock-db-exam-categories.js"),
  "utf8"
);
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harness = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
import { initExamPlanUI, enterExamPlan } from "/js/exam-plan-ui.js";
initExamPlanUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
});
enterExamPlan("karte-due-align");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.querySelectorAll(".right-panel").forEach((p) => { p.hidden = true; });
document.getElementById("panel-exam").hidden = false;
document.getElementById("btn-exam-new")?.click();
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
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.waitForSelector("#exam-plan-due-units .interval-unit-btn");

const metrics = await page.evaluate(() => {
  const root = document.querySelector(".exam-due-compact__relative");
  const units = document.querySelector(".exam-due-compact__units");
  const display = document.getElementById("exam-plan-due-display");
  const unitBtns = [...document.querySelectorAll("#exam-plan-due-units .interval-unit-btn")];
  const numpad = document.getElementById("exam-plan-due-numpad");
  const keys = [...numpad.querySelectorAll(".numpad__btn")];
  const cs = getComputedStyle(root);
  const leftCells = [display, ...unitBtns].map((el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top * 10) / 10, h: Math.round(r.height * 10) / 10 };
  });
  const rightRows = [0, 1, 2, 3].map((row) => {
    const el = keys[row * 3];
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top * 10) / 10, h: Math.round(r.height * 10) / 10 };
  });
  const unitsH = units.getBoundingClientRect().height;
  const numpadH = numpad.getBoundingClientRect().height;
  return {
    cellH: cs.getPropertyValue("--due-cell-h").trim(),
    cellGap: cs.getPropertyValue("--due-cell-gap").trim(),
    leftCells,
    rightRows,
    unitsH: Math.round(unitsH * 10) / 10,
    numpadH: Math.round(numpadH * 10) / 10,
    leftCount: leftCells.length,
    keyCount: keys.length,
  };
});
console.log(JSON.stringify(metrics, null, 2));

assert.equal(metrics.leftCount, 4);
assert.equal(metrics.keyCount, 12);

const leftHs = metrics.leftCells.map((c) => c.h);
const rightHs = metrics.rightRows.map((c) => c.h);
const allH = [...leftHs, ...rightHs];
const hMin = Math.min(...allH);
const hMax = Math.max(...allH);
assert.ok(hMax - hMin <= 1.5, `cell heights differ: ${JSON.stringify(allH)}`);

for (let i = 0; i < 4; i++) {
  const dTop = Math.abs(metrics.leftCells[i].top - metrics.rightRows[i].top);
  assert.ok(dTop <= 1.5, `row ${i} top misaligned by ${dTop}px`);
}

assert.ok(
  Math.abs(metrics.unitsH - metrics.numpadH) <= 1.5,
  `block heights differ L=${metrics.unitsH} R=${metrics.numpadH}`
);

await page.locator("#exam-plan-modal .exam-due-compact__relative").scrollIntoViewIfNeeded();
await page.screenshot({
  path: path.join(outDir, "01-relative-grid.png"),
  fullPage: false,
});
const box = await page.locator("#exam-plan-modal .exam-due-compact__relative").boundingBox();
await page.screenshot({
  path: path.join(outDir, "02-relative-crop.png"),
  clip: {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 8),
    width: box.width + 16,
    height: box.height + 16,
  },
});
await page.screenshot({
  path: path.join(outDir, "03-exam-plan-modal.png"),
  fullPage: false,
});

await browser.close();
server.close();
console.log("OK: exam due grid aligned");
console.log("shots:", outDir);
