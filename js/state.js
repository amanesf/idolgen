// ゲーム全体の状態（永続カレンダー、週送りループ）

import {
  BALANCE,
  SCOUT_STAT_KEYS,
  ATTRIBUTES,
  EVENT_TYPES,
  SONG_NAME_POOL,
  GROWTH_TYPES,
  TASK_TYPES,
  NEGOTIATION_PERSONALITIES,
  OBSERVABLE_SCOUT_PARAMS,
  RANK_THRESHOLDS,
  ORIGIN_ATTRIBUTES,
  SCOUT_LOCATIONS,
  JOB_TYPES,
} from "./masterData.js?v=1785558404241";
import { applySkillInheritance } from "./succession.js?v=1785558404241";
import {
  getStaffEffects,
  getEquipmentEffects,
  cleanlinessRiskMultiplier,
  settleDailyFinances,
  settleMonthlyExpense,
  settleVentures,
  getRosterCapacity,
} from "./office.js?v=1785558404241";
import { updateUnitTensions, removeIdolFromAllUnits } from "./units.js?v=1785558404241";
import { applyTraining } from "./training.js?v=1785558404241";
import { createScoutLead } from "./scoutGenerator.js?v=1785558404241";

// レッスン結果ログ(§UI改修計画④-5)の短縮ラベル。ui.jsのSTAT_LABELS_SHORTを
// 直接importすると循環import(ui.js→state.js)になるため、ここに複製しておく。
const SHORT_STAT_LABELS = { vocal: "ボ", dance: "ダ", talk: "ト", acting: "演", looks: "ル", charm: "愛", mental: "メ" };

function clamp01(value) {
  return Math.max(0, Math.min(100, value));
}

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// 成長タイプ(§ステータス生成バランス再設計)。旧セーブや創業メンバーなど
// growthType未設定のアイドルは"normal"(標準)として扱う。
export function getGrowthType(idol) {
  return GROWTH_TYPES.find((g) => g.id === idol.growthType) ?? GROWTH_TYPES.find((g) => g.id === "normal");
}

// 交渉性格タイプ(§契約交渉に性格を持たせる)。旧セーブなどnegotiationPersonality
// 未設定のアイドルは先頭(堅実型)として扱う。スカウトの口説き交渉
// (closingProgress)と契約更改交渉(contractRenewalView.js)の両方から参照する。
export function getNegotiationPersonality(idol) {
  return NEGOTIATION_PERSONALITIES.find((p) => p.id === idol.negotiationPersonality) ?? NEGOTIATION_PERSONALITIES[0];
}

// ロースターからの完全離脱(解雇・引退・独立・契約満了など)を一箇所に集約する。
// 所属グループ(units.js)の後片付け(メンバー除去・人数割れなら解散)を必ず
// セットで行い、グループにメンバーIDだけが残り続ける不整合を防ぐ。
function removeIdolFromRoster(gameState, idolId) {
  // 永続ランキング(§UI改修計画⑪-2)。人気/曲ランキングは引退・解雇後も
  // 残したいので、ロースターから消す前にスナップショットを退避しておく。
  const idol = gameState.roster.find((i) => i.id === idolId);
  if (idol) {
    gameState.retiredIdolsArchive ??= [];
    gameState.retiredIdolsArchive.push({ ...idol });
  }
  gameState.roster = gameState.roster.filter((i) => i.id !== idolId);
  removeIdolFromAllUnits(gameState, idolId);
}

// 取引先評価(§ボリューム拡張)。未取引(初回)はBALANCE.clientReputation.startを返す。
export function getClientReputation(gameState, stageId) {
  return gameState.clientReputation[stageId] ?? BALANCE.clientReputation.start;
}

// 取引先評価を報酬倍率に変換する(state.js/ui.js共通、表示と実計算でズレないように)。
export function getReputationRewardMultiplier(gameState, stageId) {
  const cfg = BALANCE.clientReputation;
  const reputation = getClientReputation(gameState, stageId);
  const ratio = (reputation - cfg.min) / (cfg.max - cfg.min);
  return cfg.rewardMultiplierAtMin + (cfg.rewardMultiplierAtMax - cfg.rewardMultiplierAtMin) * ratio;
}

function pickRandomAttributeKey(excludeKey) {
  const pool = ATTRIBUTES.filter((a) => a.key !== excludeKey);
  const list = pool.length > 0 ? pool : ATTRIBUTES;
  return list[Math.floor(Math.random() * list.length)].key;
}

// マクロ環境(§11)の新しい era を1つ作る。パラダイムシフト直後は「先行者利益」の
// 追い風(peakMultiplier)を持つが、一定確率でそれが「暗黒期」(antiTrend)になる。
function rollNewEra(previousTrendAttribute) {
  return {
    trendAttribute: pickRandomAttributeKey(previousTrendAttribute),
    antiTrend: Math.random() < BALANCE.macroEra.antiTrendChance,
    daysSinceShift: 0,
  };
}

const SAVE_KEY = "idolgen_save_v1";

// 個人単位のメンタル・人間関係(§4.3、完全隠蔽・変動パラメータ)の初期値。
// ストレス・天狗度・擦り切れ度はいずれも0〜100、所属直後は0から始まる。
function initialMentalStats() {
  return { stress: 0, tenguDo: 0, surikireDo: 0 };
}

export function createGameState() {
  return {
    day: 1, // カレンダー(§永続ループ)の絶対週カウンタ。リセットせず増え続ける
    cash: BALANCE.startingCash,
    fans: 0,
    songCount: BALANCE.repertoire.startingSongCount, // ライブのターン上限になる持ち曲数
    masteredSongCount: BALANCE.repertoire.startingMasteredCount, // うち習熟済みの曲数
    // §創業メンバー0人: 開始時のロースターは空。全員スカウトで迎え入れる。
    roster: [],
    workedToday: false,
    trainedToday: false,
    // 倒産(§8)。月次決算後の時点で現金がマイナスのまま2ヶ月連続になったら
    // bankrupt=trueになる(main.js側がgameOver画面に切り替える)。
    cashNegativeLastMonthEnd: false,
    bankrupt: false,
    history: [], // 週ごとの結果ログ
    // 育成システム用: 所有している施設・トレーナーのID一覧。
    // 施設の購入・トレーナーの雇用UIは§7の社員システムで実装予定だが、
    // カタログ構造(masterData.jsのTRAINING_FACILITIES/TRAINERS)は
    // 先に用意してあるので、ここに追加するだけで反映できる。
    ownedFacilityIds: ["starter_studio"],
    ownedTrainerIds: [],
    // 事務所設備(§ボリューム拡張)。買い切りの備品で、家賃のような継続コストはない。
    ownedEquipmentIds: [],
    // セカンドキャリア(§9.4)。ラストダンス(§9.3)を経て引退したタレントのみが
    // ここに残留し、育成(js/training.js)に恩恵を与える。
    secondCareerCoaches: [],
    // 社員システム(§7)。所有社員IDの一覧(masterData.jsのSTAFF)。
    ownedStaffIds: [],
    // 資金調達(§8)。融資は返済しきるまで日次で自動引き落とされる。
    // タニマチ出資は返済不要な代わりに日々の闇イベントリスクを負う。
    loan: null,
    patronActive: false,
    // 事務所の「裏の顔」蓄積(§11)の簡易指標。100が最も清廉、下がるほど
    // 悪評・談合の確率が上がる(§8の記者会見での選択で増減する)。
    cleanliness: 100,
    // 記者会見(§8)待ち。悪評が発生したターンにセットされ、
    // resolvePressConference()で解決されるまで次の営業日には進めない。
    pendingPressConference: null,
    // 契約更改(§スカウト充実化「1年に1回契約交渉」)待ちのidolId一覧。
    // finalizeContractRenewal()で1件ずつ解決するまで次の営業日には進めない。
    pendingContractRenewals: [],
    // マクロ環境(§11)。数日周期で入れ替わるトレンド(パラダイムシフト)。
    era: rollNewEra(null),
    // グループ結成の闇(§11)。{ id, name, memberIds, tension }の配列。
    units: [],
    // 投資/コンテンツ(§3.2)。進行中のventure({ ventureId, startedOnDay, endsOnDay? })の配列。
    activeVentures: [],
    // 週刊の噂話イベント(§ボリューム拡張)のログ。新しい順、最大randomEvents.logLimit件。
    eventLog: [],
    // 取引先評価(§ボリューム拡張)。stageId -> 0〜100。未登場のstageは
    // getClientReputation()がBALANCE.clientReputation.startを返す。
    clientReputation: {},
    // シングル売上枚数(§UI改修計画⑪-1)。曲タイトル→累計売上枚数。
    // idol個人のrepertoireとは別にgameStateへ持たせることで、引退・解雇後も
    // ランキング上に売上数が残り続ける(§UI改修計画⑪-2)。
    songSales: {},
    // 永続ランキング(§UI改修計画⑪-2)。引退・解雇したアイドルのスナップショット
    // (removeIdolFromRoster参照)。人気/曲ランキングでロースターとマージして使う。
    retiredIdolsArchive: [],
    // レッスン割り当て(§UI改修計画④)。{ idolId: menuId }。週送り(advanceDay)で
    // まとめて適用され、適用後は空に戻る。
    pendingTraining: {},
    // タスク割り当て(§UI改修計画④)。グループ単位/個人単位、週送りで一括実行。
    pendingTasks: { groups: {}, individuals: {} },
    // 編成済みオファー(§UI改修計画⑤)。{ stageId, assignment }の配列。週送り
    // (次の週へ)のタイミングで1件ずつバトル画面へ誘導して手動プレイさせる。
    pendingBattles: [],
    // 投資(VENTURE_TYPES)で解除されたタスク(TASK_TYPES)のid一覧(§UI改修計画⑩-2)。
    unlockedTaskIds: [],
    // oneTime venture(シングルリリース等)を実行済みかどうかの記録。
    oneTimeVenturesUsed: [],
    // スカウト候補プール(§スカウト再設計「登用交渉」)。createScoutLead()で
    // 生成された候補の配列。ホーム画面の地図にピン表示され、週送りごとに
    // tickScoutLeads()で残り週数の消化・ライバル横取り判定・新規湧きを行う。
    scoutLeads: [],
    // 差し入れ・食事・ライブ招待の週次アクション枠(§行動制限による差別化)。
    // { gift: 最後に使った週, meal: ..., invite: ... }。事務所全体で共有される
    // (候補ごとの個別クールダウンではない)。confirmAffinityAction参照。
    affinityActionWeeks: {},
    // 今週すでに出向いた行き先(SCOUT_LOCATIONS.id、公募なら"audition")。
    // 同じ場所(公募なら公募)への複数回の訪問は許すが、違う行き先には
    // その週はもう行けない(§スカウト画面のナビゲーション再設計)。
    // advanceDay()の週送りごとにnullへ戻る。
    scoutedLocationId: null,
  };
}

