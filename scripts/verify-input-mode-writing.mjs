/**
 * 入力モードを「書くこと」に寄せた改修を、本番 index.html + app.js 経路で検証する。
 * - 左カラムの見出し一覧が入力中も残り、タップで見出し・本文が写ること（続きから選ぶ）
 * - 写した後も編集でき、別の記録を何度でも選び直せること
 * - 「変化あり」で保存すると changed が付き、時系列の該当行に印が出ること
 * - 本文欄が記入面の高さの大半を占め、「今日の登録」が畳まれていること
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";
import { MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

/** 左カラムから写す元になる、過去の記録 */
const ENTRIES = [
  {
    id: "e-old-3",
    recordDate: "2026-08-10",
    headline: "皮膚炎の経過観察",
    body: "痒みは軽度。プレドニゾロンは継続。次回は2週間後。",
    category: "none",
    important: false,
    author: "大辻",
  },
  {
    id: "e-old-2",
    recordDate: "2026-08-03",
    headline: "入院3日目",
    body: "食欲やや改善。点滴は継続中。",
    category: "admission",
    important: false,
    author: "院長",
  },
  {
    id: "e-old-1",
    recordDate: "2026-07-27",
    headline: "初診",
    body: "左前肢の跛行を主訴に来院。",
    category: "none",
    important: true,
    author: "大辻",
  },
];

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
// 実機はタップ操作なので、クリックではなくタップで確かめられる文脈にする
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  deviceScaleFactor: 2,
  hasTouch: true,
  serviceWorkers: "block",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => {
  pageErrors.push(String(e));
  console.warn("pageerror", String(e));
});

// 「続きから選ぶ」は確認を挟まない。ダイアログが出た時点で不合格。
// （iPad で確認が抑止／キャンセルされると、タップが空振りになるため）
// 破棄の確認だけは出てほしいので、場面ごとに応答を切り替える。
let dialogCount = 0;
let lastDialog = "";
let dialogAnswer = "dismiss";
page.on("dialog", (d) => {
  dialogCount += 1;
  lastDialog = d.message();
  if (dialogAnswer === "accept") d.accept();
  else d.dismiss();
});

await page.addInitScript((entries) => {
  globalThis.__seedEntries = entries;
}, ENTRIES);

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

// --- 入力モードへ ---------------------------------------------------------
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
await page.click("#btn-status-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });

// --- 【3】レイアウト ------------------------------------------------------
const layout = await page.evaluate(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const col = document.getElementById("col-left");
  return {
    leftInInput: col?.parentElement?.id === "input-left-slot",
    leftVisible: Boolean(col && col.getBoundingClientRect().width > 0),
    headlineListVisible: !document.getElementById("headline-list").hidden,
    left: rect("#input-left-slot"),
    pane: rect(".input-pane"),
    meta: rect(".input-meta-row"),
    textarea: rect("#input-body-text"),
    chips: rect(".input-chips"),
    today: rect("#input-today"),
    todayOpen: document.getElementById("input-today").open,
    metaRowTops: [
      "#input-author-field",
      "#input-category-buttons",
      "#btn-input-important",
      "#input-record-date",
    ].map((sel) => rect(sel)?.y),
  };
});
console.log("LAYOUT", layout);

assert.equal(layout.leftInInput, true, "左カラムが入力モードに移っていない");
assert.equal(layout.leftVisible, true, "左カラムが見えていない");
assert.equal(layout.headlineListVisible, true, "見出し一覧が隠れている");
assert.ok(layout.left.x < layout.pane.x, "左カラムが画面の左にない");

const bodyRatio = layout.textarea.h / layout.pane.h;
console.log("BODY_RATIO", Number(bodyRatio.toFixed(3)));
assert.ok(bodyRatio > 0.45, `本文欄が狭い: 記入面の${Math.round(bodyRatio * 100)}%`);

assert.ok(
  layout.chips.y > layout.textarea.y + layout.textarea.h - 2,
  "検出チップが本文欄の下にない"
);
assert.ok(layout.today.y > layout.chips.y, "「今日の登録」が検出チップより上にある");
assert.equal(layout.todayOpen, false, "「今日の登録」が畳まれていない");
assert.ok(layout.today.h < 60, `畳んだ「今日の登録」が高い: ${layout.today.h}px`);

