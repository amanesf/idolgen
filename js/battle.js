// タクティカル・ライブシステム（陣形パズル）のロジック本体。
// フォーメーション定義(masterData.FORMATIONS)に従い、スロット構成と
// 「送る(advance)」の移動ルールを差し替え可能にしている。
// このモジュールは純粋なロジックのみを担当し、演出（アニメーション）は
// battleView.js 側が resolveTurn() の返す events を時間をかけて再生する。

import {
  BALANCE,
  FORMATIONS,
  DAMAGE_PATTERNS,
  ATTRIBUTES,
  ATTACK_SHAPES,
  AUDIENCE_BOARD_LAYOUTS,
  BATTLE_LINES,
  getAgeBand,
} from "./masterData.js?v=1785558404241";

function attributeOf(key) {
  return ATTRIBUTES.find((a) => a.key === key) ?? null;
}

function computeMaxStamina(idol) {
  const attribute = attributeOf(idol.attribute);
  const scaling = BALANCE.attributeScaling;
  let bonus = attribute ? attribute.def * scaling.maxStaminaBonusPerDefPoint : 0;
  // 特能「鋼の体幹」「スタミナ切れ体質」: 最大スタミナの固定加減
  if (idol.talent === "iron_core") bonus += BALANCE.talentEffects.iron_core.maxStaminaBonus;
  if (idol.talent === "weak_stamina") bonus -= BALANCE.talentEffects.weak_stamina.maxStaminaPenalty;
  const ageBand = getAgeBand(idol.age);
  const base = BALANCE.stamina.base + idol.stats.mental * BALANCE.stamina.mentalScale + bonus;
  return Math.round(base * (ageBand.maxStaminaMultiplier ?? 1));
}

// 客席ボード(3×3、AUDIENCE_BOARD_LAYOUTS)。総targetScoreをweight比で配分してmaxHpを
// 決める(weight配分のブロックの中で最後のものが端数を吸収し、合計が必ず
// totalTargetScoreと一致するようにする)。layoutBlocksは会場によって中身が変わる
// (stage.audienceLayoutId、§ボリューム拡張)。block.fixedMaxHpを指定すると
// weight比配分から除外し、常にその固定値のmaxHpにする(§お試しステージの
// 「コーチの能力を超えている」席は1撃で倒れるようにする、scoutView.js参照。
// 端数丸めに頼ると0や2以上になり得て「必ず1撃」を保証できないため固定値にする)。
function buildAudienceBoard(totalTargetScore, layoutBlocks) {
  const weightedBlocks = layoutBlocks.filter((b) => b.fixedMaxHp == null);
  const fixedTotal = layoutBlocks.reduce((sum, b) => sum + (b.fixedMaxHp ?? 0), 0);
  const totalWeight = weightedBlocks.reduce((sum, b) => sum + b.weight, 0);
  const remainingScore = Math.max(0, totalTargetScore - fixedTotal);
  let allocated = 0;
  const blocks = layoutBlocks.map((block) => {
    let maxHp;
    if (block.fixedMaxHp != null) {
      maxHp = block.fixedMaxHp;
    } else {
      const isLastWeighted = block === weightedBlocks[weightedBlocks.length - 1];
      maxHp = isLastWeighted ? remainingScore - allocated : Math.round((remainingScore * block.weight) / totalWeight);
      allocated += maxHp;
    }
    return { id: block.id, label: block.label, icon: block.icon, row: block.row, col: block.col, maxHp, hp: maxHp };
  });
  return blocks;
}

function aliveAudienceBlocks(battleState) {
  return battleState.audienceBoard.filter((b) => b.hp > 0);
}

// 現在最もHPの少ないブロック(優先ブロック)。同率なら審査員列(row0)を優先する
// (狙い撃ち・遠距離は審査員狙いになりやすい、というフレーバーに合わせる)。
function priorityAudienceBlock(battleState) {
  const alive = aliveAudienceBlocks(battleState);
  if (alive.length === 0) return null;
  return alive.reduce((best, block) => {
    const ratio = block.hp / block.maxHp;
    const bestRatio = best.hp / best.maxHp;
    if (ratio < bestRatio) return block;
    if (ratio === bestRatio && block.row < best.row) return block;
    return best;
  });
}

function audienceRowNeighbors(battleState, block) {
  return battleState.audienceBoard.filter((b) => b.row === block.row && b.id !== block.id && b.hp > 0);
}

function audienceColumn(battleState, col) {
  return battleState.audienceBoard.filter((b) => b.col === col && b.hp > 0);
}

// 攻撃の形(ATTACK_SHAPES)ごとに、客席ボードのどのブロックへ何ダメージ入れるかを
// 決める。resolveDamageTargets(被弾側)と対称的な、攻撃側の対象決定ロジック。
function resolveAttackTargets(battleState, shapeKey, amount) {
  const shape = ATTACK_SHAPES[shapeKey] ?? ATTACK_SHAPES.random;
  const alive = aliveAudienceBlocks(battleState);
  if (alive.length === 0) return [];

  switch (shape.targeting) {
    case "single_priority": {
      const target = priorityAudienceBlock(battleState);
      return target ? [{ block: target, amount }] : [];
    }
    case "single_plus_adjacent": {
      const target = priorityAudienceBlock(battleState);
      if (!target) return [];
      const hits = [{ block: target, amount }];
      for (const neighbor of audienceRowNeighbors(battleState, target)) {
        hits.push({ block: neighbor, amount: Math.round(amount * 0.5) });
      }
      return hits;
    }
    case "all": {
      const perBlock = Math.max(1, Math.round(amount / alive.length));
      return alive.map((block) => ({ block, amount: perBlock }));
    }
    case "column": {
      const target = priorityAudienceBlock(battleState);
      const col = target ? target.col : Math.floor(Math.random() * battleState.boardCols);
      const blocks = audienceColumn(battleState, col);
      return blocks.length > 0 ? blocks.map((block) => ({ block, amount })) : [{ block: alive[0], amount }];
    }
    case "single_twice": {
      const target = priorityAudienceBlock(battleState);
      return target ? [{ block: target, amount }, { block: target, amount }] : [];
    }
    case "random":
    default: {
      const target = alive[Math.floor(Math.random() * alive.length)];
      return [{ block: target, amount }];
    }
  }
}

