/**
 * 「その他」タブ用シード5項目が独立 leaf として定義されていることを検証する。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "js/db.js"), "utf8");

const expected = [
  { id: "seed-other-urine-no-upc", label: "尿検査(UPCなし)", order: 10 },
  { id: "seed-other-urine-upc", label: "尿検査(UPC)", order: 20 },
  { id: "seed-other-upc-outlab", label: "UPC(外注)", order: 30 },
  { id: "seed-other-fecal", label: "便検査", order: 40 },
  { id: "seed-other-diarrhea-panel", label: "下痢パネル", order: 50 },
];

for (const row of expected) {
  const re = new RegExp(
    `id:\\s*"${row.id}"[\\s\\S]*?label:\\s*"${row.label.replace(/[()]/g, "\\$&")}"[\\s\\S]*?category:\\s*"other"[\\s\\S]*?kind:\\s*"leaf"[\\s\\S]*?parentId:\\s*""[\\s\\S]*?order:\\s*${row.order}`,
    "m"
  );
  assert.ok(re.test(src), `seed missing or wrong shape: ${row.label}`);
}

// 胸部スク／腹部スクは other ではなく imaging のまま
assert.ok(
  /id:\s*"seed-other-chest-set"[\s\S]*?category:\s*"imaging"/.test(src),
  "胸部スク should stay imaging"
);
assert.ok(
  /id:\s*"seed-other-abdomen-set"[\s\S]*?category:\s*"imaging"/.test(src),
  "腹部スク should stay imaging"
);

console.log(
  "OK: other seeds →",
  expected.map((e) => e.label).join(", ")
);
