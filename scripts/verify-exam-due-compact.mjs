/**
 * 検査「次回予定の登録」: 日付枠内収まり／相対指定ラベル削除／縦4タイルを検証する。
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
const outDir = path.join(root, "tools", "exam-due-compact-verify");
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

assert.ok(
  !fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .includes('exam-due-compact__units-label">相対指定'),
  "相対指定 label still in exam-plan HTML"
);

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
enterExamPlan("karte-due-compact");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.querySelectorAll(".right-panel").forEach((p) => { p.hidden = true; });
document.getElementById("panel-exam").hidden = false;
document.getElementById("btn-exam-new")?.click();
window.__ready = true;
</script>
</body>`
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
const page = await browser.newPage({
  viewport: { width: 1100, height: 900 },
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__ready === true);
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.waitForSelector("#exam-plan-due-units .interval-unit-btn");

const geo = await page.evaluate(() => {
  const section = document.querySelector(".exam-plan-section--plan");
  const date = document.getElementById("exam-plan-due-date");
  const display = document.getElementById("exam-plan-due-display");
  const units = [...document.querySelectorAll("#exam-plan-due-units .interval-unit-btn")];
  const numpad = document.getElementById("exam-plan-due-numpad");
  const sr = section.getBoundingClientRect();
  const dr = date.getBoundingClientRect();
  const tiles = [display, ...units];
  const tileRects = tiles.map((el) => el.getBoundingClientRect());
  const text = section.innerText;
  // vertical alignment: each tile below previous, same left
  let verticalOk = true;
  for (let i = 1; i < tileRects.length; i++) {
    const prev = tileRects[i - 1];
    const cur = tileRects[i];
    if (cur.top < prev.bottom - 1) verticalOk = false;
    if (Math.abs(cur.left - prev.left) > 2) verticalOk = false;
  }
  const unitLabels = units.map((b) => b.textContent.trim());
  const numpadR = numpad.getBoundingClientRect();
  const colRight = Math.max(...tileRects.map((r) => r.right));
  return {
    hasSouai: text.includes("相対指定"),
    dateInSection:
      dr.left >= sr.left - 1 &&
      dr.right <= sr.right + 1 &&
      dr.top >= sr.top - 1 &&
      dr.bottom <= sr.bottom + 1,
    dateOverflowPx: Math.max(0, dr.right - sr.right),
    verticalOk,
    tileCount: tiles.length,
    unitLabels,
    numpadSeparated: numpadR.left >= colRight - 1,
    displayText: display.textContent.trim(),
  };
});

console.log(geo);
assert.equal(geo.hasSouai, false, "相対指定 label still visible");
assert.ok(geo.dateInSection, `date overflows by ${geo.dateOverflowPx}px`);
assert.equal(geo.tileCount, 4, "should be 4 tiles: display+日週月");
assert.deepEqual(geo.unitLabels, ["日", "週", "月"]);
assert.ok(geo.displayText.includes("日後"));
assert.ok(geo.verticalOk, "tiles not in a clean vertical column");
assert.ok(geo.numpadSeparated, "numpad not separated from unit column");

await page.locator(".exam-plan-section--plan").screenshot({
  path: path.join(outDir, "01-plan-block.png"),
});
await page.screenshot({
  path: path.join(outDir, "02-exam-plan-modal.png"),
});

// populate relative a bit for visual
await page.locator("#exam-plan-due-units .interval-unit-btn", { hasText: "週" }).click();
await page.locator("#exam-plan-due-numpad .numpad__btn", { hasText: "2" }).click();
await page.locator(".exam-plan-section--plan").screenshot({
  path: path.join(outDir, "03-plan-block-with-value.png"),
});

await browser.close();
server.close();
console.log("OK: exam due compact layout");
console.log("shots:", outDir);
