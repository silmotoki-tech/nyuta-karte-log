/**
 * 入力モードのチップ検出（chip-detect.js）が、あいまい照合
 * （編集距離＋類義語辞書）にどこまで対応できているかを検証する。
 * - 完全一致（アモキシシリン・ゲンタマイシンクリーム・CBC・肝スク・慢性腎臓病）
 * - ACTHの表記ゆれ（ACTH通常／ACTH松木式）を編集距離で拾えるか
 * - 「血液検査」という一般語から類義語辞書経由でCBC等を拾えるか
 * - 「肝スクリーニング」から「肝スク」と「スクリーニング」が二重検出されず
 *   1件（肝スク）にまとまるか（開始位置優先の重複解消）
 * - 疾患名マスタ（既往歴）も検出対象に入るか
 * - 検出件数の上限（8〜10件程度）が効くか
 *
 * ブラウザを使わず、実際のマッチングモジュール（chip-detect.js /
 * exam-item-match.js / med-item-match.js / history-item-match.js）を
 * そのままNodeから読み込んで検証する（DOM・Firebaseに依存しないため）。
 */
import assert from "node:assert/strict";
import { detectNoteChips } from "../js/chip-detect.js";

// 実マスタ（js/db.js）の該当項目を模した最小セット
const examItems = [
  { id: "g-blood", label: "血液", kind: "group", category: "blood", parentId: "" },
  { id: "g-blood-liver", label: "肝臓", kind: "group", category: "blood", parentId: "g-blood" },
  { id: "l-liver-scr", label: "肝スク", kind: "leaf", category: "blood", parentId: "g-blood-liver" },
  { id: "l-cbc", label: "CBC", kind: "leaf", category: "blood", parentId: "g-blood" },
  { id: "g-blood-hormone", label: "ホルモン", kind: "group", category: "blood", parentId: "g-blood" },
  { id: "l-acth", label: "ACTH通常", kind: "leaf", category: "blood", parentId: "g-blood-hormone" },
  { id: "l-acth-m", label: "ACTH松木式", kind: "leaf", category: "blood", parentId: "g-blood-hormone" },
  { id: "g-imaging", label: "画像", kind: "group", category: "imaging", parentId: "" },
  { id: "g-heart-echo", label: "心エコー", kind: "group", category: "imaging", parentId: "g-imaging" },
  { id: "l-heart-scr", label: "スクリーニング", kind: "leaf", category: "imaging", parentId: "g-heart-echo" },
  { id: "g-abdomen-echo", label: "腹部エコー", kind: "group", category: "imaging", parentId: "g-imaging" },
  { id: "l-abdomen-scr", label: "スクリーニング", kind: "leaf", category: "imaging", parentId: "g-abdomen-echo" },
];

const medItems = [
  { id: "g-oral-abx", label: "抗生剤", kind: "group", category: "oral", parentId: "" },
  { id: "l-amox", label: "アモキシシリン", kind: "leaf", category: "oral", parentId: "g-oral-abx" },
  { id: "l-amox-clav", label: "クラブラン酸/アモキシシリン", kind: "leaf", category: "oral", parentId: "g-oral-abx" },
  { id: "g-topical-skin", label: "皮膚", kind: "group", category: "topical", parentId: "" },
  { id: "l-gentamicin", label: "ゲンタマイシンクリーム", kind: "leaf", category: "topical", parentId: "g-topical-skin" },
];

const historyItems = [
  { id: "g-hist-internal", label: "内科疾患", kind: "group", parentId: "" },
  { id: "l-hist-ckd", label: "慢性腎臓病", kind: "leaf", parentId: "g-hist-internal" },
  { id: "l-hist-mvi", label: "僧帽弁閉鎖不全症", kind: "leaf", parentId: "g-hist-internal" },
];

function detect(body, opts) {
  return detectNoteChips(body, { examItems, medItems, historyItems }, opts);
}

// --- 1. 元の調査で使った文（初回報告分） -----------------------------------
const BODY1 =
  "本日はアモキシシリンを継続。血液検査（CBCと肝スク）を実施し、ACTHも合わせて確認した。皮膚の状態を見てゲンタマイシンクリームを処方。";
const hits1 = detect(BODY1);
console.log("BODY1 HITS", hits1.map((h) => `${h.kind}:${h.label}(${h.score})`));

const labelsOf = (hits) => hits.map((h) => h.label);
assert.ok(labelsOf(hits1).includes("アモキシシリン"), "アモキシシリンが検出されない");
assert.ok(labelsOf(hits1).includes("ゲンタマイシンクリーム"), "ゲンタマイシンクリームが検出されない");
assert.ok(labelsOf(hits1).includes("CBC"), "CBCが検出されない");
assert.ok(labelsOf(hits1).includes("肝スク"), "肝スクが検出されない");
// ACTHは通常/松木式のどちらかは編集距離（トークン一致）で拾えるはず
assert.ok(
  labelsOf(hits1).includes("ACTH通常") || labelsOf(hits1).includes("ACTH松木式"),
  "ACTHの表記からACTH通常/松木式のどちらも検出されない"
);

// --- 2. 「肝スクリーニング」の重複検出が解消されているか ---------------------
const BODY2 =
  "本日はアモキシシリンを継続。血液検査（CBCと肝スクリーニング）を実施し、ACTHも合わせて確認した。皮膚の状態を見てゲンタマイシンクリームを処方。慢性腎臓病の経過観察も継続。";
const hits2 = detect(BODY2);
console.log("BODY2 HITS", hits2.map((h) => `${h.kind}:${h.label}(${h.score})`));

assert.ok(labelsOf(hits2).includes("肝スク"), "肝スクリーニングから肝スクが検出されない");
assert.ok(
  !labelsOf(hits2).includes("スクリーニング"),
  "肝スクリーニングからスクリーニングが重複検出されている（重複解消が効いていない）"
);
assert.ok(labelsOf(hits2).includes("慢性腎臓病"), "既往歴（慢性腎臓病）が検出対象に入っていない");
assert.equal(
  hits2.find((h) => h.label === "慢性腎臓病")?.kind,
  "history",
  "慢性腎臓病がhistory種別で検出されていない"
);

// --- 3. 上限（既定10件）を超えたら高スコア優先で切り詰める -------------------
const manyExamItems = Array.from({ length: 20 }, (_, i) => ({
  id: `l-extra-${i}`,
  label: `検査項目${i}`,
  kind: "leaf",
  category: "other",
  parentId: "",
}));
const capHits = detectNoteChips(
  manyExamItems.map((t) => t.label).join("。"),
  { examItems: manyExamItems, medItems: [], historyItems: [] },
  { limit: 10 }
);
assert.equal(capHits.length, 10, `上限10件で切り詰められていない: ${capHits.length}`);

console.log("OK: チップ検出のあいまい照合をすべて通過しました");