// 記入者・分類・★・記録日は縦積みをやめて横並びにする。
// 記入者13名のボタンだけで1行を使い切るため、分類・★・記録日が2行目に回るところまでが限界。
const [authorTop, catTop, starTop, dateTop] = layout.metaRowTops;
assert.ok(
  Math.abs(catTop - starTop) < 12 && Math.abs(catTop - dateTop) < 12,
  `分類・★・記録日が横並びになっていない: ${layout.metaRowTops}`
);
assert.ok(catTop > authorTop, "記入者と分類が同じ行に重なっている");
assert.ok(
  layout.meta.h <= 80,
  `記入者〜記録日の帯が高い: ${layout.meta.h}px`
);
assert.ok(
  layout.textarea.h > layout.meta.h * 4,
  "本文欄が選択欄に対して十分大きくない"
);

await shot("10-writing-layout");

// 畳んだ「今日の登録」はタップで開く
await page.click("#input-today .input-today__head");
assert.equal(
  await page.evaluate(() => document.getElementById("input-today").open),
  true,
  "タップしても「今日の登録」が開かない"
);
await shot("11-today-expanded");
await page.click("#input-today .input-today__head");

// --- 【1】左カラムから続きを選ぶ ------------------------------------------
const headlines = await page.evaluate(() =>
  [...document.querySelectorAll("#headline-list .hl-item__text")].map((el) => el.textContent)
);
assert.deepEqual(
  headlines,
  ["皮膚炎の経過観察", "入院3日目", "初診"],
  `左カラムの見出しが想定と違う: ${headlines}`
);

// 実機と同じくタップで操作する
const pick = (n) => page.locator("#headline-list .hl-item__btn").nth(n - 1).tap();
const fields = () =>
  page.evaluate(() => ({
    headline: document.getElementById("input-headline").value,
    body: document.getElementById("input-body-text").value,
    target: document.querySelector("#headline-list .hl-item__btn.is-target")?.textContent.trim(),
  }));

// 空の状態から写す
await pick(1);
let now = await fields();
assert.equal(now.headline, ENTRIES[0].headline, "見出しが写っていない");
assert.equal(now.body, ENTRIES[0].body, "本文が写っていない");
assert.ok(now.target?.includes(ENTRIES[0].headline), "選んだ項目に印が付いていない");
await shot("12-copied-from-left");

// 写した内容はそのまま編集できる
await page.click("#input-body-text");
await page.keyboard.press("End");
await page.type("#input-body-text", "\n本日は痒みが消失。");
now = await fields();
assert.ok(now.body.endsWith("本日は痒みが消失。"), "写した本文を編集できない");
await page.fill("#input-headline", "皮膚炎の経過観察（改善）");
await shot("13-edited-after-copy");

// 自分で書き換えた後でも、タップしたら必ず写る（ここが空振りしていた）
await pick(3);
now = await fields();
assert.equal(now.headline, ENTRIES[2].headline, "編集後のタップが反映されていない");
assert.equal(now.body, ENTRIES[2].body, "編集後のタップで本文が反映されていない");
assert.ok(now.target?.includes(ENTRIES[2].headline), "印が選び直した項目に移っていない");

// 本文にカーソルを置いたまま（キーボードが出ている状態）でも写る
await page.click("#input-body-text");
await page.type("#input-body-text", "追記。");
await pick(2);
now = await fields();
assert.equal(now.headline, ENTRIES[1].headline, "本文編集中のタップが反映されていない");
assert.equal(now.body, ENTRIES[1].body, "本文編集中のタップで本文が反映されていない");

// 4回目・5回目も同じように選び直せる
await pick(1);
now = await fields();
assert.equal(now.headline, ENTRIES[0].headline, "4回目の写しが反映されていない");
await pick(3);
now = await fields();
assert.equal(now.headline, ENTRIES[2].headline, "5回目の写しが反映されていない");

// 写した後もそこから自由に編集できる
await page.fill("#input-headline", `${ENTRIES[2].headline}（追記）`);
await page.click("#input-body-text");
await page.keyboard.press("End");
await page.type("#input-body-text", "\n跛行は改善傾向。");
now = await fields();
assert.equal(now.headline, `${ENTRIES[2].headline}（追記）`, "写した後の見出しを編集できない");
assert.ok(now.body.startsWith(ENTRIES[2].body), "編集で写した本文が消えている");
assert.ok(now.body.endsWith("跛行は改善傾向。"), "写した後の本文に追記できない");

assert.equal(dialogCount, 0, `続きから選ぶで確認ダイアログが出た（${dialogCount}回）`);
await shot("14-repicked");

