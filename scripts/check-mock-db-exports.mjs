/**
 * 検証用モックDBを js/db.js のエクスポートに追随させる。
 *
 * モックに名前が足りないと、検証スクリプトは
 * 「does not provide an export named ...」という原因の分かりにくい起動失敗になり、
 * 毎回「今回の変更とは無関係」と切り分ける手間が発生する。
 *
 * 各モックは page.route で /js/db.js の中身として丸ごと差し替えられるため、
 * 別ファイルを import して補うことはできない（相対パスが /js/ 配下として解決される）。
 * そこで各モックの末尾に、そのモックが定義していない名前だけの既定実装を書き込む。
 * 中身が要る名前はモック側で普通に定義すれば、この生成ブロックには含まれなくなる。
 *
 * 対象は scripts/mock-db-*.js と、検証スクリプト内に
 * `const mockDb = \`...\`;` の形で直書きされたモックの両方。
 *
 * 使い方:
 *   node scripts/check-mock-db-exports.mjs         追随できているか検査（ずれていれば exit 1）
 *   node scripts/check-mock-db-exports.mjs --write 各モックの生成ブロックを作り直す
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const scriptsDir = path.join(root, "scripts");

const BEGIN = "// ==== ここから自動生成: node scripts/check-mock-db-exports.mjs --write ====";
const END = "// ==== 自動生成ここまで ====";

const realSource = fs.readFileSync(path.join(root, "js/db.js"), "utf8");

/** `export const X` / `export function X` / `export { a, b }` を拾う */
function exportNames(source) {
  const names = new Set();
  const direct =
    /^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm;
  for (const m of source.matchAll(direct)) names.add(m[1]);

  const grouped = /^export\s*\{([^}]*)\}/gm;
  for (const m of source.matchAll(grouped)) {
    for (const part of m[1].split(",")) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** `export const NAME = ...;` の宣言を、複数行でもそのまま切り出す */
function constDeclaration(source, name) {
  const head = new RegExp(`^export\\s+(?:const|let|var)\\s+${name}\\s*=`, "m").exec(source);
  if (!head) return null;
  let depth = 0;
  for (let i = head.index; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "[" || ch === "{" || ch === "(") depth += 1;
    else if (ch === "]" || ch === "}" || ch === ")") depth -= 1;
    else if (ch === ";" && depth === 0) return source.slice(head.index, i + 1);
  }
  return null;
}

/**
 * 名前の形から既定実装を決める。
 * 呼び出し側が起動時に落ちないことだけを狙った最小限の実装で、
 * 挙動が要るものは各モックが自前で定義して生成対象から外す前提。
 */
function defaultImpl(name) {
  const decl = new RegExp(
    `^export\\s+(?:async\\s+)?(const|let|var|function)\\s+${name}\\b`,
    "m"
  ).exec(realSource);

  if (decl && decl[1] !== "function") {
    // 定数は本物の値をそのまま使う（分類IDやラベルは値そのものに意味があるため）
    return constDeclaration(realSource, name) || `export const ${name} = "";`;
  }

  if (name === "verifyAdminPasscode") {
    return [
      `export async function ${name}(input) {`,
      '  return String(input ?? "") === DEFAULT_ADMIN_PASSCODE;',
      "}",
    ].join("\n");
  }
  if (/^subscribe/.test(name)) {
    return [
      `export function ${name}(...args) {`,
      "  const cb = args[args.length - 1];",
      '  if (typeof cb === "function") cb([]);',
      "  return () => {};",
      "}",
    ].join("\n");
  }
  if (/^fetch/.test(name)) return `export async function ${name}() {\n  return [];\n}`;
  if (/^(add|save|create|revive)/.test(name)) {
    return `export async function ${name}() {\n  return __mockNextId();\n}`;
  }
  if (/^normalize/.test(name)) return `export function ${name}(value) {\n  return value;\n}`;
  if (/Label$/.test(name)) return `export function ${name}() {\n  return "";\n}`;
  if (/^sort/.test(name)) {
    return `export function ${name}(list) {\n  return [...(list || [])];\n}`;
  }
  return `export async function ${name}() {}`;
}

function stripGeneratedBlock(source) {
  const start = source.indexOf(BEGIN);
  if (start < 0) return source;
  const end = source.indexOf(END, start);
  if (end < 0) return source.slice(0, start);
  return source.slice(0, start) + source.slice(end + END.length).replace(/^\n+/, "");
}