// castSize指定があれば、フォーメーションの全枠のうち優先度が高い枠だけを
// 残す（先方オーダーで人数を絞られた案件向け）。sequenceを持つフォーメー
// ションはその並び順を保ったまま間引き、そこから一方通行の巡回を作り直す。
export function buildActiveTopology(formation, castSize) {
  const fullIds = formation.slots.map((s) => s.id);
  if (!castSize || castSize >= fullIds.length) {
    return { slots: formation.slots, advance: formation.advance, priorityOrder: formation.priorityOrder };
  }

  const keep = new Set(formation.priorityOrder.slice(0, castSize));
  const orderedIds = (formation.sequence ?? formation.priorityOrder).filter((id) => keep.has(id));
  const slots = formation.slots.filter((s) => keep.has(s.id));
  const priorityOrder = formation.priorityOrder.filter((id) => keep.has(id));

  const advance = {};
  orderedIds.forEach((id, i) => {
    advance[id] = orderedIds[(i + 1) % orderedIds.length];
  });

  return { slots, advance, priorityOrder };
}

// 実際に出演するメンバーのscoreStats平均(ステージが要求する土俵の実力を測る指標)。
function averageStatLevel(performers, scoreStats) {
  if (performers.length === 0) return 0;
  const [a, b] = scoreStats;
  const total = performers.reduce((sum, p) => sum + (p.stats[a] + p.stats[b]) / 2, 0);
  return total / performers.length;
}

function resolveTurnLimit(stage, songCount) {
  return stage.turnLimitMode === "fixed" ? stage.maxTurns : songCount;
}

// 曲モードのステージだけ「習熟済み曲数」を超えたターンがぶっつけ本番になる。
// 尺モード(ドラマ/映画/トーク)には曲の概念がないのでペナルティは掛からない。
function resolveMasteredLimit(stage, masteredSongCount) {
  return stage.turnLimitMode === "fixed" ? Infinity : masteredSongCount;
}

// assignment: { slotId: idolId } 。事前編成画面(loadout.js)で決める。
// era: gameState.era(§11マクロ環境、任意)。省略時はマクロ環境の影響なし。
export function createBattleState(idols, stage, assignment, songCount, masteredSongCount, era) {
  const formation = FORMATIONS[stage.formationId];
  const topology = buildActiveTopology(formation, stage.castSize);
  const idolMap = new Map(idols.map((idol) => [idol.id, idol]));

  const performers = idols
    .filter((idol) => Object.values(assignment).includes(idol.id))
    .map((idol) => {
      const maxStamina = computeMaxStamina(idol);
      return {
        id: idol.id,
        name: idol.name, // 表示名は常にフルネーム(本名)にする方針
        stats: idol.stats,
        age: idol.age,
        attribute: idol.attribute,
        attributeLabel: idol.attributeLabel,
        talent: idol.talent ?? null,
        interest: idol.interest ?? null, // やる気(§スカウト再設計、0〜100)。未設定はmoraleAttack.defaultInterestで代用
        lastDance: idol.lastDance ?? false,
        cheerBoosted: false,
        fragileNextTurn: false, // 特能「打たれ弱い」: 被弾した次の曲だけ効率が落ちる予約フラグ
        gutsUsed: false, // 特能「根性」: スタミナ0寸前からの強制引退回避を使い切ったか
        moraleAttackUsed: false, // やる気ボーナス攻撃(§ボリューム拡張)を使い切ったか(1ステージにつき1回)
        awakeningUsed: false, // 特能「覚醒」を使い切ったか(1ステージにつき1回)
        fans: idol.fans ?? 0, // 会場特性「人気投票型」(lowest_fans)が参照する
        stress: idol.stress ?? 0, // 会場特性「メンタル連動型」(highest_instability)が参照する(§4.3、完全隠蔽)
        tenguDo: idol.tenguDo ?? 0, // 同上
        avatarInitial: idol.avatarInitial,
        avatarHue: idol.avatarHue,
        portrait: idol.portrait ?? null, // 顔アイコン(§12.1)。あればチップ内にcanvas描画する
        maxStamina,
        stamina: maxStamina,
        retired: false,
        wasExposed: false,
        holdStreakInSlot: 0,
        totalScoreGained: 0, // グループのギスギス度判定(§11、js/units.js)に使う
      };
    });

  const slotOf = {};
  for (const [slotId, idolId] of Object.entries(assignment)) {
    if (idolMap.has(idolId)) slotOf[slotId] = idolId;
  }

  // クライアント格付け(§6.2)の係数。期待値ライン・報酬(state.js側)・
  // スタミナ経済に一律で乗る。
  const clientConf = BALANCE.clientTiers[stage.clientTier] || BALANCE.clientTiers.clean;

  // バーター営業(§6.2)判定: 実際の編成の平均実力が推奨レベルを
  // 大きく下回るなら、実力不足を知名度で押し切る扱いとして期待値ラインが上がる。
  const avgLevel = averageStatLevel(performers, stage.scoreStats);
  const isBarter =
    stage.recommendedStatLevel != null && avgLevel <= stage.recommendedStatLevel - BALANCE.barter.statGapThreshold;

  const targetScoreMultiplier =
    clientConf.targetScoreMultiplier * (isBarter ? BALANCE.barter.targetScoreMultiplier : 1);
  const initialTargetScore = Math.round(stage.targetScore * targetScoreMultiplier);
  const damagePattern = DAMAGE_PATTERNS[stage.damagePatternId] || DAMAGE_PATTERNS.single_random;
  // stage.audienceLayoutはマスターデータ登録済みのレイアウトIDに頼らず、
  // 呼び出し側が観客席の構成をその場で組み立てたい場合に使う(§お試しステージは
  // 選択項目数に合わせて観客席を増やす、scoutView.js参照)。
  const boardLayout = stage.audienceLayout ?? AUDIENCE_BOARD_LAYOUTS[stage.audienceLayoutId] ?? AUDIENCE_BOARD_LAYOUTS.standard_hall;
  const audienceBoard = buildAudienceBoard(initialTargetScore, boardLayout.blocks);

  return {
    stage,
    formation,
    activeSlots: topology.slots,
    activeAdvance: topology.advance,
    activePriorityOrder: topology.priorityOrder,
    performers,
    slotOf, // slotId -> idolId | undefined
    turn: 0,
    turnLimit: resolveTurnLimit(stage, songCount),
    masteredLimit: resolveMasteredLimit(stage, masteredSongCount),
    score: 0,
    targetScore: initialTargetScore,
    baseTargetScore: initialTargetScore, // 「目標の逆行」(target_creep)の増分計算の基準値
    audienceBoard, // 客席ボード。score/targetScoreの内訳を可視化するブロック群(サイズ可変、§ボリューム拡張)
    boardLayoutBlocks: boardLayout.blocks, // このバトルで使用中の客席レイアウト定義(target_creepのweight参照用)
    boardCols: boardLayout.cols, // battleView.jsのCSSグリッド組み立て・column攻撃のランダム対象決定に使う
    boardRows: boardLayout.rows,
    staminaCostMultiplier: clientConf.staminaCostMultiplier,
    trendAttribute: stage.trendAttribute ?? null,
    era: era ?? null,
    damagePattern,
    isBarter,
    heat: BALANCE.heat.start,
    comboStreak: 0,
    pendingDamage: null,
    cheerBoostsUsed: 0, // 応援ブースト(§3.6・§10、大型イベント限定)の使用回数
    result: null, // 'success' | 'fail' | 'retreat' | 'timeup' | null
  };
}

