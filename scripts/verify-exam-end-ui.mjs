import { launchBrowser } from "./launch-browser.js";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let rel = urlPath === "/" ? "/tools/exam-end-revive-harness.html" : urlPath;
  const filePath = path.join(root, rel.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("not found: " + rel);
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  res.end(fs.readFileSync(filePath));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const mockDb = fs.readFileSync(path.join(__dirname, "mock-db-exam-end.js"), "utf-8");

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);

await page.goto(`${base}/tools/exam-end-revive-harness.html`, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__examReady === true, null, { timeout: 10000 });

// Seed: plan + history
await page.evaluate(async () => {
  await window.__seedExam();
});
await page.waitForTimeout(200);

let plans = await page.locator("#exam-plan-list .exam-list-item__title").allTextContents();
let history = await page.locator("#exam-history-list .exam-history-group-title__label").allTextContents();
console.log("SEED plans=", plans, "history=", history);
if (!plans.includes("血液検査")) throw new Error("seed plan missing");
if (!history.some((t) => t.includes("血液検査"))) throw new Error("seed history missing");
if ((await page.locator("#exam-ended-list").count()) !== 0) throw new Error("ended section exists");

// End via sheet
await page.locator("#exam-plan-list .exam-list-item").first().click();
await page.waitForSelector("#exam-item-sheet:not([hidden])");
page.once("dialog", (d) => d.accept());
await page.click("#btn-exam-sheet-end");
await page.waitForTimeout(300);

plans = await page.locator("#exam-plan-list .exam-list-item__title").allTextContents();
history = await page.locator("#exam-history-list .exam-history-group-title__label").allTextContents();
console.log("AFTER END plans=", plans, "history=", history);
if (plans.includes("血液検査")) throw new Error("plan still listed after end");
if (!history.some((t) => t.includes("血液検査"))) throw new Error("history gone after end");

// 予定に戻すは見出しではなく実施1件ずつの行に付いている
const heading = page.locator("#exam-history-list .exam-list-item--history").first();
const box = await heading.boundingBox();
page.once("dialog", (d) => d.accept());
await page.mouse.move(box.x + box.width - 24, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(250);
await page.locator(".swipeable__actions--edit .icon-btn--refresh").first().click();
await page.waitForTimeout(400);

plans = await page.locator("#exam-plan-list .exam-list-item__title").allTextContents();
const dues = await page.locator("#exam-plan-list .exam-list-item__due").allTextContents();
history = await page.locator("#exam-history-list .exam-history-group-title__label").allTextContents();
console.log("AFTER REVIVE plans=", plans, "dues=", dues, "history=", history);
if (!plans.includes("血液検査")) throw new Error("not revived to plan list");
if (!dues.some((t) => t.includes("未設定"))) throw new Error("due date should be unset");
if (!history.some((t) => t.includes("血液検査"))) throw new Error("history lost on revive");

// Save due date from sheet (auto-opened)
const sheetOpen = await page.isVisible("#exam-item-sheet:not([hidden])");
if (!sheetOpen) throw new Error("sheet did not open after revive");
await page.fill("#exam-sheet-due-date", "2026-09-10");
// 血液検査は絶食の要不要が必須
await page.click('#exam-sheet-fasting-buttons [data-fasting="none"]');
await page.click("#btn-exam-sheet-save");
await page.waitForTimeout(300);
const dues2 = await page.locator("#exam-plan-list .exam-list-item__due").allTextContents();
console.log("AFTER SAVE dues=", dues2);
if (!dues2.some((t) => /あと|2026-09-10/.test(t))) throw new Error("due date not saved");

await page.screenshot({ path: path.join(root, "tools/exam-end-revive-ui.png") });

if (errors.length) {
  console.log("ERRORS", errors);
  throw new Error("page errors");
}
console.log("OK: UI flow end → history → revive → set due");
await browser.close();
server.close();
