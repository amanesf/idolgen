// スカウト/応募時に提示する候補キャラクターの初期値をランダム生成する。
// GDD §5「プロシージャル・スカウトシステム」/§ステータス生成ばらつき改善の実装。
// 場所(SCOUT_LOCATIONS)を選んで移動し、方法(SCOUT_METHODS)を選んで候補を
// 探す。各ステータスは「レッスン上限(=成長+レッスン込みの最終到達点)を
// RANK_THRESHOLDSのランクピラミッドから直接ロール」→「そこからlessonCapVariance
// 分を差し引いて自然到達点(成長)を逆算」→「自然到達点に成長度(年齢カーブの
// 比率)を掛けて現状値を出す」という3段階で決める(詳細はBALANCE.scouting.quality
// のコメント参照)。方法によって候補の「やる気(interest)」の出やすさが変わる。
//
// 生成ロジックのみを担当し、DOM操作は一切行わない(検証ビューア側が描画する)。

import {
  BALANCE,
  SURNAME_FIRST_KANJI,
  SURNAME_SECOND_KANJI,
  GIVEN_NAMES,
  ATTRIBUTES,
  SCOUT_STAT_KEYS,
  SCOUT_LOCATIONS,
  SCOUT_METHODS,
  PORTRAIT_SHEETS,
  TALENTS,
  JOB_TYPES,
  ORIGIN_ATTRIBUTES,
  GROWTH_TYPES,
  NEGOTIATION_PERSONALITIES,
  RANK_THRESHOLDS,
  rankLabel,
} from "./masterData.js?v=1785558404241";
import { getAgencyRank, rankIndexOf } from "./jobBoard.js?v=1785558404241";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// レッスン上限(training.jsが実際のクランプに使う値)をステータスごとに算出する。
// 乱数(資質ロール)が乗るのは既に全盛期(natureCaps)側で確定済みなので、ここでは
// 二重に乱数をかけない。全盛期から一律variance点だけ上に足した値(成長タイプ
// 共通の絶対上限growthTypeStatCapでクランプ)にすることで、誰でも「レッスンで
// 追加に伸ばせる幅」がきっちりvariance点になる(§スカウト再設計・
// idolDetailViewとの表示統一)。
// 生成済みのスカウト候補(scoutGenerator.js)にも、statCapsを持たない
// 創業メンバー(state.js: createGameState)にも同じ関数を使う。
export function rollLessonCaps(natureCaps, growthTypeStatCap, variance = BALANCE.scouting.lessonCapVariance) {
  const lessonCaps = {};
  for (const key of SCOUT_STAT_KEYS) {
    lessonCaps[key] = Math.min(growthTypeStatCap, (natureCaps[key] ?? 0) + variance);
  }
  return lessonCaps;
}

// 現在の事務所ランクで解放済みの行き先だけを返す(minRankId未設定は常時解放)。
// §UI改修計画⑦: 「スカウト」(行き先を選んで出向く)向け。募集方法はプレイヤーに
// 選ばせず、行き先ごとに固定でSCOUT_METHOD_REFERRALを使う。
export function getAvailableScoutOptions(gameState) {
  const rank = getAgencyRank(gameState);
  const rankPos = rankIndexOf(rank.id);
  const isUnlocked = (entry) => !entry.minRankId || rankPos >= rankIndexOf(entry.minRankId);
  return {
    rank,
    locations: SCOUT_LOCATIONS.filter(isUnlocked),
  };
}

// §UI改修計画⑦: 「スカウト」「公募」それぞれに固定で紐づく募集方法。
export const SCOUT_METHOD_REFERRAL = SCOUT_METHODS.find((m) => m.id === "referral");
export const SCOUT_METHOD_AUDITION = SCOUT_METHODS.find((m) => m.id === "audition");

// 5段階ピラミッド(BALANCE.scouting.tierPyramidWeights)でTier(1〜5)を決めてから、
// そのTierに属するエントリから均等に1つ選ぶ(§重み付けの共通化: 属性の
// レア度・経歴のsalaryTierで同じ表を共有する)。
function pickByTierPyramid(entries, tierKey) {
  const weights = BALANCE.scouting.tierPyramidWeights;
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  let tier = weights.length;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      tier = i + 1;
      break;
    }
  }
  const candidates = entries.filter((e) => e[tierKey] === tier);
  return pick(candidates.length ? candidates : entries);
}

