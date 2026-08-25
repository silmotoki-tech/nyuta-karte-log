/**
 * 既往歴の追加をフリーワード入力に切り替えたことの検証。
 * - 新規追加は階層ピッカーではなくテキスト欄
 * - 種別ボタンでラベルが切り替わる
 * - 既存データ（マスタから選んだ想定の登録）が表示・編集できる
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
  const listText = await page.locator("#status-history-list").innerText();
  assert.ok(listText.includes("僧帽弁閉鎖不全症"), "existing disease title missing");
  assert.ok(listText.includes("避妊手術"), "existing surgery title missing");
  assert.ok(listText.includes("皮膚科専門医へ紹介"), "existing referral title missing");
  assert.ok(listText.includes("進行中"), "active badge missing");
  assert.ok(listText.includes("終了"), "resolved badge missing");

  await page.locator("#status-history-list .status-row", { hasText: "僧帽弁閉鎖不全症" }).click();
  await page.waitForSelector("#status-detail-modal:not([hidden])", { timeout: 5000 });
  const detail = await page.evaluate(() => {
    const modal = document.getElementById("status-detail-modal");
    const titleInput = modal?.querySelector("input.input");
    const selectedType = [...(modal?.querySelectorAll(".exam-item-btn.is-selected") || [])].map(
      (b) => b.textContent
    );
    const statusBtn = modal?.querySelector(".hist-status-toggle")?.textContent || "";
    return {
      title: titleInput?.value || "",
      selectedType,
      statusBtn,
    };
  });
  assert.match(detail.title, /僧帽弁閉鎖不全症/);
  assert.ok(detail.selectedType.includes("疾患"), "existing type not selected");
  assert.match(detail.statusBtn, /進行中/);

  await page.fill("#status-detail-modal input.input", "僧帽弁閉鎖不全症（編集確認）");
  await page.locator("#status-detail-modal button", { hasText: "タイトルを保存" }).click();
  await page.waitForTimeout(200);
  await page.click("#btn-close-status-detail");
  await page.waitForFunction(
    () => document.getElementById("status-detail-modal")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  assert.ok(
    (await page.locator("#status-history-list").innerText()).includes("編集確認"),
    "edited title not shown"
  );
  console.log("  OK  existing rows display and title can be edited");
}

console.log("\n[add modal: free text]");
{
  await page.click("#btn-status-history-add");
  await page.waitForSelector("#history-add-modal:not([hidden])", { timeout: 5000 });

  assert.equal(
    await page.locator("#history-add-linear-picker").count(),
    0,
    "linear picker still in add modal"
  );
  assert.equal(
    await page.locator("#btn-history-add-toggle").count(),
    0,
    "master + toggle still in add modal"
  );
  assert.ok(
    await page.locator("#history-add-title").isVisible(),
    "title text input not visible"
  );

  const initial = await page.evaluate(() => ({
    label: document.getElementById("history-add-title-label")?.textContent || "",
    placeholder: document.getElementById("history-add-title")?.placeholder || "",
    type: [...document.querySelectorAll("#history-add-type-buttons .exam-item-btn")]
      .find((b) => b.classList.contains("is-selected"))
      ?.textContent || "",
  }));
  assert.equal(initial.label, "疾患名");
  assert.equal(initial.type, "疾患");

  await page.locator("#history-add-type-buttons .exam-item-btn", { hasText: "手術歴" }).click();
  const afterSurgery = await page.evaluate(() => ({
    label: document.getElementById("history-add-title-label")?.textContent || "",
    type: [...document.querySelectorAll("#history-add-type-buttons .exam-item-btn")]
      .find((b) => b.classList.contains("is-selected"))
      ?.textContent || "",
  }));
  assert.equal(afterSurgery.label, "手術名");
  assert.equal(afterSurgery.type, "手術歴");

  await page
    .locator("#history-add-type-buttons .exam-item-btn", { hasText: "紹介・専門治療歴" })
    .click();
  const afterRef = await page.evaluate(() => ({
    label: document.getElementById("history-add-title-label")?.textContent || "",
    type: [...document.querySelectorAll("#history-add-type-buttons .exam-item-btn")]
      .find((b) => b.classList.contains("is-selected"))
      ?.textContent || "",
  }));
  assert.equal(afterRef.label, "紹介先");
  assert.match(afterRef.type, /紹介/);

  await page.locator("#history-add-type-buttons .exam-item-btn", { hasText: "疾患" }).click();
  await page.fill("#history-add-title", "自由記述の皮膚炎");
  await page.click("#btn-history-add-save");
  await page.waitForFunction(
    () => document.getElementById("history-add-modal")?.hidden === true,
    null,
    { timeout: 5000 }
  );
  const listText = await page.locator("#status-history-list").innerText();
  assert.ok(listText.includes("自由記述の皮膚炎"), "free-text add not listed");
  console.log("  OK  free-text add + type buttons");
}

const shotDir = path.join(root, "tools");
fs.mkdirSync(shotDir, { recursive: true });
await page.click("#btn-status-history-add");
await page.waitForSelector("#history-add-modal:not([hidden])");
await page.locator("#history-add-modal .modal__panel").screenshot({
  path: path.join(shotDir, "history-add-freetext-verify.png"),
});

await browser.close();
server.close();
console.log("\nVERIFY_OK");