function getPerformer(battleState, id) {
  return battleState.performers.find((p) => p.id === id);
}

// 応援ブースト(§10)。大型イベント/アワード限定。対象は現時点でスタミナが
// 最も少ない出演中(非引退・非ラストダンス)のメンバーを自動選択する。
// 現金消費・回数制限のチェックは呼び出し側(state.js)が行う。
export function applyCheerBoost(battleState) {
  if (!battleState.stage.isMilestone || battleState.result) return null;
  if (battleState.cheerBoostsUsed >= BALANCE.cheerBoost.maxUsesPerBattle) return null;

  const candidates = battleState.performers.filter((p) => !p.retired && !p.lastDance);
  if (candidates.length === 0) return null;
  const target = candidates.reduce((a, b) => (b.stamina < a.stamina ? b : a));

  target.stamina = clamp(target.stamina + BALANCE.cheerBoost.staminaRestore, 0, target.maxStamina);
  target.cheerBoosted = true;
  battleState.cheerBoostsUsed += 1;
  return { type: "cheer_boost", idolId: target.id, staminaAfter: target.stamina };
}

function slotById(battleState, slotId) {
  return battleState.activeSlots.find((s) => s.id === slotId);
}

function activeOccupant(battleState, slotId) {
  const idolId = battleState.slotOf[slotId];
  if (!idolId) return null;
  const performer = getPerformer(battleState, idolId);
  return performer && !performer.retired ? performer : null;
}

function heatEfficiency(heat) {
  const { min, max, efficiencyAtMin, efficiencyAtMax } = BALANCE.heat;
  const t = (heat - min) / (max - min);
  return efficiencyAtMin + (efficiencyAtMax - efficiencyAtMin) * t;
}

