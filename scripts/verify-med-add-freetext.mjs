/**
 * 薬剤の追加をサジェスト付きフリーワード入力に切り替えたことの検証。
 * - 新規追加は階層ピッカーではなくテキスト欄
 * - 入力中にマスタから部分一致候補が出る
 * - 候補タップで入力欄に確定する
 * - 候補にない名前も登録できる
 * - 既存データが表示・詳細編集でき、状態ブロックの見た目は維持される
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
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("#status-meds-list .status-row")].map((li) => ({
      name: li.querySelector(".status-row__title")?.textContent || "",
      cat: li.querySelector(".med-cat")?.textContent || "",
      prn: Boolean(li.querySelector(".med-sign--prn")),
      status: li.querySelector(".med-status")?.textContent || "",
    }))
  );
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.ok(byName["プレドニゾロン"], "prednisolone missing");
  assert.equal(byName["プレドニゾロン"].cat, "A");
  assert.equal(byName["プレドニゾロン"].status, "継続");
  assert.equal(byName["プレドニゾロン"].prn, false);
  assert.ok(byName["アムロジピン"], "amlodipine missing");
  assert.equal(byName["アムロジピン"].cat, "B");
  assert.ok(byName["マロピタント"], "maropitant missing");
  assert.equal(byName["マロピタント"].prn, true, "prn mark missing");
  assert.equal(byName["マロピタント"].status, "一時的");
  assert.ok(byName["フロセミド"], "furosemide missing");
  assert.equal(byName["フロセミド"].status, "投与難");
  assert.ok(byName["ガバペンチン"], "gabapentin missing");
  assert.equal(byName["ガバペンチン"].cat, "C");
  assert.equal(byName["ガバペンチン"].status, "休薬中");
  assert.ok(byName["セレニア"], "cerenia missing");
  assert.equal(byName["セレニア"].status, "中止");

  await page.locator("#status-meds-list .status-row", { hasText: "プレドニゾロン" }).click();
  await page.waitForSelector("#med-detail-sheet:not([hidden])", { timeout: 5000 });
  const sheet = await page.evaluate(() => ({
    name: document.getElementById("med-detail-sheet-name")?.textContent || "",
    status: document.getElementById("med-detail-sheet-status")?.textContent || "",
    hasEvent: Boolean(document.querySelector("#med-detail-sheet-body [aria-label='出来事の種類']")),
    hasMemo: Boolean(document.querySelector("#med-detail-sheet-body textarea, #med-detail-sheet-body .med-detail-meta__note")),
  }));
  assert.match(sheet.name, /プレドニゾロン/);
  assert.match(sheet.status, /継続/);
  assert.ok(sheet.hasEvent, "event buttons missing on existing detail");
  assert.ok(sheet.hasMemo, "memo field missing on existing detail");
  await page.click("#btn-med-detail-sheet-close");
  await page.waitForFunction(
    () => document.getElementById("med-detail-sheet")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  console.log("  OK  existing drugs display and open");
}

console.log("\n[add modal: free text + suggest]");
{
  await page.click("#btn-status-meds-add");
  await page.waitForSelector("#med-add-modal:not([hidden])", { timeout: 5000 });

  assert.equal(
    await page.locator("#med-add-linear-picker").count(),
    0,
    "linear picker still in add modal"
  );
  assert.ok(await page.locator("#med-add-name").isVisible(), "name text input not visible");
  const tag = await page.locator("#med-add-name").evaluate((el) => el.tagName);
  assert.equal(tag, "INPUT");
  const locked = await page.locator("#med-add-name").evaluate((el) => el.readOnly || el.disabled);
  assert.equal(locked, false, "name input is locked");

  await page.fill("#med-add-name", "アモキ");
  await page.waitForSelector("#med-add-name-suggest:not([hidden])", { timeout: 5000 });
  const labels = await page.locator("#med-add-name-suggest .input-picker-item__label").allTextContents();
  assert.ok(labels.includes("アモキシシリン"), "amoxicillin missing: " + JSON.stringify(labels));
  assert.ok(
    labels.includes("クラブラン酸/アモキシシリン"),
    "amox/clav missing: " + JSON.stringify(labels)
  );

  await page
    .locator("#med-add-name-suggest .input-picker-item__label", { hasText: /^アモキシシリン$/ })
    .click();
  assert.equal(await page.locator("#med-add-name").inputValue(), "アモキシシリン");
  assert.equal(
    await page.locator("#med-add-name-suggest").evaluate((el) => el.hidden),
    true,
    "suggest still open after pick"
  );
  console.log("  OK  suggest pick");

  await page.fill("#med-add-name", "オリジナル配合剤");
  await page.waitForFunction(
    () => document.getElementById("med-add-name-suggest")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  await page.click("#btn-med-add-save");
  await page.waitForFunction(
    () => document.getElementById("med-add-modal")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  const listText = await page.locator("#status-meds-list").innerText();
  assert.ok(listText.includes("オリジナル配合剤"), "free-text med not listed");
  assert.ok(listText.includes("プレドニゾロン"), "existing drug disappeared after add");
  console.log("  OK  free-text add");
}

const shotDir = path.join(root, "tools");
fs.mkdirSync(shotDir, { recursive: true });
await page.click("#btn-status-meds-add");
await page.waitForSelector("#med-add-modal:not([hidden])");
await page.fill("#med-add-name", "アモキ");
await page.waitForSelector("#med-add-name-suggest:not([hidden])");
await page.locator("#med-add-modal .modal__panel").screenshot({
  path: path.join(shotDir, "med-add-freetext-verify.png"),
});

await browser.close();
server.close();
console.log("\nVERIFY_OK");
