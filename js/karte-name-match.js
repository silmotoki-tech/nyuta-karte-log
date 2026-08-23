// カルテ番号ゲートの名前検索（動物名・飼い主名の部分一致）。

/**
 * ひらがなをカタカナに寄せ、空白と大小を無視して比較用にする。
 */
export function normalizeKarteNameQuery(value) {
  return String(value || "")
    .trim()
    .replace(/[\u3041-\u3096]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    )
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * 動物名または飼い主名にクエリが部分一致するか。
 */
export function karteNameMatches(record, query) {
  const q = normalizeKarteNameQuery(query);
  if (!q) return false;
  const animal = normalizeKarteNameQuery(record?.animalName);
  const owner = normalizeKarteNameQuery(record?.ownerName);
  return animal.includes(q) || owner.includes(q);
}

/**
 * 名前一覧から部分一致するカルテをすべて返す（番号順）。
 */
export function filterKartesByName(records, query) {
  const q = normalizeKarteNameQuery(query);
  if (!q) return [];
  return (records || [])
    .filter((row) => karteNameMatches(row, q))
    .sort((a, b) =>
      String(a.karteNumber || "").localeCompare(String(b.karteNumber || ""), "en")
    );
}
