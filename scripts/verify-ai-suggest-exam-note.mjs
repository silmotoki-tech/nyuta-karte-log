/**
 * AI提案から検査予定を確定するとき、メモが自動文言で埋まらないことを検証する。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const aiSrc = readFileSync(join(root, "js/ai-suggest-ui.js"), "utf8");
const examSrc = readFileSync(join(root, "js/exam-plan-ui.js"), "utf8");
const dbSrc = readFileSync(join(root, "js/db.js"), "utf8");

// フォールバックの自動メモ文言が残っていないこと
assert.ok(!aiSrc.includes("AI提案から登録"), "exam 確定のフォールバックメモが残っている");
assert.ok(
  !aiSrc.includes("ワクチン等の次回予定（AI提案）"),
  "followup 確定の自動メモが残っている"
);

// 正規化で AI 生成 note を捨てること
assert.ok(aiSrc.includes('data.note = ""'), "exam の note クリアがない");
assert.ok(aiSrc.includes('data.noteText = ""'), "history の noteText クリアがない");

// 登録時は source: "ai" を渡し、note はユーザー入力のみ
assert.ok(aiSrc.includes('source: "ai"'), "source: ai の受け渡しがない");
assert.ok(
  aiSrc.includes('note: String(data.note || "").trim()'),
  "exam 確定が data.note のみを使っていない"
);
assert.ok(
  /addExamPlanFromExternal\([\s\S]*?note:\s*""[\s\S]*?source:\s*"ai"/.test(aiSrc),
  "followup の検査予定登録で note が空になっていない"
);

assert.ok(examSrc.includes("source: source === \"ai\" ? \"ai\" : undefined"), "外部登録の source 伝播がない");
assert.ok(dbSrc.includes('if (source === "ai") record.source = "ai"'), "plans に source を保存していない");

// 正規化 → 確定ペイロードのシミュレーション
function normalizeExamData(data) {
  return { ...data, note: "" };
}
function resolveExamApplyPayload(data) {
  return {
    item: String(data.item || "").trim(),
    dueDate: data.dueDate,
    note: String(data.note || "").trim(),
    source: "ai",
  };
}

const fromAi = normalizeExamData({
  item: "ACTH通常",
  dueDate: "2026-08-01",
  note: "本文よりACTH刺激試験を実施した",
});
const payload = resolveExamApplyPayload(fromAi);
assert.equal(payload.note, "", "正規化後もメモが残っている");
assert.equal(payload.source, "ai", "由来が source に入っていない");

// ユーザーが確認画面で手入力した場合のみ残る
const userEdited = resolveExamApplyPayload({
  item: "ACTH通常",
  dueDate: "2026-08-01",
  note: "再検希望",
});
assert.equal(userEdited.note, "再検希望");

console.log("OK: AI提案の検査予定確定でメモは空、由来は source=ai");
