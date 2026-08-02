// 仕事選択の経営レイヤー(§6・実装計画Phase 3)。
// 「どの仕事を出すか」だけを決めるモジュールで、陣形パズル自体の判定ロジックには
// 触れない(クライアント格付け・トレンド・バーターの数値適用はbattle.js側)。

import { AGENCY_RANKS, BALANCE } from "./masterData.js?v=1785558404241";
import { getStaffEffects } from "./office.js?v=1785558404241";
import { getClientReputation } from "./state.js?v=1785558404241";

// 累計ファン数から現在の事務所ランクを求める(§6.1)。
export function getAgencyRank(gameState) {
  let current = AGENCY_RANKS[0];
  for (const rank of AGENCY_RANKS) {
    if (gameState.fans >= rank.fansThreshold) current = rank;
  }
  return current;
}

export function rankIndexOf(rankId) {
  return AGENCY_RANKS.findIndex((r) => r.id === rankId);
}

// 日替わりで安定した(=同じdayなら毎回同じ)疑似乱数用ハッシュ。
function stageHash(stageId, day) {
  let h = day * 2654435761;
  for (let i = 0; i < stageId.length; i++) {
    h = (h * 31 + stageId.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ランクで解放済みの仕事のうち、営業モードに応じて見せる範囲を決める。
// - 能動(ドブ板営業): 解放済みの仕事を全部リストし、プレイヤーが自分で選びに行く。
// - 受動(オファー選別): 日替わりで数件だけ「本日のオファー」として提示する
//   (全件は見せない＝待ちの営業判断であることを表現する)。
export function getAvailableStages(gameState, stages) {
  const rank = getAgencyRank(gameState);
  // エージェント(コネクション)の効果: 仕事の解放判定だけ、ランクを+rankSkip
  // 分だけ先取りできる(ランク表示・営業モード自体は変わらない)。
  const rankSkip = getStaffEffects(gameState, "agent").reduce((sum, e) => sum + (e.rankSkip || 0), 0);
  const rankPos = AGENCY_RANKS.indexOf(rank) + rankSkip;

  const unlocked = stages.filter((stage) => {
    const minRankPos = stage.minRankId ? rankIndexOf(stage.minRankId) : 0;
    return rankPos >= minRankPos;
  });

  if (rank.salesMode !== "passive") {
    return { rank, mode: "active", stages: unlocked };
  }

  // 取引先評価(§ボリューム拡張): オファー選別(受動)では、評価が
  // hideBelowReputationを下回った取引先はもうオファーを出してこなくなる
  // (能動営業ならこちらから出向けるので対象外)。
  const reputable = unlocked.filter(
    (stage) => getClientReputation(gameState, stage.id) >= BALANCE.clientReputation.hideBelowReputation
  );

  const offerCount = Math.min(reputable.length, 3);
  const ranked = [...reputable].sort(
    (a, b) => stageHash(a.id, gameState.day) - stageHash(b.id, gameState.day)
  );
  return { rank, mode: "passive", stages: ranked.slice(0, offerCount) };
}
