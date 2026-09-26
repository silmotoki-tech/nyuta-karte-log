/**
 * 入力モードの見出し先頭絵文字ボタンを、本番 index.html + app.js 経路で検証する。
 * - 記録日の右に 6 個（⭐🆕😄😐😓😨）が並ぶこと
 * - 押すと見出し先頭へ入り、もう一度で外れること
 * - 顔文字は1つだけ、並びは常に ⭐ → 🆕 → 顔文字
 * - 左カラムからのコピーでは先頭絵文字を除くこと
 * - 保存すると左カラムに絵文字付きで出ること
 * - 旧「変化あり」チェックが無いこと
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";
import { MOCK_AUTH_LOGGED_IN } from "./mock-auth-email.js";
import {
  HEADLINE_EMOJI_FACES,
  HEADLINE_EMOJI_NEW,
  HEADLINE_EMOJI_STAR,
  parseHeadlineMarks,
  stripHeadlineMarks,
  toggleHeadlineEmoji,
} from "../js/headline-emoji.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const STAR = HEADLINE_EMOJI_STAR;
const NEW = HEADLINE_EMOJI_NEW;
const [GOOD, OK, MEH, BAD] = HEADLINE_EMOJI_FACES;

// --- モジュール単体 -------------------------------------------------------
assert.equal(toggleHeadlineEmoji("", STAR), `${STAR} `);
assert.equal(toggleHeadlineEmoji(`${STAR} `, STAR), "");
assert.equal(
  toggleHeadlineEmoji(toggleHeadlineEmoji("膀胱炎の経過", MEH), STAR),
  `${STAR}${MEH} 膀胱炎の経過`
);
assert.equal(toggleHeadlineEmoji(`${GOOD} 経過`, OK), `${OK} 経過`);
assert.equal(toggleHeadlineEmoji(`${OK} 経過`, OK), "経過");
assert.equal(
  stripHeadlineMarks(`${STAR}${NEW}${MEH} 膀胱炎の経過`),
  "膀胱炎の経過"
);
assert.deepEqual(parseHeadlineMarks(`${NEW}${STAR}${BAD}本文`).star, true);
assert.equal(formatOrderOnly(), `${STAR}${NEW}${BAD} 本文`);
function formatOrderOnly() {
  return toggleHeadlineEmoji(
    toggleHeadlineEmoji(toggleHeadlineEmoji("本文", BAD), NEW),
    STAR
  );
}

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

const ENTRIES = [
  {
    id: "e-emoji-src",
    recordDate: "2026-08-12",
    headline: `${STAR}${NEW}${MEH} 膀胱炎の経過`,
    body: "前回は食欲普通。",
    category: "none",
    important: false,
    author: "大辻",
  },
  {
    id: "e-plain",
    recordDate: "2026-08-10",
    headline: "皮膚炎の経過観察",
    body: "痒みは軽度。",
    category: "none",
    important: true,
    changed: true,
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
  hasTouch: true,
  serviceWorkers: "block",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => {
  pageErrors.push(String(e));
  console.warn("pageerror", String(e));
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

const outDir = path.join(root, "tools/input-headline-emoji");
fs.mkdirSync(outDir, { recursive: true });
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

await page.click("#btn-view-status");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });
await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });

const codes = await page.evaluate(() =>
  [...document.querySelectorAll("#input-headline-emoji [data-headline-emoji]")].map((btn) =>
    [...(btn.getAttribute("data-headline-emoji") || "")].map((ch) =>
      ch.codePointAt(0).toString(16)
    )
  )
);
assert.deepEqual(
  codes,
  [["2b50"], ["1f195"], ["1f604"], ["1f610"], ["1f613"], ["1f628"]],
  `絵文字の文字コードが指定と違う: ${JSON.stringify(codes)}`
);

const layout = await page.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
    };
  };
  const date = box(document.getElementById("input-record-date"));
  const oldStarBtn = document.getElementById("btn-input-important");
  const oldStarFilter = document.getElementById("star-filter");
  const group = document.getElementById("input-headline-emoji");
  const btns = [...group.querySelectorAll(".input-headline-emoji__btn")].map((btn) => ({
    emoji: btn.textContent.trim(),
    ...box(btn),
    pressed: btn.getAttribute("aria-pressed"),
    label: btn.getAttribute("aria-label"),
  }));
  return {
    viewport: window.innerWidth,
    date,
    oldStarBtn: Boolean(oldStarBtn),
    oldStarFilter: Boolean(oldStarFilter),
    group: box(group),
    btns,
    metaH: Math.round(document.querySelector(".input-meta-row")?.getBoundingClientRect().height || 0),
  };
});
console.log("EMOJI_LAYOUT", JSON.stringify(layout, null, 2));

assert.equal(layout.oldStarBtn, false, "旧★ボタンが残っている");
assert.equal(layout.oldStarFilter, false, "★フィルタが残っている");
assert.equal(layout.btns.length, 6, "ボタンが6個ない");
assert.deepEqual(
  layout.btns.map((b) => b.emoji),
  [STAR, NEW, GOOD, OK, MEH, BAD],
  "ボタンの並びが違う"
);
for (const btn of layout.btns) {
  assert.ok(btn.w >= 44, `タップ領域が狭い ${btn.emoji}: ${btn.w}x${btn.h}`);
  assert.ok(btn.h >= 44, `タップ領域が低い ${btn.emoji}: ${btn.w}x${btn.h}`);
}

const btnYs = layout.btns.map((b) => b.y);
const sameBtnRow = btnYs.every((y) => Math.abs(y - btnYs[0]) < 8);
const firstBtn = layout.btns[0];
const lastBtn = layout.btns[layout.btns.length - 1];
const toTheRightOfDate = firstBtn.x >= layout.date.right - 4;
const sameRowAsDate =
  Math.abs(firstBtn.y + firstBtn.h / 2 - (layout.date.y + layout.date.h / 2)) < 24;
const overflowRight = lastBtn.right > layout.viewport;
const fits = sameBtnRow && toTheRightOfDate && sameRowAsDate && !overflowRight;
console.log("EMOJI_FITS_BESIDE_DATE", fits, {
  sameBtnRow,
  toTheRightOfDate,
  sameRowAsDate,
  overflowRight,
  dateRight: layout.date.right,
  firstBtnX: firstBtn.x,
  lastBtnRight: lastBtn.right,
  viewport: layout.viewport,
  firstBtnY: firstBtn.y,
  dateY: layout.date.y,
});
console.log("FEAR_RIGHT_EDGE", lastBtn.right);
await shot("01-buttons-beside-date");

const leftoverRules = await page.evaluate(() =>
  [...document.querySelectorAll("#headline-list .hl-item")].map((li) => ({
    text: li.querySelector(".hl-item__text")?.textContent || "",
    isImportant: li.classList.contains("is-important"),
    isChanged: li.classList.contains("is-changed"),
    color: getComputedStyle(li.querySelector(".hl-item__rule")).backgroundColor,
  }))
);
console.log("LEFTOVER_RULES", leftoverRules);
assert.ok(
  leftoverRules.some((r) => r.text.includes("皮膚炎の経過観察")),
  "旧★フラグ付きの記録が一覧から消えている"
);
assert.ok(
  leftoverRules.every((r) => !r.isImportant),
  "旧★の is-important が付いている"
);
assert.ok(
  leftoverRules.every((r) => !r.isChanged),
  "旧変化ありの is-changed が付いている"
);
const leftoverPlain = leftoverRules.find((r) => r.text.includes("皮膚炎の経過観察"));
assert.equal(
  leftoverPlain?.color,
  "rgb(220, 223, 227)",
  `旧★付き通常記録の縦線が黄のまま: ${leftoverPlain?.color}`
);

if (!fits) {
  await page.locator(".input-meta-row").screenshot({
    path: path.join(outDir, "01b-overflow-crop.png"),
  });
  console.log(
    "EMOJI_LAYOUT_NOTE",
    overflowRight
      ? "右端がビューポートからはみ出している（縮小はしていない）"
      : "記録日と同じ行に収まっていない（縮小はしていない）"
  );
}

const pressed = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("#input-headline-emoji [data-headline-emoji]")].map((btn) => ({
      emoji: btn.getAttribute("data-headline-emoji"),
      on: btn.getAttribute("aria-pressed") === "true",
    }))
  );

const tapMark = (label) =>
  page.locator(`#input-headline-emoji .input-headline-emoji__btn[aria-label="${label}"]`).tap();

await tapMark("重要");
assert.equal(await page.inputValue("#input-headline"), `${STAR} `, "空見出しで⭐が入らない");
let state = await pressed();
assert.deepEqual(
  state.map((s) => s.on),
  [true, false, false, false, false, false],
  "⭐の選択状態が付かない"
);

await tapMark("重要");
assert.equal(await page.inputValue("#input-headline"), "", "⭐をもう一度押しても消えない");

await page.fill("#input-headline", "膀胱炎の経過");
await tapMark("悪くない");
await tapMark("新しい症状");
await tapMark("重要");
assert.equal(
  await page.inputValue("#input-headline"),
  `${STAR}${NEW}${OK} 膀胱炎の経過`,
  "押した順に関係なく ⭐🆕😐 の並びにならない"
);
await shot("02-after-toggle-order");

await tapMark("良い");
assert.equal(
  await page.inputValue("#input-headline"),
  `${STAR}${NEW}${GOOD} 膀胱炎の経過`,
  "顔文字が入れ替わらない"
);
await tapMark("良い");
assert.equal(
  await page.inputValue("#input-headline"),
  `${STAR}${NEW} 膀胱炎の経過`,
  "同じ顔文字をもう一度押しても消えない"
);

await page.fill("#input-headline", "手で直した見出し");
state = await pressed();
assert.ok(
  state.every((s) => !s.on),
  "見出しから絵文字を消してもボタンが選択のまま"
);

await page.fill("#input-headline", `${BAD} 手入力`);
state = await pressed();
assert.equal(state.find((s) => s.emoji === BAD)?.on, true, "手入力の顔文字がボタンに反映されない");
assert.equal(state.find((s) => s.emoji === STAR)?.on, false, "手入力に無い⭐が選択されている");

await page.locator("#headline-list .hl-item__btn", { hasText: "膀胱炎の経過" }).tap();
assert.equal(
  await page.inputValue("#input-headline"),
  "膀胱炎の経過",
  "左カラムからコピーしたときに絵文字が残っている"
);
state = await pressed();
assert.ok(state.every((s) => !s.on), "コピー後も絵文字ボタンが選択のまま");
const listStillHasEmoji = await page.evaluate(
  () =>
    [...document.querySelectorAll("#headline-list .hl-item__text")].some((el) =>
      el.textContent.includes("膀胱炎の経過") && el.textContent.includes("\u2B50")
    )
);
assert.ok(listStillHasEmoji, "コピー元の左カラム見出しから絵文字が消えている");
await shot("03-copy-stripped");

await page.click('#input-author-row .author-btn[data-author="大辻"]');
await page.fill("#input-headline", "保存確認");
await tapMark("重要");
await tapMark("新しい症状");
await tapMark("イマイチ");
await page.fill("#input-body-text", "保存後の左カラム確認。");
await page.click("#btn-input-save");
await page.waitForSelector("#screen-status:not([hidden])", { timeout: 5000 });

const writes = await page.evaluate(() => globalThis.__writes || []);
const saved = writes.filter((w) => w.op === "addEntry").at(-1);
assert.equal(saved.headline, `${STAR}${NEW}${MEH} 保存確認`, "保存された見出しに絵文字が無い");
assert.equal(saved.important, undefined, "旧★フラグを新規保存に書いている");
assert.equal(saved.changed, undefined, "変化フラグを新規保存に書いている");

await page.click("#btn-start-compose");
await page.waitForSelector("#screen-input:not([hidden])", { timeout: 5000 });
const afterSaveHeadlines = await page.evaluate(() =>
  [...document.querySelectorAll("#headline-list .hl-item__text")].map((el) => el.textContent)
);
console.log("AFTER_SAVE_HEADLINES", afterSaveHeadlines);
assert.ok(
  afterSaveHeadlines.includes(`${STAR}${NEW}${MEH} 保存確認`),
  `保存後の左カラムに絵文字付き見出しが無い: ${afterSaveHeadlines}`
);
assert.equal(await page.locator("#input-changed").count(), 0, "「変化あり」チェックが残っている");
await shot("04-left-list-with-emoji");

assert.deepEqual(pageErrors, [], `ページエラー: ${pageErrors.join(" / ")}`);

await context.close();
await browser.close();
server.close();
console.log("OK: 見出し絵文字ボタンの検証をすべて通過しました");