// スカウトで生成した候補を契約金と引き換えにロースターへ加える。
// salaryType: "fixed"(固定給) | "commission"(歩合制)。雇用時に選び、後から
// 交渉(renegotiateSalary)で変更もできる。事務所の広さ(getRosterCapacity)を
// 超える人数は雇えない(施設を建て替えて広げる必要がある)。
// jobType: §4「希望する仕事」でプレイヤーが選んだ実際の職種(JOB_TYPESのkey)。
// 本人の志望(idol.desiredJobType)との一致/不一致は、口説いている最中の
// 好感度(closingProgress、§スカウト再設計)に反映済みなので、ここでは
// パラメータに一切影響しない。
// idol.salaryBumpRatio/commissionRateOffer(§柔軟な条件交渉)があれば、
// 実際の給与体系にそのまま反映する。
export function hireIdol(gameState, idol, salaryType = "fixed", jobType = "idol") {
  const activeCount = gameState.roster.filter((i) => !i.retired).length;
  if (activeCount >= getRosterCapacity(gameState)) return { success: false, reason: "capacity" };

  gameState.cash -= idol.contractFee ?? 0;
  const cfg = BALANCE.salary;
  const salaryBumpRatio = idol.salaryBumpRatio ?? 0;
  // 雇用時点の開示度(unresolvedStatCount)で基準額を確定する(=お試しで
  // 観測しないまま雇うと割増込みの給料のまま固定される。雇用後は無条件で
  // 全部見えるようになるが、給料は雇用時点の開示度で既に決まっている)。
  const monthlySalary =
    salaryType === "fixed" ? Math.round(getBaseSalary(idol, unresolvedStatCount(idol)) * (1 + salaryBumpRatio)) : null;
  const commissionRate = salaryType === "commission" ? idol.commissionRateOffer ?? cfg.commissionRate : null;

  gameState.roster.push({
    ...idol,
    retired: false,
    lastDance: false,
    ...initialMentalStats(),
    salaryType,
    monthlySalary,
    commissionRate,
    fans: idol.fans ?? 0,
    repertoire: idol.repertoire ?? [],
    jobType,
    interest: idol.interest ?? 50,
    contractStartDay: gameState.day, // 契約更改(§スカウト充実化「1年に1回契約交渉」)の起算日
  });
  return { success: true };
}

// 候補プール制(§スカウト再設計「登用交渉」)。単発ガチャの代わりに、
// 候補は複数人が同時にプールされ(gameState.scoutLeads)、ホーム画面の
// 地図にピン表示される。以下は候補プールの週次更新・口説きアクション・
// 雇用判定を担う。

// 週送り(advanceDay)から呼ばれる。残り週数の消化・ライバル横取り判定・
// スタッフによる好感度の自動加算・新規候補の湧きを行う。
export function tickScoutLeads(gameState) {
  const cfg = BALANCE.scouting.leads;

  gameState.scoutLeads = (gameState.scoutLeads ?? []).filter((lead) => {
    lead.remainingWeeks -= 1;
    if (lead.remainingWeeks <= 0) return false; // 期限切れで消滅

    const poachChance = cfg.rivalPoachChanceBase * (lead.rivalInterest ? cfg.rivalPoachChanceRivalFlagMult : 1);
    if (Math.random() < poachChance) return false; // 他事務所に横取りされた

    return true;
  });

  // スタッフ(category:"scout")を雇っている人数分、生存中の全候補へ
  // 好感度を自動加算する(誰を担当につけるかは選ばせない簡易版)。
  const scoutStaffCount = getStaffEffects(gameState, "scout").length;
  if (scoutStaffCount > 0) {
    for (const lead of gameState.scoutLeads) {
      lead.affinity = Math.min(100, lead.affinity + cfg.actions.staffAffinityPerWeek * scoutStaffCount);
    }
  }

  if (gameState.scoutLeads.length < cfg.maxPoolSize && Math.random() < cfg.spawnChancePerWeek) {
    gameState.scoutLeads.push(createScoutLead({ gameState }));
  }
}

// 「口説き切れているか」の判定。好感度(baseAffinity=やる気interest+差し入れ等の
// 積み上げaffinity)とお金(moneyScore、給与体系の標準からの寛大さ/悪さ)、
// 志望職種との一致/不一致(jobMatchScore)を資質グレードごとの必要値
// (requiredClosingByGrade)と突き合わせる純粋関数。
// affinityMaxShareByGradeにより、資質が高いほど好感度側(やる気+積み上げ)だけでは
// 賄いきれない割合が大きくなる(お金には上限を設けない)。moneyScore/jobMatchScoreは
// 現在の設定から毎回計算し直す(蓄積させない=何度切り替えても稼げない)。
// §契約交渉に性格を持たせる: 交渉性格タイプ(NEGOTIATION_PERSONALITIES)ごとに
// お金・積み上げ好感度・役割一致それぞれへの反応の強さが異なる。「金では
// 落ちない」候補(人情家型・役割重視型)や、逆に放っておいても口説きやすい
// 候補(熱望型のclosingBonus)が生まれる。
export function closingProgress(lead) {
  const cfg = BALANCE.scouting.leads;
  const personality = getNegotiationPersonality(lead);
  const required = cfg.requiredClosingByGrade[lead.qualityGrade] ?? cfg.requiredClosingByGrade.C;
  const affinityShareCap = cfg.affinityMaxShareByGrade[lead.qualityGrade] ?? 1;
  // §好感度のやる気ベース化: やる気(interest)を土台に、差し入れ・ライブ招待・
  // スタッフ効果による積み上げ(affinity)を性格タイプの反応の強さ(affinityWeight)
  // で重み付けして足したものが好感度側の値になる(やる気そのものは性格と無関係)。
  const baseAffinity = (lead.interest ?? 50) + lead.affinity * personality.affinityWeight;
  const effectiveAffinity = Math.min(baseAffinity, required * affinityShareCap);

  // §柔軟な条件交渉: 標準(feeOfferAmount=0円、salaryBumpRatio=0、
  // commissionRateOffer=標準歩合率)からの差分を、性格タイプごとのmoneyWeightsで
  // 重み付けしてスコア化する。標準より悪い条件(値切り・歩合率の上乗せ)を
  // 提示すると符号が反転してマイナスになる。契約金は§契約金は基本ゼロスタートに
  // より言い値が常に0円なので、feeOfferAmount(実額円)はプレイヤーが任意で
  // 積む「ゴリ押し」分のみを表す(標準より悪い=値切る、という概念はない)。
  const moneyCfg = cfg.moneyScore;
  const moneyScore =
    (lead.salaryType === "commission"
      ? (BALANCE.salary.commissionRate - (lead.commissionRateOffer ?? BALANCE.salary.commissionRate)) *
        moneyCfg.commissionGenerosityToScoreScale *
        personality.moneyWeights.commissionGenerosity
      : (lead.salaryBumpRatio ?? 0) * moneyCfg.salaryBumpToScoreScale * personality.moneyWeights.salaryBump) +
    (lead.feeOfferAmount ?? 0) * moneyCfg.feeOfferToScoreScale * personality.moneyWeights.feeTopUp;

  // §スカウト再設計: 何としてデビューさせるか(jobType)が本人の志望
  // (desiredJobType)と一致/不一致かは、契約時のやる気ではなく口説き具合に反映する。
  // 役割重視型はjobMatchWeightが高く、一致/不一致の影響がより大きくなる。
  const jobMatchScore =
    lead.desiredJobType == null
      ? 0
      : lead.jobType === lead.desiredJobType
        ? cfg.jobMatchBonus * personality.jobMatchWeight
        : -cfg.jobMismatchPenalty * personality.jobMatchWeight;

  const total = effectiveAffinity + moneyScore + jobMatchScore + (personality.closingBonus ?? 0);
  return { required, effectiveAffinity, moneyScore, jobMatchScore, personality, total, canHire: total >= required };
}