// --- 【2】変化あり --------------------------------------------------------
await page.click('#input-author-row .author-btn[data-author="大辻"]');
await page.fill("#input-headline", "入院4日目");
await page.fill("#input-body-text", "食欲が戻り、点滴を終了した。");
await page.check("#input-changed");
await shot("15-changed-checked");

await page.click("#btn-input-save");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });

const writes = await page.evaluate(() => globalThis.__writes || []);
const saved = writes.filter((w) => w.op === "addEntry").at(-1);
console.log("SAVED_ENTRY", saved);
assert.equal(saved.headline, "入院4日目", "保存された見出しが違う");
assert.equal(saved.changed, true, "変化フラグが保存されていない");

// 保存後は既定に戻る（次の記録に変化ありが残らない）
await page.click("#btn-status-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
assert.equal(
  await page.isChecked("#input-changed"),
  false,
  "保存後も「変化あり」が入ったままになっている"
);
await page.click("#btn-input-back");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });

// 中央カラムの時系列で、変化ありの回に印が出る
await page.click("#btn-status-view-history");
await page.waitForFunction(
  () => document.getElementById("screen-status").hidden,
  null,
  { timeout: 5000 }
);
const marks = await page.evaluate(() =>
  [...document.querySelectorAll("#timeline .tl-item")].map((li) => ({
    headline: li.querySelector(".tl-item__headline").textContent.trim(),
    changed: li.classList.contains("tl-item--changed"),
    badge: !li.querySelector(".tl-item__changed").hidden,
  }))
);
console.log("TIMELINE", marks);
assert.equal(marks[0].headline, "入院4日目", "保存した記録が時系列の先頭にない");
assert.equal(marks[0].changed, true, "変化ありの行に印が付いていない");
assert.equal(marks[0].badge, true, "変化ありのバッジが出ていない");
assert.ok(
  marks.slice(1).every((m) => !m.changed && !m.badge),
  "変化なしの行にも印が付いている"
);

const badgeColor = await page.evaluate(() => {
  const el = document.querySelector("#timeline .tl-item--changed .tl-item__changed");
  const cs = getComputedStyle(el);
  return { text: el.textContent.trim(), bg: cs.backgroundColor };
});
console.log("BADGE", badgeColor);
assert.equal(badgeColor.text, "変化", "バッジの文言が違う");
assert.equal(badgeColor.bg, "rgb(201, 102, 60)", `バッジの色が違う: ${badgeColor.bg}`);

await shot("16-timeline-changed-mark");

// 入力モードを閉じたら、左カラムは元の3カラムに戻っている
assert.equal(
  await page.evaluate(() => document.getElementById("col-left").parentElement.className),
  "layout",
  "左カラムが3カラムに戻っていない"
);

// --- 3カラムの「記録する」からも、同じ入力モードが同じように使える ---
assert.equal(
  await page.evaluate(() => Boolean(document.getElementById("entry-composer"))),
  false,
  "中央カラムのインラインフォームが残っている"
);

await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });

const fromHistory = await page.evaluate(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { y: Math.round(r.y), h: Math.round(r.h ?? r.height) };
  };
  return {
    layoutHidden: document.querySelector("#app-shell .layout").hidden,
    leftInInput: document.getElementById("col-left").parentElement.id === "input-left-slot",
    textarea: rect("#input-body-text"),
    pane: rect(".input-pane"),
    todayOpen: document.getElementById("input-today").open,
    changedChecked: document.getElementById("input-changed").checked,
  };
});
console.log("FROM_HISTORY", fromHistory);
assert.equal(fromHistory.layoutHidden, true, "3カラムが隠れていない");
assert.equal(fromHistory.leftInInput, true, "左カラムが入力モードに移っていない");
assert.equal(fromHistory.todayOpen, false, "「今日の登録」が畳まれていない");
assert.equal(fromHistory.changedChecked, false, "「変化あり」が入ったまま開いている");
assert.ok(
  fromHistory.textarea.h / fromHistory.pane.h > 0.45,
  "本文欄が狭い（3カラムから開いた場合）"
);

// 続きから選ぶ（保存済みの記録が先頭に増えているので見出しで選ぶ）
await page
  .locator("#headline-list .hl-item__btn", { hasText: ENTRIES[0].headline })
  .first()
  .tap();
