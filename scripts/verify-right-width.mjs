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
  if (process.env.PLAYWRIGHT_ARM_SHELL && fs.existsSync(process.env.PLAYWRIGHT_ARM_SHELL)) {
    return process.env.PLAYWRIGHT_ARM_SHELL;
  }
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
      return await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  throw new Error("Could not launch browser");
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const filePath = path.join(root, urlPath.replace(/^\//, "") || "index.html");
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(filePath);
  const type =
    ext === ".html"
      ? "text/html; charset=utf-8"
      : ext === ".css"
        ? "text/css; charset=utf-8"
        : ext === ".js"
          ? "text/javascript; charset=utf-8"
          : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

async function shot(right, label, outName) {
  await page.goto(
    `${base}/tools/right-width-preview.html?right=${right}&label=${encodeURIComponent(label)}`,
    { waitUntil: "networkidle" }
  );
  await page.waitForTimeout(120);
  const banner = await page.locator("#banner").innerText();
  console.log(banner);
  const m = banner.match(/right=(\d+)px center=(\d+)px/);
  if (!m) throw new Error(`banner parse failed: ${banner}`);
  const measuredRight = Number(m[1]);
  const measuredCenter = Number(m[2]);
  if (Math.abs(measuredRight - right) > 2) {
    throw new Error(`expected right≈${right}, got ${measuredRight}`);
  }
  await page.screenshot({
    path: path.join(root, "tools", outName),
    fullPage: false,
  });
  return { right: measuredRight, center: measuredCenter };
}

const before = await shot(280, "BEFORE 280px", "right-width-before.png");
const after = await shot(308, "AFTER 308px (+10%)", "right-width-after.png");

const deltaRight = after.right - before.right;
const deltaCenter = before.center - after.center;
const pct = ((after.right / before.right - 1) * 100).toFixed(1);
console.log(
  JSON.stringify(
    { before, after, deltaRight, deltaCenter, pctIncrease: `${pct}%` },
    null,
    2
  )
);
if (deltaRight < 25) throw new Error("right column did not widen enough");

console.log("OK: right column widened ~10%");
await browser.close();
server.close();