function buildBlock(missing) {
  const needsIdHelper = missing.some((n) => defaultImpl(n).includes("__mockNextId()"));
  const parts = [
    BEGIN,
    "// db.js にあってこのモックが定義していない名前を、起動が通る最小限の実装で埋める。",
    "// 挙動が必要になったら、この上でその名前を普通に定義すれば生成対象から外れる。",
  ];
  if (needsIdHelper) {
    // 直書きモックはテンプレートリテラルの中に入るので、バッククォートは使わない
    parts.push("", "let __mockSeq = 0;", 'const __mockNextId = () => "mock" + (__mockSeq += 1);');
  }
  for (const name of missing) parts.push("", defaultImpl(name));
  parts.push("", END);
  return parts.join("\n");
}

const realNames = [...exportNames(realSource)];

/**
 * モック本体を受け取り、生成ブロックを付け直した本体を返す。
 * extraNames は、配信時に連結される別の断片が既に定義している名前
 * （重複宣言になると構文エラーで起動しなくなるため生成対象から外す）。
 */
function rebuildMock(body, extraNames = new Set()) {
  const handWritten = stripGeneratedBlock(body);
  const have = exportNames(handWritten);
  const missing = realNames.filter((n) => !have.has(n) && !extraNames.has(n));
  if (!missing.length) return { body: handWritten, missing };
  return {
    body: `${handWritten.replace(/\n+$/, "")}\n\n${buildBlock(missing)}\n`,
    missing,
  };
}

/** 検証スクリプトに直書きされた `const mockDb = \`...\`;` を取り出す */
const INLINE_MOCK = /(const\s+mockDb\s*=\s*`)([\s\S]*?)(`;)/;

/**
 * `body: mockDb + MASTER_DELETE_MOCK` のように、配信時に別の断片を足している場合に
 * その断片が定義している名前を集める。ここと重複すると構文エラーになる。
 */
function concatenatedNames(source) {
  const names = new Set();
  const concat = /body:\s*mockDb\s*((?:\+\s*[A-Za-z0-9_$]+\s*)+)/.exec(source);
  if (!concat) return names;

  for (const token of concat[1].split("+")) {
    const ident = token.trim();
    if (!ident) continue;

    // 同じファイル内の定義、または import 元のファイルから探す
    const local = new RegExp(`const\\s+${ident}\\s*=\\s*\`([\\s\\S]*?)\`;`).exec(source);
    if (local) {
      for (const n of exportNames(local[1])) names.add(n);
      continue;
    }
    const imported = new RegExp(
      `import\\s*\\{[^}]*\\b${ident}\\b[^}]*\\}\\s*from\\s*"\\./([^"]+)"`
    ).exec(source);
    if (!imported) continue;
    const depPath = path.join(scriptsDir, imported[1]);
    if (!fs.existsSync(depPath)) continue;
    const depSource = fs.readFileSync(depPath, "utf8");
    const decl = new RegExp(`const\\s+${ident}\\s*=\\s*\`([\\s\\S]*?)\`;`).exec(depSource);
    if (decl) for (const n of exportNames(decl[1])) names.add(n);
  }
  return names;
}

function collectTargets() {
  const targets = [];
  for (const file of fs.readdirSync(scriptsDir).sort()) {
    const full = path.join(scriptsDir, file);
    if (/^mock-db-.*\.js$/.test(file)) {
      targets.push({ file, full, kind: "file" });
      continue;
    }
    if (!file.endsWith(".mjs")) continue;
    const source = fs.readFileSync(full, "utf8");
    const m = INLINE_MOCK.exec(source);
    // db.js を差し替える目的のモックだけを対象にする
    if (m && /^export\s/m.test(m[2])) {
      targets.push({ file, full, kind: "inline" });
    }
  }
  return targets;
}

const write = process.argv.includes("--write");
let problems = 0;

for (const target of collectTargets()) {
  const original = fs.readFileSync(target.full, "utf8");
  let rebuilt;
  let missing;

  if (target.kind === "file") {
    ({ body: rebuilt, missing } = rebuildMock(original));
  } else {
    const m = INLINE_MOCK.exec(original);
    const result = rebuildMock(m[2], concatenatedNames(original));
    missing = result.missing;
    rebuilt =
      original.slice(0, m.index) +
      m[1] +
      result.body +
      m[3] +
      original.slice(m.index + m[0].length);
  }

  if (rebuilt === original) {
    console.log(`OK   ${target.file}`);
    continue;
  }
  if (write) {
    fs.writeFileSync(target.full, rebuilt);
    console.log(`WROTE ${target.file} (${missing.length}件を補完)`);
    continue;
  }
  problems += 1;
  console.log(
    `MISS ${target.file}: ${missing.length}件が不足しています` +
      " → node scripts/check-mock-db-exports.mjs --write"
  );
}

if (problems) process.exit(1);
console.log("\nすべてのモックが js/db.js のエクスポートを満たしています。");
