/**
 * 内服薬の葉シード（順序・同名上書き）のロジック検証
 */
import assert from "node:assert/strict";
import {
  ensureMedicationItemDefaults,
  MED_ORAL_OTHER_GROUP_ID,
  MED_ORAL_ANTIBIOTIC_GROUP_ID,
  MED_ORAL_ANTIINFLAM_GROUP_ID,
  MED_ORAL_STEROID_ANTIHIST_GROUP_ID,
  MED_ORAL_GI_STOMACH_GROUP_ID,
  MED_ORAL_GI_INTESTINE_GROUP_ID,
  MED_ORAL_LIVER_KIDNEY_GROUP_ID,
  MED_ORAL_CARDIO_GROUP_ID,
  MED_ORAL_RESPIRATORY_GROUP_ID,
  MED_ORAL_NEURO_GROUP_ID,
  MED_ORAL_ANTIFUNGAL_GROUP_ID,
  MED_ORAL_ANTICANCER_GROUP_ID,
  MED_ORAL_IMMUNO_GROUP_ID,
  MED_ORAL_VITAMIN_GROUP_ID,
  MED_ORAL_BLOOD_GROUP_ID,
  MEDICATION_ITEM_LEAF_SEED,
  __getStore,
  __resetStore,
} from "./mock-db-med-hierarchy.js";

const ANTIBIOTIC_LABELS = [
  "アモキシシリン",
  "クラブラン酸/アモキシシリン",
  "セファレキシン",
  "セフポドキシム",
  "ファロペネム",
  "アジスロマイシン",
  "タイロシン",
  "クリンダマイシン",
  "ホスホマイシン",
  "ドキシサイクリン",
  "ミノサイクリン",
  "エンロフロキサシン",
  "オルビフロキサシン",
  "モキシフロキサシン",
  "ベラフロックス",
  "ST合剤",
  "クロラムフェニコール",
  "メトロニダゾール",
];

const ANTIINFLAM_LABELS = [
  "オンシオール",
  "プレビコックス",
  "ガリプラント",
  "トロコキシル",
  "パノクエル",
  "トラマドール",
  "プレガバリン",
];

const STEROID_ANTIHIST_LABELS = [
  "プレドニゾロン",
  "レダコート",
  "ゼンタコート",
  "コートリル",
  "レスタミン",
  "セチリジン",
  "ペリアクチン",
];


const GI_STOMACH_LABELS = [
  "マロピタント",
  "プリンペラン",
  "オンダンセトロン",
  "コントミン",
  "ファモチジン",
  "ランソプラゾール",
  "オメプラゾール",
  "ディクアノン",
];

const GI_INTESTINE_LABELS = [
  "モサプリド",
  "メサラジン",
  "サラゾピリン",
  "デルクリアー",
  "ディアバスター",
  "FortiFlora",
  "ブスコパン",
  "ミヤBM",
  "ゼンラーゼ",
  "マイトマックス",
  "ビオフェルミンR散剤",
  "バガス",
  "サイリウム",
  "グアーガム",
  "アドソルビン",
  "パンクレアチン",
  "ピコスルファート",
  "モビコール",
  "ワセリン軟膏",
];


const LIVER_KIDNEY_LABELS = [
  "テルミサルタン",
  "ラプロス",
  "レナジェル",
  "ネフガード",
  "セミントラ",
  "ウラリット",
  "ウルソ",
  "スパカール",
  "ピアーレシロップ",
  "リバガード",
  "SAMYLIN",
  "ウロカルン",
  "プロパリン",
  "ウエルデリ",
  "タムスロシン塩酸塩",
];


const CARDIO_LABELS = [
  "ピモベハート",
  "アピナック",
  "アムロジピン",
  "ジルチアゼム",
  "アイトロール",
  "シルデナフィル",
  "タダラフィル",
  "カルベジロール",
  "アテノロール",
  "ソタコール",
  "シロスタゾール",
  "ベラプロスト",
  "スピロノラクトン",
  "ヒドロクロロチアジド",
  "フロセミド",
  "トラセミド",
];


const RESPIRATORY_LABELS = [
  "テオロング",
  "テオフィリン",
  "ムコソルバン",
  "モンテルカスト",
  "ブトルファノール",
  "ダンプロン",
  "ブリカニール",
  "デキストロメトルファン",
  "マロピタント（鎮咳）",
  "アルベール液",
  "メプチン液",
  "セファゾリン液",
  "ボスミン液",
  "ビソルボン液",
  "ゲンタマイシン液",
  "デキサメサゾン液",
];


const NEURO_LABELS = [
  "ゾニサミド",
  "臭化カリウム",
  "ミダゾラム（鼻腔）",
  "フェノバール",
  "レベチラセタム",
  "ダイアップ坐剤",
  "エンタイス",
  "エルーラ",
  "レメロン",
  "フルオキセチン",
  "パロキセチン",
  "トラゾドン",
  "ダンドスピロン",
  "ラボナ",
  "クロミカルム",
  "ランドセン",
  "メンドン",
  "アルプラゾラム",
  "ガバペンチン",
  "アセプロマジン",
  "イソバイドシロップ",
];


