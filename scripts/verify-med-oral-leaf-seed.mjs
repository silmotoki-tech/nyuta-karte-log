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
  MED_ORAL_LIVER_GROUP_ID,
  MED_ORAL_URINARY_GROUP_ID,
  MED_ORAL_CARDIO_GROUP_ID,
  MED_ORAL_RESPIRATORY_GROUP_ID,
  MED_ORAL_NEURO_GROUP_ID,
  MED_ORAL_ANTIFUNGAL_GROUP_ID,
  MED_ORAL_ANTICANCER_GROUP_ID,
  MED_ORAL_IMMUNO_GROUP_ID,
  MED_ORAL_VITAMIN_GROUP_ID,
  MED_ORAL_HORMONE_GROUP_ID,
  MED_ORAL_KAMPO_GROUP_ID,
  MED_ORAL_BLOOD_GROUP_ID,
  MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID,
  MED_TOPICAL_SKIN_OTHER_GROUP_ID,
  MED_TOPICAL_EAR_GROUP_ID,
  MED_SUPPL_JOINT_GROUP_ID,
  MED_SUPPL_ORAL_GROUP_ID,
  MED_SUPPL_GI_GROUP_ID,
  MED_SUPPL_KIDNEY_GROUP_ID,
  MED_SUPPL_URINARY_GROUP_ID,
  MED_SUPPL_NEURO_GROUP_ID,
  MED_SUPPL_SKIN_GROUP_ID,
  MED_SUPPL_OTHER_GROUP_ID,
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


const LIVER_LABELS = ["ウルソ", "スパカール", "ピアーレシロップ"];