// 差し入れ・食事・ライブ招待(§行動制限による差別化)。money系スライダーは
// いくらでも積める代わりに、こちらは事務所全体で共有の週次アクション枠
// (種類ごとに週1回まで、gameState.affinityActionWeeks[action]=最後に使った週)。
// 候補ごとの個別クールダウンではなく、事務所全体で「誰に使うか」を選ぶ
// 資源にすることで、money系とは異なる駆け引きを生む。いきなり実行せず、まず
// selectAffinityAction()で選択させ(この時点ではお金は減らない)、
// confirmAffinityAction()(決定ボタン)を押して初めてお金を払い好感度が増える。
const AFFINITY_ACTIONS = {
  gift: (cfg) => cfg.actions.gift,
  meal: (cfg) => cfg.actions.meal,
  invite: (cfg) => cfg.actions.liveInvite,
};

export function selectAffinityAction(gameState, leadId, action) {
  const lead = gameState.scoutLeads.find((l) => l.id === leadId);
  if (!lead) return;
  lead.pendingAffinityAction = lead.pendingAffinityAction === action ? null : action;
}

export function confirmAffinityAction(gameState, leadId) {
  const lead = gameState.scoutLeads.find((l) => l.id === leadId);
  if (!lead || !lead.pendingAffinityAction) return { success: false, reason: "none" };
  const action = lead.pendingAffinityAction;
  const actionCfg = AFFINITY_ACTIONS[action](BALANCE.scouting.leads);
  gameState.affinityActionWeeks ??= {};
  const lastWeek = gameState.affinityActionWeeks[action];

  if (lastWeek != null && gameState.day - lastWeek < actionCfg.cooldownWeeks) {
    lead.pendingAffinityAction = null;
    return { success: false, reason: "cooldown" };
  }
  if (gameState.cash < actionCfg.cost) {
    lead.pendingAffinityAction = null;
    return { success: false, reason: "cash" };
  }
  gameState.cash -= actionCfg.cost;
  lead.affinity = Math.min(100, lead.affinity + actionCfg.affinityGain);
  gameState.affinityActionWeeks[action] = gameState.day;
  lead.pendingAffinityAction = null;
  return { success: true };
}

// お試しステージ(§スカウトに賭けと発見を持たせる)。契約前の候補は
// OBSERVABLE_SCOUT_PARAMS(7ステータス+成長度)が伏せられており、性格タイプ・
// 属性・年齢・経歴・志望職種だけが常に見える。観測したい項目は選択数の
// 上限なく好きなだけ選んで1回のお試しで全部観測できる(costPerItem×項目数の
// 実額を払う)。観測係は臨時で雇った外部の低レベルコーチなので、目利き自体に
// 上限がある(BALANCE.scouting.trial.judgeRankCeiling)。7ステータスは、この上限
// ランク自身の下限値未満(=judgeRankCeilingより明確に格下)なら正確な数値が
// 分かる(コーチより格下の実力は具体的に見抜ける)が、下限値以上(=judgeRankCeiling
// と同格以上)は「◯以上」というランク表現しか分からない(revealedFloorsに
// そのランクの下限値を記録し、revealedParamsには含めない=数値未確定のまま。
// コーチと同格以上かそれ以上かの区別はコーチ自身にもつかない)。
// 成長度はランクの概念ではないので、観測すればそのまま正確に分かる。
// 資質グレード(qualityGrade/subQualityGrade)は直接の観測枠を持たず、
// 元になる7ステータスが個別に全部観測済みになった時点で自動的に開示される
// (getParamRevealState参照)。

// judgeRankCeiling(RANK_THRESHOLDSの文字ランク)自身の下限値を、正確に観測
// できる実力の上限値として返す。
export function getJudgeThreshold(rankCeiling) {
  return RANK_THRESHOLDS.find((r) => r.label === rankCeiling)?.min ?? Infinity;
}

// お試しステージ1項目あたりの単価(§スタッフ・設備のtrialCostMultiplierで割引)。
export function getTrialCostPerItem(gameState) {
  const cfg = BALANCE.scouting.trial;
  const staffMult = getStaffEffects(gameState, "scout").reduce((mult, e) => mult * (e.trialCostMultiplier ?? 1), 1);
  const equipmentMult = getEquipmentEffects(gameState).reduce((mult, e) => mult * (e.trialCostMultiplier ?? 1), 1);
  return Math.round(cfg.costPerItem * staffMult * equipmentMult);
}

// 観測対象の選択(お試し実行前のトグル)。選択数の上限はない。
export function selectObservationParam(gameState, leadId, param) {
  const lead = gameState.scoutLeads.find((l) => l.id === leadId);
  if (!lead) return;
  lead.pendingObservationParams ??= [];
  if (lead.pendingObservationParams.includes(param)) {
    lead.pendingObservationParams = lead.pendingObservationParams.filter((p) => p !== param);
    return;
  }
  lead.pendingObservationParams = [...lead.pendingObservationParams, param];
}

// お試しステージを実行する。pendingObservationParamsで選んだ項目を観測し、
// 費用(1項目あたりgetTrialCostPerItem()の実額×項目数)を払う。何度でもやり直せる
// (お金を払えば追加で別の項目を観測しに行ける)。
export function runTrialPerformance(gameState, leadId) {
  const lead = gameState.scoutLeads.find((l) => l.id === leadId);
  if (!lead) return { success: false, reason: "gone" };
  const params = lead.pendingObservationParams ?? [];
  if (params.length === 0) return { success: false, reason: "none" };
  const cfg = BALANCE.scouting.trial;
  const totalCost = getTrialCostPerItem(gameState) * params.length;
  if (gameState.cash < totalCost) return { success: false, reason: "cash" };

  gameState.cash -= totalCost;
  const judgeThreshold = getJudgeThreshold(cfg.judgeRankCeiling);
  lead.revealedParams ??= [];
  lead.revealedFloors ??= {};

  for (const param of params) {
    if (SCOUT_STAT_KEYS.includes(param) && lead.stats[param] >= judgeThreshold) {
      // 臨時コーチと同格以上の実力。「◯以上」というランク表現しか分からない。
      lead.revealedFloors[param] = Math.max(lead.revealedFloors[param] ?? 0, judgeThreshold);
    } else if (!lead.revealedParams.includes(param)) {
      lead.revealedParams = [...lead.revealedParams, param];
    }
  }
  lead.pendingObservationParams = [];
  return { success: true, revealed: params };
}

// 総合評価(qualityGrade=主評価/subQualityGrade=サブ評価)は直接観測する枠を
// 持たない(§お試しステージから総合評価は選択できないように)。元になる
// 7ステータスがそれぞれ全部観測済みになった時点で自動的に開示扱いにする
// (主評価=志望職種の関連4ステータス、サブ評価=残り3ステータス)。
function qualityGradeRevealState(lead, param) {
  const relevantStats = JOB_TYPES.find((j) => j.key === lead.desiredJobType)?.relevantStats ?? SCOUT_STAT_KEYS;
  const keys = param === "qualityGrade" ? relevantStats : SCOUT_STAT_KEYS.filter((key) => !relevantStats.includes(key));
  return keys.every((key) => lead.revealedParams?.includes(key)) ? "revealed" : "hidden";
}

// UI向け: 指定パラメータがそのlead(スカウト候補)で観測済みかどうか、
// あるいは下限だけ分かっている状態かを判定する。契約済みタレント(statsReveal
// のようなフィールドを持たない)には常にnullを返し、呼び出し側は「無条件で
// 全部見せる」既存の分岐なし表示のままにする。
export function getParamRevealState(lead, param) {
  if (!lead || !Array.isArray(lead.revealedParams)) return null;
  if (param === "qualityGrade" || param === "subQualityGrade") return qualityGradeRevealState(lead, param);
  if (lead.revealedParams.includes(param)) return "revealed";
  if (lead.revealedFloors?.[param] != null) return "floor";
  return "hidden";
}

// 7ステータス中、正確な数値がまだ判明していない項目数(§給料は経歴・場所・
// 年齢・開示度で決める)。「D以上」止まりの曖昧な項目も、そもそも未観測の
// 項目も同じ「未解決」として扱う(getBaseSalaryの不確実性割増に使う)。
export function unresolvedStatCount(lead) {
  return SCOUT_STAT_KEYS.filter((key) => getParamRevealState(lead, key) !== "revealed").length;
}

