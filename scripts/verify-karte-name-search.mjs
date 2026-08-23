/**
 * カルテ番号ゲートの名前検索を検証する。
 * - 動物名・飼い主名の部分一致
 * - 同名が複数あるときは全部出す
 * - ヒットなしは「見つかりません」
 * - 一覧タップでその番号の動物名確認へ進む
 * - 検索欄は通常のテキスト入力（テンキーに数字を奪われない）
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./launch-browser.js";
import { applyAuthStub, enterPasscode, readMockDb } from "./auth-stub.js";
import {
  filterKartesByName,
  karteNameMatches,
  normalizeKarteNameQuery,
} from "../js/karte-name-match.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const DIRECTORY = [
  { karteNumber: "11111", animalName: "イチロウ", ownerName: "ヤマダ" },
  { karteNumber: "22222", animalName: "イチロウ", ownerName: "サトウ" },
  { karteNumber: "33333", animalName: "ハナコ", ownerName: "ヤマダタロウ" },
];

const mockDb = `import { filterKartesByName } from "./karte-name-match.js";
const KARTE_NAME_DIRECTORY = ${JSON.stringify(DIRECTORY)};
export async function searchKartesByName(query) {
  return filterKartesByName(KARTE_NAME_DIRECTORY, query);
}
export async function getOwnerName(karteNumber) {
  const row = KARTE_NAME_DIRECTORY.find((r) => r.karteNumber === String(karteNumber));
  return row?.ownerName || null;
}
export async function setOwnerName() {}
` + readMockDb("mock-db-status-mode.js");

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
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

console.log("\n[unit: karte-name-match]");
{
  assert.equal(normalizeKarteNameQuery(" イチ ロウ "), "イチロウ");
  assert.equal(normalizeKarteNameQuery("いちろう"), "イチロウ");
  assert.equal(
    karteNameMatches({ animalName: "イチロウ", ownerName: "ヤマダ" }, "イチ"),
    true
  );
  assert.equal(
    karteNameMatches({ animalName: "イチロウ", ownerName: "ヤマダ" }, "ヤマ"),
    true
  );
  assert.equal(
    karteNameMatches({ animalName: "イチロウ", ownerName: "ヤマダ" }, "ハナ"),
    false
  );
  const ichi = filterKartesByName(DIRECTORY, "イチ").map((r) => r.karteNumber);
  assert.deepEqual(ichi, ["11111", "22222"]);
  const yamada = filterKartesByName(DIRECTORY, "ヤマダ").map((r) => r.karteNumber);
  assert.deepEqual(yamada, ["11111", "33333"]);
  const none = filterKartesByName(DIRECTORY, "ケンタ");
  assert.equal(none.length, 0);
  console.log("  OK  partial match on animal and owner, multi-hit, no-hit");
}

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1180, height: 900 },
  serviceWorkers: "block",
});
const page = await context.newPage();
await applyAuthStub(page, { dbMock: mockDb });
await page.goto(base + "/index.html", { waitUntil: "networkidle" });
await enterPasscode(page);
await page.waitForSelector("#gate-karte:not([hidden])", { timeout: 10000 });

async function searchState() {
  return page.evaluate(() => {
    const input = document.getElementById("karte-name-search-input");
    const status = document.getElementById("karte-name-search-status");
    const items = [...document.querySelectorAll(".karte-name-search__btn")].map(
      (btn) => ({
        number: btn.dataset.karteNumber,
        text: btn.innerText.replace(/\s+/g, " ").trim(),
      })
    );
    return {
      value: input?.value || "",
      readOnly: !!input?.readOnly,
      inputmode: input?.getAttribute("inputmode"),
      status: status?.hidden ? "" : status?.textContent || "",
      items,
    };
  });
}

async function typeSearch(text) {
  const input = page.locator("#karte-name-search-input");
  await input.click();
  await input.fill("");
  await input.type(text, { delay: 20 });
  await page.waitForTimeout(350);
}

console.log("\n[ui: search field]");
{
  const attrs = await searchState();
  assert.equal(attrs.readOnly, false, "search input is editable");
  assert.notEqual(attrs.inputmode, "none", "search input is not inputmode=none");

  await page.locator("#karte-name-search-input").click();
  const focused = await page.evaluate(
    () => document.activeElement?.id === "karte-name-search-input"
  );
  assert.equal(focused, true, "search input keeps focus");

  await page.keyboard.type("12");
  const afterDigits = await page.evaluate(() => ({
    search: document.getElementById("karte-name-search-input")?.value || "",
    karte: document.getElementById("karte-number-input")?.value || "",
  }));
  assert.equal(afterDigits.search, "12", "digits stay in the search field");
  assert.equal(afterDigits.karte, "", "numpad gate does not steal search digits");
  await page.locator("#karte-name-search-input").fill("");
  console.log("  OK  search field is a normal text input");
}

console.log("\n[ui: animal partial]");
{
  await typeSearch("イチ");
  const state = await searchState();
  assert.equal(state.status, "", `no empty status (got "${state.status}")`);
  assert.deepEqual(
    state.items.map((x) => x.number),
    ["11111", "22222"]
  );
  assert.ok(
    state.items.every((x) => x.text.includes("イチロウ")),
    "animal name is shown"
  );
  assert.ok(
    state.items.some((x) => x.text.includes("ヤマダ")),
    "owner ヤマダ is shown"
  );
  assert.ok(
    state.items.some((x) => x.text.includes("サトウ")),
    "owner サトウ is shown"
  );
  const shotDir = path.join(root, "tools");
  fs.mkdirSync(shotDir, { recursive: true });
  await page.locator("#gate-karte .gate-card").screenshot({
    path: path.join(shotDir, "karte-name-search-verify.png"),
  });
  console.log("  OK  イチ → 11111 / 22222");
}

console.log("\n[ui: owner partial]");
{
  await typeSearch("ヤマダ");
  const state = await searchState();
  assert.deepEqual(
    state.items.map((x) => x.number),
    ["11111", "33333"]
  );
  assert.ok(
    state.items.some((x) => x.text.includes("ハナコ")),
    "owner search also returns ハナコ"
  );
  console.log("  OK  ヤマダ → 11111 / 33333");
}

console.log("\n[ui: no hit]");
{
  await typeSearch("ケンタ");
  const state = await searchState();
  assert.equal(state.items.length, 0, "no result rows");
  assert.match(state.status, /見つかりません/);
  console.log("  OK  見つかりません");
}

console.log("\n[ui: tap proceeds]");
{
  await typeSearch("ハナ");
  const state = await searchState();
  assert.deepEqual(
    state.items.map((x) => x.number),
    ["33333"]
  );
  await page.click('.karte-name-search__btn[data-karte-number="33333"]');
  await page.waitForSelector("#gate-animal:not([hidden])", { timeout: 8000 });
  const next = await page.evaluate(() => ({
    gateKarteHidden: document.getElementById("gate-karte")?.hidden === true,
    number: document.getElementById("animal-karte-number")?.textContent || "",
    owner: document.getElementById("owner-name-input")?.value || "",
  }));
  assert.equal(next.gateKarteHidden, true, "left karte gate");
  assert.equal(next.number, "33333", "selected karte number");
  assert.equal(next.owner, "ヤマダタロウ", "owner name is filled");
  console.log("  OK  tap 33333 → animal gate");
}

await browser.close();
server.close();
console.log("\nVERIFY_OK");
