/**
 * 検査予定の「終了 → 実施履歴のみ → 予定に戻す → 次回予定日を入れる」の検証。
 */
import { launchBrowser } from "./launch-browser.js";
import { applyAuthStub, enterPasscode, readMockDb } from "./auth-stub.js";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const KARTE = "77771";

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
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
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
// 終了・復活の確認ダイアログはすべて OK で進める
page.on("dialog", (d) => d.accept());

await applyAuthStub(page, { dbMock: mockDb });

// アプリの通常フローを辿る（認証はスタブ済み）
await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });

await enterPasscode(page);

// カルテ番号はテンキー専用（readonly）なので数字ボタンを押す
await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 15000 });
for (const d of KARTE.split("")) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click("#btn-karte-next");

// 動物名（新規の場合）
const animalVisible = await page
  .waitForSelector("#gate-animal:not([hidden])", { timeout: 5000 })
  .then(() => true)
  .catch(() => false);
if (animalVisible) {
  await page.fill("#animal-name-input", "テスト");
  await page.click("#btn-animal-next");
}

await page.waitForSelector("#center-main:not([hidden])", { timeout: 15000 });

// 記入者
const authorBtn = page.locator("#author-buttons-vet button").first();
if (await authorBtn.count()) await authorBtn.click();

/** 階層ピッカーの1列から、ラベルが一致する項目を押す */
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

// 状態モードへ切り替え、検査予定を状態モードの「＋」から登録する
// （右カラムの5タブは削除済みのため、検査の追加・編集は状態モードから行う）
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });

// 予定登録
await page.click("#btn-status-exam-add");
await page.waitForSelector("#exam-plan-modal:not([hidden])");
// 大項目「血液」→ 小項目「血液検査」の順に辿る（階層ピッカー）
await pickLinear("#exam-plan-col-category-list", "血液");
await pickLinear("#exam-plan-col-leaf-list", "血液検査");
const due = "2026-08-15";
await page.fill("#exam-plan-due-date", due);
// 血液検査は絶食の要不要が必須
await page.click('#exam-plan-fasting-buttons [data-fasting="none"]');
await page.click("#btn-exam-plan-save");
await page.waitForTimeout(400);

const planTitles = await page
  .locator("#status-exam-plan-list .status-row__title")
  .allTextContents();
console.log("STEP1 plans after create:", planTitles);
if (!planTitles.some((t) => t.includes("血液検査"))) {
  throw new Error("予定登録に失敗");
}

// 実施履歴を1件追加して予定を終了する
await page.locator("#status-exam-plan-list .status-row").first().click();
await page.waitForSelector("#exam-item-sheet:not([hidden])");
const dueHiddenOnOpen = await page.locator("#exam-sheet-due-field").isHidden();
if (!dueHiddenOnOpen) throw new Error("タップ直後に次回予定カレンダーが見えている");
const doneVisibleOnOpen = await page.locator("#exam-sheet-done-field").isVisible();
if (!doneVisibleOnOpen) throw new Error("1枚目に実施日の入力欄が出ていない");
const endBtnLabel = (await page.locator("#btn-exam-sheet-end").innerText()).trim();
if (endBtnLabel !== "終了として保存") {
  throw new Error(`1枚目の終了ボタンが「${endBtnLabel}」になっている`);
}
await page.fill("#exam-sheet-done-date", "2026-06-01");
await page.click("#btn-exam-sheet-end");
const dueHiddenOnEnd = await page.locator("#exam-sheet-due-field").isHidden();
if (!dueHiddenOnEnd) throw new Error("終了フローで次回予定カレンダーが見えている");
await page.waitForTimeout(400);

let plans = await page.locator("#status-exam-plan-list .status-row__title").allTextContents();
let historyGroups = await page.locator("#status-exam-history-list .status-group-title").allTextContents();
console.log("STEP2 after complete+end: plans=", plans, "history=", historyGroups);