// 固定給の基準額(§給料は経歴・場所・年齢・開示度で決める、相談の結果を
// そのまま反映)。実力(ランク)そのものは一切参照しない。年齢・経歴・場所
// という常に見えている情報の足し算に、観測できていない項目数ぶんの
// 不確実性割増(unresolvedCount)を乗せるだけにする(=値踏みしない)。
// unresolvedCountは呼び出し側が渡す: スカウト候補ならunresolvedStatCount()、
// 雇用済みタレントは常に0(お試しステージ後は無条件で全部見えているため)。
export function getBaseSalary(entity, unresolvedCount = 0) {
  const cfg = BALANCE.salary;
  const origin = ORIGIN_ATTRIBUTES.find((o) => o.key === entity.origin);
  const originBonus = cfg.originTierBonusYen[(origin?.salaryTier ?? 1) - 1] ?? 0;
  const location = SCOUT_LOCATIONS.find((l) => l.id === entity.locationId);
  const locationBonus = (location?.rankShift ?? 0) * cfg.locationBonusPerShiftYen;
  const attribute = ATTRIBUTES.find((a) => a.key === entity.attribute);
  const attributeBonus = cfg.originTierBonusYen[(attribute?.rarity ?? 1) - 1] ?? 0;
  const ageBase = (entity.age ?? 0) * cfg.ageYen;
  const penalty = unresolvedCount * cfg.unresolvedPenaltyYen;
  return Math.round(ageBase + originBonus + locationBonus + attributeBonus + penalty);
}

// お金側の条件(契約金のゴリ押し・固定給の上乗せ・歩合率の譲歩)を変更する。
// closingProgress()が次回呼ばれたときに反映される(値を保存するだけの薄い関数)。
// §柔軟な条件交渉: スライダーで標準より悪い条件(歩合率の上乗せ)も選べるよう、
// moneyOfferRangeの範囲内でクランプするだけにとどめ、0未満を切り捨てない。
function clampToRange(value, range) {
  return Math.min(range.max, Math.max(range.min, value));
}

export function setLeadMoneyOffer(
  gameState,
  leadId,
  { salaryType, feeOfferAmount, salaryBumpRatio, commissionRateOffer } = {}
) {
  const lead = gameState.scoutLeads.find((l) => l.id === leadId);
  if (!lead) return;
  const range = BALANCE.scouting.leads.moneyOfferRange;
  if (salaryType != null) lead.salaryType = salaryType;
  if (feeOfferAmount != null) lead.feeOfferAmount = clampToRange(feeOfferAmount, range.feeOfferAmount);
  if (salaryBumpRatio != null) lead.salaryBumpRatio = clampToRange(salaryBumpRatio, range.salaryBumpRatio);
  if (commissionRateOffer != null) lead.commissionRateOffer = clampToRange(commissionRateOffer, range.commissionRateOffer);
}

// 「何としてデビューさせるか」(JOB_TYPES)を変更する。本人の志望
// (lead.desiredJobType)と食い違うと契約時のやる気にペナルティが乗る
// (hireIdol側の判定)。初期値は志望と一致させてあるので、変えなければ
// ペナルティは発生しない。
export function setLeadJobType(gameState, leadId, jobType) {
  const lead = gameState.scoutLeads.find((l) => l.id === leadId);
  if (lead) lead.jobType = jobType;
}

let hiredLeadIdCounter = 0;

// 口説き切れた候補を実際にロースターへ迎え入れる。既存のhireIdol()に、
// feeOfferAmount(ゴリ押しで積んだ実額)を契約金として委譲する(給与体系・
// 在籍枠上限などの判定はhireIdol側にすべて任せる)。契約金は本来0円だが
// (§契約金は基本ゼロスタート)、スタッフ・設備のfeeOfferDiscountMultiplier
// (交渉巧者/来客応接ラウンジ)があれば、同じ提示額でも実際の支払いは割引く。
export function hireLeadCandidate(gameState, leadId) {
  const lead = gameState.scoutLeads.find((l) => l.id === leadId);
  if (!lead) return { success: false, reason: "gone" };
  if (!closingProgress(lead).canHire) return { success: false, reason: "not_closed" };

  hiredLeadIdCounter += 1;
  const feeDiscountMultiplier =
    getStaffEffects(gameState, "scout").reduce((mult, e) => mult * (e.feeOfferDiscountMultiplier ?? 1), 1) *
    getEquipmentEffects(gameState).reduce((mult, e) => mult * (e.feeOfferDiscountMultiplier ?? 1), 1);
  const effectiveFee = Math.round((lead.feeOfferAmount ?? 0) * feeDiscountMultiplier);
  const result = hireIdol(
    gameState,
    { ...lead, id: `scouted_${Date.now()}_${hiredLeadIdCounter}`, contractFee: effectiveFee },
    lead.salaryType,
    lead.jobType ?? "idol"
  );
  if (result.success) {
    gameState.scoutLeads = gameState.scoutLeads.filter((l) => l.id !== leadId);
  }
  return result;
}

// 給与体系の交渉(§スカウト再設計)。固定給↔歩合制を切り替える。
// 成功確率はBALANCE.salary.renegotiateSuccessChance。失敗しても現状維持のみ
// (ペナルティはない)。
export function renegotiateSalary(gameState, idolId, newSalaryType) {
  const idol = gameState.roster.find((i) => i.id === idolId);
  if (!idol || idol.salaryType === newSalaryType) return { success: false };
  if (Math.random() >= BALANCE.salary.renegotiateSuccessChance) return { success: false };
  const cfg = BALANCE.salary;
  idol.salaryType = newSalaryType;
  idol.monthlySalary = newSalaryType === "fixed" ? getBaseSalary(idol, 0) : null;
  idol.commissionRate = newSalaryType === "commission" ? cfg.commissionRate : null;
  return { success: true };
}

// 解雇(§ボリューム拡張)。即座にロースターから除籍する(引退や休養と違い、
// 円満な形ではないためファンをわずかに失う)。
export function fireIdol(gameState, idolId) {
  const idol = gameState.roster.find((i) => i.id === idolId);
  if (!idol) return { success: false };
  removeIdolFromRoster(gameState, idolId);
  gameState.fans = Math.max(0, gameState.fans - BALANCE.firing.fansPenalty);
  return { success: true, name: idol.name };
}

// タスク「新曲制作」(§タレント関連)。個人 or グループ(unit)へ割り当てる。
// 完成した曲は割当先全員のrepertoireに追加され、事務所全体の持ち曲数
// (songCount、ライブのターン上限)も1曲分伸びる(習熟済みには数えない)。
export function assignNewSongTask(gameState, targetIdolIds) {
  if (!targetIdolIds || targetIdolIds.length === 0) return { success: false, reason: "no-target" };
  if (gameState.cash < BALANCE.task.newSongCost) return { success: false, reason: "cash" };

  gameState.cash -= BALANCE.task.newSongCost;
  const used = new Set(gameState.roster.flatMap((idol) => idol.repertoire ?? []));
  const pool = SONG_NAME_POOL.filter((title) => !used.has(title));
  const candidates = pool.length > 0 ? pool : SONG_NAME_POOL;
  const title = candidates[Math.floor(Math.random() * candidates.length)];

  for (const idolId of targetIdolIds) {
    const idol = gameState.roster.find((i) => i.id === idolId);
    if (idol) idol.repertoire = [...(idol.repertoire ?? []), title];
  }
  gameState.songCount += 1;
  return { success: true, title, targetNames: targetIdolIds.map((id) => gameState.roster.find((i) => i.id === id)?.name).filter(Boolean) };
}

// タスク「MV撮影」(§UI改修計画④・⑩-2、投資「シングルリリース」で解禁)。
// 対象タレント全員に均等にファンを配る、新曲制作とは別系統の効果を持つタスク。
function assignMvShootTask(gameState, targetIdolIds) {
  if (!targetIdolIds || targetIdolIds.length === 0) return { success: false, reason: "no-target" };
  if (gameState.cash < BALANCE.task.mvShootCost) return { success: false, reason: "cash" };

  gameState.cash -= BALANCE.task.mvShootCost;
  const share = Math.floor(BALANCE.task.mvShootFansGain / targetIdolIds.length);
  const targetNames = [];
  for (const idolId of targetIdolIds) {
    const idol = gameState.roster.find((i) => i.id === idolId);
    if (!idol) continue;
    idol.fans = (idol.fans ?? 0) + share;
    targetNames.push(idol.name);
  }
  gameState.fans += share * targetIdolIds.length;
  return { success: true, targetNames };
}

// タスク実行の共通入口(§UI改修計画④)。taskTypeIdに応じて実処理へ振り分ける。
function applyTaskAssignment(gameState, taskTypeId, targetIdolIds) {
  if (taskTypeId === "mv_shoot") return assignMvShootTask(gameState, targetIdolIds);
  return assignNewSongTask(gameState, targetIdolIds);
}

