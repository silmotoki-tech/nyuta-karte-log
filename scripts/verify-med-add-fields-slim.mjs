/**
 * 薬剤の追加・編集から頻度・投与量・開始日の入力を外したことの検証。
 * - 追加モーダルにそれらの欄がない
 * - 期限とメモは残る
 * - 既存データの表示（開始日・頻度・期限アラート）は残る
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";
import { applyAuthStub, readMockDb } from "./auth-stub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mockDb = readMockDb("mock-db-status-mode.js");

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  if (ext === ".json") return "application/json";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || "/").split("?")[0]);
  if (u === "/") u = "/index.html";
  const fp = path.join(root, u.replace(/^\//, ""));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404);
    res.end("nf");
    return;
  }
  res.writeHead(200, {
    "Content-Type": contentType(fp),
    "Cache-Control": "no-store",
  });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  serviceWorkers: "block",
});
const page = await context.newPage();
page.on("pageerror", (e) => console.warn("pageerror", String(e)));

await applyAuthStub(page, { dbMock: mockDb, passcodeVerifiedToday: true });
await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10000 });
for (const d of ["0", "0", "0", "0", "1"]) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click('#karte-numpad [data-karte-action="confirm"]');
await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 10000 });
await page.fill("#animal-name-input", "イチロウ");
await page.click("#btn-animal-next");
await page.waitForSelector("#center-main:not([hidden])", { timeout: 10000 });
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 10000 });

console.log("\n[existing data]");
{
  const listText = await page.locator("#status-meds-list").innerText();
  assert.ok(listText.includes("プレドニゾロン"), "existing pred missing");
  assert.ok(listText.includes("アムロジピン"), "existing amlo missing");
  assert.ok(listText.includes("超過") || listText.includes("期限"), "expiry alert missing");

  await page.locator("#status-meds-list .status-row", { hasText: "プレドニゾロン" }).click();
  await page.waitForSelector("#med-detail-sheet:not([hidden])", { timeout: 5000 });
  const sheet = await page.evaluate(() => {
    const body = document.getElementById("med-detail-sheet-body");
    return {
      text: body?.innerText || "",
      startInput: Boolean(body?.querySelector(".med-detail-meta__start input")),
      startText: body?.querySelector(".med-detail-meta__start-value")?.textContent || "",
      expiryInput: body?.querySelector(".med-detail-meta__expiry input")?.value || "",
      memo: body?.querySelector("textarea")?.value || "",
      cat: Boolean(body?.querySelector(".med-cat-btn")),
      prn: Boolean(body?.querySelector(".med-prn-check")),
    };
  });
  assert.match(sheet.startText, /2026\/5\/1/, "existing start date not shown");
  assert.equal(sheet.startInput, false, "start date still editable");
  assert.equal(sheet.expiryInput, "2026-08-14");
  assert.equal(sheet.memo, "多飲多尿に注意");
  assert.match(sheet.text, /1回0\.5錠 1日2回/, "existing event detail missing");
  assert.ok(sheet.cat, "category buttons missing");
  assert.ok(sheet.prn, "prn checkbox missing");
  await page.click("#btn-med-detail-sheet-close");
  await page.waitForFunction(
    () => document.getElementById("med-detail-sheet")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  console.log("  OK  existing display");
}

console.log("\n[add modal fields]");
{
  await page.click("#btn-status-meds-add");
  await page.waitForSelector("#med-add-modal:not([hidden])", { timeout: 5000 });
  assert.equal(await page.locator("#med-add-freq-picker").count(), 0);
  assert.equal(await page.locator("#med-add-dose").count(), 0);
  assert.equal(await page.locator("#med-add-date").count(), 0);
  assert.ok(await page.locator("#med-add-expiry").isVisible());
  assert.ok(await page.locator("#med-add-note").isVisible());
  assert.ok(await page.locator("#med-add-category-buttons").isVisible());
  const bodyText = await page.locator("#med-add-modal .modal__body").innerText();
  assert.equal(bodyText.includes("投与頻度"), false);
  assert.equal(bodyText.includes("投与量"), false);
  assert.equal(bodyText.includes("開始日"), false);

  await page.fill("#med-add-name", "スリム入力検証薬");
  await page.fill("#med-add-expiry", "2026-09-08");
  await page.fill("#med-add-note", "1日2回・1回0.5錠");
  await page.click("#btn-med-add-save");
  await page.waitForFunction(
    () => document.getElementById("med-add-modal")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  const after = await page.locator("#status-meds-list").innerText();
  assert.ok(after.includes("スリム入力検証薬"), "new drug missing");
  assert.ok(after.includes("プレドニゾロン"), "existing disappeared");
  assert.ok(after.includes("あと") || after.includes("本日"), "near expiry alert missing");

  await page.locator("#status-meds-list .status-row", { hasText: "スリム入力検証薬" }).click();
  await page.waitForSelector("#med-detail-sheet:not([hidden])", { timeout: 5000 });
  const added = await page.evaluate(() => ({
    expiry: document.querySelector("#med-detail-sheet-body .med-detail-meta__expiry input")?.value,
    memo: document.querySelector("#med-detail-sheet-body textarea")?.value,
    startInput: Boolean(document.querySelector("#med-detail-sheet-body .med-detail-meta__start input")),
  }));
  assert.equal(added.expiry, "2026-09-08");
  assert.equal(added.memo, "1日2回・1回0.5錠");
  assert.equal(added.startInput, false);
  console.log("  OK  slim add + expiry/memo");
}

const shotDir = path.join(root, "tools");
fs.mkdirSync(shotDir, { recursive: true });
await page.locator("#med-detail-sheet .modal__panel").screenshot({
  path: path.join(shotDir, "med-add-fields-slim-detail.png"),
});
await page.click("#btn-med-detail-sheet-close");
await page.click("#btn-status-meds-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.locator("#med-add-modal .modal__panel").screenshot({
  path: path.join(shotDir, "med-add-fields-slim-add.png"),
});

await browser.close();
server.close();
console.log("\nVERIFY_OK");