function pickAttribute() {
  return pickByTierPyramid(ATTRIBUTES, "rarity");
}

// 成長タイプ(GROWTH_TYPES.rarityWeight)に応じた重み付き抽選。
function pickGrowthType() {
  const totalWeight = GROWTH_TYPES.reduce((sum, g) => sum + (g.rarityWeight ?? 1), 0);
  let roll = Math.random() * totalWeight;
  for (const growthType of GROWTH_TYPES) {
    roll -= growthType.rarityWeight ?? 1;
    if (roll <= 0) return growthType;
  }
  return GROWTH_TYPES[GROWTH_TYPES.length - 1];
}

// growthType.ageCurve([年齢,比率]の配列)を折れ線補間し、その年齢での比率(0〜1)を返す。
// 範囲外の年齢は端の比率でクランプする。タレント詳細画面(§UI改修計画③-4)でも
// 「成長度」表示のため共有する(exportして再利用)。
export function growthAgeFactorRatio(growthType, age) {
  const curve = growthType.ageCurve;
  if (age <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [prevAge, prevRatio] = curve[i - 1];
    const [nextAge, nextRatio] = curve[i];
    if (age <= nextAge) {
      const t = (age - prevAge) / (nextAge - prevAge);
      return prevRatio + (nextRatio - prevRatio) * t;
    }
  }
  return curve[curve.length - 1][1];
}

// 「成長度」(§スカウトに賭けと発見を持たせる: 成長パターンではなく成長度を
// 観測できるようにする)。growthType(早熟/大器晩成などの曲線の形そのもの)は
// 伏せたまま、年齢に応じて「今どのくらい育っているか」だけを返す純粋関数。
// idolDetailView.js(常時公開)とscoutLeadCard.js(お試しステージで観測するまで
// 伏せる)の両方がHTML整形だけそれぞれで行い、ここではDOM操作をしない。
// declineStartAgeへの到達から1年(48週=ちょうど誕生日1回分)が経つと経年劣化
// (state.js: applyAging)が下げ止まりまで落ちきるため、年齢だけで判定できる
// (declining=下降中の1年間、withered=落ちきった後の「衰え」)。
// stage(1〜7、§スカウト画面の成長度は7段階で): 成長中を比率で4分割して1〜4、
// 全盛期(peak)=5、下降中(declining)=6、衰え(withered)=7。
export function getGrowthPhase(idol) {
  const growthType = GROWTH_TYPES.find((g) => g.id === idol.growthType) ?? GROWTH_TYPES.find((g) => g.id === "normal");
  const ratio = growthAgeFactorRatio(growthType, idol.age);
  const percent = Math.round(ratio * 100);
  const phase =
    idol.age >= growthType.declineStartAge + 1 ? "withered" :
    idol.age >= growthType.declineStartAge ? "declining" :
    ratio >= 0.98 ? "peak" : "growing";
  const stage =
    phase === "withered" ? 7 :
    phase === "declining" ? 6 :
    phase === "peak" ? 5 :
    Math.max(1, Math.min(4, Math.ceil(ratio / 0.245)));
  return { percent, phase, stage };
}

// 経歴(origin)の「得意ステータス」。statBaseが高い順にcount個のキーを返す
// (§経歴はレッスン度に影響)。この得意ステータスは追加+1シフト(アプティチュード)
// と、経歴レッスン度(originTraining、既にレッスン済みの度合い)の両方の対象になる。
// statBaseが全ステータス同値(一般人・スカウト直行など、本当に無色の経歴)の
// 場合は「得意なし」とみなし空配列を返す(タイの先頭キーを機械的に選ばない)。
function pickLessonTargetStats(origin, count) {
  if (count <= 0) return [];
  const values = SCOUT_STAT_KEYS.map((key) => origin.statBase?.[key] ?? 0);
  if (Math.max(...values) === Math.min(...values)) return [];
  return [...SCOUT_STAT_KEYS].sort((a, b) => origin.statBase[b] - origin.statBase[a]).slice(0, count);
}

