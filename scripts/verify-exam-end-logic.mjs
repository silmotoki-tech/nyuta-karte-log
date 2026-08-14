/**
 * 検査予定の終了／予定に戻すフローを、Firebase なしで検証する。
 * db.js の公開契約（終了＝plans削除のみ、復活＝空dueDateでsave、履歴不変）を模倣して確認。
 */
import assert from "node:assert/strict";

function emptyPlan() {
  return { schemaVersion: 2, plans: {}, history: {} };
}

const store = { examPlan: {} };

function ensure(karte) {
  if (!store.examPlan[karte]) store.examPlan[karte] = emptyPlan();
  return store.examPlan[karte];
}

let seq = 0;
const nid = (p) => `${p}${++seq}`;

async function saveExamScheduledPlan(karte, { planId = null, item, dueDate, note, baselineDate }) {
  const plan = ensure(karte);
  const itemName = (item || "").trim();
  let targetId = planId || null;
  if (!targetId && itemName) {
    const found = Object.entries(plan.plans).find(([, p]) => (p.item || "").trim() === itemName);
    if (found) targetId = found[0];
  }
  if (!targetId) targetId = nid("plan");
  const date = dueDate || "";
  plan.plans[targetId] = {
    item: item || "",
    dueDate: date,
    baselineDate: baselineDate || date || "",
    note: note || "",
  };
  return targetId;
}

async function deleteExamScheduledPlan(karte, planId) {
  delete ensure(karte).plans[planId];
}

async function endExamScheduledPlan(karte, planId) {
  await deleteExamScheduledPlan(karte, planId);
}

async function reviveExamPlanByItem(karte, { item, note = "" }) {
  return saveExamScheduledPlan(karte, {
    item,
    dueDate: "",
    note,
    baselineDate: "2026-07-22",
  });
}

async function addExamHistory(karte, { item, date, note }) {
  const id = nid("hist");
  ensure(karte).history[id] = { item, date, note: note || "" };
  return id;
}

const KARTE = "t1";

// 1. 予定登録 + 履歴追加
const planId = await saveExamScheduledPlan(KARTE, {
  item: "血液検査",
  dueDate: "2026-08-15",
  note: "メモA",
});
await addExamHistory(KARTE, { item: "血液検査", date: "2026-06-01", note: "実施" });
assert.equal(Object.keys(ensure(KARTE).plans).length, 1);
assert.equal(Object.keys(ensure(KARTE).history).length, 1);

// 2. 終了 → plans から消え、history は残り、ended は作らない
await endExamScheduledPlan(KARTE, planId);
const afterEnd = ensure(KARTE);
assert.equal(Object.keys(afterEnd.plans).length, 0, "終了後に plans が空");
assert.equal(Object.keys(afterEnd.history).length, 1, "履歴は残る");
assert.equal(afterEnd.ended, undefined, "ended キーは使わない");
assert.ok(!("ended" in afterEnd) || Object.keys(afterEnd.ended || {}).length === 0);

// 3. 予定に戻す → dueDate 空で plans 復帰、履歴はそのまま
const revivedId = await reviveExamPlanByItem(KARTE, { item: "血液検査", note: "メモA" });
const afterRevive = ensure(KARTE);
assert.ok(afterRevive.plans[revivedId], "plans に復帰");
assert.equal(afterRevive.plans[revivedId].dueDate, "", "次回予定は未設定");
assert.equal(afterRevive.plans[revivedId].item, "血液検査");
assert.equal(Object.keys(afterRevive.history).length, 1, "復活後も履歴は消えない");

// 4. 日付入力して保存
await saveExamScheduledPlan(KARTE, {
  planId: revivedId,
  item: "血液検査",
  dueDate: "2026-09-01",
  note: "メモA",
});
assert.equal(ensure(KARTE).plans[revivedId].dueDate, "2026-09-01");
assert.equal(Object.keys(ensure(KARTE).history).length, 1);

// 5. もう一度終了しても履歴は残る
await endExamScheduledPlan(KARTE, revivedId);
assert.equal(Object.keys(ensure(KARTE).plans).length, 0);
assert.equal(Object.keys(ensure(KARTE).history).length, 1);

console.log("OK: end removes plan only; revive restores empty dueDate; history preserved");
