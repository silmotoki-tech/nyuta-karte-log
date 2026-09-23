// 既往歴・特記の種別（院内電子カルテと同じアイコン＋特記2種）。
// 複数選択可。並びは ⚠️ → 💬 → 🚹 → ✅ → 🚨 → 🔰。
// 既存の type/status・importance は消さず、未設定の kinds はそこから読み取る。

export const HISTORY_KINDS = [
  { id: "important", icon: "⚠️", label: "重要" },
  { id: "note", icon: "💬", label: "特記" },
  { id: "current", icon: "🚹", label: "現疾患" },
  { id: "past", icon: "✅", label: "疾患歴" },
  { id: "surgery", icon: "🚨", label: "手術" },
  { id: "referral", icon: "🔰", label: "紹介" },
];

export const HISTORY_KIND_ORDER = HISTORY_KINDS.map((k) => k.id);

export function sanitizeHistoryKinds(kinds) {
  const list = Array.isArray(kinds)
    ? kinds
    : kinds && typeof kinds === "object"
      ? Object.values(kinds)
      : [];
  const set = new Set(list.filter((id) => HISTORY_KIND_ORDER.includes(id)));
  return HISTORY_KIND_ORDER.filter((id) => set.has(id));
}

export function kindsFromLegacy(type, status) {
  if (type === "surgery") return ["surgery"];
  if (type === "referral") return ["referral"];
  if (status === "resolved") return ["past"];
  return ["current"];
}

export function kindsFromNoteImportance(importance) {
  return importance === "high" ? ["important"] : ["note"];
}

export function importanceFromKinds(kinds) {
  return sanitizeHistoryKinds(kinds).includes("important") ? "high" : "medium";
}

export function resolveHistoryKinds(entry) {
  const fromField = sanitizeHistoryKinds(entry?.kinds);
  if (fromField.length) return fromField;
  if (entry?.store === "specialNotes" || entry?.importance) {
    return kindsFromNoteImportance(entry?.importance);
  }
  return kindsFromLegacy(entry?.type, entry?.status);
}

export function primaryHistoryKind(kinds) {
  return resolveHistoryKinds({ kinds })[0] || "current";
}

export function legacyTypeStatusFromKinds(kinds) {
  const primary = primaryHistoryKind(kinds);
  if (primary === "current") return { type: "disease", status: "active" };
  if (primary === "past") return { type: "disease", status: "resolved" };
  if (primary === "surgery") return { type: "surgery", status: "resolved" };
  if (primary === "referral") return { type: "referral", status: "resolved" };
  return { type: "disease", status: "active" };
}

export function historyKindMeta(id) {
  return HISTORY_KINDS.find((k) => k.id === id) || HISTORY_KINDS[2];
}

export function titleFieldLabelForKinds(kinds) {
  const primary = primaryHistoryKind(kinds);
  if (primary === "important" || primary === "note") return "特記";
  if (primary === "surgery") return "手術名";
  if (primary === "referral") return "紹介先";
  return "疾患名";
}

export function titlePlaceholderForKinds(kinds) {
  const primary = primaryHistoryKind(kinds);
  if (primary === "important" || primary === "note") return "例）咬傷歴あり。保定は2人で";
  if (primary === "surgery") return "例）避妊手術";
  if (primary === "referral") return "例）○○動物病院";
  return "例）僧帽弁閉鎖不全症";
}

export function sortHistoryEntries(entries) {
  return [...(entries || [])].sort((a, b) => {
    const pa = HISTORY_KIND_ORDER.indexOf(primaryHistoryKind(resolveHistoryKinds(a)));
    const pb = HISTORY_KIND_ORDER.indexOf(primaryHistoryKind(resolveHistoryKinds(b)));
    if (pa !== pb) return pa - pb;
    const ud = (b.lastUpdated || "").localeCompare(a.lastUpdated || "");
    if (ud !== 0) return ud;
    return (a.title || "").localeCompare(b.title || "", "ja");
  });
}
