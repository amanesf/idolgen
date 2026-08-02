// グループ結成の闇(§11)。ユニット結成による副次的なファン増加がある一方、
// センター格差(出演メンバー間のスコア偏重)が続くとギスギス度(tension)が
// 蓄積し、一定値を超えると強制解散する。DOM操作は一切行わない。

import { BALANCE } from "./masterData.js?v=1785558404241";

let unitIdCounter = 0;

export function formUnit(gameState, name, memberIds) {
  const cfg = BALANCE.groups;
  const uniqueIds = [...new Set(memberIds)];
  if (uniqueIds.length < cfg.minMembers || uniqueIds.length > cfg.maxMembers) return null;

  unitIdCounter += 1;
  const unit = {
    id: `unit_${Date.now()}_${unitIdCounter}`,
    name: name?.trim() || "無題ユニット",
    memberIds: uniqueIds,
    tension: 0,
  };
  gameState.units.push(unit);
  return unit;
}

export function disbandUnit(gameState, unitId) {
  gameState.units = gameState.units.filter((u) => u.id !== unitId);
}

// 加入(§グループ加入脱退対応)。既に何らかのグループに所属している人・
// maxMembers超過・存在しないユニットは弾く(1人1グループまでの制約を維持)。
export function addUnitMember(gameState, unitId, idolId) {
  const cfg = BALANCE.groups;
  const unit = gameState.units.find((u) => u.id === unitId);
  if (!unit) return { success: false, reason: "not_found" };
  if (unit.memberIds.includes(idolId)) return { success: false, reason: "already_member" };
  if (unit.memberIds.length >= cfg.maxMembers) return { success: false, reason: "full" };
  const alreadyGrouped = gameState.units.some((u) => u.memberIds.includes(idolId));
  if (alreadyGrouped) return { success: false, reason: "already_grouped" };
  unit.memberIds.push(idolId);
  return { success: true };
}

// 脱退(§グループ加入脱退対応)。抜けると人数がminMembers未満になる場合は
// グループごと解散する(半端な1人グループを残さない)。円満な脱退ではないため
// 残ったメンバーのギスギス度を少し上げる。
export function removeUnitMember(gameState, unitId, idolId) {
  const unit = gameState.units.find((u) => u.id === unitId);
  if (!unit || !unit.memberIds.includes(idolId)) return { success: false, reason: "not_found" };

  const cfg = BALANCE.groups;
  const remaining = unit.memberIds.filter((id) => id !== idolId);
  if (remaining.length < cfg.minMembers) {
    gameState.units = gameState.units.filter((u) => u.id !== unitId);
    return { success: true, disbanded: true };
  }
  unit.memberIds = remaining;
  unit.tension = Math.min(100, unit.tension + cfg.leaveTensionGain);
  return { success: true, disbanded: false };
}

// ロースターからの完全離脱(解雇・引退・独立など)時に、所属していた
// グループから後片付けせずメンバーIDだけが残り続けていた不整合を防ぐ。
// state.js側でロースター除籍と必ずセットで呼ぶ想定。
export function removeIdolFromAllUnits(gameState, idolId) {
  for (const unit of [...gameState.units]) {
    if (unit.memberIds.includes(idolId)) removeUnitMember(gameState, unit.id, idolId);
  }
}

// バトル終了後、出演した各ユニットのギスギス度を更新する。2名以上が同じ
// ステージに立った場合のみ判定対象になる。戻り値: 解散したユニット名の配列と、
// (解散せず)共演したユニットIDの配列(ファンボーナス判定用)。
export function updateUnitTensions(gameState, battleState) {
  const cfg = BALANCE.groups;
  const dissolved = [];
  const performedUnitIds = [];

  for (const unit of [...gameState.units]) {
    const members = battleState.performers.filter((p) => unit.memberIds.includes(p.id));
    if (members.length < 2) continue;

    const gains = members.map((p) => p.totalScoreGained ?? 0);
    const max = Math.max(...gains);
    const min = Math.min(...gains);
    const imbalance = max > 0 ? (max - min) / max : 0;

    if (imbalance >= cfg.imbalanceThreshold) {
      unit.tension = Math.min(100, unit.tension + cfg.tensionGainOnImbalance);
    } else {
      unit.tension = Math.max(0, unit.tension - cfg.tensionDecayOtherwise);
    }

    if (unit.tension >= cfg.dissolveThreshold) {
      gameState.units = gameState.units.filter((u) => u.id !== unit.id);
      gameState.fans = Math.max(0, gameState.fans - cfg.dissolutionFansPenalty);
      dissolved.push(unit.name);
    } else {
      performedUnitIds.push(unit.id);
    }
  }

  return { dissolved, performedUnitIds };
}
