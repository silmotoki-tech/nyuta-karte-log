/**
 * 検査完了 → 次の予定: 絶食の引き継ぎ、保存失敗時に予定が残ること、成功時の更新。
 */
import { launchBrowser } from "./launch-browser.js";
import { applyAuthStub, enterPasscode, readMockDb } from "./auth-stub.js";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const KARTE = "77772";

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(root, rel.replace(/^\//, ""));
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
const base = `http://127.0.0.1:${port}`;

const mockDb = readMockDb("mock-db-exam-end.js");
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
page.on("dialog", (d) => d.accept());

await applyAuthStub(page, { dbMock: mockDb });
await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
await enterPasscode(page);

await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 15000 });
for (const d of KARTE.split("")) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click("#btn-karte-next");
const animalVisible = await page
  .waitForSelector("#gate-animal:not([hidden])", { timeout: 5000 })
  .then(() => true)
  .catch(() => false);
if (animalVisible) {
  await page.fill("#animal-name-input", "テスト");
  await page.click("#btn-animal-next");
}
await page.waitForSelector("#center-main:not([hidden])", { timeout: 15000 });
const authorBtn = page.locator("#author-buttons-vet button").first();
if (await authorBtn.count()) await authorBtn.click();

async function pickLinear(listSelector, label) {
  const items = page.locator(`${listSelector} .med-linear-picker__item`);
  await items.first().waitFor({ timeout: 5000 });
  const count = await items.count();
  for (let i = 0; i < count; i += 1) {
    const text = await items.nth(i).locator(".med-linear-picker__item-label").innerText();
    if (text.trim() === label) {
      await items.nth(i).click();
      return;
    }
  }
  throw new Error(`${listSelector} に「${label}」が見つからない`);
}

await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });

await page.click("#btn-status-exam-add");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await pickLinear("#exam-plan-col-category-list", "血液");
await pickLinear("#exam-plan-col-leaf-list", "血液検査");
await page.fill("#exam-plan-due-date", "2026-08-15");
await page.click('#exam-plan-fasting-buttons [data-fasting="none"]');
await page.click("#btn-exam-plan-save");
await page.waitForFunction(
  () => document.getElementById("exam-plan-modal")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);

await page.locator("#status-exam-plan-list .status-row").first().click();
await page.waitForSelector("#exam-item-sheet:not([hidden])");
const dueHiddenOnOpen = await page.locator("#exam-sheet-due-field").isHidden();
if (!dueHiddenOnOpen) throw new Error("タップ直後に次回予定カレンダーが見えている");

await page.click("#btn-exam-sheet-complete");
const dueVisibleOnComplete = await page.locator("#exam-sheet-due-field").isVisible();
if (!dueVisibleOnComplete) throw new Error("完了を選んでも次回予定カレンダーが出ない");
await page.fill("#exam-sheet-done-date", "2026-08-10");

const fastingSelected = await page.evaluate(() =>
  [...document.querySelectorAll("#exam-sheet-fasting-buttons .exam-fasting-btn.is-selected")].map(
    (b) => b.dataset.fasting
  )
);
console.log("FASTING_AFTER_COMPLETE", fastingSelected);
if (!fastingSelected.includes("none") && !fastingSelected.includes("required")) {
  throw new Error("次回予定画面で絶食が自動選択されていない");
}

await page.click("#btn-exam-sheet-save");
await page.waitForTimeout(300);
const emptyDueError = await page.locator("#exam-sheet-error").innerText();
console.log("EMPTY_DUE_ERROR", emptyDueError);
if (!emptyDueError.includes("次回予定")) {
  throw new Error("日付なし保存でエラーになっていない");
}
const plansAfterFailedSave = await page
  .locator("#status-exam-plan-list .status-row__title")
  .allTextContents();
if (!plansAfterFailedSave.some((t) => t.includes("血液検査"))) {
  throw new Error("次回予定の保存エラーで元の予定が消えた");
}

await page.fill("#exam-sheet-due-date", "2026-09-01");
await page.fill("#exam-sheet-due-date-to", "2026-09-10");
await page.click("#btn-exam-sheet-save");
await page.waitForFunction(
  () => document.getElementById("exam-item-sheet")?.hasAttribute("hidden"),
  null,
  { timeout: 5000 }
);

const dues = await page.locator("#status-exam-plan-list .status-row__due").allTextContents();
const titles = await page.locator("#status-exam-plan-list .status-row__title").allTextContents();
const history = await page.locator("#status-exam-history-list").innerText();
console.log("AFTER_SUCCESS", { titles, dues, history });
if (!titles.some((t) => t.includes("血液検査"))) {
  throw new Error("次回予定の保存後に予定一覧から消えた");
}
if (!dues.some((t) => t.includes("あと"))) {
  throw new Error("新しい次回予定（あと〇日）が表示されていない");
}

await page.locator("#status-exam-plan-list .status-row").first().click();
await page.waitForSelector("#exam-item-sheet:not([hidden])");
await page.click("#btn-exam-sheet-end");
await page.click("#btn-exam-sheet-save");
await page.waitForTimeout(400);
const historyAfterEnd = await page
  .locator("#status-exam-history-list .status-group-title")
  .allTextContents();
if (!historyAfterEnd.some((t) => t.includes("血液検査"))) {
  throw new Error("完了時の実施履歴が残っていない");
}

console.log("OK: complete → next due fasting inherit, failed save keeps plan, success updates due");
await browser.close();
server.close();
