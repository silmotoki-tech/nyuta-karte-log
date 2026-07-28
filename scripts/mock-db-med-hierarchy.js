// 薬剤マスタ階層（注射薬／内服薬／外用薬／点眼薬）＋既存フラット移行付きモック

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
];

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";
export const MED_ORAL_ANTIBIOTIC_GROUP_ID = "seed-med-oral-antibiotic";
export const MED_ORAL_ANTIINFLAM_GROUP_ID = "seed-med-oral-antiinflam";
export const MED_ORAL_STEROID_ANTIHIST_GROUP_ID = "seed-med-oral-steroid-antihist";
export const MED_ORAL_GI_STOMACH_GROUP_ID = "seed-med-oral-gi-stomach";
export const MED_ORAL_GI_INTESTINE_GROUP_ID = "seed-med-oral-gi-intestine";
export const MED_ORAL_LIVER_KIDNEY_GROUP_ID = "seed-med-oral-liver-kidney";
export const MED_ORAL_CARDIO_GROUP_ID = "seed-med-oral-cardio";
export const MED_ORAL_RESPIRATORY_GROUP_ID = "seed-med-oral-respiratory";
export const MED_ORAL_NEURO_GROUP_ID = "seed-med-oral-neuro";
export const MED_ORAL_ANTIFUNGAL_GROUP_ID = "seed-med-oral-antifungal";
export const MED_ORAL_ANTICANCER_GROUP_ID = "seed-med-oral-anticancer";
export const MED_ORAL_IMMUNO_GROUP_ID = "seed-med-oral-immuno";
export const MED_ORAL_VITAMIN_GROUP_ID = "seed-med-oral-vitamin";
export const MED_ORAL_HORMONE_GROUP_ID = "seed-med-oral-hormone";
export const MED_ORAL_BLOOD_GROUP_ID = "seed-med-oral-blood";

const CATEGORY_IDS = new Set(MEDICATION_ITEM_CATEGORIES.map((c) => c.id));

export function normalizeMedicationItemCategory(category) {
  const id = String(category || "").trim();
  return CATEGORY_IDS.has(id) ? id : "oral";
}

export function normalizeMedicationItemKind(kind) {
  return String(kind || "").trim() === "group" ? "group" : "leaf";
}

export function medicationItemCategoryLabel(category) {
  const id = normalizeMedicationItemCategory(category);
  return MEDICATION_ITEM_CATEGORIES.find((c) => c.id === id)?.label || id;
}

function normalizeMedicationItem(id, raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  const kind = normalizeMedicationItemKind(row.kind);
  return {
    id,
    label: row.label || "",
    category: normalizeMedicationItemCategory(row.category),
    kind,
    parentId: kind === "group" ? "" : String(row.parentId || "").trim(),
    order: typeof row.order === "number" ? row.order : 0,
  };
}

function medGroupSeed(category, id, label, order) {
  return { id, label, category, kind: "group", parentId: "", order };
}

function medLeafSeed(category, parentId, id, label, order) {
  return { id, label, category, kind: "leaf", parentId, order };
}

function medGroupLeaves(category, parentId, children) {
  return children.map((child, index) =>
    medLeafSeed(category, parentId, child.id, child.label, (index + 1) * 10)
  );
}

