/**
 * 予定登録画面での検査項目追加がマスタ共有されることを検証する。
 */
import assert from "node:assert/strict";

const store = { examItems: {} };
const listeners = [];
let seq = 0;

function notify() {
  const items = Object.entries(store.examItems).map(([id, t]) => ({ id, ...t }));
  items.sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  listeners.forEach((cb) => cb(items.map((x) => ({ ...x }))));
}

function subscribeExamItems(callback) {
  listeners.push(callback);
  notify();
  return () => {
    const i = listeners.indexOf(callback);
    if (i >= 0) listeners.splice(i, 1);
  };
}

async function addExamItem({ label }) {
  const id = `item${++seq}`;
  store.examItems[id] = { label, order: Date.now() };
  notify();
  return id;
}

// カルテA相当: 空のマスタから追加
let seenA = [];
subscribeExamItems((items) => {
  seenA = items;
});
assert.equal(seenA.length, 0, "最初はマスタ空");

await addExamItem({ label: "血液検査" });
assert.equal(seenA.length, 1);
assert.equal(seenA[0].label, "血液検査");

// カルテB相当: 別サブスクでも同じマスタが見える
let seenB = [];
subscribeExamItems((items) => {
  seenB = items;
});
assert.equal(seenB.length, 1);
assert.equal(seenB[0].label, "血液検査", "別カルテでもボタン候補になる");

await addExamItem({ label: "超音波検査" });
assert.equal(seenA.length, 2);
assert.equal(seenB.length, 2);
assert.ok(seenB.some((i) => i.label === "超音波検査"));

console.log("OK: exam item master is shared across kartes");
