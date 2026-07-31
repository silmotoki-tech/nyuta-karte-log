// 薬剤マスタ階層（注射薬／内服薬／外用薬／点眼薬）＋既存フラット移行付きモック

export const MEDICATION_ITEM_CATEGORIES = [
  { id: "inject", label: "注射薬" },
  { id: "oral", label: "内服薬" },
  { id: "topical", label: "外用薬" },
  { id: "eye", label: "点眼薬" },
  { id: "supplement", label: "サプリメント・商品" },
  { id: "food", label: "フード" },
];

export const MED_ORAL_OTHER_GROUP_ID = "seed-med-oral-other";
export const MED_INJECT_ANTIINFLAM_STEROID_GROUP_ID =
  "seed-med-inject-antiinflam-steroid";
export const MED_INJECT_ANTIBIOTIC_GROUP_ID = "seed-med-inject-antibiotic";
export const MED_INJECT_GI_GROUP_ID = "seed-med-inject-gi";
export const MED_INJECT_NEURO_GROUP_ID = "seed-med-inject-neuro";
export const MED_INJECT_ANTICANCER_GROUP_ID = "seed-med-inject-anticancer";
export const MED_INJECT_CARDIO_RESP_GROUP_ID = "seed-med-inject-cardio-resp";
export const MED_INJECT_OTHER_GROUP_ID = "seed-med-inject-other";
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
export const MED_ORAL_KAMPO_GROUP_ID = "seed-med-oral-kampo";
export const MED_ORAL_BLOOD_GROUP_ID = "seed-med-oral-blood";
export const MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID = "seed-med-topical-skin-steroid-abx";
export const MED_TOPICAL_SKIN_OTHER_GROUP_ID = "seed-med-topical-skin-other";
export const MED_TOPICAL_EAR_GROUP_ID = "seed-med-topical-ear";
/** @deprecated 旧「皮膚」中項目。シード退役対象 */
export const MED_TOPICAL_SKIN_GROUP_ID = "seed-med-topical-skin";
/** @deprecated 旧「消毒」中項目。シード退役対象 */
export const MED_TOPICAL_DISINFECT_GROUP_ID = "seed-med-topical-disinfect";
/** @deprecated 旧「シャンプー・スキンケア」中項目。シード退役対象 */
export const MED_TOPICAL_SHAMPOO_GROUP_ID = "seed-med-topical-shampoo";
export const MED_SUPPL_JOINT_GROUP_ID = "seed-med-suppl-joint";
export const MED_SUPPL_ORAL_GROUP_ID = "seed-med-suppl-oral";
export const MED_SUPPL_GI_GROUP_ID = "seed-med-suppl-gi";
export const MED_SUPPL_KIDNEY_GROUP_ID = "seed-med-suppl-kidney";
export const MED_SUPPL_URINARY_GROUP_ID = "seed-med-suppl-urinary";
export const MED_SUPPL_NEURO_GROUP_ID = "seed-med-suppl-neuro";
export const MED_SUPPL_SKIN_GROUP_ID = "seed-med-suppl-skin";
export const MED_SUPPL_OTHER_GROUP_ID = "seed-med-suppl-other";
export const MED_FOOD_HILLS_GROUP_ID = "seed-med-food-hills";
export const MED_FOOD_DOCTORS_GROUP_ID = "seed-med-food-doctors";
export const MED_FOOD_DIETIX_GROUP_ID = "seed-med-food-dietix";
export const MED_FOOD_FARMINA_GROUP_ID = "seed-med-food-farmina";
export const MED_FOOD_PURINA_GROUP_ID = "seed-med-food-purina";
export const MED_FOOD_ROYAL_CANIN_GROUP_ID = "seed-med-food-royal-canin";
export const MED_FOOD_OTHER_GROUP_ID = "seed-med-food-other";

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
  medGroupSeed(
    "inject",
    MED_INJECT_ANTIINFLAM_STEROID_GROUP_ID,
    "消炎・ステロイド",
    10
  ),
  medGroupSeed("inject", MED_INJECT_ANTIBIOTIC_GROUP_ID, "抗生剤", 20),
  medGroupSeed("inject", MED_INJECT_GI_GROUP_ID, "消化器", 30),
  medGroupSeed("inject", MED_INJECT_NEURO_GROUP_ID, "鎮痛・鎮静・神経", 40),
  medGroupSeed("inject", MED_INJECT_ANTICANCER_GROUP_ID, "抗癌剤", 50),
  medGroupSeed("inject", MED_INJECT_CARDIO_RESP_GROUP_ID, "循環器・呼吸器", 60),
  medGroupSeed("inject", MED_INJECT_OTHER_GROUP_ID, "その他", 70),
  medGroupSeed("oral", MED_ORAL_ANTIBIOTIC_GROUP_ID, "抗生剤", 10),
  medGroupSeed("oral", MED_ORAL_ANTIINFLAM_GROUP_ID, "消炎・鎮痛", 20),
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
  medGroupSeed("oral", MED_ORAL_KAMPO_GROUP_ID, "漢方", 170),
  medGroupSeed("oral", MED_ORAL_OTHER_GROUP_ID, "その他", 180),
  medGroupSeed("oral", "seed-med-oral-inject-suppository", "処方注射薬・座薬", 190),
  medGroupSeed("topical", MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID, "皮膚ステロイド+抗菌", 10),
  medGroupSeed("topical", MED_TOPICAL_SKIN_OTHER_GROUP_ID, "皮膚その他", 20),
  medGroupSeed("topical", MED_TOPICAL_EAR_GROUP_ID, "耳", 30),
  medGroupSeed("supplement", MED_SUPPL_JOINT_GROUP_ID, "関節・炎症", 10),
  medGroupSeed("supplement", MED_SUPPL_ORAL_GROUP_ID, "口腔", 20),
  medGroupSeed("supplement", MED_SUPPL_GI_GROUP_ID, "消化器・代謝", 30),
  medGroupSeed("supplement", MED_SUPPL_KIDNEY_GROUP_ID, "腎臓", 40),
  medGroupSeed("supplement", MED_SUPPL_URINARY_GROUP_ID, "泌尿器", 50),
  medGroupSeed("supplement", MED_SUPPL_NEURO_GROUP_ID, "行動・神経", 60),
  medGroupSeed("supplement", MED_SUPPL_SKIN_GROUP_ID, "皮膚", 70),
  medGroupSeed("supplement", MED_SUPPL_OTHER_GROUP_ID, "その他", 80),
  medGroupSeed("food", MED_FOOD_HILLS_GROUP_ID, "Hills", 10),
  medGroupSeed("food", MED_FOOD_DOCTORS_GROUP_ID, "ドクターズ", 20),
  medGroupSeed("food", MED_FOOD_DIETIX_GROUP_ID, "ダイエティクス", 30),
  medGroupSeed("food", MED_FOOD_FARMINA_GROUP_ID, "ファルミナ", 40),
  medGroupSeed("food", MED_FOOD_PURINA_GROUP_ID, "ピュリナ", 50),
  medGroupSeed("food", MED_FOOD_ROYAL_CANIN_GROUP_ID, "ロイヤルカナン", 60),
  medGroupSeed("food", MED_FOOD_OTHER_GROUP_ID, "その他", 70),
];

