/**
 * 検査マスタ全体に対する AI 照合の包括テスト。
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findExamItemCandidates, listExamMatchTargets } from "../js/exam-item-match.js";

function bloodGroupSeed(group) {
  const rows = [
    {
      id: group.id,
      label: group.label,
      category: "blood",
      kind: "group",
      parentId: "",
      order: group.order,
    },
  ];
  (group.children || []).forEach((child, index) => {
    rows.push({
      id: child.id,
      label: child.label,
      category: "blood",
      kind: "leaf",
      parentId: group.id,
      order: (index + 1) * 10,
    });
  });
  return rows;
}

/** 現行シード相当のフルマスタ */
export const FULL_EXAM_MASTER = [
  { id: "seed-blood-cbc", label: "CBC", category: "blood", kind: "leaf", parentId: "", order: 1 },
  ...bloodGroupSeed({
    id: "seed-blood-liver",
    label: "肝臓",
    order: 10,
    children: [
      { id: "seed-blood-liver-alt", label: "ALT" },
      { id: "seed-blood-liver-ast", label: "AST" },
      { id: "seed-blood-liver-alp", label: "ALP" },
      { id: "seed-blood-liver-ggt", label: "GGT" },
      { id: "seed-blood-liver-tbil", label: "総ビリルビン" },
      { id: "seed-blood-liver-tba-prepost", label: "TBA(pre・post)" },
      { id: "seed-blood-liver-tba-post", label: "TBA(post)" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-kidney",
    label: "腎臓",
    order: 20,
    children: [
      { id: "seed-blood-kidney-bun", label: "BUN" },
      { id: "seed-blood-kidney-cre", label: "Cre" },
      { id: "seed-blood-kidney-ca", label: "Ca" },
      { id: "seed-blood-kidney-ip", label: "IP" },
      { id: "seed-blood-kidney-electrolyte", label: "電解質" },
      { id: "seed-blood-kidney-panel-idexx", label: "腎パネル(IDEXX)" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-lipid",
    label: "脂質",
    order: 30,
    children: [
      { id: "seed-blood-lipid-tcho", label: "T-Cho" },
      { id: "seed-blood-lipid-tg", label: "TG" },
    ],
  }),
  ...bloodGroupSeed({
    id: "seed-blood-hormone",
    label: "ホルモン",
    order: 40,
    children: [
      { id: "seed-blood-hormone-acth", label: "ACTH通常" },
      { id: "seed-blood-hormone-acth-matsuki", label: "ACTH松木式" },
      { id: "seed-blood-hormone-t4", label: "T4" },
      { id: "seed-blood-hormone-ft4", label: "fT4" },
    ],
  }),
  { id: "seed-blood-glucose-antosense", label: "血糖(アントセンス)", category: "blood", kind: "leaf", parentId: "" },
  { id: "seed-blood-glucose-drychem", label: "血糖(ドライケム)", category: "blood", kind: "leaf", parentId: "" },
  { id: "seed-blood-crp", label: "CRP", category: "blood", kind: "leaf", parentId: "" },
  { id: "seed-blood-saa", label: "SAA", category: "blood", kind: "leaf", parentId: "" },
  { id: "seed-blood-checkup-fujifilm", label: "健診セット(FUJIFILM)", category: "blood", kind: "leaf", parentId: "" },
  { id: "seed-blood-checkup-idexx", label: "健診セット(IDEXX)", category: "blood", kind: "leaf", parentId: "" },
  {
    id: "seed-imaging-set",
    label: "セット",
    category: "imaging",
    kind: "group",
    parentId: "",
  },
  {
    id: "seed-imaging-full-scr",
    label: "全set",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-set",
  },
  {
    id: "seed-other-chest-set",
    label: "胸部set",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-set",
  },
  {
    id: "seed-other-abdomen-set",
    label: "腹部set",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-set",
  },
  {
    id: "seed-imaging-heart-echo",
    label: "心エコー",
    category: "imaging",
    kind: "group",
    parentId: "",
  },
  {
    id: "seed-imaging-heart-echo-scr",
    label: "心エコー(スクリーニング)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-heart-echo",
  },
  {
    id: "seed-imaging-heart-echo-flow",
    label: "心エコー(流速あり)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-heart-echo",
  },
  {
    id: "seed-imaging-heart-echo-enlarge",
    label: "心エコー(拡大チェック)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-heart-echo",
  },
  {
    id: "seed-imaging-abdomen-echo",
    label: "腹部エコー",
    category: "imaging",
    kind: "group",
    parentId: "",
  },
  {
    id: "seed-imaging-abdomen-echo-scr",
    label: "腹部エコー(スクリーニング)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-abdomen-echo",
  },
  {
    id: "seed-imaging-abdomen-echo-spleen",
    label: "腹部エコー(脾臓)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-abdomen-echo",
  },
  {
    id: "seed-imaging-abdomen-echo-liver",
    label: "腹部エコー(肝臓)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-abdomen-echo",
  },
  {
    id: "seed-imaging-abdomen-echo-kidney",
    label: "腹部エコー(腎臓)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-abdomen-echo",
  },
  {
    id: "seed-imaging-abdomen-echo-ureter",
    label: "腹部エコー(尿管)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-abdomen-echo",
  },
  {
    id: "seed-imaging-abdomen-echo-bladder",
    label: "腹部エコー(膀胱)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-abdomen-echo",
  },
  {
    id: "seed-imaging-abdomen-echo-prostate",
    label: "腹部エコー(前立腺)",
    category: "imaging",
    kind: "leaf",
    parentId: "seed-imaging-abdomen-echo",
  },
  { id: "seed-pathology-cyto-inhouse", label: "細胞診(院内)", category: "pathology", kind: "leaf", parentId: "" },
  { id: "seed-pathology-cyto-outlab", label: "細胞診(外注)", category: "pathology", kind: "leaf", parentId: "" },
  { id: "seed-pathology-histo", label: "組織検査", category: "pathology", kind: "leaf", parentId: "" },
  { id: "seed-pathology-bact-culture-inhouse", label: "細菌培養(院内)", category: "pathology", kind: "leaf", parentId: "" },
  { id: "seed-pathology-bact-culture-outlab", label: "細菌培養(外注)", category: "pathology", kind: "leaf", parentId: "" },
  { id: "seed-pathology-fungal-culture-inhouse", label: "真菌培養(院内)", category: "pathology", kind: "leaf", parentId: "" },
  { id: "seed-pathology-fungal-culture-outlab", label: "真菌培養(外注)", category: "pathology", kind: "leaf", parentId: "" },
  { id: "seed-other-urine-no-upc", label: "尿検査(UPCなし)", category: "other", kind: "leaf", parentId: "" },
  { id: "seed-other-urine-upc", label: "尿検査(UPC)", category: "other", kind: "leaf", parentId: "" },
  { id: "seed-other-upc-outlab", label: "UPC(外注)", category: "other", kind: "leaf", parentId: "" },
  { id: "seed-other-fecal", label: "便検査", category: "other", kind: "leaf", parentId: "" },
  { id: "seed-other-diarrhea-panel", label: "下痢パネル", category: "other", kind: "leaf", parentId: "" },
];

const cases = [
  { group: "肝臓内訳", query: "ALTの数値を測った", expectAll: ["ALT"] },
  { group: "腎臓内訳", query: "BUNとCreを測定", expectAll: ["BUN", "Cre"] },
  { group: "脂質内訳", query: "コレステロールを測った", expectAll: ["T-Cho"] },
  { group: "ホルモン内訳", query: "ACTH刺激試験", expectAll: ["ACTH通常", "ACTH松木式"] },
  { group: "誤変換・1文字違い", query: "ACDH刺激試験", expectAll: ["ACTH通常", "ACTH松木式"] },
  { group: "誤変換・1文字違い", query: "ATHC刺激", expectAll: ["ACTH通常", "ACTH松木式"] },
  { group: "ホルモン内訳", query: "甲状腺のT4を測定", expectAll: ["T4"] },
  { group: "独立・血液", query: "血液検査した", expectAny: ["CBC", "血糖(アントセンス)"] },
  { group: "独立・画像", query: "レントゲン撮影", expectAny: ["胸部set", "腹部set", "全set"] },
  { group: "独立・病理", query: "病理検査に出した", expectAny: ["組織検査", "細胞診(院内)", "細胞診(外注)"] },
  { group: "脂質内訳", query: "TGが高値", expectAll: ["TG"] },
  {
    group: "独立・画像",
    query: "心エコー実施",
    expectAny: [
      "心エコー(スクリーニング)",
      "心エコー(流速あり)",
      "心エコー(拡大チェック)",
    ],
  },
  {
    group: "独立・画像",
    query: "腹部エコー",
    expectAny: [
      "腹部エコー(スクリーニング)",
      "腹部エコー(脾臓)",
      "腹部エコー(肝臓)",
      "腹部エコー(腎臓)",
      "腹部エコー(尿管)",
      "腹部エコー(膀胱)",
      "腹部エコー(前立腺)",
    ],
  },
  { group: "その他", query: "尿検査UPC", expectAny: ["尿検査(UPC)", "UPC(外注)"] },
  { group: "その他", query: "下痢パネル提出", expectAll: ["下痢パネル"] },
  { group: "独立・血液", query: "CRP再検", expectAll: ["CRP"] },
  { group: "独立・血液", query: "血糖をアントセンスで", expectAll: ["血糖(アントセンス)"] },
  { group: "肝臓内訳", query: "AST再検", expectAll: ["AST"] },
  { group: "腎臓内訳", query: "電解質もみる", expectAll: ["電解質"] },
  { group: "独立・病理", query: "細胞診を外注へ", expectAny: ["細胞診(外注)", "細胞診(院内)"] },
  {
    group: "略称・言い換え",
    query: "腹エコー",
    expectAny: [
      "腹部エコー(スクリーニング)",
      "腹部エコー(脾臓)",
      "腹部エコー(肝臓)",
      "腹部エコー(腎臓)",
      "腹部エコー(尿管)",
      "腹部エコー(膀胱)",
      "腹部エコー(前立腺)",
    ],
  },
  { group: "略称・言い換え", query: "胸写", expectAll: ["胸部set"] },
];

export function runExamMatchAllTests() {
  const targets = listExamMatchTargets(FULL_EXAM_MASTER);
  assert.ok(targets.some((t) => t.label === "ACTH通常" && t.nested));
  assert.ok(targets.some((t) => t.label === "ALT" && t.nested));
  assert.ok(targets.some((t) => t.label === "CBC" && !t.nested));
  assert.ok(!targets.some((t) => t.label === "ホルモン"));

  const results = [];
  let failed = 0;

  for (const c of cases) {
    const labels = findExamItemCandidates(c.query, FULL_EXAM_MASTER).map((x) => x.label);
    let pass = false;
    let detail = "";
    if (c.expectAll) {
      const missing = c.expectAll.filter((e) => !labels.includes(e));
      pass = missing.length === 0;
      detail = pass ? `期待どおり: ${c.expectAll.join(", ")}` : `不足: ${missing.join(", ")}`;
    } else {
      const hit = (c.expectAny || []).filter((e) => labels.includes(e));
      pass = hit.length > 0;
      detail = pass
        ? `ヒット: ${hit.join(", ")}`
        : `期待のいずれかが無い: ${(c.expectAny || []).join(", ")}`;
    }
    if (!pass) failed += 1;
    results.push({
      group: c.group,
      query: c.query,
      pass,
      detail,
      got: labels.join(", ") || "(なし)",
    });
  }

  console.log("\n=== 検査名照合 包括テスト結果 ===\n");
  for (const r of results) {
    console.log(`${r.pass ? "✅" : "❌"} [${r.group}] 「${r.query}」`);
    console.log(`   ${r.detail}`);
    console.log(`   候補: ${r.got}`);
  }
  console.log(`\n合計: ${results.length - failed}/${results.length} 成功`);

  if (failed) {
    process.exitCode = 1;
    throw new Error(`${failed} case(s) failed`);
  }

  console.log("OK: comprehensive exam match");
  return results;
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) runExamMatchAllTests();
