/**
 * 中央・左カラムの新レイアウトをサンプルデータで描画し、スクリーンショットを撮る。
 */
import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "tools/column-layout-preview.png");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const filePath = path.join(root, urlPath === "/" ? "tools/column-layout-preview.html" : urlPath);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://127.0.0.1:${port}/tools/column-layout-preview.html`, {
  waitUntil: "networkidle",
});

// 左: 年見出しと日付太字
const years = await page.locator(".hl-year").allTextContents();
if (!years.includes("2026年") || !years.includes("2025年")) {
  throw new Error(`year headings missing: ${years.join(", ")}`);
}
const firstDate = await page.locator(".hl-item__date").first().textContent();
if (firstDate !== "7/22") throw new Error(`left date wrong: ${firstDate}`);
const firstText = await page.locator(".hl-item__text").first().textContent();
if (firstText !== "耳を痒がる") throw new Error(`left text wrong: ${firstText}`);

// 中央: 日付・見出し・メタ
const titleDate = await page.locator(".tl-item__date").first().textContent();
const titleHead = await page.locator(".tl-item__headline").first().textContent();
const meta = await page.locator(".tl-item__meta").first().textContent();
if (titleDate !== "7/22") throw new Error(`center date wrong: ${titleDate}`);
if (titleHead !== "耳を痒がる") throw new Error(`center headline wrong: ${titleHead}`);
if (!meta.includes("13:36入力") || !meta.includes("記入者：院長")) {
  throw new Error(`center meta wrong: ${meta}`);
}

await page.screenshot({ path: outPath, fullPage: false });
console.log("OK screenshot:", outPath);
console.log("left years:", years.join(", "));
console.log("center first:", titleDate, titleHead, "|", meta);

await browser.close();
server.close();
