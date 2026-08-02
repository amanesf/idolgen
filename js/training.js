// 育成（レッスン）ロジック。§2ステップ2「育成」の実装。
// §UI改修計画④: レッスン枠(スロット)の概念は廃止し、ロースター全員に無制限で
// メニュー(TRAINING_MENUS、単独 or 複数ステータスの総合メニュー)を割り当てられる。
// 割り当ては即時実行せず、週送り(state.js: advanceDay)のタイミングでまとめて
// 適用する(gameState.pendingTraining)。DOM操作は一切行わない。

import { BALANCE, TRAINING_FACILITIES, TRAINERS, TRAINING_MENUS, GROWTH_TYPES, SCOUT_STAT_KEYS } from "./masterData.js?v=1785558404241";
import { getEquipmentEffects } from "./office.js?v=1785558404241";

// 成長タイプ(§ステータス生成バランス再設計)。growthType未設定の場合は"normal"扱い。
function getGrowthType(idol) {
  return GROWTH_TYPES.find((g) => g.id === idol.growthType) ?? GROWTH_TYPES.find((g) => g.id === "normal");
}

// 所有施設のうち最も高い倍率を採用する(複数施設を同時所有しても、
// 最良の設備で受けられると解釈する)。
function getFacilityMultiplier(gameState, key) {
  const facilities = gameState.ownedFacilityIds
    .map((id) => TRAINING_FACILITIES.find((f) => f.id === id))
    .filter(Boolean);
  if (facilities.length === 0) return 1;
  return facilities.reduce((best, f) => Math.max(best, f[key]), facilities[0][key]);
}

// 指定カテゴリに効果を持つ所有トレーナーのうち、最良の倍率を返す
// (専門トレーナー・汎用トレーナーの両方を考慮する)。
function getTrainerMultiplier(gameState, category) {
  const trainers = gameState.ownedTrainerIds
    .map((id) => TRAINERS.find((t) => t.id === id))
    .filter((t) => t && (t.category === null || t.category === category));
  if (trainers.length === 0) return 1;
  return trainers.reduce((best, t) => Math.max(best, t.statMultiplier), 1);
}

// 特能「一点集中」用: 現時点でそのアイドルが最も高いステータスのキーを返す。
function bestStatKey(idol) {
  return SCOUT_STAT_KEYS.reduce((best, key) => (idol.stats[key] > idol.stats[best] ? key : best), SCOUT_STAT_KEYS[0]);
}

// メニュー未指定(初回)のアイドルへの自動割り当て(§UI改修計画④-4)。
// 職種(jobType)ごとの既定メニュー(TRAINING_MENUS.defaultForJobTypes)を優先し、
// 該当メニューがなければ最も低い単独ステータスを選ぶ(弱点を優先的に鍛える)。
// 戻り値: { [idolId]: menuId }
export function autoAssignTraining(gameState) {
  const activeRoster = gameState.roster.filter((idol) => !idol.retired && !idol.resting);
  const assignments = {};
  for (const idol of activeRoster) {
    const jobMenu = TRAINING_MENUS.find((m) => m.defaultForJobTypes?.includes(idol.jobType));
    if (jobMenu) {
      assignments[idol.id] = jobMenu.id;
      continue;
    }
    const singleMenus = TRAINING_MENUS.filter((m) => m.type === "single");
    let lowest = singleMenus[0];
    let lowestValue = Infinity;
    for (const menu of singleMenus) {
      const value = idol.stats[menu.statKeys[0]] ?? 0;
      if (value < lowestValue) {
        lowestValue = value;
        lowest = menu;
      }
    }
    assignments[idol.id] = lowest.id;
  }
  return assignments;
}

// 割り当て済みのレッスンを実行し、ステータス・資金へ反映する。
// assignments: { [idolId]: menuId }
export function applyTraining(gameState, assignments) {
  const cfg = BALANCE.training;
  const entries = Object.entries(assignments ?? {}).filter(([, menuId]) => menuId);
  const totalCost = entries.length * cfg.costPerSession;
  gameState.cash -= totalCost; // 倒産(§8)対応: 0でフロアしない

  const resultLog = []; // 週送り結果表示用: [{ idolName, menuLabel, gains: [{key, amount}] }]

  for (const [idolId, menuId] of entries) {
    const idol = gameState.roster.find((i) => i.id === idolId);
    const menu = TRAINING_MENUS.find((m) => m.id === menuId);
    if (!idol || !menu) continue;

    // ストレス(§4.3、完全隠蔽): レッスンでも現場と同様に少しずつ蓄積する
    idol.stress = Math.min(100, (idol.stress ?? 0) + BALANCE.mentalStats.stressPerLesson);

    const facilityMult = getFacilityMultiplier(gameState, "statMultiplier");
    const wideMultiplier = menu.gainMultiplier ?? 1;
    const gains = [];

    for (const category of menu.statKeys) {
      const trainerMult = getTrainerMultiplier(gameState, category);

      // セカンドキャリア(§9.4): 残留コーチがいるほど、レッスンの基礎伸び幅が上乗せされる
      const coachBonus =
        (gameState.secondCareerCoaches?.length ?? 0) * BALANCE.secondCareer.trainingStatGainBonusPerCoach;

      // 特能「不器用」「一点集中」「練習の虫」「練習嫌い」ごとに
      // 成長量そのものに個人差が出る
      const growthType = getGrowthType(idol);
      let statGainMultiplier = 1;
      if (idol.talent === "clumsy") statGainMultiplier *= BALANCE.talentEffects.clumsy.statGainMultiplier;
      if (idol.talent === "practice_bug") statGainMultiplier *= BALANCE.talentEffects.practice_bug.statGainMultiplier;
      if (idol.talent === "practice_hater") statGainMultiplier *= BALANCE.talentEffects.practice_hater.statGainMultiplier;
      if (idol.talent === "specialist" && category === bestStatKey(idol)) {
        statGainMultiplier *= BALANCE.talentEffects.specialist.statGainMultiplier;
      }

      // 事務所設備「鏡張り稽古場改修」: 成長量そのものが底上げされる
      const equipmentStatGainMultiplier = getEquipmentEffects(gameState).reduce(
        (mult, e) => mult * (e.trainingStatGainMultiplier ?? 1),
        1
      );

      const statGain =
        (cfg.statGainMin + coachBonus + Math.random() * (cfg.statGainMax - cfg.statGainMin)) *
        facilityMult *
        trainerMult *
        statGainMultiplier *
        equipmentStatGainMultiplier *
        wideMultiplier;
      // 成長タイプ(§ステータス生成バランス再設計)「早熟」: 成長上限が100より低い所で頭打ちになる。
      // §スカウト再設計: idol.lessonCaps(成長タイプ共通の上限からランダムに
      // 個人差を持たせた値、資質ロール=運込みの全盛期statCapsを下回らない)を
      // 優先する。持たない場合(旧セーブ等)は成長タイプ共通のフラットな上限に
      // フォールバックする。
      const statCap = idol.lessonCaps?.[category] ?? growthType.statCap ?? 100;
      const before = idol.stats[category];
      idol.stats[category] = Math.min(statCap, Math.round(idol.stats[category] + statGain));
      gains.push({ key: category, amount: idol.stats[category] - before });
    }

    resultLog.push({ idolName: idol.name, menuLabel: menu.label, gains });
  }

  gameState.trainedToday = true;
  return resultLog;
}