const MEDICATION_ITEM_GROUP_SEED = [
  medGroupSeed("oral", MED_ORAL_ANTIBIOTIC_GROUP_ID, "抗生剤", 10),
  medGroupSeed("oral", MED_ORAL_ANTIINFLAM_GROUP_ID, "消炎・鎮痛", 20),
  medGroupSeed("oral", "seed-med-oral-analgesic", "鎮痛剤", 30),
  medGroupSeed("oral", MED_ORAL_STEROID_ANTIHIST_GROUP_ID, "ステロイド・抗ヒス", 40),
  medGroupSeed("oral", MED_ORAL_GI_STOMACH_GROUP_ID, "消化器（胃）", 50),
  medGroupSeed("oral", MED_ORAL_GI_INTESTINE_GROUP_ID, "消化器（腸）", 60),
  medGroupSeed("oral", MED_ORAL_LIVER_KIDNEY_GROUP_ID, "肝・腎・泌尿", 70),
  medGroupSeed("oral", MED_ORAL_CARDIO_GROUP_ID, "循環器", 80),
  medGroupSeed("oral", MED_ORAL_RESPIRATORY_GROUP_ID, "呼吸器", 90),
  medGroupSeed("oral", MED_ORAL_NEURO_GROUP_ID, "神経・行動", 100),
  medGroupSeed("oral", MED_ORAL_ANTIFUNGAL_GROUP_ID, "抗真菌・駆虫薬・抗ウイルス薬", 110),
  medGroupSeed("oral", MED_ORAL_IMMUNO_GROUP_ID, "免疫抑制", 120),
  medGroupSeed("oral", MED_ORAL_VITAMIN_GROUP_ID, "ビタミン・代謝", 130),
  medGroupSeed("oral", MED_ORAL_HORMONE_GROUP_ID, "ホルモン", 140),
  medGroupSeed("oral", MED_ORAL_BLOOD_GROUP_ID, "血液", 150),
  medGroupSeed("oral", MED_ORAL_ANTICANCER_GROUP_ID, "抗がん", 160),
  medGroupSeed("oral", "seed-med-oral-kampo", "漢方", 170),
  medGroupSeed("oral", MED_ORAL_OTHER_GROUP_ID, "その他", 180),
  medGroupSeed("oral", "seed-med-oral-inject-suppository", "処方注射薬・座薬", 190),
  medGroupSeed("topical", "seed-med-topical-skin", "皮膚", 10),
  medGroupSeed("topical", "seed-med-topical-disinfect", "消毒", 20),
  medGroupSeed("topical", "seed-med-topical-ear", "耳", 30),
];

