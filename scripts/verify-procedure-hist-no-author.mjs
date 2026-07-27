/**
 * 処置「実施を記録」: 記入者欄なしで登録できることを検証する。
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
const outDir = path.join(root, "tools", "procedure-hist-no-author");
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
});
enterProcedures("karte-proc");
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.documentElement.classList.add("is-unlocked");
document.getElementById("gate-karte")?.setAttribute("hidden", "");
document.getElementById("center-main")?.removeAttribute("hidden");
document.querySelectorAll(".right-panel").forEach((p) => { p.hidden = true; });
document.getElementById("panel-proc").hidden = false;
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

await page.click("#btn-procedure-add");
await page.waitForSelector("#procedure-modal:not([hidden])");

const ui = await page.evaluate(() => {
  const modal = document.getElementById("procedure-modal");
  return {
    hasAuthorRow: !!document.getElementById("procedure-author-row"),
    hasAuthorHint: !!document.getElementById("procedure-author-hint"),
    hasAuthorLabel: !!Array.from(modal.querySelectorAll(".label")).find((el) =>
      /記入者/.test(el.textContent || "")
    ),
    title: document.getElementById("procedure-modal-title")?.textContent || "",
  };
});
assert.equal(ui.hasAuthorRow, false);
assert.equal(ui.hasAuthorHint, false);
assert.equal(ui.hasAuthorLabel, false);
assert.equal(ui.title, "実施を記録");

await page.screenshot({
  path: path.join(outDir, "01-modal-no-author.png"),
  fullPage: false,
});

await page.fill("#procedure-content", "皮下点滴 100ml");
await page.fill("#procedure-note", "反応良好");
await page.click("#btn-procedure-save");
await page.waitForFunction(() => {
  const modal = document.getElementById("procedure-modal");
  return !!modal?.hidden;
});

await page.waitForFunction(() => {
  const texts = [...document.querySelectorAll("#procedures-list .proc-card__content")].map(
    (el) => el.textContent || ""
  );
  return texts.some((t) => t.includes("皮下点滴 100ml"));
});

const listed = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("#procedures-list .proc-card")];
  const card = cards.find((c) =>
    (c.querySelector(".proc-card__content")?.textContent || "").includes("皮下点滴 100ml")
  );
  return {
    content: card?.querySelector(".proc-card__content")?.textContent || "",
    note: card?.querySelector(".proc-card__note")?.textContent || "",
    meta: card?.querySelector(".proc-card__meta")?.textContent || "",
    hasAuthorMeta: !!card?.querySelector(".proc-card__meta"),
  };
});
assert.ok(listed.content.includes("皮下点滴 100ml"));
assert.equal(listed.note, "反応良好");
assert.equal(listed.hasAuthorMeta, false);

await page.screenshot({
  path: path.join(outDir, "02-listed-after-save.png"),
  fullPage: false,
});

console.log(JSON.stringify({ ui, listed }, null, 2));
await browser.close();
server.close();
console.log("OK: procedure hist save without author");
console.log("shots:", outDir);