export const MEDICATION_ITEM_LEAF_SEED = [
  ...medGroupLeaves("inject", MED_INJECT_ANTIINFLAM_STEROID_GROUP_ID, [
    { id: "seed-med-inject-pred-susp", label: "プレドニゾロン懸濁液" },
    { id: "seed-med-inject-onsior", label: "オンシオール" },
    { id: "seed-med-inject-tranexamic", label: "トラネキサム酸" },
    { id: "seed-med-inject-diphenhydramine", label: "ジフェンヒドラミン" },
    { id: "seed-med-inject-polaramine", label: "ポララミン" },
    { id: "seed-med-inject-panoquell", label: "パノクエル" },
    { id: "seed-med-inject-docp", label: "DOCP" },
    { id: "seed-med-inject-dexamethasone", label: "デキサメサゾン" },
    { id: "seed-med-inject-cytopoint", label: "サイトポイント" },
    { id: "seed-med-inject-cartrophen", label: "カルトロフェン" },
    { id: "seed-med-inject-pre-vax", label: "ワクチン前投与" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_ANTIBIOTIC_GROUP_ID, [
    { id: "seed-med-inject-convenia", label: "コンベニア" },
    { id: "seed-med-inject-abpc", label: "ABPC" },
    { id: "seed-med-inject-cez", label: "CEZ" },
    { id: "seed-med-inject-ctx", label: "CTX" },
    { id: "seed-med-inject-erfx", label: "ERFX" },
    { id: "seed-med-inject-mpm", label: "MPM" },
    { id: "seed-med-inject-fom-cat-contraindicated", label: "FOM(猫禁忌)" },
    { id: "seed-med-inject-st", label: "ST合剤" },
    { id: "seed-med-inject-amk", label: "AMK" },
    { id: "seed-med-inject-cldm", label: "CLDM" },
    { id: "seed-med-inject-vancomycin", label: "バンコマイシン" },
    { id: "seed-med-inject-cp", label: "CP" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_GI_GROUP_ID, [
    { id: "seed-med-inject-maropitant", label: "マロピタント" },
    { id: "seed-med-inject-ondansetron", label: "オンダンセトロン" },
    { id: "seed-med-inject-famotidine", label: "ファモチジン" },
    { id: "seed-med-inject-omeprazole", label: "オメプラゾール" },
    { id: "seed-med-inject-primperan", label: "プリンペラン" },
    { id: "seed-med-inject-buscopan", label: "ブスコパン" },
    { id: "seed-med-inject-diabuster", label: "ディアバスター" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_NEURO_GROUP_ID, [
    { id: "seed-med-inject-libera-dog", label: "リブレラ（犬）" },
    { id: "seed-med-inject-libera-camp-dog", label: "リブレラキャンペーン（犬）" },
    { id: "seed-med-inject-solensia-cat", label: "ソレンシア（猫）" },
    {
      id: "seed-med-inject-solensia-camp-cat",
      label: "ソレンシアキャンペーン（猫）",
    },
    { id: "seed-med-inject-butorphanol", label: "ブトルファノール" },
    { id: "seed-med-inject-buprenorphine", label: "ブプレノルフィン" },
    { id: "seed-med-inject-tramadol", label: "トラマドール" },
    { id: "seed-med-inject-phenobarbital", label: "フェノバール" },
    { id: "seed-med-inject-levetiracetam", label: "レベチラセタム" },
    { id: "seed-med-inject-midazolam", label: "ミダゾラム" },
    { id: "seed-med-inject-ketamine", label: "ケタミン" },
    { id: "seed-med-inject-morphine", label: "モルヒネ" },
    { id: "seed-med-inject-propofol", label: "プロポフォール" },
    { id: "seed-med-inject-alphaxalone", label: "アルファキサロン" },
    { id: "seed-med-inject-lidocaine", label: "リドカイン" },
    { id: "seed-med-inject-flumazenil", label: "フルマゼニル" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_ANTICANCER_GROUP_ID, [
    { id: "seed-med-inject-asparaginase", label: "L-アスパラギナーゼ" },
    { id: "seed-med-inject-doxorubicin", label: "ドキソルビシン" },
    { id: "seed-med-inject-vincristine", label: "ビンクリスチン" },
    { id: "seed-med-inject-cyclophosphamide", label: "シクロホスファミド" },
    { id: "seed-med-inject-carboplatin", label: "カルボプラチン" },
    { id: "seed-med-inject-vinblastine", label: "ビンブラスチン" },
    { id: "seed-med-inject-nimustine", label: "ニムスチン" },
    { id: "seed-med-inject-zoledronic", label: "ゾレドロン酸" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_CARDIO_RESP_GROUP_ID, [
    { id: "seed-med-inject-furosemide", label: "フロセミド" },
    { id: "seed-med-inject-diprophylline", label: "ジプロフィリン" },
    { id: "seed-med-inject-pimobendan", label: "ピモベンダン" },
    { id: "seed-med-inject-atropine", label: "アトロピン" },
    { id: "seed-med-inject-ephedrine", label: "エフェドリン" },
    { id: "seed-med-inject-bosmin", label: "ボスミン" },
    { id: "seed-med-inject-norepinephrine", label: "ノルエピネフリン" },
    { id: "seed-med-inject-dobutamine", label: "ドブタミン" },
    { id: "seed-med-inject-dopamine", label: "ドパミン" },
    { id: "seed-med-inject-diltiazem", label: "ジルチアゼム" },
    { id: "seed-med-inject-acepromazine", label: "アセプロマジン" },
    { id: "seed-med-inject-danpron", label: "ダンプロン" },
    { id: "seed-med-inject-cough-maropitant", label: "咳マロピタント" },
  ]),
  ...medGroupLeaves("inject", MED_INJECT_OTHER_GROUP_ID, [
    { id: "seed-med-inject-dalteparin", label: "ダルテパリン" },
    { id: "seed-med-inject-darbepoetin", label: "ダルベポエチン" },
    { id: "seed-med-inject-epovet", label: "エポベット" },
    { id: "seed-med-inject-iron-tonky", label: "鉄剤（トンキー）" },
    { id: "seed-med-inject-intercat", label: "インターキャット" },
    { id: "seed-med-inject-pegasys", label: "ペガシス" },
    { id: "seed-med-inject-hepahica", label: "ヘパヒカ" },
    { id: "seed-med-inject-mecobalamin", label: "メコバラミン" },
    { id: "seed-med-inject-k2", label: "K2" },
    { id: "seed-med-inject-vitamin-c", label: "ビタミンC" },
    { id: "seed-med-inject-alinamin", label: "アリナミン" },
    { id: "seed-med-inject-mercasol", label: "メルカゾール" },
    { id: "seed-med-inject-cortrosyn", label: "コートロシン" },
  ]),
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
  ...medGroupLeaves("oral", MED_ORAL_KAMPO_GROUP_ID, [
    { id: "seed-med-oral-kampo-genki", label: "源気" },
    { id: "seed-med-oral-kampo-sanshen", label: "三仙" },
    { id: "seed-med-oral-kampo-seiki", label: "清肌" },
    { id: "seed-med-oral-kampo-tsuraku", label: "通楽" },
    { id: "seed-med-oral-kampo-roka", label: "露華" },
    { id: "seed-med-oral-kampo-neishin", label: "寧心" },
    { id: "seed-med-oral-kampo-junka", label: "潤華" },
    { id: "seed-med-oral-kampo-kaigen", label: "快元" },
    { id: "seed-med-oral-kampo-seiberia", label: "西伯利亜" },
    { id: "seed-med-oral-kampo-tsurin", label: "通淋" },
    { id: "seed-med-oral-kampo-seishin", label: "静心" },
    { id: "seed-med-oral-kampo-jijun", label: "滋潤" },
    { id: "seed-med-oral-kampo-sokufu", label: "熄風" },
    { id: "seed-med-oral-kampo-chousoku", label: "調息" },
    { id: "seed-med-oral-kampo-jinko", label: "腎固" },
    { id: "seed-med-oral-kampo-soga", label: "爽牙" },
    { id: "seed-med-oral-kampo-shigyaku-san", label: "四逆散" },
    { id: "seed-med-oral-kampo-hachimi-jio", label: "八味地黄丸" },
    { id: "seed-med-oral-kampo-hozen", label: "補全" },
    { id: "seed-med-oral-kampo-unnan-hakuyaku", label: "雲南白薬" },
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
  ...medGroupLeaves("topical", MED_TOPICAL_SKIN_STEROID_ABX_GROUP_ID, [
    { id: "seed-med-topical-skin-gentamicin", label: "ゲンタマイシンクリーム" },
    { id: "seed-med-topical-skin-geben", label: "ゲーベンクリーム" },
    { id: "seed-med-topical-skin-ozone-gel", label: "オゾンジェル" },
    { id: "seed-med-topical-skin-ketoconazole", label: "ケトコナゾールクリーム" },
    { id: "seed-med-topical-ear-victas-mt", label: "ビクタスMTクリーム" },
    { id: "seed-med-topical-skin-allerief", label: "アレリーフローション" },
    { id: "seed-med-topical-skin-mometotic", label: "モメタオティック" },
    { id: "seed-med-topical-skin-restamin-kowa", label: "レスタミンコーワ軟膏" },
    { id: "seed-med-topical-skin-spirazone", label: "スピラゾン軟膏" },
    { id: "seed-med-topical-skin-mometasone", label: "モメタゾン軟膏" },
  ]),
  ...medGroupLeaves("topical", MED_TOPICAL_SKIN_OTHER_GROUP_ID, [
    { id: "seed-med-topical-skin-heparin-cream", label: "ヘパリンクリーム" },
    { id: "seed-med-topical-skin-heparin-foam", label: "ヘパリン泡スプレー" },
    { id: "seed-med-topical-skin-horse-oil", label: "馬油" },
    { id: "seed-med-topical-skin-chitosan", label: "キトサンパウダー" },
    { id: "seed-med-topical-skin-chitosan-mnz", label: "キトサンMNZパウダー" },
    { id: "seed-med-topical-skin-antinoll", label: "アンチノールスキン" },
    { id: "seed-med-topical-skin-tacrolimus", label: "タクロリムス軟膏" },
    { id: "seed-med-topical-skin-quick-stop", label: "クイックストップ" },
  ]),
  ...medGroupLeaves("topical", MED_TOPICAL_EAR_GROUP_ID, [
    { id: "seed-med-topical-ear-silpina", label: "シルピナ" },
    { id: "seed-med-topical-ear-mimipure", label: "ミミピュア" },
    { id: "seed-med-topical-ear-edta", label: "EDTAイヤークリーナー" },
    { id: "seed-med-topical-ear-pet-liquid", label: "Pet Ear&Skincare Liquid" },
    { id: "seed-med-topical-ear-ivermectin", label: "イベルメクチン（耳用）" },
  ]),
  ...medGroupLeaves("eye", "", [
    { id: "seed-med-eye-oneclean", label: "ワンクリーン点眼液" },
    { id: "seed-med-eye-hyaluronate", label: "ヒアルロン酸点眼液" },
    { id: "seed-med-eye-hyalein-mini", label: "ヒアレインミニ" },
    { id: "seed-med-eye-levofloxacin", label: "レボフロキサシン点眼液" },
    { id: "seed-med-eye-bestron", label: "ベストロン点眼液" },
    { id: "seed-med-eye-gentamicin", label: "ゲンタマイシン点眼液" },
    { id: "seed-med-eye-ofloxacin-oint", label: "オフロキサシン眼軟膏" },
    { id: "seed-med-eye-ecolysin-oint", label: "エコリシン眼軟膏" },
    { id: "seed-med-eye-gatifloxacin", label: "ガチフロキサシン点眼液" },
    { id: "seed-med-eye-fvr-mix", label: "FVR Mix" },
    { id: "seed-med-eye-hya-pranoprofen", label: "ヒア・プラノプロフェン点眼液" },
    { id: "seed-med-eye-hya-gm", label: "ヒアGM" },
    { id: "seed-med-eye-hya-gm-intercat", label: "ヒアGM＋インターキャット" },
    { id: "seed-med-eye-panoquell-bestron", label: "パノクエル加ベストロン" },
    { id: "seed-med-eye-panoquell-azulene", label: "パノクエル加アズレン" },
    { id: "seed-med-eye-pranoprofen", label: "プラノプロフェン点眼液" },
    { id: "seed-med-eye-diclo-star", label: "ジクロスター点眼液" },
    { id: "seed-med-eye-sterop", label: "ステロップ点眼液" },
    { id: "seed-med-eye-dexamethasone", label: "デキサメサゾン点眼液" },
    { id: "seed-med-eye-neomedrol-oint", label: "ネオメドロール眼軟膏" },
    { id: "seed-med-eye-idu", label: "IDU点眼液" },
    { id: "seed-med-eye-acyclovir-oint", label: "アシクロビル眼軟膏" },
    { id: "seed-med-eye-optimune-oint", label: "オプティミューン眼軟膏" },
    { id: "seed-med-eye-pirenoxine", label: "ピレノキシン点眼液" },
    { id: "seed-med-eye-serum", label: "血清点眼液" },
    { id: "seed-med-eye-azulene", label: "アズレン点眼液" },
    { id: "seed-med-eye-latanoprost", label: "ラタノプロスト点眼液" },
    { id: "seed-med-eye-azorga", label: "アゾルガ点眼液" },
    { id: "seed-med-eye-egypt", label: "エイジプト点眼液" },
    { id: "seed-med-eye-tapros", label: "タプロス点眼液" },
    { id: "seed-med-eye-timolol", label: "チモロール点眼液" },
    { id: "seed-med-eye-neosynesin-kowa", label: "ネオシネジンコーワ" },
    { id: "seed-med-eye-tropicamide", label: "トロピカミド" },
    { id: "seed-med-eye-desmopressin", label: "デスモプレシン" },
    { id: "seed-med-eye-brenda", label: "ブレンダ点眼" },
    { id: "seed-med-eye-acetylcysteine", label: "アセチルシステイン点眼液" },
    { id: "seed-med-eye-brinzolamide", label: "ブリンゾラミド懸濁性点眼液" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_JOINT_GROUP_ID, [
    { id: "seed-med-suppl-joint-antinoll-plus", label: "アンチノールプラス（犬猫用）" },
    { id: "seed-med-suppl-joint-antinoll-cat", label: "アンチノール（猫用）" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_ORAL_GROUP_ID, [
    { id: "seed-med-suppl-oral-oralguard-v", label: "オーラルガードV" },
    { id: "seed-med-suppl-oral-vi001", label: "Vi001デンタルジェル" },
    { id: "seed-med-suppl-oral-scallo", label: "スカロー" },
    { id: "seed-med-suppl-oral-scallo-dental-gel", label: "スカローデンタルジェル" },
    { id: "seed-med-suppl-oral-virbac-brush-mini", label: "ビルバックデンタルブラシミニ" },
    { id: "seed-med-suppl-oral-virbac-periaid", label: "ビルバックペリエイドデンタルブラシ" },
    { id: "seed-med-suppl-oral-virbac-brush-double", label: "ビルバックデンタルブラシダブル" },
    { id: "seed-med-suppl-oral-lion-brush", label: "ライオンハブラシ" },
    { id: "seed-med-suppl-oral-ci-shuwawa", label: "Ciシュワワハブラシ" },
    { id: "seed-med-suppl-oral-awayuki-small", label: "泡雪（ハブラシ小）" },
    { id: "seed-med-suppl-oral-awayuki-xs", label: "泡雪（ハブラシ極小）" },
    { id: "seed-med-suppl-oral-anisapo-glove", label: "アニサポ_歯磨きグローブ" },
    { id: "seed-med-suppl-oral-kaito-veil", label: "カイトベールオーラルケア" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_GI_GROUP_ID, [
    { id: "seed-med-suppl-gi-flora-care", label: "フローラケア" },
    { id: "seed-med-suppl-gi-eneala", label: "エネアラ" },
    { id: "seed-med-suppl-gi-laxatone", label: "ラキサトーン" },
    { id: "seed-med-suppl-gi-cat-lux", label: "CAT LUX" },
    { id: "seed-med-suppl-gi-pe-mct-powder-plus", label: "PE_MCTパウダープラス" },
    { id: "seed-med-suppl-gi-glucose-50", label: "50%ブドウ糖注射液" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_KIDNEY_GROUP_ID, [
    { id: "seed-med-suppl-kidney-carinal-combo", label: "カリナールコンボ" },
    { id: "seed-med-suppl-kidney-pronefra", label: "プロネフラ" },
    { id: "seed-med-suppl-kidney-phytocare", label: "フィトケア" },
    { id: "seed-med-suppl-kidney-renal-k", label: "リーナルK" },
    { id: "seed-med-suppl-kidney-azodyl", label: "アジデイル" },
    { id: "seed-med-suppl-kidney-phos-care", label: "リンケア" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_URINARY_GROUP_ID, [
    { id: "seed-med-suppl-urinary-uroact-plus", label: "ウロアクトプラス" },
    { id: "seed-med-suppl-urinary-utclean", label: "UTclean" },
    { id: "seed-med-suppl-urinary-utclean-ca", label: "UTclean_Ca" },
    { id: "seed-med-suppl-urinary-calmurofel", label: "Calmurofel" },
    { id: "seed-med-suppl-urinary-welldeli", label: "ウエルデリ" },
    { id: "seed-med-suppl-urinary-ut-stick", label: "UTスティック" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_NEURO_GROUP_ID, [
    { id: "seed-med-suppl-neuro-zylkene", label: "ジルケーン" },
    { id: "seed-med-suppl-neuro-aktivait", label: "AKTIVAIT" },
    { id: "seed-med-suppl-neuro-cbd-casein", label: "CBDカゼインタブ" },
    { id: "seed-med-suppl-neuro-neuroact-plus", label: "ニューロアクトプラス" },
    { id: "seed-med-suppl-neuro-cbd-oil-3", label: "小型犬・猫３％CBDオイル" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_SKIN_GROUP_ID, [
    { id: "seed-med-suppl-skin-dermact", label: "ダーマクト" },
    { id: "seed-med-suppl-skin-omega-sunshine", label: "オメガサンシャイン" },
  ]),
  ...medGroupLeaves("supplement", MED_SUPPL_OTHER_GROUP_ID, [
    { id: "seed-med-suppl-other-soltol-one", label: "ソルトールワン" },
    { id: "seed-med-suppl-other-eyeact", label: "アイアクト" },
    { id: "seed-med-suppl-other-viralys-plus", label: "バイラリスプラス" },
    { id: "seed-med-suppl-other-oryzarose", label: "オリザロース" },
    { id: "seed-med-suppl-other-insulact", label: "インスラクト" },
    { id: "seed-med-suppl-other-heartact", label: "ハートアクト" },
    { id: "seed-med-suppl-other-hydra-care", label: "Hydra Care" },
    { id: "seed-med-suppl-other-carming-care", label: "Carming Care" },
    { id: "seed-med-suppl-other-animewn", label: "アニミューン" },
    { id: "seed-med-suppl-other-eyelid-lash", label: "アイリッドラッシュ" },
    { id: "seed-med-suppl-other-pet-mybo-shampoo", label: "Pet Mybo shampoo" },
  ]),
];

/** 外用再編で廃止する中項目・葉シード */
const MEDICATION_ITEM_SEED_RETIRE = [
  "seed-med-oral-analgesic",
  "seed-med-topical-skin",
  "seed-med-topical-disinfect",
  "seed-med-topical-shampoo",
  "seed-med-topical-disinfect-ch-towel",
  "seed-med-topical-disinfect-ap-water",
  "seed-med-topical-ear-mometotic",
  "seed-med-topical-ear-izotic",
  "seed-med-topical-ear-berbezolon",
  "seed-med-topical-ear-epiotic",
  "seed-med-topical-ear-mal-a-ket-plus",
  "seed-med-topical-ear-malacetic",
  "seed-med-topical-shampoo-malasecure",
  "seed-med-topical-shampoo-hinocare",
  "seed-med-topical-shampoo-nano-basing",
  "seed-med-topical-shampoo-cleansing-oil",
  "seed-med-topical-shampoo-chlorhexidine",
  "seed-med-topical-shampoo-derma-moist",
  "seed-med-topical-shampoo-hoscare",
  "seed-med-topical-shampoo-quanpow",
  "seed-med-topical-shampoo-quanpow-bath-milk",
];

const MEDICATION_ITEM_LABEL_RETIRE = ["デルトピカローション", "エピオティック"];

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

/** 同名葉の上書き対象。別中項目の現行葉シードは奪わず共存させる。 */
function findSameNameLeafIdForSeed(next, payload) {
  const seedParent = String(payload.parentId || "").trim();
  return Object.entries(next).find(([id, row]) => {
    if (!row || typeof row !== "object") return false;
    if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return false;
    if (normalizeMedicationItemKind(row.kind) === "group") return false;
    if (String(row.label || "").trim() !== payload.label) return false;
    const rowParent = String(row.parentId || "").trim();
    if (rowParent === seedParent) return true;
    if (MEDICATION_ITEM_LEAF_SEED_IDS.has(id)) {
      return false;
    }
    return true;
  })?.[0];
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
    const sameNameId = findSameNameLeafIdForSeed(next, payload);
    if (sameNameId) {
      next[sameNameId] = payload;
      return;
    }
    next[seed.id] = payload;
  });

  MEDICATION_ITEM_SEED_RETIRE.forEach((id) => {
    delete next[id];
  });
  Object.entries(next).forEach(([id, row]) => {
    if (!row || typeof row !== "object") return;
    if (MEDICATION_ITEM_GROUP_SEED_IDS.has(id)) return;
    if (MEDICATION_ITEM_LEAF_SEED_IDS.has(id)) return;
    const label = String(row.label || "").trim();
    if (MEDICATION_ITEM_LABEL_RETIRE.includes(label)) {
      delete next[id];
    }
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

// exam-plan-ui 経由の import が壊れないよう検査マスタの最小スタブ
export const EXAM_ITEM_CATEGORIES = [
  { id: "blood", label: "血液" },
  { id: "imaging", label: "画像" },
  { id: "pathology", label: "病理" },
  { id: "other", label: "その他" },
];
export const EXAM_FASTING = { REQUIRED: "required", NONE: "none" };
export function normalizeExamItemCategory(category) {
  return String(category || "").trim() || "blood";
}
export function normalizeExamFasting(value) {
  const v = String(value || "").trim();
  return v === EXAM_FASTING.REQUIRED || v === EXAM_FASTING.NONE ? v : "";
}
export function examFastingLabel() {
  return "";
}
export function subscribeExamItems(cb) {
  cb([]);
  return () => {};
}
export function subscribeExamPlan(karte, cb) {
  cb([]);
  return () => {};
}
export async function addExamItem() {
  return "x";
}
export async function saveExamScheduledPlan() {
  return "p";
}
export async function deleteExamScheduledPlan() {}
export async function endExamScheduledPlan() {}
export async function reviveExamPlanByItem() {
  return "p";
}
export async function addExamHistory() {
  return "h";
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
