// 入力モードの見出し先頭に付ける目印（文字列そのものに含める。別フィールドは持たない）。
// 並びは常に ⭐ → 🆕 → 顔文字。顔文字はどれか1つだけ。⭐ と 🆕 は顔文字と併用できる。

export const HEADLINE_EMOJI_STAR = "\u2B50";
export const HEADLINE_EMOJI_NEW = "\u{1F195}";
export const HEADLINE_EMOJI_FACES = Object.freeze([
  "\u{1F604}",
  "\u{1F610}",
  "\u{1F613}",
  "\u{1F628}",
]);

export const HEADLINE_EMOJI_BUTTONS = Object.freeze([
  { id: "star", emoji: HEADLINE_EMOJI_STAR, label: "重要" },
  { id: "new", emoji: HEADLINE_EMOJI_NEW, label: "新しい症状" },
  { id: "good", emoji: HEADLINE_EMOJI_FACES[0], label: "良い" },
  { id: "ok", emoji: HEADLINE_EMOJI_FACES[1], label: "悪くない" },
  { id: "meh", emoji: HEADLINE_EMOJI_FACES[2], label: "イマイチ" },
  { id: "bad", emoji: HEADLINE_EMOJI_FACES[3], label: "悪い" },
]);

const FACE_SET = new Set(HEADLINE_EMOJI_FACES);
const VS16 = "\uFE0F";

function isSpaceChar(ch) {
  return ch === " " || ch === "\u00A0" || ch === "\u3000";
}

function consumeToken(text, index, token) {
  if (!text.startsWith(token, index)) return -1;
  let next = index + token.length;
  if (text[next] === VS16) next += 1;
  return next;
}

/**
 * 見出し先頭の目印を読み取る。本文中の絵文字は見ない。
 * @returns {{ star: boolean, isNew: boolean, face: string, body: string }}
 */
export function parseHeadlineMarks(text) {
  const s = String(text || "");
  let i = 0;
  let star = false;
  let isNew = false;
  let face = "";

  while (i < s.length) {
    const before = i;
    while (i < s.length && isSpaceChar(s[i])) i += 1;

    const afterStar = consumeToken(s, i, HEADLINE_EMOJI_STAR);
    if (afterStar !== -1) {
      star = true;
      i = afterStar;
      continue;
    }
    const afterNew = consumeToken(s, i, HEADLINE_EMOJI_NEW);
    if (afterNew !== -1) {
      isNew = true;
      i = afterNew;
      continue;
    }
    let foundFace = false;
    for (const f of HEADLINE_EMOJI_FACES) {
      const afterFace = consumeToken(s, i, f);
      if (afterFace !== -1) {
        face = f;
        i = afterFace;
        foundFace = true;
        break;
      }
    }
    if (foundFace) continue;

    i = before;
    break;
  }

  while (i < s.length && isSpaceChar(s[i])) i += 1;
  return { star, isNew, face, body: s.slice(i) };
}

export function formatHeadlineMarks({ star, isNew, face, body }) {
  let prefix = "";
  if (star) prefix += HEADLINE_EMOJI_STAR;
  if (isNew) prefix += HEADLINE_EMOJI_NEW;
  if (face && FACE_SET.has(face)) prefix += face;
  const rest = String(body || "");
  if (!prefix) return rest;
  return `${prefix} ${rest}`;
}

/** 指定の絵文字を先頭で ON/OFF。顔文字同士は入れ替え。並びは固定順に組み直す。 */
export function toggleHeadlineEmoji(text, emoji) {
  const marks = parseHeadlineMarks(text);
  if (emoji === HEADLINE_EMOJI_STAR) {
    marks.star = !marks.star;
  } else if (emoji === HEADLINE_EMOJI_NEW) {
    marks.isNew = !marks.isNew;
  } else if (FACE_SET.has(emoji)) {
    marks.face = marks.face === emoji ? "" : emoji;
  } else {
    return String(text || "");
  }
  return formatHeadlineMarks(marks);
}

/** 左カラムから写すとき、先頭の目印だけ除いて本文を返す。 */
export function stripHeadlineMarks(text) {
  return parseHeadlineMarks(text).body;
}
