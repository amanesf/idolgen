// 社員システム(§7)と財務・資金調達(§8)のロジック。DOM操作は一切行わない。
// 職種ごとの効果は「所有している社員(STAFF)のeffectを合算する」方式で、
// 呼び出し側(scoutGenerator.js/state.js/jobBoard.js)は自分が使うキーだけ見る。

import { BALANCE, STAFF, TRAINERS, TRAINING_FACILITIES, OFFICE_EQUIPMENT, VENTURE_TYPES, AGENCY_RANKS } from "./masterData.js?v=1785558404241";

// 累計ファン数からのランク順位(0始まり)。jobBoard.jsのgetAgencyRankと同じ
// 判定だが、循環import(jobBoard.js→office.js)を避けるためここに複製する。
function rankPositionOf(gameState) {
  let index = 0;
  AGENCY_RANKS.forEach((rank, i) => {
    if (gameState.fans >= rank.fansThreshold) index = i;
  });
  return index;
}

// 指定カテゴリの所有社員のeffectオブジェクトを配列で返す。
export function getStaffEffects(gameState, category) {
  return gameState.ownedStaffIds
    .map((id) => STAFF.find((s) => s.id === id))
    .filter((s) => s && s.category === category)
    .map((s) => s.effect);
}

// スカウトマン(人脈)の効果を反映した、候補ステータスへの合算ボーナス。
// §ステータス生成ばらつき改善によりscoutGenerator.js側では現在未使用
// (scout_networkのstatBonus効果を戦闘バトル側の効果に付け替えるまでの保留中)。
export function getScoutStatBonus(gameState) {
  return getStaffEffects(gameState, "scout").reduce((sum, e) => sum + (e.statBonus || 0), 0);
}

// 所有中の事務所設備(OFFICE_EQUIPMENT)のeffectオブジェクトを配列で返す。
// 買い切りの備品なので、社員(STAFF)と違って家賃やcategoryによる絞り込みは行わず、
// 全て常時有効(呼び出し側が使うキーだけ見る、STAFFと同じ流儀)。
export function getEquipmentEffects(gameState) {
  return (gameState.ownedEquipmentIds ?? [])
    .map((id) => OFFICE_EQUIPMENT.find((e) => e.id === id))
    .filter(Boolean)
    .map((e) => e.effect);
}

// 事務所設備(§ボリューム拡張)の購入。買い切りで継続コストは発生しない。
export function purchaseEquipment(gameState, equipmentId) {
  if (gameState.ownedEquipmentIds.includes(equipmentId)) return gameState;
  const equipment = OFFICE_EQUIPMENT.find((e) => e.id === equipmentId);
  if (!equipment || gameState.cash < equipment.cost) return gameState;
  gameState.cash -= equipment.cost;
  gameState.ownedEquipmentIds.push(equipmentId);
  return gameState;
}

export function hireStaff(gameState, staffId) {
  if (gameState.ownedStaffIds.includes(staffId)) return gameState;
  if (!STAFF.some((s) => s.id === staffId)) return gameState;
  gameState.ownedStaffIds.push(staffId);
  return gameState;
}

export function fireStaff(gameState, staffId) {
  gameState.ownedStaffIds = gameState.ownedStaffIds.filter((id) => id !== staffId);
  return gameState;
}

// 日次の人件費(社員+トレーナー)の合計。§8「月次決算」の簡易版として、
// 1週間ループの1日ごとに引き落とす(advanceDay側から呼ぶ)。
export function getDailyStaffCost(gameState) {
  const staffCost = gameState.ownedStaffIds
    .map((id) => STAFF.find((s) => s.id === id))
    .filter(Boolean)
    .reduce((sum, s) => sum + s.hireCostPerDay, 0);
  const trainerCost = gameState.ownedTrainerIds
    .map((id) => TRAINERS.find((t) => t.id === id))
    .filter(Boolean)
    .reduce((sum, t) => sum + t.hireCostPerDay, 0);
  return staffCost + trainerCost;
}

// 銀行融資(§8)。即座に現金が入るが、完済するまで日次で自動返済される。
export function takeBankLoan(gameState) {
  if (gameState.loan) return gameState; // 二重借入はさせない(単純化)
  const cfg = BALANCE.finance.bankLoan;
  gameState.cash += cfg.amount;
  gameState.loan = { remaining: cfg.amount, dailyRepayment: cfg.dailyRepayment };
  return gameState;
}