const URINARY_LABELS = [
  "テルミサルタン",
  "ラプロス",
  "レナジェル",
  "ネフガード",
  "セミントラ",
  "ウラリット",
  "ウロカルン",
  "プロパリン",
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

const HORMONE_LABELS = [
  "アドレスタン",
  "チラージン",
  "チロブロック",
  "トリロスタン",
  "フロリネフ",
  "サキオジール",
  "メラトニン",
  "チアマゾール",
];

const KAMPO_LABELS = [
  "源気",
  "三仙",
  "清肌",
  "通楽",
  "露華",
  "寧心",
  "潤華",
  "快元",
  "西伯利亜",
  "通淋",
  "静心",
  "滋潤",
  "熄風",
  "調息",
  "腎固",
  "爽牙",
  "四逆散",
  "八味地黄丸",
  "補全",
  "雲南白薬",
];

const BLOOD_LABELS = [
  "ドメナン",
  "クロピドグレル",
  "イグザレルト",
  "トラネキサム酸",
];

const TOPICAL_SKIN_STEROID_ABX_LABELS = [
  "ゲンタマイシンクリーム",
  "ゲーベンクリーム",
  "オゾンジェル",
  "ケトコナゾールクリーム",
  "ビクタスMTクリーム",
  "アレリーフローション",
  "モメタオティック",
  "レスタミンコーワ軟膏",
  "スピラゾン軟膏",
  "モメタゾン軟膏",
];

const TOPICAL_SKIN_OTHER_LABELS = [
  "ヘパリンクリーム",
  "ヘパリン泡スプレー",
  "馬油",
  "キトサンパウダー",
  "キトサンMNZパウダー",
  "アンチノールスキン",
  "タクロリムス軟膏",
  "クイックストップ",
];

const TOPICAL_EAR_LABELS = [
  "シルピナ",
  "ミミピュア",
  "EDTAイヤークリーナー",
  "Pet Ear&Skincare Liquid",
  "イベルメクチン（耳用）",
];

const EYE_LABELS = [
  "ワンクリーン点眼液",
  "ヒアルロン酸点眼液",
  "ヒアレインミニ",
  "レボフロキサシン点眼液",
  "ベストロン点眼液",
  "ゲンタマイシン点眼液",
  "オフロキサシン眼軟膏",
  "エコリシン眼軟膏",
  "ガチフロキサシン点眼液",
  "FVR Mix",
  "ヒア・プラノプロフェン点眼液",
  "ヒアGM",
  "ヒアGM＋インターキャット",
  "パノクエル加ベストロン",
  "パノクエル加アズレン",
  "プラノプロフェン点眼液",
  "ジクロスター点眼液",
  "ステロップ点眼液",
  "デキサメサゾン点眼液",
  "ネオメドロール眼軟膏",
  "IDU点眼液",
  "アシクロビル眼軟膏",
  "オプティミューン眼軟膏",
  "ピレノキシン点眼液",
  "血清点眼液",
  "アズレン点眼液",
  "ラタノプロスト点眼液",
  "アゾルガ点眼液",
  "エイジプト点眼液",
  "タプロス点眼液",
  "チモロール点眼液",
  "ネオシネジンコーワ",
  "トロピカミド",
  "デスモプレシン",
  "ブレンダ点眼",
  "アセチルシステイン点眼液",
  "ブリンゾラミド懸濁性点眼液",
];

const SUPPL_JOINT_LABELS = ["アンチノールプラス（犬猫用）", "アンチノール（猫用）"];
const SUPPL_ORAL_LABELS = [
  "オーラルガードV",
  "Vi001デンタルジェル",
  "スカロー",
  "スカローデンタルジェル",
  "ビルバックデンタルブラシミニ",
  "ビルバックペリエイドデンタルブラシ",
  "ビルバックデンタルブラシダブル",
  "ライオンハブラシ",
  "Ciシュワワハブラシ",
  "泡雪（ハブラシ小）",
  "泡雪（ハブラシ極小）",
  "アニサポ_歯磨きグローブ",
  "カイトベールオーラルケア",
];
const SUPPL_GI_LABELS = [
  "フローラケア",
  "エネアラ",
  "ラキサトーン",
  "CAT LUX",
  "PE_MCTパウダープラス",
  "50%ブドウ糖注射液",
];
const SUPPL_KIDNEY_LABELS = [
  "カリナールコンボ",
  "プロネフラ",
  "フィトケア",
  "リーナルK",
  "アジデイル",
  "リンケア",
];
const SUPPL_URINARY_LABELS = [
  "ウロアクトプラス",
  "UTclean",
  "UTclean_Ca",
  "Calmurofel",
  "ウエルデリ",
  "UTスティック",
];
const SUPPL_NEURO_LABELS = [
  "ジルケーン",
  "AKTIVAIT",
  "CBDカゼインタブ",
  "ニューロアクトプラス",
  "小型犬・猫３％CBDオイル",
];
const SUPPL_SKIN_LABELS = ["ダーマクト", "オメガサンシャイン"];
const SUPPL_OTHER_LABELS = [
  "ソルトールワン",
  "アイアクト",
  "バイラリスプラス",
  "オリザロース",
  "インスラクト",
  "ハートアクト",
  "Hydra Care",
  "Carming Care",
  "アニミューン",
  "アイリッドラッシュ",
  "Pet Mybo shampoo",
];

__resetStore();
await ensureMedicationItemDefaults();
const store = __getStore();
const items = store.medicationItems;

assert.equal(items[MED_ORAL_ANTIINFLAM_GROUP_ID]?.label, "消炎・鎮痛");
assert.equal(items[MED_ORAL_LIVER_GROUP_ID]?.label, "肝臓");
assert.equal(items[MED_ORAL_URINARY_GROUP_ID]?.label, "腎泌尿器");
assert.equal(items[MED_ORAL_LIVER_KIDNEY_GROUP_ID], undefined);
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
const liver = labelsUnder(MED_ORAL_LIVER_GROUP_ID);
const urinary = labelsUnder(MED_ORAL_URINARY_GROUP_ID);
const cardio = labelsUnder(MED_ORAL_CARDIO_GROUP_ID);
const respiratory = labelsUnder(MED_ORAL_RESPIRATORY_GROUP_ID);
const neuro = labelsUnder(MED_ORAL_NEURO_GROUP_ID);
const antifungal = labelsUnder(MED_ORAL_ANTIFUNGAL_GROUP_ID);
const anticancer = labelsUnder(MED_ORAL_ANTICANCER_GROUP_ID);
const immuno = labelsUnder(MED_ORAL_IMMUNO_GROUP_ID);
const vitamin = labelsUnder(MED_ORAL_VITAMIN_GROUP_ID);
const hormone = labelsUnder(MED_ORAL_HORMONE_GROUP_ID);
const kampo = labelsUnder(MED_ORAL_KAMPO_GROUP_ID);
const blood = labelsUnder(MED_ORAL_BLOOD_GROUP_ID);
const topicalSteroidAbx = labelsUnder(MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID);
const topicalSkinOther = labelsUnder(MED_TOPICAL_SKIN_OTHER_GROUP_ID);
const topicalEar = labelsUnder(MED_TOPICAL_EAR_GROUP_ID);
const eye = Object.values(items)
  .filter(
    (r) =>
      r &&
      r.kind === "leaf" &&
      r.category === "eye" &&
      String(r.parentId || "") === ""
  )
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label, "ja"))
  .map((r) => r.label);