now = await fields();
assert.equal(now.headline, ENTRIES[0].headline, "3カラム経由で見出しが写らない");
assert.equal(now.body, ENTRIES[0].body, "3カラム経由で本文が写らない");

// 検出チップ（本文の薬剤名を拾う）
await page.fill("#input-body-text", "エンロフロキサシンを開始。CBCを予定。");
await page.waitForFunction(
  () => document.querySelectorAll("#input-chip-list .input-chip").length >= 2,
  null,
  { timeout: 5000 }
);
const historyChips = await page.evaluate(() =>
  [...document.querySelectorAll("#input-chip-list .input-chip")].map((el) => el.dataset.chipLabel)
);
console.log("FROM_HISTORY_CHIPS", historyChips);
assert.ok(historyChips.includes("エンロフロキサシン"), "3カラム経由で薬剤チップが出ない");
assert.ok(historyChips.includes("CBC"), "3カラム経由で検査チップが出ない");

// 今日の登録（チップから積むと開く）
await page.click('#input-chip-list .input-chip[data-chip-label="CBC"]');
await page.waitForSelector("#input-sheet-modal:not([hidden])", { timeout: 5000 });
await page.click("#btn-input-sheet-add");
await page.waitForFunction(() => document.getElementById("input-sheet-modal").hasAttribute("hidden"));
assert.equal(
  await page.evaluate(() => document.getElementById("input-today").open),
  true,
  "3カラム経由で「今日の登録」が開かない"
);
assert.equal(
  await page.locator("#input-today-list .input-today-item").count(),
  1,
  "3カラム経由で登録が積まれない"
);

// 変化あり付きで保存 → 3カラムに戻り、時系列に印が出る
await page.click('#input-author-row .author-btn[data-author="院長"]');
await page.fill("#input-headline", "3カラムから記録");
await page.check("#input-changed");
await shot("17-from-history-input-mode");
await page.click("#btn-input-save");
await page.waitForFunction(
  () => document.getElementById("screen-input").hidden,
  null,
  { timeout: 5000 }
);

const backTo3col = await page.evaluate(() => ({
  layoutHidden: document.querySelector("#app-shell .layout").hidden,
  statusHidden: document.getElementById("screen-status").hidden,
  leftHome: document.getElementById("col-left").parentElement.className,
  first: (() => {
    const li = document.querySelector("#timeline .tl-item");
    return {
      headline: li.querySelector(".tl-item__headline").textContent.trim(),
      badge: !li.querySelector(".tl-item__changed").hidden,
    };
  })(),
}));
console.log("BACK_TO_3COL", backTo3col);
assert.equal(backTo3col.layoutHidden, false, "3カラムに戻っていない");
assert.equal(backTo3col.statusHidden, true, "3カラムから開いたのに状態モードへ移っている");
assert.equal(backTo3col.leftHome, "layout", "左カラムが3カラムに戻っていない");
assert.equal(backTo3col.first.headline, "3カラムから記録", "保存した記録が時系列の先頭にない");
assert.equal(backTo3col.first.badge, true, "3カラム経由の変化ありに印が付いていない");

const writesFromHistory = await page.evaluate(() => globalThis.__writes || []);
const savedFromHistory = writesFromHistory.filter((w) => w.op === "addEntry").at(-1);
assert.equal(savedFromHistory.changed, true, "3カラム経由で変化フラグが保存されていない");
assert.ok(
  writesFromHistory.some((w) => w.op === "saveExamScheduledPlan"),
  "3カラム経由で「今日の登録」が保存されていない"
);
await shot("18-from-history-saved");

// --- キャンセル -----------------------------------------------------------

// 何も書いていなければ、確認なしでそのまま閉じる
await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
const beforeEmptyCancel = dialogCount;
await page.click("#btn-input-cancel");
await page.waitForFunction(() => document.getElementById("screen-input").hidden, null, {
  timeout: 5000,
});
assert.equal(dialogCount, beforeEmptyCancel, "空のまま閉じたのに確認が出た");
assert.equal(
  await page.evaluate(() => document.querySelector("#app-shell .layout").hidden),
  false,
  "キャンセルで3カラムに戻っていない"
);

