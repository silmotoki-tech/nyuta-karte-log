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

let dialogCount = 0;
page.on("dialog", (d) => {
  dialogCount += 1;
  d.accept();
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

const pick = (n) => page.locator("#headline-list .hl-item__btn").nth(n - 1).click();
const fields = () =>
  page.evaluate(() => ({
    headline: document.getElementById("input-headline").value,
    body: document.getElementById("input-body-text").value,
    target: document.querySelector("#headline-list .hl-item__btn.is-target")?.textContent.trim(),
  }));

// 空の状態から写す（確認は出ない）
const before = dialogCount;
await pick(1);
let now = await fields();
assert.equal(now.headline, ENTRIES[0].headline, "見出しが写っていない");
assert.equal(now.body, ENTRIES[0].body, "本文が写っていない");
assert.ok(now.target?.includes(ENTRIES[0].headline), "選んだ項目に印が付いていない");
assert.equal(dialogCount, before, "空の入力欄なのに確認が出た");
await shot("12-copied-from-left");

// 写した内容はそのまま編集できる
await page.click("#input-body-text");
await page.keyboard.press("End");
await page.type("#input-body-text", "\n本日は痒みが消失。");
now = await fields();
assert.ok(now.body.endsWith("本日は痒みが消失。"), "写した本文を編集できない");
await page.fill("#input-headline", "皮膚炎の経過観察（改善）");
await shot("13-edited-after-copy");

// 書き換えた後に別の記録を選ぶと、置き換え前に確認が出る
const before2 = dialogCount;
await pick(3);
assert.equal(dialogCount, before2 + 1, "編集済みなのに確認なしで置き換わった");
now = await fields();
assert.equal(now.headline, ENTRIES[2].headline, "2回目の写しが反映されていない");
assert.equal(now.body, ENTRIES[2].body, "2回目の本文が反映されていない");
assert.ok(now.target?.includes(ENTRIES[2].headline), "印が選び直した項目に移っていない");

// 触っていなければ、何度でも確認なしで選び直せる
const before3 = dialogCount;
await pick(2);
now = await fields();
assert.equal(now.headline, ENTRIES[1].headline, "3回目の写しが反映されていない");
assert.equal(dialogCount, before3, "未編集なのに確認が出た");
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

assert.deepEqual(pageErrors, [], `ページエラーが出ている: ${pageErrors.join(" / ")}`);

await context.close();
await browser.close();
server.close();
console.log("OK: 入力モード（書くことに特化）の検証をすべて通過しました");