const ANTIFUNGAL_LABELS = [
  "イトラコナゾール",
  "ケトコナゾール",
  "ドロンタール",
  "ドロンタールプラス",
  "プロコックス",
  "フェンベンダゾール",
  "チニダゾール",
  "ロニダゾール",
  "ドロンシット",
  "ファムシクロビル",
  "モルヌピラビル",
];


const ANTICANCER_LABELS = [
  "イマチニブ",
  "パラディア",
  "エンドキサン",
  "チガソン",
  "ロムスチン",
];


const IMMUNO_LABELS = [
  "イムラン",
  "クロラムブシル",
  "シクラバンス",
  "シクロスポリン（ネオーラル）",
  "モフェチル",
  "ボンゾール",
  "アラバ",
  "ゼンレリア",
  "アポキル",
  "ジアゾキシド",
  "メスチノン",
];

const VITAMIN_LABELS = [
  "メコバラミン",
  "ユベラN",
  "葉酸",
  "センベルゴ",
];

const BLOOD_LABELS = [
  "ドメナン",
  "クロピドグレル",
  "イグザレルト",
  "トラネキサム酸",
];

__resetStore();
await ensureMedicationItemDefaults();
const store = __getStore();
const items = store.medicationItems;

assert.equal(items[MED_ORAL_ANTIINFLAM_GROUP_ID]?.label, "消炎・鎮痛");
assert.equal(items[MED_ORAL_LIVER_KIDNEY_GROUP_ID]?.label, "肝・腎・泌尿");
assert.equal(items[MED_ORAL_ANTIFUNGAL_GROUP_ID]?.label, "抗真菌・駆虫薬・抗ウイルス薬");
assert.equal(items[MED_ORAL_ANTICANCER_GROUP_ID]?.label, "抗がん");
assert.equal(items[MED_ORAL_VITAMIN_GROUP_ID]?.label, "ビタミン・代謝");

// 同名の既存アモキシシリンは削除せず、抗生剤へ上書き移動
assert.ok(items.legacy1, "legacy1 must remain (no delete)");
assert.equal(items.legacy1.label, "アモキシシリン");
assert.equal(items.legacy1.parentId, MED_ORAL_ANTIBIOTIC_GROUP_ID);
assert.equal(items.legacy1.order, 10);
assert.equal(items.legacy1.category, "oral");
assert.equal(items.legacy1.kind, "leaf");
assert.equal(
  items["seed-med-oral-abx-amoxicillin"],
  undefined,
  "should reuse same-name id instead of creating seed id"
);

// 旧フラット同名は各中項目へ上書き移動（その他は空）
assert.equal(items.legacy2.parentId, MED_ORAL_IMMUNO_GROUP_ID);
assert.equal(items.legacy2.label, "アラバ");
assert.equal(items.legacy2.order, 70);
assert.equal(items.legacy3.parentId, MED_ORAL_ANTICANCER_GROUP_ID);
assert.equal(items.legacy3.label, "パラディア");
assert.equal(items.legacy3.order, 20);


function labelsUnder(parentId) {
  return Object.values(items)
    .filter(
      (r) =>
        r &&
        r.kind === "leaf" &&
        String(r.parentId || "") === parentId
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, "ja"))
    .map((r) => r.label);
}

const antibiotic = labelsUnder(MED_ORAL_ANTIBIOTIC_GROUP_ID);
const antiinflam = labelsUnder(MED_ORAL_ANTIINFLAM_GROUP_ID);
const steroid = labelsUnder(MED_ORAL_STEROID_ANTIHIST_GROUP_ID);
const giStomach = labelsUnder(MED_ORAL_GI_STOMACH_GROUP_ID);
const giIntestine = labelsUnder(MED_ORAL_GI_INTESTINE_GROUP_ID);
const liverKidney = labelsUnder(MED_ORAL_LIVER_KIDNEY_GROUP_ID);
const cardio = labelsUnder(MED_ORAL_CARDIO_GROUP_ID);
const respiratory = labelsUnder(MED_ORAL_RESPIRATORY_GROUP_ID);
const neuro = labelsUnder(MED_ORAL_NEURO_GROUP_ID);
const antifungal = labelsUnder(MED_ORAL_ANTIFUNGAL_GROUP_ID);
const anticancer = labelsUnder(MED_ORAL_ANTICANCER_GROUP_ID);
const immuno = labelsUnder(MED_ORAL_IMMUNO_GROUP_ID);
const vitamin = labelsUnder(MED_ORAL_VITAMIN_GROUP_ID);
const blood = labelsUnder(MED_ORAL_BLOOD_GROUP_ID);
console.log("antibiotic order:", antibiotic);
console.log("antiinflam order:", antiinflam);
console.log("steroid-antihist order:", steroid);
console.log("gi stomach order:", giStomach);
console.log("gi intestine order:", giIntestine);
console.log("liver-kidney order:", liverKidney);
console.log("cardio order:", cardio);
console.log("respiratory order:", respiratory);
console.log("neuro order:", neuro);
console.log("antifungal order:", antifungal);
console.log("anticancer order:", anticancer);
console.log("immuno order:", immuno);
console.log("vitamin order:", vitamin);
console.log("blood order:", blood);