const supplJoint = labelsUnder(MED_SUPPL_JOINT_GROUP_ID);
const supplOral = labelsUnder(MED_SUPPL_ORAL_GROUP_ID);
const supplGi = labelsUnder(MED_SUPPL_GI_GROUP_ID);
const supplKidney = labelsUnder(MED_SUPPL_KIDNEY_GROUP_ID);
const supplUrinary = labelsUnder(MED_SUPPL_URINARY_GROUP_ID);
const supplNeuro = labelsUnder(MED_SUPPL_NEURO_GROUP_ID);
const supplSkin = labelsUnder(MED_SUPPL_SKIN_GROUP_ID);
const supplOther = labelsUnder(MED_SUPPL_OTHER_GROUP_ID);
console.log("antibiotic order:", antibiotic);
console.log("antiinflam order:", antiinflam);
console.log("steroid-antihist order:", steroid);
console.log("gi stomach order:", giStomach);
console.log("gi intestine order:", giIntestine);
console.log("liver order:", liver);
console.log("urinary order:", urinary);
console.log("cardio order:", cardio);
console.log("respiratory order:", respiratory);
console.log("neuro order:", neuro);
console.log("antifungal order:", antifungal);
console.log("anticancer order:", anticancer);
console.log("immuno order:", immuno);
console.log("vitamin order:", vitamin);
console.log("hormone order:", hormone);
console.log("kampo order:", kampo);
console.log("blood order:", blood);
console.log("topical steroid+abx order:", topicalSteroidAbx);
console.log("topical skin other order:", topicalSkinOther);
console.log("topical ear order:", topicalEar);
console.log("eye order:", eye);
console.log("suppl joint:", supplJoint);
console.log("suppl oral:", supplOral);
console.log("suppl gi:", supplGi);
console.log("suppl kidney:", supplKidney);
console.log("suppl urinary:", supplUrinary);
console.log("suppl neuro:", supplNeuro);
console.log("suppl skin:", supplSkin);
console.log("suppl other:", supplOther);