const endedSection = await page.locator("#exam-ended-list").count();
console.log("STEP2 ended section count:", endedSection);
if (endedSection !== 0) throw new Error("終了済みセクションが残っている");

if (plans.some((t) => t.includes("血液検査"))) {
  throw new Error("完了後も予定一覧に残っている");
}
if (!historyGroups.some((t) => t.includes("血液検査"))) {
  throw new Error("実施履歴に統合されていない");
}

// 予定に戻す（履歴の行を左スワイプ。状態モードの実施履歴一覧に付いている）
const historyRow = page.locator("#status-exam-history-list .status-row").first();
const box = await historyRow.boundingBox();
if (!box) throw new Error("履歴の行が見つからない");

await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);
await page.locator(".swipeable__actions--edit .icon-btn--refresh").first().click();
await page.waitForTimeout(500);

plans = await page.locator("#status-exam-plan-list .status-row__title").allTextContents();
const dueTexts = await page.locator("#status-exam-plan-list .status-row__due").allTextContents();
historyGroups = await page.locator("#status-exam-history-list .status-group-title").allTextContents();
console.log("STEP3 after revive: plans=", plans, "dues=", dueTexts, "history=", historyGroups);

if (!plans.some((t) => t.includes("血液検査"))) {
  throw new Error("予定に戻しても一覧に出ない");
}
if (!dueTexts.some((t) => t.includes("未設定"))) {
  throw new Error("復活後の次回予定が未設定になっていない");
}
if (historyGroups.some((t) => t.includes("血液検査"))) {
  throw new Error("復活後も実施履歴セクションに予定あり項目が残っている");
}

// 詳細シートが開いていれば日付入力して保存
const sheetOpen = await page.isVisible("#exam-item-sheet:not([hidden])");
console.log("STEP4 sheet open:", sheetOpen);
if (sheetOpen) {
  const dueVisible = await page.locator("#exam-sheet-due-field").isVisible();
  if (!dueVisible) throw new Error("復活後の次回予定入力でカレンダーが出ない");
  await page.fill("#exam-sheet-due-date", "2026-09-01");
  if (await page.locator("#exam-sheet-fasting-check").count()) {
    await page.locator("#exam-sheet-fasting-check").uncheck();
  }
  await page.click("#btn-exam-sheet-save");
  await page.waitForTimeout(400);
  const duesAfter = await page.locator("#status-exam-plan-list .status-row__due").allTextContents();
  console.log("STEP4 dues after save:", duesAfter);
  if (!duesAfter.some((t) => t.includes("2026-09-01") || t.includes("あと"))) {
    throw new Error("次回予定日の保存が反映されない");
  }
}

// 追加確認: 予定がある状態で終了すると一覧から消え履歴は残る
await page.locator("#status-exam-plan-list .status-row").first().click();
await page.waitForSelector("#exam-item-sheet:not([hidden])");
await page.click("#btn-exam-sheet-end");
await page.waitForTimeout(400);
plans = await page.locator("#status-exam-plan-list .status-row__title").allTextContents();
historyGroups = await page.locator("#status-exam-history-list .status-group-title").allTextContents();
console.log("STEP5 after explicit end: plans=", plans, "history=", historyGroups);
if (plans.some((t) => t.includes("血液検査"))) {
  throw new Error("終了後も予定一覧に残っている");
}
if (!historyGroups.some((t) => t.includes("血液検査"))) {
  throw new Error("終了後に実施履歴が消えた");
}
if (await page.locator("#exam-ended-list").count()) {
  throw new Error("終了済みセクションが復活している");
}

await page.screenshot({
  path: path.join(root, "tools/exam-end-revive-verify.png"),
  fullPage: false,
});

if (errors.length) {
  console.log("PAGE_ERRORS:", errors.slice(0, 10));
}

console.log("OK: end→history only→revive→set due verified");
await browser.close();
server.close();