// RANK_THRESHOLDS(S/A/B/C/D/E/F/G、インデックス0=S〜7=G)上でのランクの
// インデックスを、ピラミッド分布+シフトでロールする(§ステータス生成ばらつき改善/
// §重み付けの共通化)。rankPyramidWeightsはRANK_THRESHOLDSと同じ並び順・合計100。
// S・A(インデックス0・1)はshiftの影響を受けない固定確率。それ以外はB〜Gの
// 6段階ピラミッド(Gが最頻)からロールし、shiftの分だけ良い方(Bに向かって)に
// ずらす(Bで頭打ち)。
function rollRankIndex(shift) {
  const weights = BALANCE.scouting.quality.rankPyramidWeights;
  const sIndex = RANK_THRESHOLDS.findIndex((r) => r.label === "S");
  const aIndex = RANK_THRESHOLDS.findIndex((r) => r.label === "A");
  const bIndex = RANK_THRESHOLDS.findIndex((r) => r.label === "B");
  const gIndex = RANK_THRESHOLDS.findIndex((r) => r.label === "G");

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const roll = Math.random() * totalWeight;
  if (roll < weights[sIndex]) return sIndex;
  if (roll < weights[sIndex] + weights[aIndex]) return aIndex;

  // B〜G(shiftの対象)だけをG→Bの順(距離0=G)に並べ直してロールする。
  const commonWeights = weights.slice(bIndex, gIndex + 1).reverse();
  const commonTotal = commonWeights.reduce((sum, w) => sum + w, 0);
  let w = Math.random() * commonTotal;
  let distanceFromG = commonWeights.length - 1;
  for (let i = 0; i < commonWeights.length; i++) {
    w -= commonWeights[i];
    if (w <= 0) {
      distanceFromG = i;
      break;
    }
  }
  const baseIndex = gIndex - distanceFromG;
  return Math.max(bIndex, baseIndex - shift);
}

// ロールしたランクのインデックスから、そのランクの数値レンジ内で一様乱数の
// 具体的な値を決める(1つ上のランクの下限値未満に収める)。
function rollRankValue(rankIndex, statFloor) {
  const min = Math.max(RANK_THRESHOLDS[rankIndex].min, statFloor);
  const betterEntry = RANK_THRESHOLDS[rankIndex - 1];
  const max = betterEntry ? betterEntry.min - 1 : 100;
  return Math.round(randRange(min, Math.max(min, max)));
}