assert.deepEqual(antibiotic, ANTIBIOTIC_LABELS);
assert.deepEqual(antiinflam, ANTIINFLAM_LABELS);
assert.deepEqual(steroid, STEROID_ANTIHIST_LABELS);
assert.deepEqual(giStomach, GI_STOMACH_LABELS);
assert.deepEqual(giIntestine, GI_INTESTINE_LABELS);
assert.deepEqual(liverKidney, LIVER_KIDNEY_LABELS);
assert.deepEqual(cardio, CARDIO_LABELS);
assert.deepEqual(respiratory, RESPIRATORY_LABELS);
assert.deepEqual(neuro, NEURO_LABELS);
assert.deepEqual(antifungal, ANTIFUNGAL_LABELS);
assert.equal(items["seed-med-oral-abx-famciclovir"]?.parentId, MED_ORAL_ANTIFUNGAL_GROUP_ID);
assert.equal(items["seed-med-oral-abx-famciclovir"]?.order, 100);

assert.ok(!antibiotic.includes("ファムシクロビル"));
assert.equal(antifungal.filter((x) => x === "ファムシクロビル").length, 1);
assert.deepEqual(anticancer, ANTICANCER_LABELS);
assert.deepEqual(immuno, IMMUNO_LABELS);
assert.deepEqual(vitamin, VITAMIN_LABELS);
assert.deepEqual(blood, BLOOD_LABELS);
assert.ok(giStomach.includes("マロピタント"));
assert.ok(respiratory.includes("マロピタント（鎮咳）"));
assert.ok(!respiratory.includes("マロピタント"));
assert.equal(
  MEDICATION_ITEM_LEAF_SEED.length,
  ANTIBIOTIC_LABELS.length +
    ANTIINFLAM_LABELS.length +
    STEROID_ANTIHIST_LABELS.length +
    GI_STOMACH_LABELS.length +
    GI_INTESTINE_LABELS.length +
    LIVER_KIDNEY_LABELS.length +
    CARDIO_LABELS.length +
    RESPIRATORY_LABELS.length +
    NEURO_LABELS.length +
    ANTIFUNGAL_LABELS.length +
    ANTICANCER_LABELS.length +
    IMMUNO_LABELS.length +
    VITAMIN_LABELS.length +
    BLOOD_LABELS.length
);

// 表記ゆれの同名上書き（既存IDを維持）
__resetStore();
store.medicationItems.userClav = {
  label: "クラブラン酸/アモキシシリン",
  category: "oral",
  kind: "leaf",
  parentId: MED_ORAL_OTHER_GROUP_ID,
  order: 999,
};
store.medicationItems.userPred = {
  label: "プレドニゾロン",
  category: "oral",
  kind: "leaf",
  parentId: MED_ORAL_OTHER_GROUP_ID,
  order: 888,
};
store.medicationItems["seed-med-oral-gi-i-piale"] = {
  label: "ピアーレシロップ",
  category: "oral",
  kind: "leaf",
  parentId: MED_ORAL_GI_INTESTINE_GROUP_ID,
  order: 170,
};
await ensureMedicationItemDefaults();
assert.ok(store.medicationItems.userClav);
assert.equal(store.medicationItems.userClav.parentId, MED_ORAL_ANTIBIOTIC_GROUP_ID);
assert.equal(store.medicationItems.userClav.order, 20);
assert.ok(store.medicationItems.userPred);
assert.equal(store.medicationItems.userPred.parentId, MED_ORAL_STEROID_ANTIHIST_GROUP_ID);
assert.equal(store.medicationItems.userPred.order, 10);
assert.equal(store.medicationItems.userPred.label, "プレドニゾロン");
assert.equal(
  store.medicationItems["seed-med-oral-steroid-prednisolone"],
  undefined
);
assert.ok(store.medicationItems["seed-med-oral-gi-i-piale"]);
assert.equal(store.medicationItems["seed-med-oral-gi-i-piale"].parentId, MED_ORAL_LIVER_KIDNEY_GROUP_ID);
assert.equal(store.medicationItems["seed-med-oral-gi-i-piale"].order, 90);
assert.equal(store.medicationItems["seed-med-oral-lk-piale"], undefined);

console.log("OK: oral leaf seeds + same-name overwrite");
