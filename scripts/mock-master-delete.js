/**
 * 検証用モック db.js に追記するスタブ。
 * master-delete-ui.js が db.js から取り込む名前を補い、
 * 名前解決エラーでハーネスのモジュール読み込みが止まるのを防ぐ。
 */
export const MASTER_DELETE_MOCK = `
export const DEFAULT_ADMIN_PASSCODE = "oono";
export async function verifyAdminPasscode(input) {
  return String(input ?? "") === DEFAULT_ADMIN_PASSCODE;
}
export async function ensureAdminPasscodeDefault() {}
export async function deleteExamItem() {}
export async function deleteMedicationItem() {}
export async function deleteHistoryDiseaseItem() {}
export async function deleteHistorySurgeryItem() {}
export async function deleteHistoryReferralItem() {}
`;