// タニマチ出資(§8)。返済不要な代わりに、出資が続く間は日次で闇イベントの
// リスクを負う(発生時はファンが減る)。
export function takePatronInvestment(gameState) {
  if (gameState.patronActive) return gameState;
  gameState.cash += BALANCE.finance.patron.amount;
  gameState.patronActive = true;
  return gameState;
}

// 固定給メンバー(§スカウト再設計/§給与体系の月給化)の月次給与合計。歩合制
// メンバーは対象外(ステージ成功報酬からの天引きでapplyBattleResult側が処理する)。
export function getMonthlySalaryCost(gameState) {
  return gameState.roster
    .filter((idol) => idol.salaryType === "fixed")
    .reduce((sum, idol) => sum + (idol.monthlySalary ?? 0), 0);
}

// 日次決算(§8)。advanceDay()から呼ばれる想定。固定給の月給はここではなく
// 月次経費(settleMonthlyExpense、§給与体系の月給化)側で精算する。
export function settleDailyFinances(gameState) {
  // 倒産(§8)対応: 支払えない分もマイナスのまま引き落とす(0でフロアしない)。
  // 月末時点でのマイナス継続はstate.js側のadvanceDayがbankrupt判定する。
  gameState.cash -= getDailyStaffCost(gameState);

  if (gameState.loan) {
    const repay = Math.min(gameState.loan.remaining, gameState.loan.dailyRepayment);
    gameState.cash -= repay;
    gameState.loan.remaining -= repay;
    if (gameState.loan.remaining <= 0) gameState.loan = null;
  }

  if (gameState.patronActive && Math.random() < BALANCE.finance.patron.darkEventChance) {
    gameState.fans = Math.max(0, gameState.fans - BALANCE.finance.patron.darkEventFansPenalty);
  }

  // 事務所設備「専用トレーニングジム」: 清廉度が週次でわずかに自然回復する
  const cleanlinessRegen = getEquipmentEffects(gameState).reduce(
    (sum, e) => sum + (e.cleanlinessRegenPerWeek || 0),
    0
  );
  if (cleanlinessRegen > 0) {
    gameState.cleanliness = Math.min(100, gameState.cleanliness + cleanlinessRegen);
  }

  return gameState;
}

// 事務所の家賃(§月次経費)。所有中の設備(TRAINING_FACILITIES)のmonthlyRent
// 合計。設備を増やす/上位設備に切り替えるほど家賃も上がる。
export function getMonthlyRent(gameState) {
  return gameState.ownedFacilityIds
    .map((id) => TRAINING_FACILITIES.find((f) => f.id === id))
    .filter(Boolean)
    .reduce((sum, f) => sum + (f.monthlyRent ?? 0), 0);
}

// 事務所の「広さ」(所属できるアイドルの人数上限)。所有施設のうち
// 最も広いものが採用される(複数施設を同時所有しても合算はしない。
// 一番広い建物に事務所そのものが入っている、という解釈)。
export function getRosterCapacity(gameState) {
  return gameState.ownedFacilityIds
    .map((id) => TRAINING_FACILITIES.find((f) => f.id === id))
    .filter(Boolean)
    .reduce((max, f) => Math.max(max, f.rosterCapacity ?? 0), 0);
}

// 月次経費(§月次経費/§給与体系の月給化)。日次(実質週次)のスタッフ/
// トレーナー給与とは別枠の、事務所の家賃と固定給メンバーの月給。
// 月が変わるタイミングでstate.js側から呼ばれる。
export function settleMonthlyExpense(gameState) {
  // 倒産(§8)対応: 家賃・月給も0でフロアせず、払えなければマイナスのまま引き落とす。
  gameState.cash -= getMonthlyRent(gameState);
  gameState.cash -= getMonthlySalaryCost(gameState);
  return gameState;
}

// 設備の購入(§7)。購入すると即座にownedFacilityIdsへ加わり、次の月次経費から
// 家賃が反映される。
export function purchaseFacility(gameState, facilityId) {
  if (gameState.ownedFacilityIds.includes(facilityId)) return gameState;
  const facility = TRAINING_FACILITIES.find((f) => f.id === facilityId);
  if (!facility || gameState.cash < facility.purchaseCost) return gameState;
  gameState.cash -= facility.purchaseCost;
  gameState.ownedFacilityIds.push(facilityId);
  return gameState;
}

