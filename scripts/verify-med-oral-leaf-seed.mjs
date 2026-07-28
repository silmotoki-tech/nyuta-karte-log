/**
 * 内服薬の葉シード（順序・同名上書き）のロジック検証
 */
import assert from "node:assert/strict";
import {
  ensureMedicationItemDefaults,
  MED_ORAL_OTHER_GROUP_ID,
  MED_ORAL_ANTIBIOTIC_GROUP_ID,
  MED_ORAL_ANTIINFLAM_GROUP_ID,
  MED_ORAL_STEROID_ANTIHIST_GROUP_ID,
  MED_ORAL_BLOOD_GROUP_ID,
  MEDICATION_ITEM_LEAF_SEED,
  __getStore,
  __resetStore,
} from "./mock-db-med-hierarchy.js";

const ANTIBIOTIC_LABELS = [
  "アモキシシリン",
  "クラブラン酸/アモキシシリン",
  "セファレキシン",
  "セフポドキシム",
  "ファロペネム",
  "アジスロマイシン",
  "タイロシン",
  "クリンダマイシン",
  "ホスホマイシン",
  "ドキシサイクリン",
  "ミノサイクリン",
  "エンロフロキサシン",
  "オルビフロキサシン",
  "モキシフロキサシン",
  "ベラフロックス",
  "ST合剤",
  "ファムシクロビル",
  "クロラムフェニコール",
  "メトロニダゾール",
];

const ANTIINFLAM_LABELS = [
  "オンシオール",
  "プレビコックス",
  "ガリプラント",
  "トロコキシル",
  "パノクエル",
  "トラマドール",
  "プレガバリン",
];

const STEROID_ANTIHIST_LABELS = [
  "プレドニゾロン",
  "レダコート",
  "ゼンタコート",
  "コートリル",
  "レスタミン",
  "セチリジン",
  "ペリアクチン",
];

const BLOOD_LABELS = [
  "ドメナン",
  "クロピドグレル",
  "イグザレルト",
  "トラネキサム酸",
];

__resetStore();
await ensureMedicationItemDefaults();
const store = __getStore();
const items = store.medicationItems;

assert.equal(items[MED_ORAL_ANTIINFLAM_GROUP_ID]?.label, "消炎・鎮痛");

// 同名の既存アモキシシリンは削除せず、抗生剤へ上書き移動
assert.ok(items.legacy1, "legacy1 must remain (no delete)");
assert.equal(items.legacy1.label, "アモキシシリン");
assert.equal(items.legacy1.parentId, MED_ORAL_ANTIBIOTIC_GROUP_ID);
assert.equal(items.legacy1.order, 10);
assert.equal(items.legacy1.category, "oral");
assert.equal(items.legacy1.kind, "leaf");
assert.equal(
  items["seed-med-oral-abx-amoxicillin"],
  undefined,
  "should reuse same-name id instead of creating seed id"
);

// その他に残る旧フラット
for (const id of ["legacy2", "legacy3"]) {
  assert.equal(items[id].parentId, MED_ORAL_OTHER_GROUP_ID);
}

function labelsUnder(parentId) {
  return Object.values(items)
    .filter(
      (r) =>
        r &&
        r.kind === "leaf" &&
        String(r.parentId || "") === parentId
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, "ja"))
    .map((r) => r.label);
}

const antibiotic = labelsUnder(MED_ORAL_ANTIBIOTIC_GROUP_ID);
const antiinflam = labelsUnder(MED_ORAL_ANTIINFLAM_GROUP_ID);
const steroid = labelsUnder(MED_ORAL_STEROID_ANTIHIST_GROUP_ID);
const blood = labelsUnder(MED_ORAL_BLOOD_GROUP_ID);
console.log("antibiotic order:", antibiotic);
console.log("antiinflam order:", antiinflam);
console.log("steroid-antihist order:", steroid);
console.log("blood order:", blood);

assert.deepEqual(antibiotic, ANTIBIOTIC_LABELS);
assert.deepEqual(antiinflam, ANTIINFLAM_LABELS);
assert.deepEqual(steroid, STEROID_ANTIHIST_LABELS);
assert.deepEqual(blood, BLOOD_LABELS);
assert.equal(
  MEDICATION_ITEM_LEAF_SEED.length,
  ANTIBIOTIC_LABELS.length +
    ANTIINFLAM_LABELS.length +
    STEROID_ANTIHIST_LABELS.length +
    BLOOD_LABELS.length
);

// 表記ゆれの同名上書き（既存IDを維持）
__resetStore();
store.medicationItems.userClav = {
  label: "クラブラン酸/アモキシシリン",
  category: "oral",
  kind: "leaf",
  parentId: MED_ORAL_OTHER_GROUP_ID,
  order: 999,
};
store.medicationItems.userPred = {
  label: "プレドニゾロン",
  category: "oral",
  kind: "leaf",
  parentId: MED_ORAL_OTHER_GROUP_ID,
  order: 888,
};
await ensureMedicationItemDefaults();
assert.ok(store.medicationItems.userClav);
assert.equal(store.medicationItems.userClav.parentId, MED_ORAL_ANTIBIOTIC_GROUP_ID);
assert.equal(store.medicationItems.userClav.order, 20);
assert.ok(store.medicationItems.userPred);
assert.equal(store.medicationItems.userPred.parentId, MED_ORAL_STEROID_ANTIHIST_GROUP_ID);
assert.equal(store.medicationItems.userPred.order, 10);
assert.equal(store.medicationItems.userPred.label, "プレドニゾロン");
assert.equal(
  store.medicationItems["seed-med-oral-steroid-prednisolone"],
  undefined
);

console.log("OK: oral leaf seeds + same-name overwrite");
