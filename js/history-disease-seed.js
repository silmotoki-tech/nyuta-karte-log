// 既往歴・疾患名マスタの階層シード（大分類・中項目・小項目）

function histTopGroupSeed(id, label, order) {
  return { id, label, kind: "group", parentId: "", order };
}

function histMidGroupSeed(id, label, topId, order) {
  return { id, label, kind: "group", parentId: topId, order };
}

function histLeafSeed(id, label, parentId, order) {
  return { id, label, kind: "leaf", parentId, order };
}

function histLeaves(parentId, pairs) {
  return pairs.map(([id, label], i) =>
    histLeafSeed(id, label, parentId, (i + 1) * 10)
  );
}

// 疾患名マスタ 大分類 ID
const D_SKIN = "seed-hist-disease-skin";
const D_EAR = "seed-hist-disease-ear";
const D_EYE = "seed-hist-disease-eye";
const D_GI = "seed-hist-disease-gi";
const D_URO = "seed-hist-disease-kidney"; // 旧「腎臓・泌尿器」→泌尿器
const D_REPRO = "seed-hist-disease-repro";
const D_CARDIO = "seed-hist-disease-cardio";
const D_RESP = "seed-hist-disease-resp";
const D_ENDO = "seed-hist-disease-endo";
const D_NEURO = "seed-hist-disease-neuro";
const D_ORTHO = "seed-hist-disease-ortho";
const D_IMMUNO = "seed-hist-disease-immuno";
const D_ONCO = "seed-hist-disease-onco";
const D_INFECT = "seed-hist-disease-infect";
const D_OTHER = "seed-hist-disease-other";