// 書きかけと「今日の登録」がある状態では確認が出る
await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
await page.fill("#input-headline", "捨てられる見出し");
await page.fill("#input-body-text", "エンロフロキサシンを開始。");
await page.waitForFunction(
  () => document.querySelectorAll("#input-chip-list .input-chip").length >= 1,
  null,
  { timeout: 5000 }
);
await page.click('#input-chip-list .input-chip[data-chip-label="エンロフロキサシン"]');
await page.waitForSelector("#input-sheet-modal:not([hidden])", { timeout: 5000 });
await page.click("#btn-input-sheet-add");
await page.waitForFunction(() => document.getElementById("input-sheet-modal").hasAttribute("hidden"));

const writesBeforeCancel = await page.evaluate(() => (globalThis.__writes || []).length);

// いったん「やめない」を選ぶと、入力はそのまま残る
dialogAnswer = "dismiss";
const beforeKeep = dialogCount;
await page.click("#btn-input-cancel");
assert.equal(dialogCount, beforeKeep + 1, "書きかけがあるのに確認が出ない");
console.log("CANCEL_DIALOG", lastDialog);
assert.ok(lastDialog.includes("破棄"), `確認文に破棄の旨がない: ${lastDialog}`);
assert.ok(lastDialog.includes("書きかけの記録"), `確認文に書きかけの記録がない: ${lastDialog}`);
assert.ok(lastDialog.includes("今日の登録"), `確認文に今日の登録がない: ${lastDialog}`);
assert.equal(
  await page.evaluate(() => document.getElementById("screen-input").hidden),
  false,
  "確認をやめたのに入力モードが閉じた"
);
assert.equal(
  await page.inputValue("#input-headline"),
  "捨てられる見出し",
  "確認をやめたのに入力が消えた"
);
await shot("19-cancel-confirm");

// 破棄すると、元の画面に戻って中身は空になる
dialogAnswer = "accept";
await page.click("#btn-input-cancel");
await page.waitForFunction(() => document.getElementById("screen-input").hidden, null, {
  timeout: 5000,
});
dialogAnswer = "dismiss";

const afterCancel = await page.evaluate(() => ({
  layoutHidden: document.querySelector("#app-shell .layout").hidden,
  statusHidden: document.getElementById("screen-status").hidden,
  leftHome: document.getElementById("col-left").parentElement.className,
  writes: (globalThis.__writes || []).length,
  timeline: [...document.querySelectorAll("#timeline .tl-item__headline")].map((el) =>
    el.textContent.trim()
  ),
}));
console.log("AFTER_CANCEL", afterCancel);
assert.equal(afterCancel.layoutHidden, false, "破棄しても3カラムに戻らない");
assert.equal(afterCancel.statusHidden, true, "3カラムから開いたのに状態モードに戻った");
assert.equal(afterCancel.leftHome, "layout", "左カラムが3カラムに戻っていない");
assert.equal(afterCancel.writes, writesBeforeCancel, "破棄したのにDBへ書き込まれている");
assert.ok(
  !afterCancel.timeline.includes("捨てられる見出し"),
  "破棄した記録が時系列に残っている"
);

// 開き直すと空になっている
await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
const reopened = await page.evaluate(() => ({
  headline: document.getElementById("input-headline").value,
  body: document.getElementById("input-body-text").value,
  queue: document.querySelectorAll("#input-today-list .input-today-item").length,
  author: document.querySelector("#input-author-row .author-btn.is-selected")?.dataset.author || "",
}));
console.log("REOPENED", reopened);
assert.equal(reopened.headline, "", "破棄後も見出しが残っている");
assert.equal(reopened.body, "", "破棄後も本文が残っている");
assert.equal(reopened.queue, 0, "破棄後も「今日の登録」が残っている");
assert.equal(reopened.author, "院長", "同じカルテ内の記入者が引き継がれていない");

// 状態モードから開いた場合は、破棄で状態モードに戻る
await page.click("#btn-input-cancel");
await page.waitForFunction(() => document.getElementById("screen-input").hidden, null, {
  timeout: 5000,
});
await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
await page.click("#btn-status-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
await page.fill("#input-headline", "状態モードから書きかけ");
dialogAnswer = "accept";
await page.click("#btn-input-cancel");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
dialogAnswer = "dismiss";
assert.equal(
  await page.evaluate(() => document.getElementById("screen-input").hidden),
  true,
  "破棄しても入力モードが閉じない"
);
await shot("20-cancel-back-to-status");

assert.deepEqual(pageErrors, [], `ページエラーが出ている: ${pageErrors.join(" / ")}`);

await context.close();
await browser.close();
server.close();
console.log("OK: 入力モード（書くことに特化）の検証をすべて通過しました");
