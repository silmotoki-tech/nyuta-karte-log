/**
 * 入力モード（全画面の記入 + 今日の登録）を本番 index.html + app.js 経路で検証する。
 * - 本文の貼り付けで薬剤名・検査項目名がチップとして検出されること
 * - 未登録／登録済みで見た目と挙動が分かれること（登録済みは二重登録にならない）
 * - 「今日の登録」に記入者と記録日が引き継がれること
 * - 保存で本文と登録がまとめて確定すること
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function contentType(fp) {
  const ext = path.extname(fp);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

const mockDb = fs.readFileSync(path.join(__dirname, "mock-db-input-mode.js"), "utf8");

const mockPasscode = `
export const PASSCODE_STORAGE_KEY = "nyutaKartePasscodeVerified";
export const PASSCODE_DATE_KEY = "nyutaKartePasscodeVerifiedDate";
export function todayDateStrLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate());
}
export function isPasscodeVerified() { return true; }
export function setPasscodeVerified() {}
export function clearPasscodeVerified() {}
`;

const mockApiKey = `
export function hasApiKey() { return true; }
export function getApiKey() { return "sk-ant-test-key-for-verify"; }
export function setApiKey() {}
export function clearApiKey() {}
`;

const mockFirebase = `export const app = {};`;

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
      return await chromium.launch({ executablePath, headless: true, timeout: 30_000 });
    } catch (err) {
      console.warn("launch failed", executablePath, err.message);
    }
  }
  throw new Error("Could not launch browser");
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
  res.writeHead(200, { "Content-Type": contentType(fp), "Cache-Control": "no-store" });
  res.end(fs.readFileSync(fp));
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  deviceScaleFactor: 2,
  serviceWorkers: "block",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => {
  pageErrors.push(String(e));
  console.warn("pageerror", String(e));
});

await page.route("**/js/db.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockDb })
);
await page.route("**/js/passcode-auth.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockPasscode })
);
await page.route("**/js/api-key.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockApiKey })
);
await page.route("**/js/firebase-app.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: mockFirebase })
);
await page.route("**/js/auth.js", (route) =>
  route.fulfill({ contentType: "application/javascript", body: MOCK_AUTH_LOGGED_IN })
);

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

const outDir = path.join(root, "tools/input-mode");
fs.mkdirSync(outDir, { recursive: true });
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

const hiddenOf = (sel) =>
  page.evaluate((s) => document.querySelector(s)?.hasAttribute("hidden"), sel);

// --- 状態モード → 記録する で入力モードへ --------------------------------
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });

assert.equal(await hiddenOf("#app-shell .layout"), true, "3カラムが隠れていない");
assert.equal(await hiddenOf("#screen-status"), true, "状態モードが隠れていない");

const header = await page.locator("#screen-input .status-topbar__meta").innerText();
assert.ok(header.includes("00001"), "カルテ番号が出ていない");
assert.ok(header.includes("イチロウちゃん"), "動物名が出ていない");

// 記録日の既定が今日
const todayStr = await page.evaluate(() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});
assert.equal(
  await page.inputValue("#input-record-date"),
  todayStr,
  "記録日の既定が今日ではない"
);

// --- 本文を貼り付けてチップ検出 ------------------------------------------
const BODY = [
  "元気食欲あり。プレドニゾロンは継続。",
  "細菌感染を疑いエンロフロキサシンを開始した。",
  "腹部エコーを実施。次回はCBCを予定。",
].join("\n");

await page.click("#input-body-text");
await page.evaluate(async (text) => {
  const ta = document.getElementById("input-body-text");
  ta.focus();
  ta.value = text;
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
}, BODY);

await page.waitForFunction(
  () => document.querySelectorAll("#input-chip-list .input-chip").length >= 4,
  null,
  { timeout: 5000 }
);

const chips = await page.evaluate(() =>
  [...document.querySelectorAll("#input-chip-list .input-chip")].map((el) => ({
    kind: el.dataset.chipKind,
    label: el.dataset.chipLabel,
    registered: el.dataset.chipRegistered === "true",
    stateText: el.querySelector(".input-chip__state").textContent.trim(),
    cls: el.className,
  }))
);
console.log("CHIPS", chips);

assert.equal(chips.length, 4, `チップが4件ではない: ${chips.length}`);
const chipOf = (label) => chips.find((c) => c.label === label);

assert.equal(chipOf("プレドニゾロン")?.kind, "med", "プレドニゾロンが薬として検出されていない");
assert.equal(chipOf("プレドニゾロン")?.registered, true, "登録済みの薬が未登録扱い");
assert.ok(chipOf("プレドニゾロン").cls.includes("is-registered"), "登録済みの見た目になっていない");