// location/methodはそれぞれSCOUT_LOCATIONS/SCOUT_METHODSの1エントリ。
export function generateCandidate({ gameState, location, method }) {
  const cfg = BALANCE.scouting;
  // 特能「幸運体質」: 在籍している人数分だけ全ステータスのランクを底上げする
  // (§ステータス生成ばらつき改善)。スカウト社員の生成時効果は戦闘バトル側の
  // 別の効果に付け替える想定のため、ここでは扱わない(保留)。
  const luckyBodyCount = gameState?.roster?.filter((idol) => idol.talent === "lucky_body").length ?? 0;
  const luckyShiftBonus = luckyBodyCount * (BALANCE.talentEffects.lucky_body.scoutRankShiftPerHolder ?? 0);

  // §4「元何かの属性」。本人の経歴。交渉の粘り強さに加えて、
  // 「経歴ベース」ステータス(origin.statBase)を決める。得意ステータス
  // (statBaseが高い順、salaryTierごとに0〜3個)は追加+1シフトの対象になり、
  // かつ経歴レッスン度(originTraining、§経歴はレッスン度に影響)の対象にもなる。
  const origin = pickByTierPyramid(ORIGIN_ATTRIBUTES, "salaryTier");
  const trainingCfg = cfg.originTraining;
  const originTier = (origin.salaryTier ?? 1) - 1;
  const lessonTargetCount = trainingCfg.lessonTargetCountByTier[originTier] ?? 0;
  const originLessonProgress = trainingCfg.lessonProgressByTier[originTier] ?? 0;
  const lessonTargetStats = pickLessonTargetStats(origin, lessonTargetCount);
  // 成長タイプ(§ステータス生成バランス再設計)。全アイドル共通属性として1つ抽選する。
  const growthType = pickGrowthType();
  const age = Math.round(randRange(cfg.ageMin, cfg.ageMax));
  const ageRatio = growthAgeFactorRatio(growthType, age);
  const statCap = Math.min(cfg.statCeil, growthType.statCap ?? cfg.statCeil);
  const baseShift = (location?.rankShift ?? 0) + luckyShiftBonus;

  // §ステータス生成ばらつき改善: 各ステータスの「レッスン上限」(成長+レッスン
  // 込みの最終到達点)をランクピラミッドから直接ロールする(場所・経歴の得意
  // ステータス・特能「幸運体質」の分だけ良い方にシフト)。そこから
  // lessonCapVariance分を差し引いて自然到達点(成長、statCaps)を逆算し、
  // 現状値(stats)は自然到達点に成長度(年齢カーブの比率、0〜1)を掛けて決める
  // (=幼いうちは自然到達点があっても、現状はまだそこまで育っていない)。
  // §経歴はレッスン度に影響: 得意ステータス(lessonTargetStats)は、現状値を
  // 「自然成長分」と「レッスン上限」の間でoriginLessonProgress(0〜1)分だけ
  // レッスン済み側に寄せる(1.0なら年齢に関係なくレッスン上限そのもの=
  // 「マックスだとレッスン済状態」)。得意ステータス以外は今まで通り
  // 自然成長分のみ。
  const stats = {};
  const statCaps = {};
  const lessonCaps = {};
  for (const key of SCOUT_STAT_KEYS) {
    const isLessonTarget = lessonTargetStats.includes(key);
    const shift = baseShift + (isLessonTarget ? 1 : 0);
    const rankIndex = rollRankIndex(shift);
    lessonCaps[key] = clamp(rollRankValue(rankIndex, cfg.statFloor), cfg.statFloor, statCap);
    statCaps[key] = clamp(lessonCaps[key] - cfg.lessonCapVariance, cfg.statFloor, statCap);
    const naturalGrowth = statCaps[key] * ageRatio;
    const blended = isLessonTarget
      ? naturalGrowth * (1 - originLessonProgress) + lessonCaps[key] * originLessonProgress
      : naturalGrowth;
    stats[key] = clamp(Math.round(blended), cfg.statFloor, statCap);
  }
  const statSum = SCOUT_STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
  // §4「希望する仕事」。本人の本当の志望(desiredJobType)。プレイヤーが
  // 契約時に選ぶ実際の仕事(jobType)と食い違うと、やる気にペナルティが乗る
  // (hireIdol()側で判定。ここでは志望を1つ決めるだけ)。資質グレードの
  // 算出に使うため、統計値の直後(名前・ポートレート等より先)に決めておく。
  const desiredJobType = pick(JOB_TYPES);
  const qualityRelevantStats = desiredJobType.relevantStats ?? SCOUT_STAT_KEYS;
  const avgQuality = qualityRelevantStats.reduce((sum, key) => sum + lessonCaps[key], 0) / qualityRelevantStats.length;
  // 総合評価は個別ステータスと同じRANK_THRESHOLDS(S/A/B/C/D/E/F/G)をそのまま使う。
  const qualityGrade = rankLabel(avgQuality);
  // サブ総合評価: 志望職種の関連4ステータスに含まれない残り3ステータスの平均。
  // 「総合評価S/A」のように主評価と並べて表示し、関連ステータス以外の
  // 仕上がり具合も分かるようにする(§残りの3パラメータをサブ総合評価に)。
  const subQualityStats = SCOUT_STAT_KEYS.filter((key) => !qualityRelevantStats.includes(key));
  const subAvgQuality = subQualityStats.reduce((sum, key) => sum + lessonCaps[key], 0) / subQualityStats.length;
  const subQualityGrade = rankLabel(subAvgQuality);

  // 姓は1文字目/2文字目それぞれの漢字プール(各100字、計200字)から1字ずつ選んで
  // 連結する(100×100=1万通り)。
  const surname = pick(SURNAME_FIRST_KANJI) + pick(SURNAME_SECOND_KANJI);
  const givenName = pick(GIVEN_NAMES);
  const attribute = pickAttribute();

  const sheet = pick(PORTRAIT_SHEETS.sheets);
  const row = Math.floor(Math.random() * PORTRAIT_SHEETS.gridSize);
  const col = Math.floor(Math.random() * PORTRAIT_SHEETS.gridSize);

  // やる気(芸能界への興味度、0〜100)。方法(method)ごとの幅から抽選する。
  const interest = Math.round(randRange(method?.interestMin ?? 0, method?.interestMax ?? 100));

  // §契約交渉に性格を持たせる。経歴・成長タイプとは独立した第三の軸として
  // 1つ抽選する(closingProgress/契約更改の両方で参照する)。
  const negotiationPersonality = pick(NEGOTIATION_PERSONALITIES);

  // §契約金は基本ゼロスタート: 新人なので言い値は常に0円。どうしても口説き
  // 落としたい場合はプレイヤーがfeeOfferAmountスライダーで実額を積む
  // (closingProgress側で処理、moneyOfferRange.feeOfferAmount参照)。
  const contractFee = cfg.contractFee;

  // 特能(§4.4)。低確率で1つだけ持って生まれる(§9.2の陣形継承でも増える)。
  const talent = Math.random() < BALANCE.succession.talentChance ? pick(TALENTS).id : null;

  return {
    name: `${surname} ${givenName}`,
    stageName: givenName, // 芸名は本名の名前部分を仮採用(プレイヤーが変更できる想定、§5.2)
    age,
    attribute: attribute.key,
    attributeLabel: attribute.label,
    stats,
    statSum,
    qualityGrade,
    subQualityGrade,
    talent,
    growthType: growthType.id,
    growthTypeLabel: growthType.label,
    growthTypeDescription: growthType.description,
    interest,
    origin: origin.key,
    originLabel: origin.label,
    negotiationResistance: origin.negotiationResistance ?? 1,
    desiredJobType: desiredJobType.key,
    desiredJobTypeLabel: desiredJobType.label,
    negotiationPersonality: negotiationPersonality.id,
    negotiationPersonalityLabel: negotiationPersonality.label,
    negotiationPersonalityDescription: negotiationPersonality.description,
    statCap, // 成長タイプ由来の絶対上限(早熟のみ92、他は100)。statCaps/lessonCapsのクランプ上限
    statCaps, // §ステータス生成ばらつき改善: レッスン上限からlessonCapVariance分を差し引いた自然到達点(全盛期)。
    lessonCaps, // §ステータス生成ばらつき改善: ランクピラミッドから直接ロールした最終到達点。training.js側もこの値を使う。
    lastDance: false,
    portrait: {
      sheetId: sheet.id,
      sheetFile: sheet.file,
      row,
      col,
      cellSize: PORTRAIT_SHEETS.cellSize,
    },
    locationId: location?.id ?? null,
    methodId: method?.id ?? null,
    contractFee,
  };
}

