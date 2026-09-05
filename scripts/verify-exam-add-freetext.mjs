/**
 * 検査の追加をフリーワード入力に切り替えたことの検証。
 * - 新規追加は階層ピッカーではなくテキスト欄
 * - 絶食の選択欄が出ない
 * - 既存データ（マスタから選んだ想定の登録）が表示・編集できる
 * - 完了 → 実施履歴の蓄積が動く
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
  const listText = await page.locator("#status-exam-plan-list").innerText();
  assert.ok(listText.includes("血液検査（腎パネル）"), "existing blood plan missing");
  assert.ok(listText.includes("腹部エコー"), "existing echo plan missing");
  assert.ok(listText.includes("心エコー"), "existing heart echo plan missing");

  await page.locator("#status-exam-plan-list .status-row", { hasText: "腹部エコー" }).click();
  await page.waitForSelector("#exam-item-sheet:not([hidden])", { timeout: 5000 });
  const sheet = await page.evaluate(() => ({
    item: document.getElementById("exam-item-sheet-item")?.textContent || "",
    fasting: Boolean(document.getElementById("exam-sheet-fasting-check-wrap")),
    memo: document.getElementById("exam-sheet-memo")?.tagName || "",
    history: [...document.querySelectorAll("#exam-sheet-history-list .exam-sheet__history-date")].map(
      (el) => el.textContent
    ),
  }));
  assert.match(sheet.item, /腹部エコー/);
  assert.equal(sheet.fasting, false, "fasting checkbox still on existing sheet");
  assert.equal(sheet.memo, "TEXTAREA");
  assert.ok(
    sheet.history.some((t) => t.includes("2026/5/5")),
    "existing history not listed: " + JSON.stringify(sheet.history)
  );
  await page.click("#btn-close-exam-item-sheet");
  await page.waitForFunction(
    () => document.getElementById("exam-item-sheet")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  console.log("  OK  existing plans display and open");
}

console.log("\n[add modal: free text]");
{
  await page.click("#btn-status-exam-add");
  await page.waitForSelector("#exam-plan-modal:not([hidden])", { timeout: 5000 });

  assert.equal(
    await page.locator("#exam-plan-linear-picker").count(),
    0,
    "linear picker still in add modal"
  );
  assert.equal(
    await page.locator("#exam-plan-fasting-field").count(),
    0,
    "fasting field still in add modal"
  );
  assert.equal(
    await page.locator("#exam-plan-fasting-buttons").count(),
    0,
    "fasting buttons still in add modal"
  );
  assert.ok(await page.locator("#exam-plan-item").isVisible(), "item text input not visible");

  const tag = await page.locator("#exam-plan-item").evaluate((el) => el.tagName);
  assert.equal(tag, "INPUT");
  const locked = await page.locator("#exam-plan-item").evaluate((el) => el.readOnly || el.disabled);
  assert.equal(locked, false, "item input is locked");

  await page.fill("#exam-plan-item", "肝スク（絶食）");
  await page.fill("#exam-plan-due-date", "2026-09-20");
  await page.click("#btn-exam-plan-save");
  await page.waitForFunction(
    () => document.getElementById("exam-plan-modal")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  const listText = await page.locator("#status-exam-plan-list").innerText();
  assert.ok(listText.includes("肝スク（絶食）"), "free-text exam not listed");
  assert.ok(listText.includes("血液検査（腎パネル）"), "existing plan disappeared after add");
  console.log("  OK  free-text add");
}

console.log("\n[complete / history]");
{
  await page.locator("#status-exam-plan-list .status-row", { hasText: "肝スク（絶食）" }).click();
  await page.waitForSelector("#exam-item-sheet:not([hidden])", { timeout: 5000 });
  await page.fill("#exam-sheet-done-date", "2026-08-25");
  await page.click("#btn-exam-sheet-complete");
  await page.fill("#exam-sheet-due-date", "2026-10-01");
  await page.click("#btn-exam-sheet-save");
  await page.waitForFunction(
    () => document.getElementById("exam-item-sheet")?.hidden === true,
    null,
    { timeout: 5000 }
  );

  const titles = await page.locator("#status-exam-plan-list .status-row__title").allTextContents();
  assert.ok(titles.some((t) => t.includes("肝スク（絶食）")), "plan missing after complete");

  await page.locator("#status-exam-plan-list .status-row", { hasText: "肝スク（絶食）" }).click();
  await page.waitForSelector("#exam-item-sheet:not([hidden])", { timeout: 5000 });
  const hist = await page
    .locator("#exam-sheet-history-list .exam-sheet__history-date")
    .allTextContents();
  assert.ok(hist.some((t) => t.includes("2026/8/25")), "history not accumulated: " + JSON.stringify(hist));
  await page.click("#btn-close-exam-item-sheet");
  console.log("  OK  complete + history");
}

const shotDir = path.join(root, "tools");
fs.mkdirSync(shotDir, { recursive: true });
await page.click("#btn-status-exam-add");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
await page.locator("#exam-plan-modal .modal__panel").screenshot({
  path: path.join(shotDir, "exam-add-freetext-verify.png"),
});

await browser.close();
server.close();
console.log("\nVERIFY_OK");