assert.equal(chipOf("エンロフロキサシン")?.registered, false, "未登録の薬が登録済み扱い");
assert.ok(chipOf("エンロフロキサシン").cls.includes("is-new"), "未登録の見た目になっていない");

assert.equal(chipOf("腹部エコー")?.kind, "exam", "腹部エコーが検査として検出されていない");
assert.equal(chipOf("腹部エコー")?.registered, true, "予定がある検査が未登録扱い");
assert.equal(chipOf("CBC")?.registered, false, "予定がない検査が登録済み扱い");

// マスタにあっても本文にない名前は拾わない
assert.equal(chipOf("アムロジピン"), undefined, "本文にない薬を検出している");
assert.equal(chipOf("心エコー"), undefined, "本文にない検査を検出している");

await shot("01-chips");

// --- 記入者・見出し ------------------------------------------------------
await page.click('#input-author-row .author-btn[data-author="大辻"]');
await page.fill("#input-headline", "皮膚炎の再診");
await page.click('#input-category-buttons .category-btn[data-category="admission"]');
await page.click("#btn-input-important");

// --- 登録済みの薬チップ → 出来事の追加（新規登録にはしない） --------------
await page.click('#input-chip-list .input-chip[data-chip-label="プレドニゾロン"]');
await page.waitForSelector("#input-sheet-modal:not([hidden])", { timeout: 5000 });
const medSheetTitle = await page.locator("#input-sheet-title").innerText();
assert.ok(medSheetTitle.includes("出来事を追加"), `出来事追加の画面になっていない: ${medSheetTitle}`);
assert.ok(
  (await page.locator("#input-sheet-body .input-sheet__fixed").innerText()).includes(
    "新しい薬剤としては追加しません"
  ),
  "二重登録しない旨の表示がない"
);
// 「今日の登録」に引き継がれる記入者と記録日が案内されている
const appliedNote = await page.locator("#input-sheet-body .field__note").last().innerText();
assert.ok(appliedNote.includes("大辻"), `シートに記入者が引き継がれていない: ${appliedNote}`);
await shot("02-med-registered-sheet");
await page.click('#input-sheet-body .exam-item-btn:has-text("増量")');
await page.click("#btn-input-sheet-add");
await page.waitForFunction(() =>
  document.getElementById("input-sheet-modal").hasAttribute("hidden")
);

// --- 未登録の薬チップ → 新規登録 -----------------------------------------
await page.click('#input-chip-list .input-chip[data-chip-label="エンロフロキサシン"]');
await page.waitForSelector("#input-sheet-modal:not([hidden])", { timeout: 5000 });
assert.ok(
  (await page.locator("#input-sheet-title").innerText()).includes("新規"),
  "未登録の薬が新規追加の画面になっていない"
);
assert.equal(
  await page.locator("#input-sheet-body input.input").first().inputValue(),
  "エンロフロキサシン",
  "薬剤名が選択済みで開いていない"
);
await page.click("#btn-input-sheet-add");
await page.waitForFunction(() =>
  document.getElementById("input-sheet-modal").hasAttribute("hidden")
);

// --- 未登録の検査チップ → 予定として登録 ----------------------------------
await page.click('#input-chip-list .input-chip[data-chip-label="CBC"]');
await page.waitForSelector("#input-sheet-modal:not([hidden])", { timeout: 5000 });
assert.equal(
  await page.locator("#input-sheet-body input.input").first().inputValue(),
  "CBC",
  "検査項目が選択済みで開いていない"
);
await page.click("#btn-input-sheet-add");
await page.waitForFunction(() =>
  document.getElementById("input-sheet-modal").hasAttribute("hidden")
);

// --- 登録済みの検査チップ → 実施記録 --------------------------------------
await page.click('#input-chip-list .input-chip[data-chip-label="腹部エコー"]');
await page.waitForSelector("#input-sheet-modal:not([hidden])", { timeout: 5000 });
assert.ok(
  (await page.locator("#input-sheet-title").innerText()).includes("実施を記録"),
  "予定がある検査が実施記録の画面になっていない"
);
await page.click("#btn-input-sheet-add");
await page.waitForFunction(() =>
  document.getElementById("input-sheet-modal").hasAttribute("hidden")
);

// --- 手動追加（+ 処置） ---------------------------------------------------
await page.click("#btn-input-add-proc");
await page.waitForSelector("#input-sheet-modal:not([hidden])", { timeout: 5000 });
await page.fill("#input-sheet-body textarea", "皮下点滴 150mL");
await page.click("#btn-input-sheet-add");
await page.waitForFunction(() =>
  document.getElementById("input-sheet-modal").hasAttribute("hidden")
);

