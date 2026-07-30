/**
 * 薬剤マスタ階層シードと旧フラット移行のロジック検証（Playwright なし）
 */
import {
  ensureMedicationItemDefaults,
  MED_ORAL_OTHER_GROUP_ID,
  MED_ORAL_ANTIBIOTIC_GROUP_ID,
  __getStore,
} from "./mock-db-med-hierarchy.js";

await ensureMedicationItemDefaults();
const store = __getStore();
const items = store.medicationItems;

const oralGroups = Object.entries(items).filter(
  ([, r]) => r.category === "oral" && r.kind === "group"
);
const topicalGroups = Object.entries(items).filter(
  ([, r]) => r.category === "topical" && r.kind === "group"
);
const eyeGroups = Object.entries(items).filter(
  ([, r]) => r.category === "eye" && r.kind === "group"
);
const injectGroups = Object.entries(items).filter(
  ([, r]) => r.category === "inject" && r.kind === "group"
);
const supplementGroups = Object.entries(items).filter(
  ([, r]) => r.category === "supplement" && r.kind === "group"
);
const foodGroups = Object.entries(items).filter(
  ([, r]) => r.category === "food" && r.kind === "group"
);

console.log("oral groups:", oralGroups.length);
console.log("topical groups:", topicalGroups.length);
console.log("eye groups:", eyeGroups.length);
console.log("inject groups:", injectGroups.length);
console.log("supplement groups:", supplementGroups.length);
console.log("food groups:", foodGroups.length);

if (oralGroups.length !== 19) {
  throw new Error(`expected 19 oral groups, got ${oralGroups.length}`);
}
if (topicalGroups.length !== 3) {
  throw new Error(`expected 3 topical groups, got ${topicalGroups.length}`);
}
if (eyeGroups.length !== 0) {
  throw new Error("eye must have no mid groups");
}
if (injectGroups.length !== 0) {
  throw new Error("inject must have no mid groups");
}
if (supplementGroups.length !== 8) {
  throw new Error(`expected 8 supplement groups, got ${supplementGroups.length}`);
}
if (foodGroups.length !== 7) {
  throw new Error(`expected 7 food groups, got ${foodGroups.length}`);
}
const foodLabels = foodGroups
  .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
  .map(([, r]) => r.label);
if (
  JSON.stringify(foodLabels) !==
  JSON.stringify([
    "Hills",
    "ドクターズ",
    "ダイエティクス",
    "ファルミナ",
    "ピュリナ",
    "ロイヤルカナン",
    "その他",
  ])
) {
  throw new Error("food group labels/order mismatch: " + foodLabels.join(","));
}
if (!items[MED_ORAL_OTHER_GROUP_ID]) {
  throw new Error("その他 group missing");
}

// 同名アモキシシリンは削除せず抗生剤へ上書き移動
const amo = items.legacy1;
if (!amo) throw new Error("legacy1 lost (must not delete same-name item)");
if (amo.parentId !== MED_ORAL_ANTIBIOTIC_GROUP_ID) {
  throw new Error(`アモキシシリン should move under antibiotic, got ${amo.parentId}`);
}
if (amo.order !== 10) throw new Error("アモキシシリン order should be 10");
console.log("same-name overwrite:", "legacy1", "→", amo.label, "under", amo.parentId);

const arava = items.legacy2;
if (!arava) throw new Error("legacy2 lost");
if (arava.parentId !== "seed-med-oral-immuno") {
  throw new Error(`アラバ should move under immuno, got ${arava.parentId}`);
}
console.log("same-name overwrite:", "legacy2", "→", arava.label, "under", arava.parentId);
const palladia = items.legacy3;
if (!palladia) throw new Error("legacy3 lost");
if (palladia.parentId !== "seed-med-oral-anticancer") {
  throw new Error(`パラディア should move under anticancer, got ${palladia.parentId}`);
}
console.log("same-name overwrite:", "legacy3", "→", palladia.label, "under", palladia.parentId);


const labels = ["アモキシシリン", "アラバ", "パラディア"];
for (const label of labels) {
  const found = Object.values(items).some((r) => r.label === label);
  if (!found) throw new Error(`label missing: ${label}`);
}

console.log("OK: hierarchy seed + legacy migration + same-name leaf overwrite");