function comboMultiplier(battleState) {
  const { perHoldBonus, maxBonus } = BALANCE.combo;
  return 1 + Math.min(maxBonus, battleState.comboStreak * perHoldBonus);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function highestScoreMultSlotId(slots) {
  return slots.reduce((best, s) => (s.scoreMult > best.scoreMult ? s : best)).id;
}

function statPowerOf(performer, scoreStats) {
  const [a, b] = scoreStats;
  return (performer.stats[a] + performer.stats[b]) / 2;
}

// 次に被弾が起こるかどうかを事前に決めておく（予兆）。
// 単体系のパターン(random/lowest_stamina/anti_trend/center)は対象を先に
// 決めておき、誰がそのスロットに来るかはプレイヤーの送る/耐えるの選択で
// 変わるため、予兆を見てからの読み合いが生まれる。全体系のパターン
// (all_exposed/random_multi)は「発生するかどうか」だけ先に決め、実際に
// 誰が対象になるかは解決時(resolveDamageTargets)に確定させる。
// タイミング型の会場特性(§3.8-B)。turnPhase(サビ等)の概念自体は実装していないため、
// ターンカウンタの周期そのもの(chorusInterval/countdownInterval)を到来タイミングと
// する簡易版。ランダムな発生確率(BALANCE.telegraph.chance)は使わず、周期のみで
// 確実に起きる/起きないを決める(サビは「そこだけ耐えればいい」、カウントダウンは
// 「読んで退避する」という一点集中の緊張感をランダム性抜きで再現する)。
function primeTimedBurst(battleState, intervalKey, defaultInterval, label) {
  const pattern = battleState.damagePattern;
  const interval = pattern[intervalKey] ?? defaultInterval;
  const nextTurn = battleState.turn + 1;
  const willHappen = nextTurn % interval === 0;
  battleState.pendingDamage = willHappen
    ? { willHappen: true, amount: pattern.burstAmount ?? BALANCE.telegraph.amount * 2, slotLabel: label }
    : { willHappen: false };
  return willHappen
    ? { type: "telegraph", willHappen: true, slotLabel: label }
    : { type: "telegraph", willHappen: false };
}

export function primeTelegraph(battleState) {
  const timedPattern = battleState.damagePattern.targeting;
  if (timedPattern === "chorus_burst") {
    return primeTimedBurst(battleState, "chorusInterval", 4, "サビ(会場全体)");
  }
  if (timedPattern === "countdown_burst") {
    return primeTimedBurst(battleState, "countdownInterval", 3, "大技警戒(会場全体)");
  }

  // 次のターンがぶっつけ本番の曲なら、被弾も起きやすくしておく
  const nextIsUnpracticed = battleState.turn + 1 > battleState.masteredLimit;
  const chance = nextIsUnpracticed
    ? Math.min(0.95, BALANCE.telegraph.chance + BALANCE.repertoire.unpracticedPenalty.extraDamageChance)
    : BALANCE.telegraph.chance;
  const willHappen = Math.random() < chance;
  if (!willHappen) {
    battleState.pendingDamage = { willHappen: false };
    return { type: "telegraph", willHappen: false };
  }
  const target = pickTelegraphTarget(battleState);
  battleState.pendingDamage = {
    willHappen: true,
    slotId: target.slotId,
    idolId: target.idolId,
    slotLabel: target.label,
    amount: BALANCE.telegraph.amount,
  };
  return { type: "telegraph", willHappen: true, slotId: target.slotId, slotLabel: target.label };
}

function pickTelegraphTarget(battleState) {
  const pattern = battleState.damagePattern;
  const exposedIds = battleState.activePriorityOrder.filter((id) => slotById(battleState, id).exposed);
  const pool = exposedIds.length > 0 ? exposedIds : battleState.activePriorityOrder;

  if (pattern.targeting === "all_exposed") {
    return { label: "前列全体" };
  }
  if (pattern.targeting === "random_multi" || pattern.targeting === "random_repeat") {
    return { label: "複数箇所" };
  }
  if (pattern.targeting === "center") {
    const centerId = highestScoreMultSlotId(battleState.activeSlots);
    return { slotId: centerId, label: slotById(battleState, centerId).label };
  }
  if (pattern.targeting === "lowest_stamina") {
    const candidates = battleState.activePriorityOrder
      .map((id) => activeOccupant(battleState, id))
      .filter((p) => p && !p.lastDance);
    if (candidates.length > 0) {
      const weakest = candidates.reduce((a, b) => (b.stamina < a.stamina ? b : a));
      return { idolId: weakest.id, label: weakest.name };
    }
  }
  if (pattern.targeting === "anti_trend") {
    const candidates = battleState.activePriorityOrder
      .map((id) => activeOccupant(battleState, id))
      .filter((p) => p && !p.lastDance);
    const offTrend = battleState.trendAttribute
      ? candidates.filter((p) => p.attribute !== battleState.trendAttribute)
      : [];
    const chosenPool = offTrend.length > 0 ? offTrend : candidates;
    if (chosenPool.length > 0) {
      const chosen = chosenPool[Math.floor(Math.random() * chosenPool.length)];
      return { idolId: chosen.id, label: chosen.name };
    }
  }
  // 人気投票型(不人気狙い撃ち): ファン人気(idol.fans)が最も低いメンバーを狙う
  if (pattern.targeting === "lowest_fans") {
    const candidates = battleState.activePriorityOrder
      .map((id) => activeOccupant(battleState, id))
      .filter((p) => p && !p.lastDance);
    if (candidates.length > 0) {
      const leastPopular = candidates.reduce((a, b) => ((b.fans ?? 0) < (a.fans ?? 0) ? b : a));
      return { idolId: leastPopular.id, label: leastPopular.name };
    }
  }
  // メンタル連動型(不安定狙い撃ち): ストレス・天狗度(§4.3、完全隠蔽)の合計が最も高いメンバーを狙う
  if (pattern.targeting === "highest_instability") {
    const candidates = battleState.activePriorityOrder
      .map((id) => activeOccupant(battleState, id))
      .filter((p) => p && !p.lastDance);
    if (candidates.length > 0) {
      const instability = (p) => (p.stress ?? 0) + (p.tenguDo ?? 0);
      const mostUnstable = candidates.reduce((a, b) => (instability(b) > instability(a) ? b : a));
      return { idolId: mostUnstable.id, label: mostUnstable.name };
    }
  }

  const slotId = pool[Math.floor(Math.random() * pool.length)];
  return { slotId, label: slotById(battleState, slotId).label };
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 影(shadow)属性の肩代わり対象を探す(隣接枠のみ)。
// 属性の身代わり効果(effect: "substitution"、🎭影など)を持つ隣接メンバーを探す。
function findAdjacentSubstitute(battleState, targetIdolId) {
  const targetSlotId = Object.entries(battleState.slotOf).find(([, iid]) => iid === targetIdolId)?.[0];
  if (!targetSlotId) return null;
  const neighborIds = battleState.formation.adjacency?.[targetSlotId] ?? [];
  for (const nid of neighborIds) {
    const occupant = activeOccupant(battleState, nid);
    if (occupant && attributeOf(occupant.attribute)?.effect === "substitution") return occupant;
  }
  return null;
}

// ②バトル中の吹き出し。このターンで積まれたeventsから「引退>大ダメージ被弾>
// 大きい得点」の優先度で最大2人を抽選し、speechイベントを追加する(演出が
// 煩雑にならないよう人数を絞る)。同一キャラが二重に喋らないようにする。
function pickSpeechEvents(battleState, turnEvents) {
  const spoken = new Set();
  const speeches = [];

  function speak(idolId, category) {
    if (spoken.has(idolId) || speeches.length >= 2) return;
    const lines = BATTLE_LINES[category];
    if (!lines || lines.length === 0) return;
    spoken.add(idolId);
    speeches.push({ type: "speech", idolId, line: lines[Math.floor(Math.random() * lines.length)] });
  }

  const retiredIds = turnEvents.filter((e) => e.type === "retire").map((e) => e.idolId);
  for (const idolId of retiredIds) speak(idolId, "retire_common");

  // やる気ボーナス攻撃(§ボリューム拡張)の発動は目立たせたいので、被弾より先に拾う
  const moraleAttackIds = turnEvents.filter((e) => e.type === "morale_attack").map((e) => e.idolId);
  for (const idolId of moraleAttackIds) speak(idolId, "morale_attack");

  const damageEvents = turnEvents
    .filter((e) => e.type === "damage" && !e.chip)
    .sort((a, b) => b.amount - a.amount);
  for (const ev of damageEvents) speak(ev.idolId, "hit_common");

  const scoreEvents = turnEvents.filter((e) => e.type === "score").sort((a, b) => b.amount - a.amount);
  for (const ev of scoreEvents) {
    const performer = getPerformer(battleState, ev.idolId);
    const attribute = performer && attributeOf(performer.attribute);
    const category =
      attribute?.role === "defender"
        ? "defender_guard"
        : attribute?.role === "supporter"
        ? "supporter_score"
        : attribute?.role === "allrounder"
        ? "allrounder_score"
        : "attacker_score";
    speak(ev.idolId, category);
  }

  return speeches;
}

// 予兆どおりに被弾を解決する際の実際の対象一覧を決める(パターン毎)。
// { performer, ratio }の配列を返す。ratioはpending.amountに掛ける係数
// (クロスファイアの波及分など、本体より軽いダメージを表現するのに使う)。
function resolveDamageTargets(battleState, pending) {
  const pattern = battleState.damagePattern;

  if (pattern.targeting === "all_exposed") {
    return battleState.activeSlots
      .filter((s) => s.exposed)
      .map((s) => activeOccupant(battleState, s.id))
      .filter((p) => p && !p.lastDance)
      .map((performer) => ({ performer, ratio: 1 }));
  }
  if (pattern.targeting === "random_multi") {
    const candidates = shuffleInPlace(
      battleState.activePriorityOrder.map((id) => activeOccupant(battleState, id)).filter((p) => p && !p.lastDance)
    );
    return candidates.slice(0, pattern.hits ?? 1).map((performer) => ({ performer, ratio: 1 }));
  }
  // 連続ランダム(乱打型): random_multiと違い重複を許した抽選(同一メンバーへの連続被弾もあり得る)
  if (pattern.targeting === "random_repeat") {
    const pool = battleState.activePriorityOrder.map((id) => activeOccupant(battleState, id)).filter((p) => p && !p.lastDance);
    const results = [];
    for (let i = 0; i < (pattern.hits ?? 2) && pool.length > 0; i++) {
      results.push({ performer: pool[Math.floor(Math.random() * pool.length)], ratio: 1 });
    }
    return results;
  }
  // サビ限定集中砲火・カウントダウン爆発: どちらも発生時は前列一斉(all_exposed)と同じ対象決定
  if (pattern.targeting === "chorus_burst" || pattern.targeting === "countdown_burst") {
    return battleState.activeSlots
      .filter((s) => s.exposed)
      .map((s) => activeOccupant(battleState, s.id))
      .filter((p) => p && !p.lastDance)
      .map((performer) => ({ performer, ratio: 1 }));
  }

  // 単体系(random/lowest_stamina/anti_trend/center): 予兆時に決めた対象を解決する。
  // ラストダンス(§9.3)中のメンバーは有終の美として被弾対象から除外する。
  let primary = null;
  if (pending.idolId) primary = getPerformer(battleState, pending.idolId);
  if (!primary && pending.slotId) primary = activeOccupant(battleState, pending.slotId);
  if (!primary || primary.retired || primary.lastDance) primary = fallbackTarget(battleState);
  if (!primary) return [];

  const targets = [{ performer: primary, ratio: 1 }];
  if (pattern.chainToAdjacent) {
    const primarySlotId = Object.entries(battleState.slotOf).find(([, iid]) => iid === primary.id)?.[0];
    const neighborIds = (primarySlotId && battleState.formation.adjacency?.[primarySlotId]) || [];
    for (const nid of neighborIds) {
      const neighbor = activeOccupant(battleState, nid);
      if (neighbor && !neighbor.lastDance) targets.push({ performer: neighbor, ratio: pattern.chainDamageRatio });
    }
  }
  return targets;
}

// 1曲(1シーン/1コーナー)分をまとめて計算し、演出用のイベント列を返す。
export function resolveTurn(battleState, { advance }) {
  const events = [];
  if (battleState.result) return events;

  battleState.turn += 1;
  const scoreStats = battleState.stage.scoreStats;
  const isUnpracticed = battleState.turn > battleState.masteredLimit;
  if (isUnpracticed) {
    events.push({ type: "unpracticed" });
  }

  if (advance) {
    const nextSlotOf = {};
    for (const [fromSlot, idolId] of Object.entries(battleState.slotOf)) {
      const toSlot = battleState.activeAdvance[fromSlot];
      nextSlotOf[toSlot] = idolId;
    }
    battleState.slotOf = nextSlotOf;
    battleState.comboStreak = 0;
    events.push({ type: "advance", slotOf: { ...battleState.slotOf } });
  } else {
    battleState.comboStreak += 1;
  }

  const combo = comboMultiplier(battleState);
  const scaling = BALANCE.attributeScaling;
  let heatAccum = 0;
  const scoreGains = []; // { performer, slot, amount, shapeKey } 華の支援(バフ)で後から底上げする

  for (const slot of battleState.activeSlots) {
    const performer = activeOccupant(battleState, slot.id);
    if (!performer) continue;

    const isExposedNow = slot.exposed;
    const attribute = attributeOf(performer.attribute);
    // stage.forceAttackShapeがあれば属性由来のshapeより優先する(§お試しステージは
    // 客席を全体に薄く配分する固定の攻撃形にする、scoutView.js参照)。
    const shapeKey = battleState.stage.forceAttackShape ?? attribute?.shape ?? "random";
    const shape = ATTACK_SHAPES[shapeKey] ?? ATTACK_SHAPES.random;
    // 🏹遠距離(ignoresExposedRequirement): 非露出(scoreMult0)スロットからでも攻撃できる
    const canAttackHere = slot.scoreMult > 0 || shape.ignoresExposedRequirement;

    if (canAttackHere) {
      let mult = slot.scoreMult > 0 ? slot.scoreMult : scaling.rangedBackstageScoreMult;
      // 属性の攻撃力(atk 1〜5、テーブルはBALANCE.attributeScaling.atkScoreMultiplier参照)
      if (attribute) mult *= scaling.atkScoreMultiplier[attribute.atk] ?? 1;

      if (battleState.trendAttribute) {
        mult *= performer.attribute === battleState.trendAttribute
          ? BALANCE.trend.matchedMultiplier
          : BALANCE.trend.mismatchedMultiplier;
      }
      // マクロ環境(§11): パラダイムシフト後の追い風は日を追うごとに賞味期限切れで
      // 弱まり、暗黒期(antiTrend)はその属性がむしろ叩かれる
      if (battleState.era?.trendAttribute && performer.attribute === battleState.era.trendAttribute) {
        const eraCfg = BALANCE.macroEra;
        if (battleState.era.antiTrend) {
          mult *= eraCfg.antiTrendPenaltyMultiplier;
        } else {
          const decay = Math.min(1, battleState.era.daysSinceShift / eraCfg.staleAfterDays);
          mult *= eraCfg.peakMultiplier - decay * (eraCfg.peakMultiplier - eraCfg.staleMultiplier);
        }
      }
      // 年齢帯(§9.1): ガラスの大砲は前列でさらに伸び、バフの司令塔は前列がやや落ちる
      mult *= (isExposedNow ? getAgeBand(performer.age).exposedScoreMultiplier : null) ?? 1;
      // 特能「大舞台○」: 期待値ラインに近づくほどスコア効率が上がる
      if (
        performer.talent === "stage_strong" &&
        battleState.score / battleState.targetScore >= BALANCE.talentEffects.stage_strong.scoreThresholdRatio
      ) {
        mult *= BALANCE.talentEffects.stage_strong.scoreBonusMultiplier;
      }
      // 特能「負けず嫌い」: 終盤(ターン進行度60%超)かつ目標未達なら伸びる
      if (
        performer.talent === "underdog" &&
        battleState.turn / battleState.turnLimit >= BALANCE.talentEffects.underdog.lateThresholdRatio &&
        battleState.score < battleState.targetScore
      ) {
        mult *= BALANCE.talentEffects.underdog.scoreBonusMultiplier;
      }
      // 特能「天性のセンター」「センター恐怖症」: センター枠(最高scoreMult枠)での増減
      const isCenterSlot = slot.id === highestScoreMultSlotId(battleState.activeSlots);
      if (isCenterSlot && performer.talent === "center_born") {
        mult *= BALANCE.talentEffects.center_born.centerScoreBonusMultiplier;
      }
      if (isCenterSlot && performer.talent === "center_phobia") {
        mult *= BALANCE.talentEffects.center_phobia.centerScorePenaltyMultiplier;
      }
      // 特能「燃え尽き症候群」: 粘る(同じスロットに留まる)ほど逆に効率が落ちる
      if (performer.talent === "burnout") {
        const penalty = Math.min(
          BALANCE.talentEffects.burnout.maxPenalty,
          BALANCE.talentEffects.burnout.comboPenaltyPerHold * performer.holdStreakInSlot
        );
        mult *= 1 - penalty;
      }
      // 特能「打たれ弱い」: 前の曲で被弾した反動が今だけ乗る
      if (performer.fragileNextTurn) {
        mult *= BALANCE.talentEffects.fragile.postHitScoreMultiplier;
        performer.fragileNextTurn = false;
      }
      // 特能「聞き上手」「カリスマ性」「人見知り」「需要とのズレ」: ステージの
      // scoreStatsに該当ステータスが含まれるかどうかで効率が増減する
      for (const talentId of ["good_listener", "charisma", "shy", "demand_mismatch"]) {
        if (performer.talent !== talentId) continue;
        const conf = BALANCE.talentEffects[talentId];
        if (!scoreStats.includes(conf.matchingStat)) continue;
        mult *= conf.scoreBonusMultiplier ?? conf.scorePenaltyMultiplier;
      }
      // ラストダンス(§9.3): 全盛期を超える限界突破ステータス
      if (performer.lastDance) {
        mult *= BALANCE.lastDance.statBonusMultiplier;
      }
      // 応援ブースト(§10): 発動した次の1ターンだけスコア効率が上がる
      if (performer.cheerBoosted) {
        mult *= BALANCE.cheerBoost.scoreBoostMultiplier;
      }

      let practiceMult = isUnpracticed ? BALANCE.repertoire.unpracticedPenalty.scoreMultiplier : 1;
      // 特能「あがり症」「練習の虫」: ぶっつけ本番のペナルティが悪化/軽減する
      if (isUnpracticed && performer.talent === "stage_fright") {
        practiceMult *= BALANCE.talentEffects.stage_fright.unpracticedScoreMultiplier;
      }
      if (isUnpracticed && performer.talent === "practice_bug") {
        practiceMult *= BALANCE.talentEffects.practice_bug.unpracticedScoreMultiplier;
      }
      // 特能「覚醒」: スタミナ枯渇寸前(ピンチ)の瞬間だけ低確率で発動し、その曲だけ
      // 実質ステータスをS相当(statPowerOverride)まで引き上げる(1ステージ1回限り)。
      let isAwakened = false;
      if (performer.talent === "awakening" && !performer.awakeningUsed && !performer.lastDance) {
        const cfg = BALANCE.talentEffects.awakening;
        const staminaRatio = performer.maxStamina > 0 ? performer.stamina / performer.maxStamina : 1;
        if (staminaRatio <= cfg.staminaCrisisRatio && Math.random() < cfg.chance) {
          isAwakened = true;
          performer.awakeningUsed = true;
        }
      }
      const statPower = isAwakened ? BALANCE.talentEffects.awakening.statPowerOverride : statPowerOf(performer, scoreStats);
      const base = BALANCE.scoreBaseUnit * (statPower / 50);
      const amount = Math.round(base * mult * heatEfficiency(battleState.heat) * combo * practiceMult);
      scoreGains.push({ performer, slot, amount, shapeKey, isAwakened });
    }

    let staminaCost = performer.lastDance ? 0 : slot.staminaCost; // ラストダンスはスタミナ消費ゼロ
    // 💚回復(effect: "heal"、❄️氷・闇など): 回復スロットでの回復量を上乗せする
    if (attribute?.effect === "heal" && staminaCost < 0) {
      staminaCost -= attribute.heal * scaling.healPerPoint;
    }
    if (staminaCost < 0 && battleState.damagePattern.recoveryMultiplier != null) {
      // 回復封じ(灼熱型): バックステージ等の回復量(負のstaminaCost)を減衰させる
      staminaCost = Math.round(staminaCost * battleState.damagePattern.recoveryMultiplier);
    }
    if (staminaCost > 0) {
      staminaCost = Math.round(staminaCost * battleState.staminaCostMultiplier);
      // 特能「省エネ体質」「燃費が悪い」: 消費が全体的に軽く/重くなる
      if (performer.talent === "energy_saver") staminaCost = Math.round(staminaCost * BALANCE.talentEffects.energy_saver.staminaCostMultiplier);
      if (performer.talent === "high_upkeep") staminaCost = Math.round(staminaCost * BALANCE.talentEffects.high_upkeep.staminaCostMultiplier);
    }
    performer.stamina = clamp(performer.stamina - staminaCost, 0, performer.maxStamina);

    heatAccum += slot.heatDelta;
    performer.wasExposed = isExposedNow;
    performer.holdStreakInSlot = advance ? 0 : performer.holdStreakInSlot + 1;
  }

  // 💚バフ(effect: "buff"、🌸華など): 非被弾スロットにいるバフ役が、被弾スロット
  // 全員の獲得量を底上げする。バフの司令塔世代(22歳〜)は支援効果そのものが強化される(§9.1)。
  const supporters = battleState.activeSlots
    .map((slot) => activeOccupant(battleState, slot.id))
    .filter((performer, i) => performer && !battleState.activeSlots[i].exposed && attributeOf(performer.attribute)?.effect === "buff");
  if (supporters.length > 0) {
    const totalPercent = supporters.reduce((sum, performer) => {
      const attribute = attributeOf(performer.attribute);
      return sum + attribute.heal * scaling.buffPercentPerPoint * (getAgeBand(performer.age).supportBonusMultiplier ?? 1);
    }, 0);
    const bonus = 1 + totalPercent;
    for (const gain of scoreGains) {
      if (gain.slot.exposed) gain.amount = Math.round(gain.amount * bonus);
    }
  }

  // 特能「絆の証」「孤高」: 隣接スロットに仲間がいると双方少し底上げされる
  // (自分・隣接どちらかが「孤高」ならこの恩恵は発生しない)
  const bondBonus = BALANCE.talentEffects.bond_proof.adjacentScoreBonusMultiplier;
  for (const gain of scoreGains) {
    if (gain.performer.talent === "loner") continue;
    const slotId = Object.entries(battleState.slotOf).find(([, iid]) => iid === gain.performer.id)?.[0];
    const neighborIds = (slotId && battleState.formation.adjacency?.[slotId]) || [];
    const hasBondedNeighbor = neighborIds.some((nid) => {
      const neighbor = activeOccupant(battleState, nid);
      return neighbor && neighbor.talent !== "loner" && (neighbor.talent === "bond_proof" || gain.performer.talent === "bond_proof");
    });
    if (hasBondedNeighbor) gain.amount = Math.round(gain.amount * bondBonus);
  }

  const moraleCfg = BALANCE.moraleAttack;
  for (const gain of scoreGains) {
    battleState.score += gain.amount;
    gain.performer.totalScoreGained += gain.amount;
    if (gain.isAwakened) events.push({ type: "awakening", idolId: gain.performer.id });
    for (const { block, amount } of resolveAttackTargets(battleState, gain.shapeKey, gain.amount)) {
      block.hp = Math.max(0, block.hp - amount);
      events.push({
        type: "audience_hit",
        blockId: block.id,
        blockLabel: block.label,
        idolId: gain.performer.id,
        amount,
        hpAfter: block.hp,
        maxHp: block.maxHp,
        collapsed: block.hp <= 0,
      });
    }
    events.push({
      type: "score",
      idolId: gain.performer.id,
      slotId: gain.slot.id,
      amount: gain.amount,
      scoreAfter: battleState.score,
    });
    events.push({ type: "stamina", idolId: gain.performer.id, staminaAfter: gain.performer.stamina });

    // やる気ボーナス攻撃(§ボリューム拡張): やる気(interest、0〜100)に応じた確率
    // (最大50%)で、通常攻撃に加えてもう1回分の属性攻撃を追加で放つ。
    // 1人につき1ステージ(仕事)で最大1回だけ発動する。
    if (!gain.performer.moraleAttackUsed) {
      const interest = gain.performer.interest ?? moraleCfg.defaultInterest;
      const chance = (Math.min(100, interest) / 100) * (moraleCfg.maxChancePercent / 100);
      if (Math.random() < chance) {
        gain.performer.moraleAttackUsed = true;
        const bonusAmount = Math.round(gain.amount * moraleCfg.bonusDamageRatio);
        // 通常攻撃と同様にscoreにも加算し、客席ボードの合計HPとscoreの
        // 対応関係(§客席ボード)を崩さないようにする。
        battleState.score += bonusAmount;
        gain.performer.totalScoreGained += bonusAmount;
        events.push({ type: "morale_attack", idolId: gain.performer.id, amount: bonusAmount });
        for (const { block, amount } of resolveAttackTargets(battleState, gain.shapeKey, bonusAmount)) {
          block.hp = Math.max(0, block.hp - amount);
          events.push({
            type: "audience_hit",
            blockId: block.id,
            blockLabel: block.label,
            idolId: gain.performer.id,
            amount,
            hpAfter: block.hp,
            maxHp: block.maxHp,
            collapsed: block.hp <= 0,
            morale: true,
          });
        }
        events.push({
          type: "score",
          idolId: gain.performer.id,
          slotId: gain.slot.id,
          amount: bonusAmount,
          scoreAfter: battleState.score,
        });
      }
    }
  }
  // スコアを稼がないスロット(休息枠)のスタミナ変化も反映する
  for (const slot of battleState.activeSlots) {
    if (slot.scoreMult > 0) continue;
    const performer = activeOccupant(battleState, slot.id);
    if (performer) events.push({ type: "stamina", idolId: performer.id, staminaAfter: performer.stamina });
  }

  // マイペース: 出演中に持っている人がいると熱量ゲージの伸びそのものが鈍る
  const hasMyPace = battleState.performers.some((p) => !p.retired && p.talent === "my_pace");
  if (hasMyPace && heatAccum > 0) {
    heatAccum = Math.round(heatAccum * BALANCE.talentEffects.my_pace.heatGainMultiplier);
  }
  battleState.heat = clamp(battleState.heat + heatAccum, BALANCE.heat.min, BALANCE.heat.max);
  // 特能「ムードメーカー」・属性の💚鼓舞(effect: "rally"、🌈虹など): 在籍しているだけで
  // 熱量の下限を底上げする。両方いる場合はより高い方の下限が採用される。
  let heatFloor = BALANCE.heat.min;
  for (const performer of battleState.performers) {
    if (performer.retired) continue;
    if (performer.talent === "mood_maker") {
      heatFloor = Math.max(heatFloor, BALANCE.heat.min + BALANCE.talentEffects.mood_maker.heatFloorBonus);
    }
    const attribute = attributeOf(performer.attribute);
    if (attribute?.effect === "rally") {
      heatFloor = Math.max(heatFloor, BALANCE.heat.min + attribute.heal * scaling.rallyPerPoint);
    }
  }
  battleState.heat = Math.max(battleState.heat, heatFloor);
  events.push({ type: "heat", heatAfter: battleState.heat });

  // 目標の逆行(ステージHP回復型): 毎ターン、期待値ラインがわずかに伸びる。
  // 客席ボードの各ブロックにも同じ増分をweight比で配分し、見た目のHPも一緒に伸ばす。
  if (battleState.damagePattern.targetCreepPerTurn) {
    const creepAmount = Math.round(battleState.baseTargetScore * battleState.damagePattern.targetCreepPerTurn);
    battleState.targetScore += creepAmount;
    const totalWeight = battleState.boardLayoutBlocks.reduce((sum, b) => sum + b.weight, 0);
    let allocated = 0;
    battleState.audienceBoard.forEach((block, i) => {
      const weight = battleState.boardLayoutBlocks[i].weight;
      const share = i === battleState.audienceBoard.length - 1 ? creepAmount - allocated : Math.round((creepAmount * weight) / totalWeight);
      allocated += share;
      block.maxHp += share;
    });
    events.push({ type: "target_creep", targetScoreAfter: battleState.targetScore });
  }

  // 予兆どおりに被弾を解決する（対象はパターン毎にresolveDamageTargetsが決める）
  const pending = battleState.pendingDamage;
  if (pending?.willHappen) {
    const targets = resolveDamageTargets(battleState, pending);
    if (targets.length === 0) {
      events.push({ type: "damage_miss" });
    }
    for (const { performer: target, ratio } of targets) {
      const targetAttribute = attributeOf(target.attribute);
      // 🛡防御(effect: "reduction"、🗿岩・光など): defが1につき軽減量+2
      const reduction = targetAttribute?.effect === "reduction" ? targetAttribute.def * scaling.defenseReductionPerPoint : 0;
      let amount = Math.max(1, Math.round(pending.amount * ratio) - reduction);
      // 特能「ガラスの喉」「不運体質」: 被弾ダメージがやや重くなる
      if (target.talent === "glass_throat") {
        amount = Math.round(amount * BALANCE.talentEffects.glass_throat.damageTakenMultiplier);
      }
      if (target.talent === "unlucky_body") {
        amount = Math.round(amount * BALANCE.talentEffects.unlucky_body.damageTakenMultiplier);
      }

      // 🎭身代わり(effect: "substitution"): 隣接枠にいれば被弾を肩代わりする
      const substitute = findAdjacentSubstitute(battleState, target.id);
      if (substitute) {
        const substituteAttribute = attributeOf(substitute.attribute);
        const absorbPercent = substituteAttribute.def * scaling.substitutionPercentPerPoint;
        const substituteAmount = Math.round(amount * absorbPercent);
        amount -= substituteAmount;
        if (substituteAmount > 0) {
          substitute.stamina = clamp(substitute.stamina - substituteAmount, 0, substitute.maxStamina);
          events.push({
            type: "damage",
            idolId: substitute.id,
            amount: substituteAmount,
            staminaAfter: substitute.stamina,
            slotLabel: "肩代わり",
            shadowAssist: true,
          });
        }
      }

      target.stamina = clamp(target.stamina - amount, 0, target.maxStamina);
      const slot = battleState.activeSlots.find((s) => battleState.slotOf[s.id] === target.id);
      events.push({
        type: "damage",
        idolId: target.id,
        amount,
        staminaAfter: target.stamina,
        slotLabel: slot?.label ?? "ステージ",
      });
      // 特能「打たれ弱い」: 次の曲だけ効率が落ちる予約
      if (target.talent === "fragile") target.fragileNextTurn = true;
      // 🌪反撃(effect: "counter"): 被弾した分に応じて客席へ反撃する
      if (targetAttribute?.effect === "counter") {
        const counterAmount = Math.round(amount * targetAttribute.def * scaling.counterPercentPerPoint);
        const counterTargets = counterAmount > 0 ? resolveAttackTargets(battleState, "random", counterAmount) : [];
        for (const { block, amount: hitAmount } of counterTargets) {
          block.hp = Math.max(0, block.hp - hitAmount);
          battleState.score += hitAmount;
          events.push({
            type: "audience_hit",
            blockId: block.id,
            blockLabel: block.label,
            idolId: target.id,
            amount: hitAmount,
            hpAfter: block.hp,
            maxHp: block.maxHp,
            collapsed: block.hp <= 0,
            counter: true,
          });
        }
      }
    }
  } else {
    events.push({ type: "damage_miss" });
  }

  // ジリ貧全体(消耗戦型): 予兆とは独立して、出演中の全員へ薄いチップダメージが入り続ける
  if (battleState.damagePattern.chipDamageAmount) {
    for (const slot of battleState.activeSlots) {
      const performer = activeOccupant(battleState, slot.id);
      if (!performer || performer.lastDance) continue;
      const performerAttribute = attributeOf(performer.attribute);
      const reduction = performerAttribute?.effect === "reduction" ? performerAttribute.def * scaling.defenseReductionPerPoint : 0;
      const amount = Math.max(1, battleState.damagePattern.chipDamageAmount - reduction);
      performer.stamina = clamp(performer.stamina - amount, 0, performer.maxStamina);
      events.push({
        type: "damage",
        idolId: performer.id,
        amount,
        staminaAfter: performer.stamina,
        slotLabel: slot.label,
        chip: true,
      });
    }
  }

  // 応援ブーストの効果は発動した次の1ターンのみ(消費済み)
  for (const performer of battleState.performers) {
    performer.cheerBoosted = false;
  }

  // 個別強制引退（ロースターから即除籍、復帰不可）判定
  for (const performer of battleState.performers) {
    if (!performer.retired && performer.stamina <= 0) {
      // 特能「根性」: スタミナ0寸前からの強制引退を一度だけ回避する
      if (performer.talent === "guts" && !performer.gutsUsed) {
        performer.gutsUsed = true;
        performer.stamina = BALANCE.talentEffects.guts.minStaminaOnce;
        events.push({ type: "guts_save", idolId: performer.id });
        continue;
      }
      performer.retired = true;
      for (const slotId of Object.keys(battleState.slotOf)) {
        if (battleState.slotOf[slotId] === performer.id) delete battleState.slotOf[slotId];
      }
      events.push({ type: "retire", idolId: performer.id });
    }
  }

  // ②吹き出し: このターンの出来事から最大2人分だけ抽選して喋らせる
  events.push(...pickSpeechEvents(battleState, events));

  const activeCount = battleState.performers.filter((p) => !p.retired).length;
  if (activeCount < BALANCE.minPerformers) {
    battleState.result = "fail";
    events.push({ type: "result", result: "fail" });
  } else if (battleState.score >= battleState.targetScore) {
    battleState.result = "success";
    events.push({ type: "result", result: "success" });
  } else if (battleState.turn >= battleState.turnLimit) {
    battleState.result = "timeup";
    events.push({ type: "result", result: "timeup" });
  } else {
    events.push(primeTelegraph(battleState));
  }

  return events;
}

function fallbackTarget(battleState) {
  for (const slotId of battleState.activePriorityOrder) {
    const performer = activeOccupant(battleState, slotId);
    if (performer && !performer.lastDance) return performer;
  }
  return null;
}

export function retreat(battleState) {
  if (battleState.result) return [];
  battleState.result = "retreat";
  return [{ type: "result", result: "retreat" }];
}
