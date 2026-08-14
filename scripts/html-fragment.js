/**
 * 検証用ハーネスに index.html の実物のマークアップを埋め込むためのヘルパー。
 *
 * ハーネスにモーダルなどを手書きで写すと、本体に要素が増えたときに
 * 「Cannot set properties of null」で落ちて、原因の切り分けに時間を取られる。
 * id を指定して本体から丸ごと持ってくれば、その手の追随漏れが起きない。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

/** index.html から、その id を持つ <div> ブロックをそのまま取り出す */
export function htmlFragment(id, source = indexHtml) {
  const start = source.search(new RegExp(`<div[^>]*\\bid="${id}"`));
  if (start < 0) throw new Error(`fragment not found in index.html: ${id}`);

  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tags.exec(source))) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return source.slice(start, m.index + m[0].length);
  }
  throw new Error(`unterminated fragment in index.html: ${id}`);
}