const queue = await page.evaluate(() =>
  [...document.querySelectorAll("#input-today-list .input-today-item")].map((el) => ({
    kind: el.dataset.queueKind,
    action: el.dataset.queueAction,
    title: el.querySelector(".input-today-item__title").textContent.trim(),
    summary: el.querySelector(".input-today-item__summary").textContent.trim(),
  }))
);
console.log("QUEUE", queue);
assert.equal(queue.length, 5, `今日の登録が5件ではない: ${queue.length}`);
assert.deepEqual(
  queue.map((q) => `${q.kind}:${q.action}:${q.title}`),
  [
    "med:event:プレドニゾロン",
    "med:new:エンロフロキサシン",
    "exam:plan:CBC",
    "exam:complete:腹部エコー",
    "proc:history:皮下点滴 150mL",
  ],
  "今日の登録の中身が想定と違う"
);

const queueNote = await page.locator("#input-today-note").innerText();
assert.ok(queueNote.includes("大辻"), `今日の登録に記入者が引き継がれていない: ${queueNote}`);
const todayLabel = todayStr.replace(/-0?/g, "/").replace(/^\//, "");
assert.ok(
  queueNote.includes(
    `${Number(todayStr.slice(0, 4))}/${Number(todayStr.slice(5, 7))}/${Number(todayStr.slice(8, 10))}`
  ),
  `今日の登録に記録日が引き継がれていない: ${queueNote} (${todayLabel})`
);

await shot("03-today-queue");

// --- 取り消しができる -----------------------------------------------------
await page.click(
  '#input-today-list .input-today-item[data-queue-kind="proc"] .input-today-item__remove'
);
assert.equal(
  await page.locator("#input-today-list .input-today-item").count(),
  4,
  "取り消しが効いていない"
);
// 検証は5件で行うので戻す
await page.click("#btn-input-add-proc");
await page.waitForSelector("#input-sheet-modal:not([hidden])", { timeout: 5000 });
await page.fill("#input-sheet-body textarea", "皮下点滴 150mL");
await page.click("#btn-input-sheet-add");
await page.waitForFunction(() =>
  document.getElementById("input-sheet-modal").hasAttribute("hidden")
);

// --- 保存でまとめて確定 ---------------------------------------------------
await page.evaluate(() => {
  globalThis.__writes = [];
});
await page.click("#btn-input-save");
await page.waitForFunction(() =>
  document.getElementById("screen-input").hasAttribute("hidden")
);

const writes = await page.evaluate(() => globalThis.__writes || []);
console.log("WRITES", writes.map((w) => `${w.op}:${w.name || w.item || w.content || w.headline}`));

const entryWrite = writes.find((w) => w.op === "addEntry");
assert.ok(entryWrite, "本文が保存されていない");
assert.equal(entryWrite.headline, "皮膚炎の再診", "見出しが保存されていない");
assert.equal(entryWrite.author, "大辻", "記入者が保存されていない");
assert.equal(entryWrite.category, "admission", "カテゴリが保存されていない");
assert.equal(entryWrite.important, true, "★が保存されていない");
assert.equal(entryWrite.recordDate, todayStr, "記録日が保存されていない");
assert.ok(entryWrite.body.includes("エンロフロキサシン"), "本文が保存されていない");

// 登録済みの薬は addMedication ではなく addMedicationEvent になる
const addMeds = writes.filter((w) => w.op === "addMedication");
assert.equal(addMeds.length, 1, `新規薬剤の登録が1件ではない: ${addMeds.length}`);
assert.equal(addMeds[0].name, "エンロフロキサシン", "未登録の薬が新規登録されていない");
assert.equal(addMeds[0].changedBy, "大辻", "新規薬剤に記入者が引き継がれていない");
assert.equal(addMeds[0].eventDate, todayStr, "新規薬剤に記録日が引き継がれていない");

const events = writes.filter((w) => w.op === "addMedicationEvent");
assert.equal(events.length, 1, `出来事の追記が1件ではない: ${events.length}`);
assert.equal(events[0].drugId, "d-pred", "既存のプレドニゾロンに追記されていない");
assert.equal(events[0].type, "increase", "選んだ出来事の種類が反映されていない");
assert.equal(events[0].date, todayStr, "出来事に記録日が引き継がれていない");
assert.equal(events[0].changedBy, "大辻", "出来事に記入者が引き継がれていない");
assert.ok(
  !writes.some((w) => w.op === "addMedication" && w.name === "プレドニゾロン"),
  "登録済みの薬が二重登録されている"
);

const examPlans = writes.filter((w) => w.op === "saveExamScheduledPlan");
assert.equal(examPlans.length, 1, "検査予定の登録が1件ではない");
assert.equal(examPlans[0].item, "CBC", "CBCが予定として登録されていない");

const examHist = writes.filter((w) => w.op === "addExamHistory");
assert.equal(examHist.length, 1, "検査実施の記録が1件ではない");
assert.equal(examHist[0].item, "腹部エコー", "腹部エコーの実施が記録されていない");
assert.equal(examHist[0].date, todayStr, "検査実施に記録日が引き継がれていない");
assert.ok(
  writes.some((w) => w.op === "deleteExamScheduledPlan" && w.planId === "p2"),
  "実施した検査が予定から外れていない"
);

const procs = writes.filter((w) => w.op === "addProcedure");
assert.equal(procs.length, 1, "処置の記録が1件ではない");
assert.equal(procs[0].content, "皮下点滴 150mL", "処置の内容が保存されていない");
assert.equal(procs[0].date, todayStr, "処置に記録日が引き継がれていない");

// --- 保存後は状態モードに戻り、登録が反映されている ------------------------
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
const afterStatus = await page.evaluate(() => ({
  meds: [...document.querySelectorAll("#status-meds-list .status-row")].map((el) =>
    el.innerText.replace(/\s+/g, " ").trim()
  ),
  examPlans: [...document.querySelectorAll("#status-exam-plan-list .status-row")].map((el) =>
    el.innerText.replace(/\s+/g, " ").trim()
  ),
  // 実施履歴は項目名の見出しの下に日付が並ぶので、リスト全体の文言で見る
  examHistoryText: (
    document.getElementById("status-exam-history-list")?.innerText || ""
  ).replace(/\s+/g, " "),
}));
console.log("AFTER_STATUS", afterStatus);
assert.ok(
  afterStatus.meds.some((t) => t.includes("エンロフロキサシン")),
  "新規登録した薬が状態モードに出ていない"
);
assert.ok(
  afterStatus.examPlans.some((t) => t.includes("CBC")),
  "登録した検査予定が状態モードに出ていない"
);
assert.ok(
  !afterStatus.examPlans.some((t) => t.includes("腹部エコー")),
  "実施した検査が予定に残っている"
);
const todayLabelJp = `${Number(todayStr.slice(0, 4))}/${Number(
  todayStr.slice(5, 7)
)}/${Number(todayStr.slice(8, 10))}`;
assert.ok(
  afterStatus.examHistoryText.includes("腹部エコー") &&
    afterStatus.examHistoryText.includes(todayLabelJp),
  `実施した検査が履歴に出ていない: ${afterStatus.examHistoryText}`
);
await shot("04-after-save-status");

// --- 記入者は次の記録に引き継がれる（同じカルテ内） ------------------------
await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
const carried = await page.locator("#input-author-row .author-btn.is-selected").innerText();
assert.equal(carried.trim(), "大辻", "記入者が次の記録に引き継がれていない");
assert.equal(
  await page.locator("#input-today-list .input-today-item").count(),
  0,
  "今日の登録が持ち越されている"
);
assert.equal(await page.inputValue("#input-headline"), "", "見出しが残っている");
await shot("05-carried-author");

// --- 保存して次のカルテへ -------------------------------------------------
await page.fill("#input-headline", "2件目の記録");
await page.click("#btn-input-save-next");
await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 5000 });
assert.equal(await page.inputValue("#karte-number-input"), "", "カルテ番号が残っている");
assert.equal(await hiddenOf("#screen-input"), true, "入力モードが閉じていない");
await shot("06-next-karte");

