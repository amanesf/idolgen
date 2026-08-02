// 陣形を通じたスキル継承(§9.2)。前衛(exposed枠)のベテランが持つ特能を、
// 隣接する後衛(非exposed枠)のルーキーへ確率でコピーする。バトル終了後、
// 生存していたメンバーの最終配置(battleState.slotOf)を見て判定する。
// DOM操作は一切行わない。

import { BALANCE } from "./masterData.js?v=1785558404241";

// 戻り値: [{ veteranId, rookieId, talent }, ...] 継承が実際に発生したペアのみ
export function applySkillInheritance(gameState, battleState) {
  const cfg = BALANCE.succession;
  const events = [];

  for (const slot of battleState.activeSlots) {
    if (!slot.exposed) continue;
    const veteranId = battleState.slotOf[slot.id];
    if (!veteranId) continue;
    const veteran = gameState.roster.find((idol) => idol.id === veteranId);
    if (!veteran || veteran.age < cfg.veteranMinAge || !veteran.talent) continue;

    const neighborIds = battleState.formation.adjacency?.[slot.id] ?? [];
    for (const neighborId of neighborIds) {
      const neighborSlot = battleState.activeSlots.find((s) => s.id === neighborId);
      if (!neighborSlot || neighborSlot.exposed) continue;

      const rookieId = battleState.slotOf[neighborId];
      if (!rookieId) continue;
      const rookie = gameState.roster.find((idol) => idol.id === rookieId);
      if (!rookie || rookie.age > cfg.rookieMaxAge || rookie.talent === veteran.talent) continue;

      if (Math.random() < cfg.inheritChance) {
        rookie.talent = veteran.talent;
        events.push({ veteranId: veteran.id, rookieId: rookie.id, talent: veteran.talent });
      }
    }
  }

  return events;
}
