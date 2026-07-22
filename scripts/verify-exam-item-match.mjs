/**
 * 階層マスタ（血液内訳含む）に対する AI 検査名照合を検証する。
 */
import assert from "node:assert/strict";
import {
  findExamItemCandidates,
  listExamLeafItems,
  scoreExamLabelMatch,
} from "../js/exam-item-match.js";

/** 現行マスタに近い階層サンプル（ホルモン内訳・その他独立など） */
const master = [
  { id: "seed-blood-cbc", label: "CBC", kind: "leaf", category: "blood", parentId: "" },
  { id: "seed-blood-liver", label: "肝臓", kind: "group", category: "blood", parentId: "" },
  { id: "seed-blood-liver-alt", label: "ALT", kind: "leaf", category: "blood", parentId: "seed-blood-liver" },
  { id: "seed-blood-liver-ast", label: "AST", kind: "leaf", category: "blood", parentId: "seed-blood-liver" },
  { id: "seed-blood-hormone", label: "ホルモン", kind: "group", category: "blood", parentId: "" },
  {
    id: "seed-blood-hormone-acth",
    label: "ACTH通常",
    kind: "leaf",
    category: "blood",
    parentId: "seed-blood-hormone",
  },
  {
    id: "seed-blood-hormone-acth-matsuki",
    label: "ACTH松木式",
    kind: "leaf",
    category: "blood",
    parentId: "seed-blood-hormone",
  },
  { id: "seed-blood-hormone-t4", label: "T4", kind: "leaf", category: "blood", parentId: "seed-blood-hormone" },
  { id: "seed-imaging-chest", label: "胸部スク", kind: "leaf", category: "imaging", parentId: "" },
  { id: "seed-pathology-histo", label: "組織検査", kind: "leaf", category: "pathology", parentId: "" },
  { id: "seed-other-urine-upc", label: "尿検査(UPC)", kind: "leaf", category: "other", parentId: "" },
  { id: "seed-other-diarrhea-panel", label: "下痢パネル", kind: "leaf", category: "other", parentId: "" },
];

const leaves = listExamLeafItems(master);
assert.ok(leaves.some((i) => i.label === "ACTH通常"), "内訳 ACTH通常 が leaf に含まれる");
assert.ok(leaves.some((i) => i.label === "ALT"), "内訳 ALT が leaf に含まれる");
assert.ok(!leaves.some((i) => i.label === "ホルモン"), "大項目 ホルモン は leaf に含めない");
assert.ok(!leaves.some((i) => i.label === "肝臓"), "大項目 肝臓 は leaf に含めない");

const query = "ACTH刺激試験";
assert.ok(scoreExamLabelMatch(query, "ACTH通常") >= 48);
assert.ok(scoreExamLabelMatch(query, "ACTH松木式") >= 48);

const candidates = findExamItemCandidates(query, master);
const labels = candidates.map((c) => c.label);
assert.ok(labels.includes("ACTH通常"), `候補に ACTH通常 がない: ${labels.join(", ")}`);
assert.ok(labels.includes("ACTH松木式"), `候補に ACTH松木式 がない: ${labels.join(", ")}`);
assert.ok(!labels.includes("ホルモン"), "大項目が候補に混入");
assert.ok(!labels.includes("CBC"), "無関係 CBC が候補に出ている");

// kind 欠落の大項目でも parentId 参照から除外できること
const messy = [
  { id: "g", label: "ホルモン", category: "blood", parentId: "" }, // kind なし
  { id: "a", label: "ACTH通常", kind: "leaf", category: "blood", parentId: "g" },
  { id: "b", label: "ACTH松木式", kind: "leaf", category: "blood", parentId: "g" },
];
const messyLeaves = listExamLeafItems(messy).map((i) => i.label);
assert.deepEqual(messyLeaves.sort(), ["ACTH松木式", "ACTH通常"]);
const messyCand = findExamItemCandidates("ACTH刺激試験", messy).map((c) => c.label);
assert.ok(messyCand.includes("ACTH通常") && messyCand.includes("ACTH松木式"));

// 内訳 ALT
const altCand = findExamItemCandidates("ALT再検", master).map((c) => c.label);
assert.ok(altCand.includes("ALT"), `ALT 候補なし: ${altCand.join(", ")}`);

console.log("query:", query);
console.log(
  "candidates:",
  candidates.map((c) => `${c.label}(${c.score})`).join(", ")
);
console.log("OK: hierarchical master match (ACTH / ALT / leaf filter)");