let leadIdCounter = 0;

// 候補プール制(§スカウト再設計)。generateCandidate()のステータス生成は
// そのまま使い、プールで管理するための追加フィールド(残り週数・好感度・
// お金側スコア・ライバル事務所フラグ)を足す。locationを渡さない(undefined)
// 呼び出しは「パッシブ発見枠」(週次で自動的に湧く候補)を意味する。
export function createScoutLead({ gameState, location, method }) {
  const candidate = generateCandidate({ gameState, location, method });
  const cfg = BALANCE.scouting.leads;
  leadIdCounter += 1;
  const remainingWeeks = Math.round(randRange(cfg.lifespanWeeksMin, cfg.lifespanWeeksMax));

  return {
    ...candidate,
    id: `lead_${Date.now()}_${leadIdCounter}`,
    remainingWeeks,
    totalLifespanWeeks: remainingWeeks,
    affinity: 0,
    salaryType: "fixed",
    feeOfferAmount: 0, // §契約金は基本ゼロスタート: ゴリ押しで積む実額(円)
    salaryBumpRatio: 0, // §柔軟な条件交渉: 固定給の上乗せ率
    commissionRateOffer: BALANCE.salary.commissionRate, // §柔軟な条件交渉: 歩合率(標準より下げて譲歩できる)
    jobType: candidate.desiredJobType, // プレイヤーが変更できる実際の職種。初期値は本人の志望に合わせておく
    rivalInterest: Math.random() < cfg.rivalInterestChance,
    // 差し入れ/食事/ライブ招待のクールダウンは事務所全体で共有(gameState.affinityActionWeeks、
    // §行動制限による差別化)なので、候補個別には持たない。
    pendingAffinityAction: null, // "gift" | "meal" | "invite" | null。選択のみで即実行はしない(決定ボタンで確定)
    // §スカウトに賭けと発見を持たせる: OBSERVABLE_SCOUT_PARAMS(7ステータス+
    // 成長タイプ+資質グレード)のうち、お試しステージで観測済みのものだけ
    // revealedParamsに積まれる。メンタルは観測できても社長の基準スタミナを
    // 超えていれば下限しか分からず、そのときはrevealedFloors.mentalに
    // 下限値が入り、revealedParamsには含めない(=数値未確定のまま)。
    revealedParams: [],
    revealedFloors: {},
    pendingObservationParams: [], // お試し実行前に選んでいる観測対象(座席数まで)
  };
}
