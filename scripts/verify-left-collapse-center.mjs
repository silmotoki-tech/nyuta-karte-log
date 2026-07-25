/**
 * 左カラム開閉ボタンが展開・折りたたみの両方で縦方向中央に固定されることを検証する。
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

const harness = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8" />
<link rel="stylesheet" href="/css/style.css" />
<style>html,body{height:100%;margin:0;overflow:hidden}</style>
</head><body>
<div class="app" style="display:flex">
  <div class="layout" id="layout">
    <aside class="col col--left" id="col-left">
      <button type="button" class="left-collapse-btn" id="btn-left-collapse" aria-expanded="true">
        <span class="left-collapse-btn__icon" aria-hidden="true">‹</span>
      </button>
      <div class="col-left__inner" id="col-left-inner">
        <div class="left-head"><h2 class="col__title">見出し</h2></div>
        <ul class="headline-list" id="headline-list"></ul>
      </div>
    </aside>
    <section class="col col--center"><div style="padding:12px">中央</div></section>
    <aside class="col col--right"><div class="right-tabs"><button class="right-tab is-active">検査</button></div><div class="right-panel" style="display:flex"><p class="field__note">右</p></div></aside>
  </div>
</div>
<script type="module">
  const list = document.getElementById("headline-list");
  for (let i = 1; i <= 40; i++) {
    const li = document.createElement("li");
    li.className = "headline-item";
    li.textContent = "見出し " + i;
    li.style.padding = "10px 4px";
    li.style.borderBottom = "1px solid #ddd";
    list.appendChild(li);
  }
  const layout = document.getElementById("layout");
  const btn = document.getElementById("btn-left-collapse");
  const icon = btn.querySelector(".left-collapse-btn__icon");
  function apply(collapsed) {
    layout.classList.toggle("is-left-collapsed", collapsed);
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    icon.textContent = collapsed ? "›" : "‹";
  }
  btn.addEventListener("click", () => {
    apply(!layout.classList.contains("is-left-collapsed"));
  });
  window.__apply = apply;
  window.__ready = true;
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harness);
    return;
  }
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  const type = fp.endsWith(".css")
    ? "text/css; charset=utf-8"
    : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1180, height: 800 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true);

async function measure() {
  return page.evaluate(() => {
    const col = document.getElementById("col-left");
    const btn = document.getElementById("btn-left-collapse");
    const colRect = col.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const colMidY = colRect.top + colRect.height / 2;
    const btnMidY = btnRect.top + btnRect.height / 2;
    return {
      collapsed: document.getElementById("layout").classList.contains("is-left-collapsed"),
      icon: btn.querySelector(".left-collapse-btn__icon").textContent,
      colMidY,
      btnMidY,
      delta: Math.abs(btnMidY - colMidY),
      btnTop: btnRect.top,
      viewportMid: window.innerHeight / 2,
      deltaViewport: Math.abs(btnMidY - window.innerHeight / 2),
    };
  });
}

const centers = [];
for (let i = 0; i < 6; i++) {
  const collapsed = i % 2 === 1;
  await page.evaluate((c) => window.__apply(c), collapsed);
  await page.waitForTimeout(80);
  const m = await measure();
  centers.push(m);
  console.log(`toggle#${i}`, m);
  if (m.delta > 3) {
    throw new Error(
      `button not vertically centered in column (delta=${m.delta}, collapsed=${m.collapsed})`
    );
  }
  if (m.deltaViewport > 40) {
    throw new Error(
      `button far from viewport vertical center (delta=${m.deltaViewport})`
    );
  }
}

// 展開時に内側をスクロールしてもボタン位置が動かないこと
await page.evaluate(() => window.__apply(false));
const beforeScroll = await measure();
await page.evaluate(() => {
  document.getElementById("col-left-inner").scrollTop = 400;
});
await page.waitForTimeout(50);
const afterScroll = await measure();
console.log("scroll check", { beforeScroll, afterScroll });
if (Math.abs(afterScroll.btnMidY - beforeScroll.btnMidY) > 2) {
  throw new Error("button moved when inner content scrolled");
}

// 開閉を繰り返しても btnMidY がほぼ一定
const expandedYs = centers.filter((c) => !c.collapsed).map((c) => c.btnMidY);
const collapsedYs = centers.filter((c) => c.collapsed).map((c) => c.btnMidY);
const spread = (arr) => Math.max(...arr) - Math.min(...arr);
if (spread(expandedYs) > 2 || spread(collapsedYs) > 2) {
  throw new Error("button Y jumped across toggles");
}
if (Math.abs(expandedYs[0] - collapsedYs[0]) > 3) {
  throw new Error(
    `expanded/collapsed vertical centers differ: ${expandedYs[0]} vs ${collapsedYs[0]}`
  );
}

await page.evaluate(() => window.__apply(false));
await page.screenshot({
  path: path.join(root, "tools/left-collapse-center-expanded.png"),
});
await page.evaluate(() => window.__apply(true));
await page.screenshot({
  path: path.join(root, "tools/left-collapse-center-collapsed.png"),
});

console.log("OK: left collapse button stays vertically centered across toggles");
await browser.close();
server.close();