// タスクの週送り時自動実行(§UI改修計画④-3)。gameState.pendingTasksを消化する。
// 実行順序: グループ単位の割り当てが先(メンバー全員をカバー)、その後で
// グループに含まれない/グループ側で未指定だった個人単位の割り当てを処理する。
function applyPendingTasks(gameState) {
  const pending = gameState.pendingTasks ?? { groups: {}, individuals: {} };
  const resultLog = [];
  const coveredIdolIds = new Set();

  for (const [unitId, taskTypeId] of Object.entries(pending.groups ?? {})) {
    if (!taskTypeId) continue;
    const unit = gameState.units.find((u) => u.id === unitId);
    if (!unit) continue;
    const result = applyTaskAssignment(gameState, taskTypeId, unit.memberIds);
    unit.memberIds.forEach((id) => coveredIdolIds.add(id));
    if (result.success) {
      const taskLabel = TASK_TYPES.find((t) => t.id === taskTypeId)?.label ?? taskTypeId;
      resultLog.push(`${unit.name}(${taskLabel}${result.title ? `:${result.title}` : ""})`);
    }
  }

  for (const [idolId, taskTypeId] of Object.entries(pending.individuals ?? {})) {
    if (!taskTypeId || coveredIdolIds.has(idolId)) continue;
    const result = applyTaskAssignment(gameState, taskTypeId, [idolId]);
    if (result.success) {
      const taskLabel = TASK_TYPES.find((t) => t.id === taskTypeId)?.label ?? taskTypeId;
      const idol = gameState.roster.find((i) => i.id === idolId);
      resultLog.push(`${idol?.name ?? "?"}(${taskLabel}${result.title ? `:${result.title}` : ""})`);
    }
  }

  gameState.pendingTasks = { groups: {}, individuals: {} };
  if (resultLog.length === 0) return;
  gameState.eventLog.unshift({ day: gameState.day, kind: "plus", label: "タスク完了", description: resultLog.join("・") });
  gameState.eventLog = gameState.eventLog.slice(0, BALANCE.randomEvents.logLimit);
}

// 引退宣言(§9.3)。次に出演するステージがそのアイドルの「ラストダンス」に
// なる(スタミナ消費ゼロ・全盛期を超える限界突破ステータス、被弾もしない)。
// 結果に関わらず、そのステージ終了後にロースターを卒業しセカンドキャリアへ進む。
export function declareLastDance(gameState, idolId) {
  const idol = gameState.roster.find((i) => i.id === idolId);
  if (idol) idol.lastDance = true;
  return gameState;
}

// localStorageへ現在の状態を保存する。エクスポート/インポートはexportSaveJson/
// parseSaveJson(本ファイル下部)を使う。
export function saveGameState(gameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
  } catch (err) {
    console.warn("セーブに失敗しました", err);
  }
}

// 保存済みの状態を読み込む。存在しない・壊れている場合はnullを返す
// (呼び出し側でcreateGameState()にフォールバックする)。
export function loadGameState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("セーブデータの読み込みに失敗しました", err);
    return null;
  }
}

export function clearSavedGameState() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.warn("セーブデータの削除に失敗しました", err);
  }
}