// 現在の事務所ランクで解放済みのventureだけを返す(minRankId未設定は常時解放)。
export function getAvailableVentures(gameState) {
  const rankPos = rankPositionOf(gameState);
  return VENTURE_TYPES.filter((v) => !v.minRankId || rankPos >= AGENCY_RANKS.findIndex((r) => r.id === v.minRankId));
}

// 投資/コンテンツ(§3.2)の開始。campaignは一括費用を即座に支払い、
// ongoingは費用なしで即座に開始する(週次収支はsettleVenturesが処理する)。
export function startVenture(gameState, ventureId) {
  if (gameState.activeVentures.some((a) => a.ventureId === ventureId)) return gameState;
  const venture = VENTURE_TYPES.find((v) => v.id === ventureId);
  if (!venture) return gameState;

  // §UI改修計画⑩-2: oneTimeのventure(例: シングルリリース)は収益施策ではなく
  // 一度きりのタスク解除ゲート。activeVenturesには乗せず、即座にunlockedTaskIdsへ反映する。
  if (venture.oneTime) {
    gameState.oneTimeVenturesUsed ??= [];
    if (gameState.oneTimeVenturesUsed.includes(ventureId)) return gameState;
    if (gameState.cash < (venture.cost ?? 0)) return gameState;
    gameState.cash -= venture.cost ?? 0;
    gameState.oneTimeVenturesUsed.push(ventureId);
    if (venture.unlocksTaskId) {
      gameState.unlockedTaskIds ??= [];
      if (!gameState.unlockedTaskIds.includes(venture.unlocksTaskId)) {
        gameState.unlockedTaskIds.push(venture.unlocksTaskId);
      }
    }
    return gameState;
  }

  if (venture.mode === "campaign") {
    if (gameState.cash < (venture.cost ?? 0)) return gameState;
    gameState.cash -= venture.cost ?? 0;
    gameState.activeVentures.push({
      ventureId,
      startedOnDay: gameState.day,
      endsOnDay: gameState.day + (venture.durationWeeks ?? 1),
    });
  } else {
    gameState.activeVentures.push({ ventureId, startedOnDay: gameState.day });
  }
  return gameState;
}

// ongoingのventureを任意のタイミングで解約する(campaignは期間終了を待つ想定で対象外)。
export function cancelVenture(gameState, ventureId) {
  gameState.activeVentures = gameState.activeVentures.filter((a) => a.ventureId !== ventureId);
  return gameState;
}

// 進行中venture(§3.2)の週次精算。ongoingは週次費用/収益/ファン増を適用し続け、
// campaignは効果を適用しつつendsOnDayを過ぎたものを取り除く。
export function settleVentures(gameState) {
  // 事務所設備「自社録音・配信ブース」: 投資/コンテンツの収益が底上げされる
  const revenueMultiplier = getEquipmentEffects(gameState).reduce(
    (mult, e) => mult * (e.ventureRevenueMultiplier ?? 1),
    1
  );
  for (const active of gameState.activeVentures) {
    const venture = VENTURE_TYPES.find((v) => v.id === active.ventureId);
    if (!venture) continue;
    const cashDelta =
      (venture.weeklyRevenue ?? 0) * revenueMultiplier -
      (venture.weeklyCost ?? 0) +
      (venture.weeklyCashGain ?? 0) * revenueMultiplier;
    gameState.cash += cashDelta;
    gameState.fans = Math.max(0, gameState.fans + (venture.weeklyFansGain ?? 0));
  }
  gameState.activeVentures = gameState.activeVentures.filter((active) => {
    const venture = VENTURE_TYPES.find((v) => v.id === active.ventureId);
    return venture?.mode !== "campaign" || gameState.day < active.endsOnDay;
  });
  return gameState;
}

// cleanliness(§11「事務所の裏の顔」の簡易指標、0〜100)による悪評・談合
// 確率の補正係数。100(清廉)で1.0倍、0でcleanlinessRiskMultiplierAtZero倍まで悪化する。
export function cleanlinessRiskMultiplier(gameState) {
  const cfg = BALANCE.risk;
  const t = 1 - (gameState.cleanliness ?? 100) / 100;
  return 1 + t * (cfg.cleanlinessRiskMultiplierAtZero - 1);
}

// 事務所の「裏の顔」蓄積(§11)を表すフレーバー用ラベル。数値そのものは
// cleanlinessRiskMultiplier()が参照する。
export function reputationLabel(cleanliness) {
  if (cleanliness >= 80) return "クリーン事務所";
  if (cleanliness <= 30) return "イロモノ事務所";
  return "普通の事務所";
}
