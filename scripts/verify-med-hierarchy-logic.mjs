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

console.log("oral groups:", oralGroups.length);
console.log("topical groups:", topicalGroups.length);
console.log("eye groups:", eyeGroups.length);
console.log("inject groups:", injectGroups.length);

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

for (const id of ["legacy2"]) {
  const row = items[id];
  if (!row) throw new Error(`legacy ${id} lost`);
  if (row.category !== "oral" || row.kind !== "leaf") {
    throw new Error(`${id} not migrated to oral leaf`);
  }
  if (row.parentId !== MED_ORAL_OTHER_GROUP_ID) {
    throw new Error(`${id} not under その他`);
  }
  console.log("migrated", id, "→", row.label, "under", row.parentId);
}
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