export function applyBattleResult(gameState, battleState) {
  const stage = battleState.stage;
  const clientConf = BALANCE.clientTiers[stage.clientTier] || BALANCE.clientTiers.clean;
  // 取引先評価(§ボリューム拡張): このステージ固有の評価(0〜100)を報酬倍率に反映する。
  // 評価自体はこの関数の最後、結果が確定してから更新する(今回の結果は含めない)。
  const repCfg = BALANCE.clientReputation;
  const reputationBefore = getClientReputation(gameState, stage.id);
  const reputationMultiplier = getReputationRewardMultiplier(gameState, stage.id);
  // クライアント格付け(§6.2)の報酬倍率を効かせたベース報酬。以降の按分計算は
  // すべてこの値を基準にする(グレー案件は高単価、その分§6.2の高難度と釣り合う)。
  const baseRewardCash = Math.round(stage.rewardCash * clientConf.rewardMultiplier * reputationMultiplier);
  const baseRewardFans = Math.round(stage.rewardFans * clientConf.rewardMultiplier * reputationMultiplier);
  const targetScore = battleState.targetScore ?? stage.targetScore;

  // 陣形を通じたスキル継承(§9.2): ロースターから外す前に、最終配置を見て判定する
  const inheritanceEvents = applySkillInheritance(gameState, battleState);

  // グループ結成の闇(§11): センター格差によるギスギス度更新・強制解散判定
  const unitResult = updateUnitTensions(gameState, battleState);

  // 力尽き休養(§burnout): スタミナ切れで強制退場したメンバーは、即座の永久引退
  // ではなく段階的な休養にする。1回目は1ヶ月、2回目は3ヶ月休養(その間は編成・
  // 育成の対象から外れるが、ロースターには残る)。3回目でついに永久引退する。
  const restedMembers = [];
  const permanentRetirements = [];
  for (const performer of battleState.performers) {
    if (!performer.retired) continue;
    const idol = gameState.roster.find((i) => i.id === performer.id);
    if (!idol) continue;
    const cfg = BALANCE.burnout;
    idol.burnoutCount = (idol.burnoutCount ?? 0) + 1;
    if (idol.burnoutCount >= cfg.retireAtCount) {
      removeIdolFromRoster(gameState, performer.id);
      permanentRetirements.push(idol.name);
    } else {
      const restWeeks = cfg.restWeeksByCount[idol.burnoutCount] ?? 4;
      idol.resting = true;
      idol.restUntilDay = gameState.day + restWeeks;
      restedMembers.push({ name: idol.name, weeks: restWeeks, count: idol.burnoutCount });
    }
  }

  // ラストダンス(§9.3): 結果に関わらず、有終の美を飾ったらロースターを卒業し
  // セカンドキャリア(コーチ枠、§9.4)へ進む。強制引退した場合はここに来ない
  // (既にretired扱いで上のループで除籍済み、かつスタミナ消費ゼロなので通常発生しない)。
  const graduates = [];
  for (const performer of battleState.performers) {
    if (performer.retired) continue;
    const idol = gameState.roster.find((i) => i.id === performer.id);
    if (!idol?.lastDance) continue;
    removeIdolFromRoster(gameState, idol.id);
    gameState.secondCareerCoaches.push({
      id: idol.id,
      name: idol.name,
      stageName: idol.stageName,
      attribute: idol.attribute,
      attributeLabel: idol.attributeLabel,
      talent: idol.talent ?? null,
    });
    graduates.push(idol.name);
  }

  // 個人単位のメンタル(§4.3、完全隠蔽): 出演した(生存した)メンバーはストレス・
  // 擦り切れ度が現場経験として蓄積する。天狗度はこの後のファン按分の箇所で
  // 人気の伸びに応じて別途加算する。
  for (const performer of battleState.performers) {
    if (performer.retired) continue;
    const idol = gameState.roster.find((i) => i.id === performer.id);
    if (!idol || idol.lastDance) continue;
    const mCfg = BALANCE.mentalStats;
    idol.stress = Math.min(100, (idol.stress ?? 0) + mCfg.stressPerBattle);
    idol.surikireDo = Math.min(100, (idol.surikireDo ?? 0) + mCfg.surikirePerBattle);
  }

  let outcome = {
    type: battleState.result,
    cashDelta: 0,
    fansDelta: 0,
    inheritanceEvents,
    graduates,
    restedMembers,
    permanentRetirements,
    dissolvedUnits: unitResult.dissolved,
  };

  // 社員(§7)・cleanliness(§11)による補正係数。
  const promoterFansGainMult = getStaffEffects(gameState, "promoter").reduce(
    (mult, e) => mult * (e.fansGainMultiplier ?? 1),
    1
  );
  const promoterScandalPenaltyMult = getStaffEffects(gameState, "promoter").reduce(
    (mult, e) => mult * (e.scandalPenaltyMultiplier ?? 1),
    1
  );
  const managerScandalMult =
    getStaffEffects(gameState, "manager").reduce((mult, e) => mult * (e.scandalChanceMultiplier ?? 1), 1) *
    getEquipmentEffects(gameState).reduce((mult, e) => mult * (e.scandalChanceMultiplier ?? 1), 1);
  const riskMult = cleanlinessRiskMultiplier(gameState);

  // 特能「人気者」: 出演していた(引退しなかった)人数分だけファンの伸びが上乗せされる
  const crowdFavoriteCount = battleState.performers.filter((p) => !p.retired && p.talent === "crowd_favorite").length;
  const crowdFavoriteMult = 1 + crowdFavoriteCount * BALANCE.talentEffects.crowd_favorite.fansGainBonusPerHolder;

  if (battleState.result === "success") {
    outcome.cashDelta = baseRewardCash;
    outcome.fansDelta = Math.round(baseRewardFans * promoterFansGainMult * crowdFavoriteMult);
    if (battleState.isBarter) {
      // バーター営業(§6.2): 実力不足を知名度で押し切った分、ファンの伸びが上乗せされる
      outcome.fansDelta += BALANCE.barter.bonusFans;
    }
    if (unitResult.performedUnitIds.length > 0) {
      // グループ結成の闇(§11): 共演したユニット数に応じてファンの伸びが上乗せされる
      outcome.fansDelta = Math.round(
        outcome.fansDelta * (1 + BALANCE.groups.fanBonusPercent * unitResult.performedUnitIds.length)
      );
    }
    // ストレス限界(§4.3「限界を超えるとスキャンダル確率が上昇」): 出演メンバーの
    // 平均ストレスが閾値を超えていると、スキャンダル発生率がさらに悪化する。
    const survivingPerformers = battleState.performers.filter((p) => !p.retired);
    const avgStress =
      survivingPerformers.length > 0
        ? survivingPerformers.reduce((sum, p) => {
            const idol = gameState.roster.find((i) => i.id === p.id);
            return sum + (idol?.stress ?? 0);
          }, 0) / survivingPerformers.length
        : 0;
    const stressScandalMult =
      avgStress >= BALANCE.mentalStats.stressScandalThreshold ? BALANCE.mentalStats.stressScandalRiskMultiplier : 1;
    const effectiveScandalChance = clientConf.scandalChance * managerScandalMult * riskMult * stressScandalMult;
    if (effectiveScandalChance > 0 && Math.random() < effectiveScandalChance) {
      // グレー案件は成功しても一定確率で悪評が立つ。実際のファン減少幅は
      // 記者会見(§8、resolvePressConference)でのプレイヤーの選択で決まるため、
      // ここでは即座には引かず「保留」にする。
      outcome.scandal = true;
      gameState.pendingPressConference = {
        day: gameState.day,
        stageName: stage.name,
        basePenalty: Math.round(clientConf.scandalFansPenalty * promoterScandalPenaltyMult),
      };
    }
    if (stage.isMilestone && Math.random() < BALANCE.milestone.collusionChance * riskMult) {
      // 業界の談合・大人の事情(§10): 実力で勝っても大手事務所の政治力で
      // アワードを理不尽に奪われ、ファンの伸びが大きく目減りする
      outcome.fansDelta = Math.round(outcome.fansDelta * BALANCE.milestone.collusionFansMultiplier);
      outcome.collusion = true;
    }
  } else if (battleState.result === "retreat") {
    // 自分の判断で切り上げた場合は違約金つき
    const ratio = Math.min(1, battleState.score / targetScore);
    outcome.cashDelta = Math.round(baseRewardCash * ratio) - BALANCE.retreat.cashPenalty;
    outcome.fansDelta = Math.round(baseRewardFans * ratio);
  } else if (battleState.result === "timeup") {
    // 持ち曲/尺を使い切って力及ばずだった場合は、違約金なしの部分成果のみ
    const ratio = Math.min(1, battleState.score / targetScore);
    outcome.cashDelta = Math.round(baseRewardCash * ratio);
    outcome.fansDelta = Math.round(baseRewardFans * ratio);
  } else if (battleState.result === "fail") {
    outcome.cashDelta = -Math.round(BALANCE.retreat.cashPenalty / 2);
    outcome.fansDelta = 0;
  }

  // 歩合制(§スカウト再設計): 出演した歩合制メンバーの人数分だけ、成功報酬から
  // commissionRateの天引きを行う(固定給メンバーは週次で別途支払われるため対象外)。
  if (outcome.cashDelta > 0) {
    const commissionPerformers = battleState.performers.filter((p) => {
      if (p.retired) return false;
      const idol = gameState.roster.find((i) => i.id === p.id);
      return idol?.salaryType === "commission";
    });
    if (commissionPerformers.length > 0) {
      const sharePerPerformer = outcome.cashDelta / battleState.performers.length;
      let commissionCost = 0;
      for (const p of commissionPerformers) {
        const idol = gameState.roster.find((i) => i.id === p.id);
        if (!idol) continue;
        const amount = Math.round(sharePerPerformer * (idol.commissionRate ?? 0));
        commissionCost += amount;
        // 歩合支払い履歴(§UI改修計画③-7)。タレント詳細画面の「直近1年間の
        // 支払合計」表示のために、案件ごとの天引き額を個人単位で記録する。
        // 直近60週分だけ保持すれば十分なので、それ以上は間引く。
        idol.commissionHistory ??= [];
        idol.commissionHistory.push({ day: gameState.day, amount });
        if (idol.commissionHistory.length > 60) idol.commissionHistory.shift();
      }
      outcome.commissionCost = commissionCost;
      outcome.cashDelta -= outcome.commissionCost;
    }
  }

  // 倒産(§8)対応: 現金はここで0にフロアせず、マイナスのまま反映する
  // (月末に2ヶ月連続マイナスだとadvanceDay側でbankrupt判定になる)。
  gameState.cash += outcome.cashDelta;
  gameState.fans = Math.max(0, gameState.fans + outcome.fansDelta);

  // §8「ファンは個人に紐づく」。ステージに立った(生存した)メンバーへ
  // 増加分を均等割りする。全滅・全員引退時は個人には配らない。
  // 天狗度(§4.3、完全隠蔽): 人気が伸びるほど上がる。
  if (outcome.fansDelta > 0) {
    const survivors = battleState.performers.filter((performer) => !performer.retired);
    if (survivors.length > 0) {
      const share = Math.floor(outcome.fansDelta / survivors.length);
      for (const performer of survivors) {
        const idol = gameState.roster.find((entry) => entry.id === performer.id);
        if (idol) {
          idol.fans = (idol.fans ?? 0) + share;
          idol.tenguDo = Math.min(100, (idol.tenguDo ?? 0) + share * BALANCE.mentalStats.tenguGainPerFanShare);
          // シングル売上枚数(§UI改修計画⑪-1)。ファン獲得分を持ち曲の売上に換算する。
          // idol個人ではなくgameState.songSalesに記録するため、引退・解雇後も残る。
          for (const title of idol.repertoire ?? []) {
            gameState.songSales[title] = (gameState.songSales[title] ?? 0) + share * BALANCE.repertoire.salesPerFanShare;
          }
        }
      }
    }
  }

  gameState.workedToday = true;

  // 取引先評価(§ボリューム拡張): 成功で上がり、撤退・失敗で下がる。
  // 「力及ばず(timeup)」は部分成果として評価には影響させない(中立)。
  let reputationDelta = 0;
  if (battleState.result === "success") reputationDelta = repCfg.successGain;
  else if (battleState.result === "retreat") reputationDelta = -repCfg.retreatLoss;
  else if (battleState.result === "fail") reputationDelta = -repCfg.failLoss;
  const reputationAfter = clampRange(reputationBefore + reputationDelta, repCfg.min, repCfg.max);
  gameState.clientReputation[stage.id] = reputationAfter;
  outcome.reputationDelta = reputationDelta;
  outcome.reputationAfter = reputationAfter;

  gameState.history.unshift({
    day: gameState.day,
    stageName: stage.name,
    result: battleState.result,
    score: battleState.score,
    ...outcome,
  });

  return gameState;
}

// 記者会見(社長の3択+トカゲの尻尾切り、§8)。悪評(scandal)発生時のみ選べる。
// choice: "coverUp" | "apology" | "denial" | "tailCutting"
export function resolvePressConference(gameState, choice) {
  const pending = gameState.pendingPressConference;
  if (!pending) return null;
  const cfg = BALANCE.pressConference;
  const result = { choice, resignations: [] };
  let fansLoss = pending.basePenalty;

  if (choice === "coverUp") {
    gameState.cash -= cfg.coverUp.cashCost;
    fansLoss = 0;
    gameState.cleanliness = clamp01(gameState.cleanliness + cfg.coverUp.cleanlinessDelta);
  } else if (choice === "apology") {
    fansLoss = Math.round(pending.basePenalty * cfg.apology.fansPenaltyMultiplier);
    gameState.cleanliness = clamp01(gameState.cleanliness + cfg.apology.cleanlinessDelta);
  } else if (choice === "denial") {
    const success = Math.random() < cfg.denial.successChance;
    fansLoss = success ? 0 : Math.round(pending.basePenalty * cfg.denial.failFansMultiplier);
    gameState.cleanliness = clamp01(gameState.cleanliness + cfg.denial.cleanlinessDelta);
    result.success = success;
  } else if (choice === "tailCutting") {
    gameState.cash -= cfg.tailCutting.cashCost;
    fansLoss = 0;
    gameState.cleanliness = clamp01(gameState.cleanliness + cfg.tailCutting.cleanlinessDelta);
  }

  gameState.fans = Math.max(0, gameState.fans - fansLoss);
  result.fansLoss = fansLoss;
  gameState.pendingPressConference = null;

  // 連鎖退職(§8): cleanlinessが低いと、在籍メンバーがまれにその場で離脱する
  if (gameState.cleanliness < BALANCE.risk.chainResignationCleanlinessThreshold) {
    for (const idol of [...gameState.roster]) {
      if (idol.lastDance) continue;
      if (Math.random() < BALANCE.risk.chainResignationChance) {
        removeIdolFromRoster(gameState, idol.id);
        result.resignations.push(idol.name);
      }
    }
  }

  return result;
}

