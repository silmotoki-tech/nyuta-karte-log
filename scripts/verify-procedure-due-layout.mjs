/**
 * 処置予定登録: モーダル幅を抑え、相対日数テンキーの左右行高さが揃うことを検証する。
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
const outDir = path.join(root, "tools", "procedure-due-layout");
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
  path.join(__dirname, "mock-db-procedures.js"),
  "utf8"
);
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harness = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
import { initProceduresUI, enterProcedures } from "/js/procedures-ui.js";
initProceduresUI({
  showToast: () => {},
  showError: (el, msg) => { if (el) { el.hidden = !msg; el.textContent = msg || ""; } },
  setBusy: (btn, busy, a, b) => { if (btn) { btn.disabled = busy; btn.textContent = busy ? a : b; } },
  getSelectedAuthor: () => "院長",
});
enterProcedures("karte-proc");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.querySelectorAll(".right-panel").forEach((p) => { p.hidden = true; });
document.getElementById("panel-proc").hidden = false;
document.getElementById("btn-procedure-plan-add")?.click();
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
await page.waitForSelector("#procedure-plan-modal:not([hidden])");
await page.waitForSelector("#procedure-plan-due-units .interval-unit-btn");

const metrics = await page.evaluate(() => {
  const panel = document.querySelector("#procedure-plan-modal .modal__panel");
  const rootEl = document.querySelector(
    "#procedure-plan-modal .exam-due-compact__relative"
  );
  const units = document.querySelector(
    "#procedure-plan-modal .exam-due-compact__units"
  );
  const display = document.getElementById("procedure-plan-due-display");
  const unitBtns = [
    ...document.querySelectorAll("#procedure-plan-due-units .interval-unit-btn"),
  ];
  const numpad = document.getElementById("procedure-plan-due-numpad");
  const keys = [...numpad.querySelectorAll(".numpad__btn")];
  const cs = getComputedStyle(rootEl);
  const leftCells = [display, ...unitBtns].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      text: el.textContent.trim(),
    };
  });
  const rightRows = [0, 1, 2, 3].map((row) => {
    const el = keys[row * 3];
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top * 10) / 10,
      h: Math.round(r.height * 10) / 10,
    };
  });
  return {
    panelW: Math.round(panel.getBoundingClientRect().width),
    panelClass: panel.className,
    cellH: cs.getPropertyValue("--due-cell-h").trim(),
    leftCells,
    rightRows,
    unitsH: Math.round(units.getBoundingClientRect().height * 10) / 10,
    numpadH: Math.round(numpad.getBoundingClientRect().height * 10) / 10,
    numpadW: Math.round(numpad.getBoundingClientRect().width),
    relativeW: Math.round(rootEl.getBoundingClientRect().width),
    leftCount: leftCells.length,
    keyCount: keys.length,
  };
});
console.log(JSON.stringify(metrics, null, 2));

assert.ok(
  metrics.panelClass.includes("modal__panel--procedure-plan"),
  "procedure-plan panel class missing"
);
assert.ok(metrics.panelW <= 440, `panel too wide: ${metrics.panelW}`);
assert.ok(metrics.panelW >= 320, `panel unexpectedly narrow: ${metrics.panelW}`);
assert.ok(metrics.numpadW <= 280, `numpad still stretched: ${metrics.numpadW}`);
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

await page.screenshot({
  path: path.join(outDir, "01-after-modal.png"),
  fullPage: false,
});
const box = await page
  .locator("#procedure-plan-modal .exam-due-compact__relative")
  .boundingBox();
await page.screenshot({
  path: path.join(outDir, "02-after-relative-crop.png"),
  clip: {
    x: Math.max(0, box.x - 8),
    y: Math.max(0, box.y - 8),
    width: box.width + 16,
    height: box.height + 16,
  },
});

await browser.close();
server.close();
console.log("OK: procedure due layout compact + aligned");
console.log("shots:", outDir);