assert.deepEqual(antibiotic, ANTIBIOTIC_LABELS);
assert.deepEqual(antiinflam, ANTIINFLAM_LABELS);
assert.deepEqual(steroid, STEROID_ANTIHIST_LABELS);
assert.deepEqual(giStomach, GI_STOMACH_LABELS);
assert.deepEqual(giIntestine, GI_INTESTINE_LABELS);
assert.deepEqual(liver, LIVER_LABELS);
assert.deepEqual(urinary, URINARY_LABELS);
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
assert.deepEqual(hormone, HORMONE_LABELS);
assert.deepEqual(kampo, KAMPO_LABELS);
assert.deepEqual(blood, BLOOD_LABELS);
assert.deepEqual(topicalSteroidAbx, TOPICAL_SKIN_STEROID_ABX_LABELS);
assert.deepEqual(topicalSkinOther, TOPICAL_SKIN_OTHER_LABELS);
assert.deepEqual(topicalEar, TOPICAL_EAR_LABELS);
assert.deepEqual(eye, EYE_LABELS);
assert.deepEqual(supplJoint, SUPPL_JOINT_LABELS);
assert.deepEqual(supplOral, SUPPL_ORAL_LABELS);
assert.deepEqual(supplGi, SUPPL_GI_LABELS);
assert.deepEqual(supplKidney, SUPPL_KIDNEY_LABELS);
assert.deepEqual(supplUrinary, SUPPL_URINARY_LABELS);
assert.deepEqual(supplNeuro, SUPPL_NEURO_LABELS);
assert.deepEqual(supplSkin, SUPPL_SKIN_LABELS);
assert.deepEqual(supplOther, SUPPL_OTHER_LABELS);
assert.equal(items[MED_SUPPL_JOINT_GROUP_ID]?.category, "supplement");
assert.equal(items[MED_SUPPL_JOINT_GROUP_ID]?.label, "関節・炎症");
// サプリメント側と重複する3件は内服から消える
assert.equal(items["seed-med-oral-lk-welldeli"], undefined);
assert.equal(items["seed-med-oral-lk-rivaguard"], undefined);
assert.equal(items["seed-med-oral-lk-samylin"], undefined);
assert.equal(
  items["seed-med-suppl-urinary-welldeli"]?.parentId,
  MED_SUPPL_URINARY_GROUP_ID
);
assert.equal(items[MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID]?.label, "皮膚ステロイド+抗菌");
assert.equal(items[MED_TOPICAL_SKIN_OTHER_GROUP_ID]?.label, "皮膚その他");
assert.equal(items[MED_TOPICAL_EAR_GROUP_ID]?.label, "耳");
assert.equal(
  items["seed-med-topical-skin-mometotic"]?.parentId,
  MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID
);
assert.equal(
  items["seed-med-topical-ear-victas-mt"]?.parentId,
  MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID
);
assert.ok(!items["seed-med-topical-ear-mometotic"]);
assert.ok(!items["seed-med-topical-ear-epiotic"]);
assert.ok(!items["seed-med-topical-disinfect"]);
assert.ok(!items["seed-med-topical-shampoo"]);
assert.ok(!items["seed-med-topical-skin"]);
assert.ok(!Object.values(items).some((r) => r?.label === "エピオティック"));
assert.ok(!Object.values(items).some((r) => r?.label === "デルトピカローション"));
assert.ok(giStomach.includes("マロピタント"));
assert.ok(respiratory.includes("マロピタント（鎮咳）"));
assert.ok(!respiratory.includes("マロピタント"));
// 注射薬はこのテストで列挙していないため、シード側から数えて差し引く
const injectLeafCount = MEDICATION_ITEM_LEAF_SEED.filter(
  (s) => s.category === "inject"
).length;
assert.equal(
  MEDICATION_ITEM_LEAF_SEED.length - injectLeafCount,
  ANTIBIOTIC_LABELS.length +
    ANTIINFLAM_LABELS.length +
    STEROID_ANTIHIST_LABELS.length +
    GI_STOMACH_LABELS.length +
    GI_INTESTINE_LABELS.length +
    LIVER_LABELS.length +
    URINARY_LABELS.length +
    CARDIO_LABELS.length +
    RESPIRATORY_LABELS.length +
    NEURO_LABELS.length +
    ANTIFUNGAL_LABELS.length +
    ANTICANCER_LABELS.length +
    IMMUNO_LABELS.length +
    VITAMIN_LABELS.length +
    HORMONE_LABELS.length +
    KAMPO_LABELS.length +
    BLOOD_LABELS.length +
    TOPICAL_SKIN_STEROID_ABX_LABELS.length +
    TOPICAL_SKIN_OTHER_LABELS.length +
    TOPICAL_EAR_LABELS.length +
    EYE_LABELS.length +
    SUPPL_JOINT_LABELS.length +
    SUPPL_ORAL_LABELS.length +
    SUPPL_GI_LABELS.length +
    SUPPL_KIDNEY_LABELS.length +
    SUPPL_URINARY_LABELS.length +
    SUPPL_NEURO_LABELS.length +
    SUPPL_SKIN_LABELS.length +
    SUPPL_OTHER_LABELS.length
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
assert.equal(store.medicationItems["seed-med-oral-gi-i-piale"].parentId, MED_ORAL_LIVER_GROUP_ID);
assert.equal(store.medicationItems["seed-med-oral-gi-i-piale"].order, 30);
assert.equal(store.medicationItems["seed-med-oral-lk-piale"], undefined);

console.log("OK: oral leaf seeds + same-name overwrite");
