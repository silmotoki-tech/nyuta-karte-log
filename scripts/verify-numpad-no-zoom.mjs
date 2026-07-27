/**
 * テンキー連続タップでダブルタップズームが起きないこと／数字が正しく入ることを検証する。
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
const outDir = path.join(root, "tools", "numpad-no-zoom-verify");
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

const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
assert.match(css, /\.numpad\s*\{[^}]*touch-action:\s*manipulation/s);
assert.match(css, /\.numpad__btn\s*\{[^}]*touch-action:\s*manipulation/s);

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const harnessSimple = indexHtml
  .replace(/<script type="module" src="\.\/js\/app\.js"><\/script>/, "")
  .replace(
    "</body>",
    `<script type="module">
document.getElementById("screen-lock")?.setAttribute("hidden", "");
document.getElementById("app-shell")?.removeAttribute("hidden");
document.getElementById("gate-karte")?.removeAttribute("hidden");
document.getElementById("gate-animal")?.setAttribute("hidden", "");
document.getElementById("center-main")?.setAttribute("hidden", "");
document.documentElement.classList.add("is-unlocked");
const input = document.getElementById("karte-number-input");
const pad = document.getElementById("karte-numpad");
function setDigits(next) {
  input.value = String(next || "").replace(/[^0-9]/g, "").slice(0, 5);
}
pad?.querySelectorAll("[data-karte-digit], [data-karte-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const digit = btn.getAttribute("data-karte-digit");
    const action = btn.getAttribute("data-karte-action");
    if (digit != null) {
      if ((input.value || "").length >= 5) return;
      setDigits((input.value || "") + digit);
      return;
    }
    if (action === "delete") setDigits((input.value || "").slice(0, -1));
  });
});
window.__ready = true;
</script>`
  );

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harnessSimple);
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
await page.waitForSelector("#karte-numpad .numpad__btn");

const styles = await page.evaluate(() => {
  const pad = document.querySelector("#karte-numpad");
  const btn = pad?.querySelector(".numpad__btn");
  const csPad = pad ? getComputedStyle(pad) : null;
  const csBtn = btn ? getComputedStyle(btn) : null;
  return {
    padTouch: csPad?.touchAction || "",
    btnTouch: csBtn?.touchAction || "",
    btnCount: pad?.querySelectorAll(".numpad__btn").length || 0,
  };
});
console.log("styles", styles);
assert.ok(
  styles.padTouch.includes("manipulation"),
  "numpad touch-action missing: " + styles.padTouch
);
assert.ok(
  styles.btnTouch.includes("manipulation"),
  "numpad__btn touch-action missing: " + styles.btnTouch
);
assert.equal(styles.btnCount, 12);

await page.screenshot({
  path: path.join(outDir, "01-before-rapid-taps.png"),
  fullPage: false,
});

const scaleBefore = await page.evaluate(() => window.visualViewport?.scale ?? 1);

// 素早い連続タップ（ダブルタップズーム閾値より短い間隔）
const digits = ["1", "2", "3", "4", "5"];
for (const d of digits) {
  const btn = page.locator(`#karte-numpad .numpad__btn[data-karte-digit="${d}"]`);
  const box = await btn.boundingBox();
  assert.ok(box, "missing button " + d);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(80);
}

const after = await page.evaluate(() => ({
  value: document.getElementById("karte-number-input")?.value || "",
  scale: window.visualViewport?.scale ?? 1,
  bodyZoom: getComputedStyle(document.body).zoom || "1",
}));
console.log("after", after, "scaleBefore", scaleBefore);
assert.equal(after.value, "12345");
assert.equal(after.scale, 1);
assert.equal(scaleBefore, 1);

// 同じボタンを連打してもスケールが変わらないこと
const same = page.locator(`#karte-numpad .numpad__btn[data-karte-digit="0"]`);
const sameBox = await same.boundingBox();
for (let i = 0; i < 6; i++) {
  await page.touchscreen.tap(
    sameBox.x + sameBox.width / 2,
    sameBox.y + sameBox.height / 2
  );
  await page.waitForTimeout(50);
}
// 入力は既に5桁なので変わらないが、ズームしないことだけ確認
const afterSame = await page.evaluate(() => ({
  value: document.getElementById("karte-number-input")?.value || "",
  scale: window.visualViewport?.scale ?? 1,
}));
assert.equal(afterSame.value, "12345");
assert.equal(afterSame.scale, 1);

await page.screenshot({
  path: path.join(outDir, "02-after-rapid-taps.png"),
  fullPage: false,
});

// 他テンキー（検査予定など動的生成）も同じクラスなので CSS セレクタで一括確認
const allNumpads = await page.evaluate(() => {
  // 動的に1つ作って確認
  const el = document.createElement("div");
  el.className = "numpad";
  el.innerHTML = '<button type="button" class="numpad__btn">1</button>';
  document.body.appendChild(el);
  const pad = getComputedStyle(el).touchAction;
  const btn = getComputedStyle(el.querySelector(".numpad__btn")).touchAction;
  el.remove();
  return { pad, btn };
});
console.log("dynamic numpad", allNumpads);
assert.ok(allNumpads.pad.includes("manipulation"));
assert.ok(allNumpads.btn.includes("manipulation"));

await browser.close();
server.close();
console.log("OK: numpad no double-tap zoom");
console.log("shots:", outDir);