/** 疾患名マスタ: 大分類・中項目・小項目シード */
const HISTORY_DISEASE_SEED = [
  // 大分類
  histTopGroupSeed(D_SKIN, "皮膚", 10),
  histTopGroupSeed(D_EAR, "耳", 20),
  histTopGroupSeed(D_EYE, "眼", 30),
  histTopGroupSeed(D_GI, "消化器", 40),
  histTopGroupSeed(D_URO, "泌尿器", 50),
  histTopGroupSeed(D_REPRO, "生殖器", 60),
  histTopGroupSeed(D_CARDIO, "循環器", 70),
  histTopGroupSeed(D_RESP, "呼吸器", 80),
  histTopGroupSeed(D_ENDO, "内分泌", 90),
  histTopGroupSeed(D_NEURO, "神経", 100),
  histTopGroupSeed(D_ORTHO, "整形", 110),
  histTopGroupSeed(D_IMMUNO, "血液・免疫", 120),
  histTopGroupSeed(D_ONCO, "腫瘍", 130),
  histTopGroupSeed(D_INFECT, "感染症", 140),
  histTopGroupSeed(D_OTHER, "その他", 150),

  // 皮膚
  histMidGroupSeed("seed-hist-disease-skin-allergy", "アレルギー疾患", D_SKIN, 10),
  ...histLeaves("seed-hist-disease-skin-allergy", [
    ["seed-hist-disease-skin-allergy-atopy", "アトピー性皮膚炎"],
    ["seed-hist-disease-skin-allergy-food", "食物アレルギー"],
    ["seed-hist-disease-skin-allergy-flea", "ノミアレルギー性皮膚炎"],
  ]),
  histMidGroupSeed("seed-hist-disease-skin-infect", "感染性皮膚疾患", D_SKIN, 20),
  ...histLeaves("seed-hist-disease-skin-infect", [
    ["seed-hist-disease-skin-infect-pyoderma", "膿皮症"],
    ["seed-hist-disease-skin-infect-malassezia", "マラセチア皮膚炎"],
    ["seed-hist-disease-skin-infect-dermatophyte", "皮膚糸状菌症"],
  ]),
  histMidGroupSeed("seed-hist-disease-skin-parasite", "外部寄生虫", D_SKIN, 30),
  ...histLeaves("seed-hist-disease-skin-parasite", [
    ["seed-hist-disease-skin-parasite-scabies", "疥癬"],
    ["seed-hist-disease-skin-parasite-demodex", "ニキビダニ症"],
    ["seed-hist-disease-skin-parasite-flea", "ノミ寄生"],
  ]),
  histMidGroupSeed("seed-hist-disease-skin-other", "その他皮膚疾患", D_SKIN, 40),
  ...histLeaves("seed-hist-disease-skin-other", [
    ["seed-hist-disease-skin-other-seborrhea", "脂漏症"],
    ["seed-hist-disease-skin-other-anal", "肛門嚢炎"],
    ["seed-hist-disease-skin-other-alopecia", "断続的な脱毛"],
    ["seed-hist-disease-skin-other-trauma", "表在性外傷・咬傷"],
  ]),

  // 耳（中項目なし）
  ...histLeaves(D_EAR, [
    ["seed-hist-disease-ear-otitis-ext", "外耳炎"],
    ["seed-hist-disease-ear-otitis-media", "中耳炎"],
    ["seed-hist-disease-ear-aural-hematoma", "耳血腫"],
  ]),

  // 眼
  histMidGroupSeed("seed-hist-disease-eye-cornea", "角膜疾患", D_EYE, 10),
  ...histLeaves("seed-hist-disease-eye-cornea", [
    ["seed-hist-disease-eye-cornea-ulcer", "角膜潰瘍"],
    ["seed-hist-disease-eye-cornea-keratitis", "角膜炎"],
  ]),
  histMidGroupSeed("seed-hist-disease-eye-conj", "結膜・涙器", D_EYE, 20),
  ...histLeaves("seed-hist-disease-eye-conj", [
    ["seed-hist-disease-eye-conj-conjunctivitis", "結膜炎"],
    ["seed-hist-disease-eye-conj-epiphora", "流涙症"],
    ["seed-hist-disease-eye-conj-kcs", "乾性角結膜炎（KCS）"],
  ]),
  histMidGroupSeed("seed-hist-disease-eye-intra", "眼内疾患", D_EYE, 30),
  ...histLeaves("seed-hist-disease-eye-intra", [
    ["seed-hist-disease-eye-intra-cataract", "白内障"],
    ["seed-hist-disease-eye-intra-glaucoma", "緑内障"],
    ["seed-hist-disease-eye-intra-uveitis", "ぶどう膜炎"],
  ]),
  histMidGroupSeed("seed-hist-disease-eye-other", "その他", D_EYE, 40),
  ...histLeaves("seed-hist-disease-eye-other", [
    ["seed-hist-disease-eye-other-blepharitis", "眼瞼炎"],
    ["seed-hist-disease-eye-other-cherry", "第三眼瞼腺脱出（チェリーアイ）"],
  ]),

  // 消化器
  histMidGroupSeed("seed-hist-disease-gi-upper", "上部消化管", D_GI, 10),
  ...histLeaves("seed-hist-disease-gi-upper", [
    ["seed-hist-disease-gi-upper-acute-gastritis", "急性胃炎"],
    ["seed-hist-disease-gi-upper-chronic-gastritis", "慢性胃炎"],
    ["seed-hist-disease-gi-upper-gdv", "胃拡張・胃捻転"],
    ["seed-hist-disease-gi-upper-fb", "異物誤飲"],
  ]),
  histMidGroupSeed("seed-hist-disease-gi-lower", "下部消化管", D_GI, 20),
  ...histLeaves("seed-hist-disease-gi-lower", [
    ["seed-hist-disease-gi-lower-acute-enteritis", "急性腸炎"],
    ["seed-hist-disease-gi-lower-ibd", "慢性腸症（IBD）"],
    ["seed-hist-disease-gi-lower-constipation", "便秘・巨大結腸症"],
    ["seed-hist-disease-gi-lower-colitis", "大腸炎"],
  ]),
  histMidGroupSeed("seed-hist-disease-gi-hepato", "肝胆道", D_GI, 30),
  ...histLeaves("seed-hist-disease-gi-hepato", [
    ["seed-hist-disease-gi-hepato-enzyme", "肝酵素上昇"],
    ["seed-hist-disease-gi-hepato-sludge", "胆泥症・胆嚢粘液嚢腫"],
    ["seed-hist-disease-gi-hepato-lipidosis", "肝リピドーシス"],
  ]),
  histMidGroupSeed("seed-hist-disease-gi-pancreas", "膵臓", D_GI, 40),
  ...histLeaves("seed-hist-disease-gi-pancreas", [
    ["seed-hist-disease-gi-pancreas-acute", "急性膵炎"],
    ["seed-hist-disease-gi-pancreas-chronic", "慢性膵炎"],
    ["seed-hist-disease-gi-pancreas-epi", "膵外分泌不全（EPI）"],
  ]),
  histMidGroupSeed("seed-hist-disease-gi-other", "その他", D_GI, 50),
  ...histLeaves("seed-hist-disease-gi-other", [
    ["seed-hist-disease-gi-other-periodontal", "歯周病"],
    ["seed-hist-disease-gi-other-stomatitis", "口内炎"],
    ["seed-hist-disease-gi-other-megaesophagus", "巨大食道症"],
  ]),

  // 泌尿器
  histMidGroupSeed("seed-hist-disease-uro-kidney", "腎臓", D_URO, 10),
  ...histLeaves("seed-hist-disease-uro-kidney", [
    ["seed-hist-disease-uro-kidney-aki", "急性腎障害"],
    ["seed-hist-disease-uro-kidney-ckd", "慢性腎臓病"],
  ]),
  histMidGroupSeed("seed-hist-disease-uro-lower", "下部尿路", D_URO, 20),
  ...histLeaves("seed-hist-disease-uro-lower", [
    ["seed-hist-disease-uro-lower-cystitis", "膀胱炎"],
    ["seed-hist-disease-uro-lower-struvite", "尿石症（ストルバイト）"],
    ["seed-hist-disease-uro-lower-oxalate", "尿石症（シュウ酸カルシウム）"],
    ["seed-hist-disease-uro-lower-fic", "特発性膀胱炎（猫）"],
    ["seed-hist-disease-uro-lower-obstruction", "尿道閉塞"],
  ]),
  histMidGroupSeed("seed-hist-disease-uro-other", "その他", D_URO, 30),
  ...histLeaves("seed-hist-disease-uro-other", [
    ["seed-hist-disease-uro-other-proteinuria", "蛋白尿"],
    ["seed-hist-disease-uro-other-pyelo", "腎盂腎炎"],
  ]),

  // 生殖器
  histMidGroupSeed("seed-hist-disease-repro-female", "雌", D_REPRO, 10),
  ...histLeaves("seed-hist-disease-repro-female", [
    ["seed-hist-disease-repro-female-pyometra", "子宮蓄膿症"],
    ["seed-hist-disease-repro-female-mammary", "乳腺腫瘍"],
    ["seed-hist-disease-repro-female-pseudopreg", "偽妊娠"],
    ["seed-hist-disease-repro-female-dystocia", "難産"],
  ]),
  histMidGroupSeed("seed-hist-disease-repro-male", "雄", D_REPRO, 20),
  ...histLeaves("seed-hist-disease-repro-male", [
    ["seed-hist-disease-repro-male-bph", "前立腺肥大"],
    ["seed-hist-disease-repro-male-cryptorchid", "潜在精巣"],
    ["seed-hist-disease-repro-male-perineal", "会陰ヘルニア"],
  ]),

  // 循環器（中項目なし）
  ...histLeaves(D_CARDIO, [
    ["seed-hist-disease-cardio-mmvd", "僧帽弁閉鎖不全症"],
    ["seed-hist-disease-cardio-hcm", "肥大型心筋症（猫）"],
    ["seed-hist-disease-cardio-dcm", "拡張型心筋症"],
    ["seed-hist-disease-cardio-hf", "心不全"],
    ["seed-hist-disease-cardio-arrhythmia", "不整脈"],
    ["seed-hist-disease-cardio-ph", "肺高血圧症"],
    ["seed-hist-disease-cardio-hw", "フィラリア症"],
  ]),

  // 呼吸器
  histMidGroupSeed("seed-hist-disease-resp-upper", "上部気道", D_RESP, 10),
  ...histLeaves("seed-hist-disease-resp-upper", [
    ["seed-hist-disease-resp-upper-collapse", "気管虚脱"],
    ["seed-hist-disease-resp-upper-rhinitis", "鼻炎"],
    ["seed-hist-disease-resp-upper-bas", "短頭種気道症候群"],
  ]),
  histMidGroupSeed("seed-hist-disease-resp-lower", "下部気道・肺", D_RESP, 20),
  ...histLeaves("seed-hist-disease-resp-lower", [
    ["seed-hist-disease-resp-lower-bronchitis", "気管支炎"],
    ["seed-hist-disease-resp-lower-asthma", "猫喘息"],
    ["seed-hist-disease-resp-lower-pneumonia", "肺炎"],
    ["seed-hist-disease-resp-lower-edema", "肺水腫"],
    ["seed-hist-disease-resp-lower-effusion", "胸水貯留"],
  ]),

  // 内分泌（中項目なし）
  ...histLeaves(D_ENDO, [
    ["seed-hist-disease-endo-hypothyroid", "甲状腺機能低下症（犬）"],
    ["seed-hist-disease-endo-hyperthyroid", "甲状腺機能亢進症（猫）"],
    ["seed-hist-disease-endo-cushing", "副腎皮質機能亢進症（クッシング）"],
    ["seed-hist-disease-endo-addison", "副腎皮質機能低下症（アジソン）"],
    ["seed-hist-disease-endo-dm", "糖尿病"],
  ]),

  // 神経（中項目なし）
  ...histLeaves(D_NEURO, [
    ["seed-hist-disease-neuro-epilepsy", "てんかん・発作"],
    ["seed-hist-disease-neuro-ivdd", "椎間板ヘルニア"],
    ["seed-hist-disease-neuro-vestibular", "前庭疾患"],
    ["seed-hist-disease-neuro-cds", "認知機能不全（高齢性）"],
  ]),

  // 整形（中項目なし）
  ...histLeaves(D_ORTHO, [
    ["seed-hist-disease-ortho-mpl", "膝蓋骨脱臼"],
    ["seed-hist-disease-ortho-ccl", "前十字靭帯断裂"],
    ["seed-hist-disease-ortho-fracture", "骨折"],
    ["seed-hist-disease-ortho-oa", "変形性関節症"],
    ["seed-hist-disease-ortho-hip", "股関節形成不全"],
  ]),

  // 血液・免疫（中項目なし）
  ...histLeaves(D_IMMUNO, [
    ["seed-hist-disease-immuno-imha", "免疫介在性溶血性貧血（IMHA）"],
    ["seed-hist-disease-immuno-itp", "免疫介在性血小板減少症（ITP）"],
    ["seed-hist-disease-immuno-anemia", "貧血（その他）"],
    ["seed-hist-disease-immuno-thrombocytopenia", "血小板減少症"],
  ]),

  // 腫瘍（中項目なし）
  ...histLeaves(D_ONCO, [
    ["seed-hist-disease-onco-skin-benign", "皮膚腫瘤（良性）"],
    ["seed-hist-disease-onco-skin-malignant", "皮膚腫瘍（悪性）"],
    ["seed-hist-disease-onco-lymphoma", "リンパ腫"],
    ["seed-hist-disease-onco-mct", "肥満細胞腫"],
    ["seed-hist-disease-onco-mammary", "乳腺腫瘍"],
    ["seed-hist-disease-onco-spleen", "脾臓腫瘤"],
  ]),

  // 感染症（中項目なし）
  ...histLeaves(D_INFECT, [
    ["seed-hist-disease-infect-fvr", "猫ウイルス性鼻気管炎（FVR）"],
    ["seed-hist-disease-infect-fiv", "猫免疫不全ウイルス感染症（FIV）"],
    ["seed-hist-disease-infect-felv", "猫白血病ウイルス感染症（FeLV）"],
    ["seed-hist-disease-infect-fip", "猫伝染性腹膜炎（FIP）"],
    ["seed-hist-disease-infect-parvo", "パルボウイルス感染症"],
    ["seed-hist-disease-infect-kennel", "ケンネルコフ"],
  ]),

  // その他（中項目なし）
  ...histLeaves(D_OTHER, [
    ["seed-hist-disease-other-obesity", "肥満"],
    ["seed-hist-disease-other-toxicosis", "誤食・中毒"],
    ["seed-hist-disease-other-heatstroke", "熱中症"],
    ["seed-hist-disease-other-trauma", "外傷・交通事故"],
    ["seed-hist-disease-other-vaccine", "ワクチン反応"],
  ]),
];


export { HISTORY_DISEASE_SEED };
export const HISTORY_DISEASE_TOP_SEED = HISTORY_DISEASE_SEED.filter(
  (s) => s.kind === "group" && !s.parentId
);