export const MEDICATION_ITEM_LEAF_SEED = [
  ...medGroupLeaves("oral", MED_ORAL_ANTIBIOTIC_GROUP_ID, [
    { id: "seed-med-oral-abx-amoxicillin", label: "アモキシシリン" },
    { id: "seed-med-oral-abx-amox-clav", label: "クラブラン酸/アモキシシリン" },
    { id: "seed-med-oral-abx-cephalexin", label: "セファレキシン" },
    { id: "seed-med-oral-abx-cefpodoxime", label: "セフポドキシム" },
    { id: "seed-med-oral-abx-faropenem", label: "ファロペネム" },
    { id: "seed-med-oral-abx-azithromycin", label: "アジスロマイシン" },
    { id: "seed-med-oral-abx-tylosin", label: "タイロシン" },
    { id: "seed-med-oral-abx-clindamycin", label: "クリンダマイシン" },
    { id: "seed-med-oral-abx-fosfomycin", label: "ホスホマイシン" },
    { id: "seed-med-oral-abx-doxycycline", label: "ドキシサイクリン" },
    { id: "seed-med-oral-abx-minocycline", label: "ミノサイクリン" },
    { id: "seed-med-oral-abx-enrofloxacin", label: "エンロフロキサシン" },
    { id: "seed-med-oral-abx-orbifloxacin", label: "オルビフロキサシン" },
    { id: "seed-med-oral-abx-moxifloxacin", label: "モキシフロキサシン" },
    { id: "seed-med-oral-abx-veraflox", label: "ベラフロックス" },
    { id: "seed-med-oral-abx-st", label: "ST合剤" },
    { id: "seed-med-oral-abx-chloramphenicol", label: "クロラムフェニコール" },
    { id: "seed-med-oral-abx-metronidazole", label: "メトロニダゾール" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_ANTIINFLAM_GROUP_ID, [
    { id: "seed-med-oral-nsaid-onsior", label: "オンシオール" },
    { id: "seed-med-oral-nsaid-previcox", label: "プレビコックス" },
    { id: "seed-med-oral-nsaid-galliprant", label: "ガリプラント" },
    { id: "seed-med-oral-nsaid-trocoxil", label: "トロコキシル" },
    { id: "seed-med-oral-nsaid-panoquell", label: "パノクエル" },
    { id: "seed-med-oral-nsaid-tramadol", label: "トラマドール" },
    { id: "seed-med-oral-nsaid-pregabalin", label: "プレガバリン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_STEROID_ANTIHIST_GROUP_ID, [
    { id: "seed-med-oral-steroid-prednisolone", label: "プレドニゾロン" },
    { id: "seed-med-oral-steroid-ledercort", label: "レダコート" },
    { id: "seed-med-oral-steroid-zentacort", label: "ゼンタコート" },
    { id: "seed-med-oral-steroid-cortef", label: "コートリル" },
    { id: "seed-med-oral-antihist-restamin", label: "レスタミン" },
    { id: "seed-med-oral-antihist-cetirizine", label: "セチリジン" },
    { id: "seed-med-oral-antihist-periactin", label: "ペリアクチン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_GI_STOMACH_GROUP_ID, [
    { id: "seed-med-oral-gi-s-maropitant", label: "マロピタント" },
    { id: "seed-med-oral-gi-s-primperan", label: "プリンペラン" },
    { id: "seed-med-oral-gi-s-ondansetron", label: "オンダンセトロン" },
    { id: "seed-med-oral-gi-s-contomin", label: "コントミン" },
    { id: "seed-med-oral-gi-s-famotidine", label: "ファモチジン" },
    { id: "seed-med-oral-gi-s-lansoprazole", label: "ランソプラゾール" },
    { id: "seed-med-oral-gi-s-omeprazole", label: "オメプラゾール" },
    { id: "seed-med-oral-gi-s-diquanon", label: "ディクアノン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_GI_INTESTINE_GROUP_ID, [
    { id: "seed-med-oral-gi-i-mosapride", label: "モサプリド" },
    { id: "seed-med-oral-gi-i-mesalazine", label: "メサラジン" },
    { id: "seed-med-oral-gi-i-salazopyrin", label: "サラゾピリン" },
    { id: "seed-med-oral-gi-i-delclear", label: "デルクリアー" },
    { id: "seed-med-oral-gi-i-diabuster", label: "ディアバスター" },
    { id: "seed-med-oral-gi-i-fortiflora", label: "FortiFlora" },
    { id: "seed-med-oral-gi-i-buscopan", label: "ブスコパン" },
    { id: "seed-med-oral-gi-i-miyabm", label: "ミヤBM" },
    { id: "seed-med-oral-gi-i-zenrase", label: "ゼンラーゼ" },
    { id: "seed-med-oral-gi-i-mitomax", label: "マイトマックス" },
    { id: "seed-med-oral-gi-i-biofermin-r", label: "ビオフェルミンR散剤" },
    { id: "seed-med-oral-gi-i-bagasse", label: "バガス" },
    { id: "seed-med-oral-gi-i-psyllium", label: "サイリウム" },
    { id: "seed-med-oral-gi-i-guar-gum", label: "グアーガム" },
    { id: "seed-med-oral-gi-i-adsorbin", label: "アドソルビン" },
    { id: "seed-med-oral-gi-i-pancreatin", label: "パンクレアチン" },
    { id: "seed-med-oral-gi-i-picosulfate", label: "ピコスルファート" },
    { id: "seed-med-oral-gi-i-movicol", label: "モビコール" },
    { id: "seed-med-oral-gi-i-vaseline", label: "ワセリン軟膏" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_LIVER_KIDNEY_GROUP_ID, [
    { id: "seed-med-oral-lk-telmisartan", label: "テルミサルタン" },
    { id: "seed-med-oral-lk-rapros", label: "ラプロス" },
    { id: "seed-med-oral-lk-renagel", label: "レナジェル" },
    { id: "seed-med-oral-lk-nephguard", label: "ネフガード" },
    { id: "seed-med-oral-lk-semintra", label: "セミントラ" },
    { id: "seed-med-oral-lk-urarit", label: "ウラリット" },
    { id: "seed-med-oral-lk-urso", label: "ウルソ" },
    { id: "seed-med-oral-lk-spacor", label: "スパカール" },
    { id: "seed-med-oral-lk-piale", label: "ピアーレシロップ" },
    { id: "seed-med-oral-lk-rivaguard", label: "リバガード" },
    { id: "seed-med-oral-lk-samylin", label: "SAMYLIN" },
    { id: "seed-med-oral-lk-urocalun", label: "ウロカルン" },
    { id: "seed-med-oral-lk-propalin", label: "プロパリン" },
    { id: "seed-med-oral-lk-welldeli", label: "ウエルデリ" },
    { id: "seed-med-oral-lk-tamsulosin", label: "タムスロシン塩酸塩" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_CARDIO_GROUP_ID, [
    { id: "seed-med-oral-cardio-pimobendan", label: "ピモベハート" },
    { id: "seed-med-oral-cardio-upinac", label: "アピナック" },
    { id: "seed-med-oral-cardio-amlodipine", label: "アムロジピン" },
    { id: "seed-med-oral-cardio-diltiazem", label: "ジルチアゼム" },
    { id: "seed-med-oral-cardio-itrol", label: "アイトロール" },
    { id: "seed-med-oral-cardio-sildenafil", label: "シルデナフィル" },
    { id: "seed-med-oral-cardio-tadalafil", label: "タダラフィル" },
    { id: "seed-med-oral-cardio-carvedilol", label: "カルベジロール" },
    { id: "seed-med-oral-cardio-atenolol", label: "アテノロール" },
    { id: "seed-med-oral-cardio-sotalol", label: "ソタコール" },
    { id: "seed-med-oral-cardio-cilostazol", label: "シロスタゾール" },
    { id: "seed-med-oral-cardio-beraprost", label: "ベラプロスト" },
    { id: "seed-med-oral-cardio-spironolactone", label: "スピロノラクトン" },
    { id: "seed-med-oral-cardio-hctz", label: "ヒドロクロロチアジド" },
    { id: "seed-med-oral-cardio-furosemide", label: "フロセミド" },
    { id: "seed-med-oral-cardio-torasemide", label: "トラセミド" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_RESPIRATORY_GROUP_ID, [
    { id: "seed-med-oral-resp-theolong", label: "テオロング" },
    { id: "seed-med-oral-resp-theophylline", label: "テオフィリン" },
    { id: "seed-med-oral-resp-mucosolvan", label: "ムコソルバン" },
    { id: "seed-med-oral-resp-montelukast", label: "モンテルカスト" },
    { id: "seed-med-oral-resp-butorphanol", label: "ブトルファノール" },
    { id: "seed-med-oral-resp-danpron", label: "ダンプロン" },
    { id: "seed-med-oral-resp-bricanyl", label: "ブリカニール" },
    { id: "seed-med-oral-resp-dextromethorphan", label: "デキストロメトルファン" },
    { id: "seed-med-oral-resp-maropitant-cough", label: "マロピタント（鎮咳）" },
    { id: "seed-med-oral-resp-alber-liq", label: "アルベール液" },
    { id: "seed-med-oral-resp-meptin-liq", label: "メプチン液" },
    { id: "seed-med-oral-resp-cefazolin-liq", label: "セファゾリン液" },
    { id: "seed-med-oral-resp-bosmin-liq", label: "ボスミン液" },
    { id: "seed-med-oral-resp-bisolvon-liq", label: "ビソルボン液" },
    { id: "seed-med-oral-resp-gentamicin-liq", label: "ゲンタマイシン液" },
    { id: "seed-med-oral-resp-dexamethasone-liq", label: "デキサメサゾン液" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_NEURO_GROUP_ID, [
    { id: "seed-med-oral-neuro-zonisamide", label: "ゾニサミド" },
    { id: "seed-med-oral-neuro-kbr", label: "臭化カリウム" },
    { id: "seed-med-oral-neuro-midazolam-nasal", label: "ミダゾラム（鼻腔）" },
    { id: "seed-med-oral-neuro-phenobal", label: "フェノバール" },
    { id: "seed-med-oral-neuro-levetiracetam", label: "レベチラセタム" },
    { id: "seed-med-oral-neuro-diup-suppository", label: "ダイアップ坐剤" },
    { id: "seed-med-oral-neuro-entysce", label: "エンタイス" },
    { id: "seed-med-oral-neuro-elura", label: "エルーラ" },
    { id: "seed-med-oral-neuro-remeron", label: "レメロン" },
    { id: "seed-med-oral-neuro-fluoxetine", label: "フルオキセチン" },
    { id: "seed-med-oral-neuro-paroxetine", label: "パロキセチン" },
    { id: "seed-med-oral-neuro-trazodone", label: "トラゾドン" },
    { id: "seed-med-oral-neuro-tandospirone", label: "ダンドスピロン" },
    { id: "seed-med-oral-neuro-ravona", label: "ラボナ" },
    { id: "seed-med-oral-neuro-clomicalm", label: "クロミカルム" },
    { id: "seed-med-oral-neuro-landsen", label: "ランドセン" },
    { id: "seed-med-oral-neuro-mendon", label: "メンドン" },
    { id: "seed-med-oral-neuro-alprazolam", label: "アルプラゾラム" },
    { id: "seed-med-oral-neuro-gabapentin", label: "ガバペンチン" },
    { id: "seed-med-oral-neuro-acepromazine", label: "アセプロマジン" },
    { id: "seed-med-oral-neuro-isobide", label: "イソバイドシロップ" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_ANTIFUNGAL_GROUP_ID, [
    { id: "seed-med-oral-af-itraconazole", label: "イトラコナゾール" },
    { id: "seed-med-oral-af-ketoconazole", label: "ケトコナゾール" },
    { id: "seed-med-oral-af-drontal", label: "ドロンタール" },
    { id: "seed-med-oral-af-drontal-plus", label: "ドロンタールプラス" },
    { id: "seed-med-oral-af-procox", label: "プロコックス" },
    { id: "seed-med-oral-af-fenbendazole", label: "フェンベンダゾール" },
    { id: "seed-med-oral-af-tinidazole", label: "チニダゾール" },
    { id: "seed-med-oral-af-ronidazole", label: "ロニダゾール" },
    { id: "seed-med-oral-af-droncit", label: "ドロンシット" },
    { id: "seed-med-oral-abx-famciclovir", label: "ファムシクロビル" },
    { id: "seed-med-oral-af-molnupiravir", label: "モルヌピラビル" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_IMMUNO_GROUP_ID, [
    { id: "seed-med-oral-im-imuran", label: "イムラン" },
    { id: "seed-med-oral-im-chlorambucil", label: "クロラムブシル" },
    { id: "seed-med-oral-im-ciclavance", label: "シクラバンス" },
    { id: "seed-med-oral-im-cyclosporine-neoral", label: "シクロスポリン（ネオーラル）" },
    { id: "seed-med-oral-im-mofetil", label: "モフェチル" },
    { id: "seed-med-oral-im-bonzol", label: "ボンゾール" },
    { id: "seed-med-oral-im-arava", label: "アラバ" },
    { id: "seed-med-oral-im-zenrelia", label: "ゼンレリア" },
    { id: "seed-med-oral-im-apoquel", label: "アポキル" },
    { id: "seed-med-oral-im-diazoxide", label: "ジアゾキシド" },
    { id: "seed-med-oral-im-mestinon", label: "メスチノン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_VITAMIN_GROUP_ID, [
    { id: "seed-med-oral-vit-mecobalamin", label: "メコバラミン" },
    { id: "seed-med-oral-vit-yuvela-n", label: "ユベラN" },
    { id: "seed-med-oral-vit-folic-acid", label: "葉酸" },
    { id: "seed-med-oral-vit-sembergo", label: "センベルゴ" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_HORMONE_GROUP_ID, [
    { id: "seed-med-oral-hormone-adrestan", label: "アドレスタン" },
    { id: "seed-med-oral-hormone-thyradin", label: "チラージン" },
    { id: "seed-med-oral-hormone-thyroblock", label: "チロブロック" },
    { id: "seed-med-oral-hormone-trilostane", label: "トリロスタン" },
    { id: "seed-med-oral-hormone-florinef", label: "フロリネフ" },
    { id: "seed-med-oral-hormone-sakiozeal", label: "サキオジール" },
    { id: "seed-med-oral-hormone-melatonin", label: "メラトニン" },
    { id: "seed-med-oral-hormone-thiamazole", label: "チアマゾール" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_ANTICANCER_GROUP_ID, [
    { id: "seed-med-oral-ac-imatinib", label: "イマチニブ" },
    { id: "seed-med-oral-ac-palladia", label: "パラディア" },
    { id: "seed-med-oral-ac-endoxan", label: "エンドキサン" },
    { id: "seed-med-oral-ac-tigason", label: "チガソン" },
    { id: "seed-med-oral-ac-lomustine", label: "ロムスチン" },
  ]),
  ...medGroupLeaves("oral", MED_ORAL_BLOOD_GROUP_ID, [
    { id: "seed-med-oral-blood-domenan", label: "ドメナン" },
    { id: "seed-med-oral-blood-clopidogrel", label: "クロピドグレル" },
    { id: "seed-med-oral-blood-xarelto", label: "イグザレルト" },
    { id: "seed-med-oral-blood-tranexamic", label: "トラネキサム酸" },
  ]),
];

const MEDICATION_ITEM_GROUP_SEED_IDS = new Set(
  MEDICATION_ITEM_GROUP_SEED.map((s) => s.id)
);
const MEDICATION_ITEM_LEAF_SEED_IDS = new Set(
  MEDICATION_ITEM_LEAF_SEED.map((s) => s.id)
);

const store = {
  medicationItems: {
    // 旧フラット薬剤（移行対象）。アモキシシリンは葉シードと同名のため抗生剤へ上書き移動される
    legacy1: { label: "アモキシシリン", order: 1 },
    legacy2: { label: "アラバ", order: 2 },
    legacy3: { label: "パラディア", order: 3 },
  },
  medications: {},
};

const itemListeners = [];
const medListeners = new Map();
let seq = 0;
const nid = (p) => p + ++seq;

function ensureMeds(k) {
  if (!store.medications[k]) store.medications[k] = {};
  return store.medications[k];
}

function listItems() {
  return Object.entries(store.medicationItems)
    .map(([id, t]) => normalizeMedicationItem(id, t))
    .sort((a, b) => {
      const ord = (a.order ?? 0) - (b.order ?? 0);
      if (ord !== 0) return ord;
      return (a.label || "").localeCompare(b.label || "", "ja");
    });
}

function notifyItems() {
  const items = listItems();
  itemListeners.forEach((cb) => cb(items.map((x) => ({ ...x }))));
}

function notifyMeds(k) {
  const drugs = Object.entries(ensureMeds(k)).map(([id, d]) => ({
    id,
    ...d,
    events: d.events || {},
  }));
  (medListeners.get(k) || []).forEach((cb) =>
    cb(drugs.map((x) => structuredClone(x)))
  );
}

function medicationItemSeedPayload(seed) {
  return {
    label: seed.label,
    category: normalizeMedicationItemCategory(seed.category),
    kind: normalizeMedicationItemKind(seed.kind),
    parentId: seed.parentId || "",
    order: seed.order,
  };
}

export async function ensureMedicationItemDefaults() {
  const existing = store.medicationItems;
  const next = {};
  Object.entries(existing).forEach(([id, row]) => {
    if (row && typeof row === "object") next[id] = { ...row };
  });

  MEDICATION_ITEM_GROUP_SEED.forEach((seed) => {
    next[seed.id] = medicationItemSeedPayload(seed);
  });

  Object.entries(next).forEach(([id, row]) => {
    if (!row || typeof row !== "object") return;
    if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return;
    if (MEDICATION_ITEM_LEAF_SEED_IDS.has(id)) return;

    const hasCategory = Object.prototype.hasOwnProperty.call(row, "category");
    const hasKind = Object.prototype.hasOwnProperty.call(row, "kind");
    const kind = normalizeMedicationItemKind(row.kind);
    const category = hasCategory
      ? normalizeMedicationItemCategory(row.category)
      : "";
    const parentId = String(row.parentId || "").trim();
    const isLegacyFlat = !hasCategory || !hasKind;
    const isOrphanLeaf =
      kind === "leaf" &&
      (category === "oral" || category === "topical") &&
      !parentId;

    if (!isLegacyFlat && !isOrphanLeaf) return;

    next[id] = {
      label: row.label || "",
      category: "oral",
      kind: "leaf",
      parentId: MED_ORAL_OTHER_GROUP_ID,
      order: typeof row.order === "number" ? row.order : Date.now(),
    };
  });

  MEDICATION_ITEM_LEAF_SEED.forEach((seed) => {
    const payload = medicationItemSeedPayload(seed);
    if (next[seed.id]) {
      next[seed.id] = payload;
      return;
    }
    const sameNameId = Object.entries(next).find(([id, row]) => {
      if (!row || typeof row !== "object") return false;
      if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return false;
      if (normalizeMedicationItemKind(row.kind) === "group") return false;
      return String(row.label || "").trim() === payload.label;
    })?.[0];
    if (sameNameId) {
      next[sameNameId] = payload;
      return;
    }
    next[seed.id] = payload;
  });

  Object.keys(existing).forEach((id) => {
    delete existing[id];
  });
  Object.assign(existing, next);
  notifyItems();
}

export function subscribeMedicationItems(cb) {
  itemListeners.push(cb);
  ensureMedicationItemDefaults().then(() => notifyItems());
  return () => {
    const i = itemListeners.indexOf(cb);
    if (i >= 0) itemListeners.splice(i, 1);
  };
}

export function subscribeMedications(karte, cb) {
  const list = medListeners.get(karte) || [];
  list.push(cb);
  medListeners.set(karte, list);
  notifyMeds(karte);
  return () =>
    medListeners.set(
      karte,
      (medListeners.get(karte) || []).filter((x) => x !== cb)
    );
}

export async function addMedicationItem({
  label,
  order,
  category,
  kind = "leaf",
  parentId = "",
}) {
  const id = nid("mitem");
  const resolvedKind = normalizeMedicationItemKind(kind);
  store.medicationItems[id] = {
    label: label || "",
    category: normalizeMedicationItemCategory(category),
    kind: resolvedKind,
    parentId: resolvedKind === "group" ? "" : String(parentId || "").trim(),
    order: typeof order === "number" ? order : Date.now(),
  };
  notifyItems();
  return id;
}

export async function addMedication(
  karte,
  { name, category, frequencyChange, frequency, changedBy, eventDate }
) {
  const id = nid("drug");
  const date = eventDate || "2026-07-01";
  ensureMeds(karte)[id] = {
    schemaVersion: 1,
    name: name || "",
    category: category || "A",
    sideEffectNote: "",
    expiryEstimate: "",
    events: {
      [nid("ev")]: {
        date,
        type: "add",
        detail: "開始／継続",
        frequencyChange: frequencyChange || "",
        frequency: frequency || null,
        amountChange: "",
        changedBy: changedBy || "",
      },
    },
  };
  notifyMeds(karte);
  return id;
}

export async function updateMedication() {}
export async function deleteMedication() {}
export async function addMedicationEvent(
  karte,
  drugId,
  { date, type, detail, frequencyChange, frequency, amountChange, changedBy }
) {
  const drug = ensureMeds(karte)[drugId];
  if (!drug) throw new Error("drug missing");
  if (!drug.events) drug.events = {};
  const id = nid("ev");
  drug.events[id] = {
    date: date || "2026-07-01",
    type: type || "add",
    detail: detail || "",
    frequencyChange: frequencyChange || "",
    frequency: frequency || null,
    amountChange: amountChange || "",
    changedBy: changedBy || "",
  };
  notifyMeds(karte);
  return id;
}
export async function updateMedicationEvent() {}
export async function deleteMedicationEvent() {}
export async function fetchMedicationsOnce(karte) {
  return Object.entries(ensureMeds(karte)).map(([id, d]) => ({
    id,
    ...d,
    events: d.events || {},
  }));
}

/** 検証用 */
export function __getStore() {
  return store;
}

export function __resetStore() {
  store.medicationItems = {
    legacy1: { label: "アモキシシリン", order: 1 },
    legacy2: { label: "アラバ", order: 2 },
    legacy3: { label: "パラディア", order: 3 },
  };
  store.medications = {};
  seq = 0;
}
