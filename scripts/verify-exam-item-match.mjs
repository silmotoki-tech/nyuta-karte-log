/**
 * AI検出検査名 → マスタ候補の照合が期待どおり動くことを検証する。
 */
import assert from "node:assert/strict";
import {
  findExamItemCandidates,
  scoreExamLabelMatch,
} from "../js/exam-item-match.js";

const master = [
  { id: "g-hormone", label: "ホルモン", kind: "group", category: "blood" },
  { id: "seed-blood-hormone-acth", label: "ACTH通常", kind: "leaf", category: "blood", parentId: "g-hormone" },
  { id: "seed-blood-hormone-acth-matsuki", label: "ACTH松木式", kind: "leaf", category: "blood", parentId: "g-hormone" },
  { id: "seed-blood-cbc", label: "CBC", kind: "leaf", category: "blood" },
  { id: "seed-imaging-chest", label: "胸部スク", kind: "leaf", category: "imaging" },
  { id: "seed-patho-1", label: "病理組織検査", kind: "leaf", category: "pathology" },
  { id: "seed-other-1", label: "その他検査", kind: "leaf", category: "other" },
];

const query = "ACTH刺激試験";

assert.ok(scoreExamLabelMatch(query, "ACTH通常") >= 50, "ACTH通常のスコアが低い");
assert.ok(scoreExamLabelMatch(query, "ACTH松木式") >= 50, "ACTH松木式のスコアが低い");

const candidates = findExamItemCandidates(query, master);
const labels = candidates.map((c) => c.label);

assert.ok(labels.includes("ACTH通常"), `候補に ACTH通常 がない: ${labels.join(", ")}`);
assert.ok(labels.includes("ACTH松木式"), `候補に ACTH松木式 がない: ${labels.join(", ")}`);
assert.ok(!labels.includes("ホルモン"), "group が候補に混入している");
assert.ok(!labels.includes("CBC"), "無関係な CBC が候補に出ている");

console.log("query:", query);
console.log(
  "candidates:",
  candidates.map((c) => `${c.label}(${c.score})`).join(", ")
);
console.log("OK: ACTH刺激試験 → ACTH通常 / ACTH松木式");