// --- 3カラムの「記録する」も同じ入力モードを開く --------------------
for (const d of ["0", "0", "0", "0", "1"]) {
  await page.click(`#karte-numpad [data-karte-digit="${d}"]`);
}
await page.click('#karte-numpad [data-karte-action="confirm"]');
await page.waitForSelector("#gate-animal:not([hidden]), #center-main:not([hidden])", {
  timeout: 10000,
});
if (!(await hiddenOf("#gate-animal"))) {
  await page.fill("#animal-name-input", "イチロウ");
  await page.click("#btn-animal-next");
}
await page.waitForSelector("#center-main:not([hidden])", { timeout: 10000 });
assert.equal(await hiddenOf("#screen-input"), true, "初期表示が入力モードになっている");
assert.equal(await hiddenOf("#screen-status"), true, "初期表示が状態モードになっている");
await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
assert.equal(
  await page.evaluate(() => Boolean(document.getElementById("entry-composer"))),
  false,
  "中央カラムのインラインフォームが残っている"
);
assert.equal(await hiddenOf("#app-shell .layout"), true, "3カラムが隠れていない");
await shot("07-history-opens-input-mode");

assert.deepEqual(pageErrors, [], `page error: ${pageErrors.join(" / ")}`);

console.log("OK: 入力モードの検証をすべて通過しました");

await browser.close();
server.close();