// 契約更改(§スカウト充実化「1年に1回契約交渉」/§契約更改の算定式修正)。
// 固定給メンバーは在籍からintervalWeeks(1年)ごとにこのタイミングを迎える。
// 要求額は「前年の月給」ではなく「現在の年齢・経歴・場所に基づく適正給与
// (getBaseSalary、雇用時の初期給与と同じ計算式、在籍中なので不確実性割増は
// 常に0)」を基準に、ファン人気・天狗度による上乗せ率を掛けて算出する。
// 旧実装は前年の(既に上乗せ済みの)月給そのものに毎年複利で上乗せしていたため、
// 実力の伸びと無関係に月給が雪だるま式に膨らみ続ける不具合があった(10年で
// 60倍超になるシミュレーションを確認済み)。年齢が伸びれば適正給与も自然に
// 上がる形にし、伸びを妥当な範囲に抑える。
export function computeRenewalDemand(idol) {
  const cfg = BALANCE.contractRenewal;
  const personality = getNegotiationPersonality(idol);
  const fansRatio = (idol.fans ?? 0) / cfg.fansDemandDivisor;
  const tenguRatio = (idol.tenguDo ?? 0) / cfg.tenguDemandDivisor;
  // §契約交渉に性格を持たせる: 実力主義型・野心家型は要求が強気になり、
  // 堅実型・人情家型・熱望型は控えめになる(demandRatioMultiplier)。
  const demandRatio = Math.min(
    cfg.maxDemandRatio,
    (cfg.baseDemandRatio + fansRatio + tenguRatio) * personality.demandRatioMultiplier
  );
  const currentSalary = idol.monthlySalary ?? 0;
  // 在籍中は無条件で全部見えている(§4.1)ので、不確実性割増(unresolvedCount)は
  // 常に0で計算する(=年齢・経歴・場所だけの適正額)。
  const fairMarketSalary = getBaseSalary(idol, 0);
  const demandedSalary = Math.round(fairMarketSalary * (1 + demandRatio));
  return { demandRatio, currentSalary, demandedSalary };
}

// 歩合制への切り替え要求(§人気が出れば歩合制も選べるように)。固定給かつ
// ファン人気が閾値以上のメンバーだけが対象になる。
export function offersCommissionSwitch(idol) {
  return idol.salaryType === "fixed" && (idol.fans ?? 0) >= BALANCE.contractRenewal.commissionRequestFansThreshold;
}

// advanceDay()から毎週呼ばれる。契約更改のタイミングを迎えたアイドルを
// pendingContractRenewalsに積む(既に積まれていれば二重登録しない)。
function checkContractRenewals(gameState) {
  const cfg = BALANCE.contractRenewal;
  for (const idol of gameState.roster) {
    if (idol.retired || idol.lastDance || idol.resting) continue;
    if (idol.salaryType !== "fixed") continue;
    const elapsed = gameState.day - (idol.contractStartDay ?? gameState.day);
    if (elapsed > 0 && elapsed % cfg.intervalWeeks === 0 && !gameState.pendingContractRenewals.includes(idol.id)) {
      gameState.pendingContractRenewals.push(idol.id);
    }
  }
}

// 契約更改の交渉結果を確定させる(§契約更改の駆け引き強化)。ラウンドごとの
// スタンス選択・要求とのギャップの詰め方・独立リスクの判定は
// contractRenewalView.js側(BALANCE.contractRenewal.negotiation参照)が
// scoutView.jsの契約交渉と同じ構造で行い、ここでは確定した結果を適用するだけ。
// outcome: { newSalary?, tenguDelta?, stressDelta?, released?, departed?, switchToCommission? }
export function finalizeContractRenewal(gameState, idolId, outcome) {
  const idol = gameState.roster.find((i) => i.id === idolId);
  gameState.pendingContractRenewals = gameState.pendingContractRenewals.filter((id) => id !== idolId);
  if (!idol) return;

  if (outcome.released || outcome.departed) {
    removeIdolFromRoster(gameState, idol.id);
    if (outcome.departed) gameState.fans = Math.max(0, gameState.fans - BALANCE.firing.fansPenalty);
    return;
  }

  // 歩合制への切り替え(§人気が出れば歩合制も選べるように)。切り替えたら
  // 業績連動の対象になるため、以後この人は契約更改の対象から外れる
  // (checkContractRenewals側のsalaryType==="fixed"判定で自然に除外される)。
  if (outcome.switchToCommission) {
    idol.salaryType = "commission";
    idol.monthlySalary = null;
    idol.commissionRate = BALANCE.salary.commissionRate;
    idol.tenguDo = Math.max(0, Math.min(100, (idol.tenguDo ?? 0) - BALANCE.contractRenewal.negotiation.fullAcceptTenguRelief));
    return;
  }

  if (outcome.newSalary != null) idol.monthlySalary = outcome.newSalary;
  idol.tenguDo = Math.max(0, Math.min(100, (idol.tenguDo ?? 0) + (outcome.tenguDelta ?? 0)));
  idol.stress = Math.max(0, Math.min(100, (idol.stress ?? 0) + (outcome.stressDelta ?? 0)));
  // 在籍を続ける場合は次回の契約更改まで起算日をリセットする
  idol.contractStartDay = gameState.day;
}

// 加齢によるステータス増減(§9.1の延長・§ステータス生成バランス再設計)。週次で判定する。
// - 実年齢の進行: 1年(calendar.weeksPerMonth×monthsPerYear週)ごとに1歳加齢する。
//   これにより成長タイプ(GROWTH_TYPES)ごとの特別イベント(急成長期など)が
//   在籍中に実際に発火しうる。
// - 経年劣化: 成長タイプごとのdeclineStartAgeに達した時点で、各ステータスの
//   下げ止まり(そのアイドル個人のlessonCapsの半分)とその時点の値との差を
//   1回だけ確定し、そこから1年(48週)かけて毎週均等に直線的に減らしていく
//   (確率ではなく決定的な減少。能力が高いほど下げ止まりも高い)。
// - 大厄年: 低確率で一時的にステータスが下がり、durationDays後に自動で戻る
//   (特能「大厄年」を持つ本人は発生確率が上がる)。
function applyAging(gameState) {
  const cfg = BALANCE.aging;
  const weeksPerYear = BALANCE.calendar.weeksPerMonth * BALANCE.calendar.monthsPerYear;
  const isBirthdayWeek = gameState.day % weeksPerYear === 0;
  for (const idol of gameState.roster) {
    if (idol.retired) continue;
    const growthType = getGrowthType(idol);

    // 期限切れの大厄年デバフを元に戻す
    if (idol.statDebuff && gameState.day >= idol.statDebuff.expiresOnDay) {
      for (const key of SCOUT_STAT_KEYS) {
        idol.stats[key] = Math.min(100, idol.stats[key] + (idol.statDebuff.deltas[key] ?? 0));
      }
      idol.statDebuff = null;
    }

    if (isBirthdayWeek) {
      idol.age += 1;
    }

    if (idol.age >= growthType.declineStartAge) {
      // declineStartAge到達時点の1回だけ、下げ止まり(lessonCapsの半分)までの
      // 差分と週あたりの減少量を確定する。
      if (!idol.declineWeeklyAmount) {
        idol.declineFloors = {};
        idol.declineWeeklyAmount = {};
        idol.declineAccum = {};
        idol.declineWeeksElapsed = 0;
        for (const key of SCOUT_STAT_KEYS) {
          const cap = idol.lessonCaps?.[key] ?? idol.stats[key];
          const floor = Math.round(cap / 2);
          idol.declineFloors[key] = floor;
          idol.declineWeeklyAmount[key] = Math.max(0, idol.stats[key] - floor) / weeksPerYear;
          idol.declineAccum[key] = 0;
        }
      }
      if (idol.declineWeeksElapsed < weeksPerYear) {
        idol.declineWeeksElapsed += 1;
        for (const key of SCOUT_STAT_KEYS) {
          if (idol.declineWeeksElapsed >= weeksPerYear) {
            // 最終週: 端数の丸め誤差を残さず、ちょうど下げ止まりへ着地させる。
            idol.stats[key] = idol.declineFloors[key];
            continue;
          }
          idol.declineAccum[key] += idol.declineWeeklyAmount[key];
          const wholeDrop = Math.floor(idol.declineAccum[key]);
          if (wholeDrop > 0) {
            idol.stats[key] = Math.max(idol.declineFloors[key], idol.stats[key] - wholeDrop);
            idol.declineAccum[key] -= wholeDrop;
          }
        }
      }
    }

    if (!idol.statDebuff) {
      const badYearChance = idol.talent === "bad_year" ? cfg.badYear.holderDailyChance : cfg.badYear.dailyChance;
      if (Math.random() < badYearChance) {
        const deltas = {};
        for (const key of SCOUT_STAT_KEYS) {
          const drop = Math.round(idol.stats[key] * cfg.badYear.statDropPercent);
          deltas[key] = drop;
          idol.stats[key] = Math.max(1, idol.stats[key] - drop);
        }
        idol.statDebuff = { deltas, expiresOnDay: gameState.day + cfg.badYear.durationDays };
      }
    }
  }
}

// 個人単位のメンタル・人間関係(§4.3、完全隠蔽・変動パラメータ)の週次更新。
// ストレス・天狗度は現場/レッスンが無い週は自然に落ち着き、擦り切れ度は
// キャリアの蓄積として少しずつ増える。限界を超えた場合のみ、病気休業・
// 給料アップ要求・独立画策という「見える形」の結果に変換する。
function applyMentalStats(gameState) {
  const cfg = BALANCE.mentalStats;
  for (const idol of [...gameState.roster]) {
    if (idol.retired || idol.lastDance) continue;
    idol.stress = Math.max(0, (idol.stress ?? 0) - cfg.stressWeeklyDecay);
    idol.tenguDo = Math.max(0, (idol.tenguDo ?? 0) - cfg.tenguWeeklyDecay);
    if (idol.age >= BALANCE.aging.declineStartAge) {
      idol.surikireDo = Math.min(100, (idol.surikireDo ?? 0) + cfg.surikireWeeklyAgeGain);
    }

    // ストレス限界(§4.3「病気休業」): 既に休養中でなければ判定する
    if (!idol.resting && idol.stress >= cfg.stressIllnessThreshold && Math.random() < cfg.stressIllnessWeeklyChance) {
      idol.resting = true;
      idol.restUntilDay = gameState.day + cfg.stressIllnessRestWeeks;
      idol.stress = Math.round(idol.stress * 0.5);
      gameState.eventLog.unshift({
        day: gameState.day,
        kind: "scandal",
        label: "ストレス過多による病気休業",
        description: `${idol.name}がストレスで体調を崩し、${cfg.stressIllnessRestWeeks}週間の休養に入った`,
      });
      gameState.eventLog = gameState.eventLog.slice(0, BALANCE.randomEvents.logLimit);
      continue;
    }

    // 天狗度限界(§4.3「給料アップ要求・命令無視・独立画策」): 固定給メンバーのみ対象
    if (idol.tenguDo >= cfg.tenguDemandThreshold && idol.salaryType === "fixed" && Math.random() < cfg.tenguDemandWeeklyChance) {
      if (Math.random() < cfg.tenguDemandRaiseChance) {
        idol.monthlySalary = Math.round((idol.monthlySalary ?? 0) * (1 + cfg.tenguDemandSalaryBumpPercent));
        idol.tenguDo = Math.max(0, idol.tenguDo - cfg.tenguDemandRelief);
        gameState.eventLog.unshift({
          day: gameState.day,
          kind: "plus",
          label: "給料アップ要求",
          description: `${idol.name}が天狗になり給料アップを要求、押し切られて月給${Math.round(idol.monthlySalary / 10000)}万円に`,
        });
      } else {
        removeIdolFromRoster(gameState, idol.id);
        gameState.fans = Math.max(0, gameState.fans - BALANCE.firing.fansPenalty);
        gameState.eventLog.unshift({
          day: gameState.day,
          kind: "scandal",
          label: "独立画策",
          description: `${idol.name}が天狗になり待遇への不満を募らせ、事務所を飛び出して独立してしまった`,
        });
      }
      gameState.eventLog = gameState.eventLog.slice(0, BALANCE.randomEvents.logLimit);
    }
  }
}

// 週刊の噂話イベント(§ボリューム拡張)。ステージ結果とは無関係に、毎週
// わずかな確率でスキャンダル(悪い噂)かプラスの出来事(良い噂)が1件だけ起こり、
// 即座に効果が適用される。両方の条件を満たした週はスキャンダルを優先する
// (良い話より悪い話の方がニュースになりやすい、という简単な優先度)。
function rollRandomEvent(gameState) {
  const cfg = BALANCE.randomEvents;
  const scandalChance = cfg.scandalChanceBase * cleanlinessRiskMultiplier(gameState);
  const roll = Math.random();
  let pool = null;
  if (roll < scandalChance) {
    pool = EVENT_TYPES.filter((e) => e.kind === "scandal");
  } else if (roll < scandalChance + cfg.plusChanceBase) {
    pool = EVENT_TYPES.filter((e) => e.kind === "plus");
  }
  if (!pool || pool.length === 0) return;

  const event = pool[Math.floor(Math.random() * pool.length)];
  gameState.cash += event.cashDelta ?? 0;
  gameState.fans = Math.max(0, gameState.fans + (event.fansDelta ?? 0));
  if (event.cleanlinessDelta) {
    gameState.cleanliness = clamp01(gameState.cleanliness + event.cleanlinessDelta);
  }
  gameState.eventLog.unshift({ day: gameState.day, ...event });
  gameState.eventLog = gameState.eventLog.slice(0, cfg.logLimit);
}

// 力尽き休養(§burnout)からの復帰判定。restUntilDayを過ぎたメンバーは
// 編成・育成に復帰できるようになる。
function applyRestRecovery(gameState) {
  for (const idol of gameState.roster) {
    if (idol.resting && gameState.day >= idol.restUntilDay) {
      idol.resting = false;
      idol.restUntilDay = null;
    }
  }
}

// レッスンの週送り時自動実行(§UI改修計画④-5)。gameState.pendingTraining
// ({idolId: menuId})をtraining.jsのapplyTraining()に渡して適用し、結果を
// eventLogへ「誰のどの能力がどれだけ伸びたか」が見えるよう要約して記録する。
function applyPendingTraining(gameState) {
  if (!gameState.pendingTraining || Object.keys(gameState.pendingTraining).length === 0) return;
  const resultLog = applyTraining(gameState, gameState.pendingTraining);
  gameState.pendingTraining = {};
  if (resultLog.length === 0) return;
  const summary = resultLog
    .map((r) => `${r.idolName}(${r.gains.map((g) => `${SHORT_STAT_LABELS[g.key] ?? g.key}+${g.amount}`).join("")})`)
    .join("・");
  gameState.eventLog.unshift({
    day: gameState.day,
    kind: "plus",
    label: "レッスン成果",
    description: summary,
  });
  gameState.eventLog = gameState.eventLog.slice(0, BALANCE.randomEvents.logLimit);
}

export function advanceDay(gameState) {
  tickScoutLeads(gameState); // §スカウト再設計: 候補プールの残り週数消化・横取り判定・新規湧き
  applyPendingTraining(gameState); // §UI改修計画④: レッスン→タスク→オファーの順で週送り時に実行
  applyPendingTasks(gameState);
  settleDailyFinances(gameState); // 週次決算: 社員・トレーナーの人件費、融資返済、タニマチの闇イベント
  settleVentures(gameState); // 投資/コンテンツ(§3.2): 進行中ventureの週次収支・campaignの期限管理
  applyAging(gameState); // §9.1延長: 経年劣化・大厄年の週次判定
  applyMentalStats(gameState); // §4.3: 個人単位のストレス・天狗度・擦り切れ度(完全隠蔽)の週次更新
  checkContractRenewals(gameState); // §スカウト充実化: 固定給メンバーの1年に1回の契約更改タイミングを判定
  applyRestRecovery(gameState); // §burnout: 休養期間が終わったメンバーを復帰させる
  rollRandomEvent(gameState); // §ボリューム拡張: 週刊の噂話イベント(スキャンダル/プラス)

  // 月次経費(§月次経費): 月の最後の週を送るタイミングでまとめて1回引き落とす
  if (gameState.day % BALANCE.calendar.weeksPerMonth === 0) {
    settleMonthlyExpense(gameState);
    // 倒産(§8): 月末時点でまだ現金がマイナスのままだと「警告」を1回分記録し、
    // それが2ヶ月連続で続いたら倒産(ゲームオーバー)にする。単月だけのマイナスは
    // 立て直すチャンスとして許容する。
    if (gameState.cash < 0) {
      if (gameState.cashNegativeLastMonthEnd) {
        gameState.bankrupt = true;
      }
      gameState.cashNegativeLastMonthEnd = true;
    } else {
      gameState.cashNegativeLastMonthEnd = false;
    }
  }

  // マクロ環境(§11): パラダイムシフト。一定週数ごとにトレンドが入れ替わる
  gameState.era.daysSinceShift += 1;
  if (gameState.era.daysSinceShift >= BALANCE.macroEra.shiftIntervalDays) {
    gameState.era = rollNewEra(gameState.era.trendAttribute);
  }

  // カレンダー(§永続ループ): リセットせず週を進め続ける
  gameState.day += 1;
  gameState.workedToday = false;
  gameState.trainedToday = false;
  gameState.scoutedLocationId = null;
  return gameState;
}

// セーブデータのエクスポート/インポート(§13)。gameStateの構造そのものが
// JSONにできる素朴な作りなので、そのままシリアライズ/デシリアライズするだけでよい。
export function exportSaveJson(gameState) {
  return JSON.stringify(gameState, null, 2);
}

// 読み込んだJSON文字列を検証し、妥当なセーブデータならgameStateオブジェクトを返す。
// 壊れている/形式が違う場合はnullを返す(呼び出し側でエラー表示にフォールバックする)。
export function parseSaveJson(text) {
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") return null;
    if (!Array.isArray(data.roster) || typeof data.day !== "number" || typeof data.cash !== "number") return null;
    return data;
  } catch (err) {
    return null;
  }
}
