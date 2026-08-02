// 出陣前の編成画面。フォーメーションのスロットにアイドルを配置してから
// 現場へ向かう。タップで「持つ→置く」のシンプルな操作にする。
// castSize指定がある案件(先方オーダーで人数を絞られている)は、
// フォーメーションの一部の枠だけを使う。

import {
  renderTopBar,
  portraitAvatarHtml,
  drawQueuedPortraits,
  attributeSummaryHtml,
  attributeOf,
  ROLE_ICONS,
  rankBadgeHtml,
  STAT_LABELS,
} from "./ui.js?v=1785558404241";
import { buildActiveTopology } from "./battle.js?v=1785558404241";
import { DAMAGE_PATTERNS } from "./masterData.js?v=1785558404241";
import { morph } from "./domMorph.js?v=1785558404241";

// 被弾パターン(DAMAGE_PATTERNS.targeting)を編成画面向けに一言で説明する
// (masterData.js側のtargeting種別コメントを表示用に言い換えたもの)。
const TARGETING_HINTS = {
  random: "露出中の枠からランダムに1箇所へ被弾",
  all_exposed: "露出中の枠全員に一斉被弾",
  all_present: "バックステージも含む出演者全員にじわじわ被弾",
  lowest_stamina: "スタミナが最も少ないメンバーを狙い撃ち",
  center: "センター固定で集中砲火",
  anti_trend: "トレンドに逆行する属性のメンバーを優先して狙う",
  random_multi: "ランダムに複数名(重複なし)が被弾",
  random_repeat: "ランダムに複数回抽選(同じ人が連続被弾することも)",
  chorus_burst: "サビの周期だけ露出中の枠全員に大ダメージ",
  countdown_burst: "一定周期で確実に露出中の枠全員に大ダメージ(読んで退避可能)",
  lowest_fans: "ファン人気が最も低いメンバーを優先して狙う",
  highest_instability: "ストレス・天狗度(隠しパラメータ)が高いメンバーほど狙われやすい",
};

// ステージのscoreStats(2つ)の平均を戦力目安として返す。
function statPowerOf(idol, scoreStats) {
  const [a, b] = scoreStats;
  return (idol.stats[a] + idol.stats[b]) / 2;
}

function statPowerHtml(idol, scoreStats) {
  return String(Math.round(statPowerOf(idol, scoreStats)));
}

// 配置済みスロットのチップ(§編成前の見える化)。盤面が狭く(§battleView.jsの
// 実バトル画面と同じ絶対配置)、属性の詳細をテキストで並べると隣のチップと
// 重なってしまうため、battleView.jsのchip__face-wrapと同じ「小さいバッジを
// アバターに重ねる」方式を踏襲する。攻/防/回の数値・戦力はtitleツールチップに回す
// (控え一覧では変わらずattributeSummaryHtmlでフル表示している)。
function slotChipHtml(occupant, isHeld, scoreStats) {
  const attribute = attributeOf(occupant.attribute);
  const power = statPowerHtml(occupant, scoreStats);
  const tooltip = attribute
    ? `${occupant.attributeLabel} 攻${attribute.atk}/防${attribute.def}/回${attribute.heal} ／ 戦力${power}`
    : `戦力${power}`;
  return `
    <div class="chip ${isHeld ? "is-held" : ""}" title="${tooltip}">
      <div class="chip__face-wrap">
        ${portraitAvatarHtml(occupant, "md")}
        ${attribute ? `<span class="chip__attr-badge">${occupant.attributeLabel.split(" ")[0]}</span>` : ""}
        ${attribute ? `<span class="chip__role-badge">${ROLE_ICONS[attribute.role] ?? ""}</span>` : ""}
      </div>
      <div class="chip__name">${rankBadgeHtml(occupant)} ${occupant.name}</div>
    </div>`;
}

export function mountLoadoutView(container, gameState, stage, formation, callbacks) {
  const activeSlots = buildActiveTopology(formation, stage.castSize).slots;
  // §UI改修計画⑤: 編成は週送り時にまとめてバトル解決されるため、他のオファーに
  // 既に編成済み(pendingBattles)のタレントは同時に別の現場へ配属できないよう除外する
  // (このステージ自身の既存編成は除外しない=そのまま再編集できる)。
  const otherPendingAssignedIds = new Set(
    (gameState.pendingBattles ?? [])
      .filter((b) => b.stageId !== stage.id)
      .flatMap((b) => Object.values(b.assignment))
  );
  // 休養中(resting、§burnout)のメンバーは編成に出せない
  const availableRoster = gameState.roster.filter((idol) => !idol.resting && !otherPendingAssignedIds.has(idol.id));

  const state = {
    slotOf: {}, // slotId -> idolId
    heldIdolId: null,
    benchSortByPower: false, // 控え一覧をこのステージの戦力目安(statPower)順に並べ替えるか
  };
  const existingPending = (gameState.pendingBattles ?? []).find((b) => b.stageId === stage.id);
  if (existingPending) {
    state.slotOf = { ...existingPending.assignment };
  } else {
    autoFill(state, availableRoster, activeSlots);
  }

  function render() {
    morph(container, template(gameState, availableRoster, stage, activeSlots, state));
    drawQueuedPortraits();
  }

  // タップのたびにmorph()で差分更新するためDOM要素は使い回される。
  // 要素ごとにリスナーを付け直すと再描画のたびに二重登録されてしまうので、
  // container自体に一度だけ委譲リスナーを張る。container(=app)は画面遷移を
  // またいで使い回される要素なので、この画面を離れる際は必ず解除する
  // (そうしないと編成画面に再入場するたびに重複登録される)。
  container.addEventListener("click", handleClick);

  function handleClick(event) {
    const slotEl = event.target.closest("[data-slot]");
    if (slotEl) {
      onSlotClick(slotEl.dataset.slot);
      return;
    }

    const benchEl = event.target.closest("[data-bench-idol]");
    if (benchEl) {
      onBenchClick(benchEl.dataset.benchIdol);
      return;
    }

    const groupFillEl = event.target.closest("[data-group-fill]");
    if (groupFillEl) {
      const unit = (gameState.units ?? []).find((u) => u.id === groupFillEl.dataset.groupFill);
      if (unit) autoFillFromUnit(state, availableRoster, unit, activeSlots);
      render();
      return;
    }

    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    switch (actionEl.dataset.action) {
      case "auto-fill":
        autoFill(state, availableRoster, activeSlots);
        render();
        break;
      case "clear-loadout":
        state.slotOf = {};
        state.heldIdolId = null;
        render();
        break;
      case "toggle-bench-sort":
        state.benchSortByPower = !state.benchSortByPower;
        render();
        break;
      case "loadout-back":
        container.removeEventListener("click", handleClick);
        callbacks.onBack();
        break;
      case "loadout-start":
        if (!isComplete(state, activeSlots)) return;
        container.removeEventListener("click", handleClick);
        callbacks.onStart({ ...state.slotOf });
        break;
    }
  }

  function onSlotClick(slotId) {
    const occupantId = state.slotOf[slotId];
    if (state.heldIdolId) {
      const prevSlot = findSlotOf(state, state.heldIdolId);
      if (prevSlot) delete state.slotOf[prevSlot];
      state.slotOf[slotId] = state.heldIdolId;
      if (occupantId && occupantId !== state.heldIdolId) {
        if (prevSlot) state.slotOf[prevSlot] = occupantId;
      }
      state.heldIdolId = null;
    } else if (occupantId) {
      delete state.slotOf[slotId];
      state.heldIdolId = occupantId;
    }
    render();
  }

  function onBenchClick(idolId) {
    state.heldIdolId = state.heldIdolId === idolId ? null : idolId;
    render();
  }

  render();
}

function findSlotOf(state, idolId) {
  return Object.entries(state.slotOf).find(([, v]) => v === idolId)?.[0] ?? null;
}

function isComplete(state, activeSlots) {
  return activeSlots.every((slot) => !!state.slotOf[slot.id]);
}

function autoFill(state, availableRoster, activeSlots) {
  state.slotOf = {};
  state.heldIdolId = null;
  const idols = availableRoster.slice(0, activeSlots.length);
  activeSlots.forEach((slot, i) => {
    if (idols[i]) state.slotOf[slot.id] = idols[i].id;
  });
}

// §3「オファー：グループ割り当て可能」。結成済みグループ(units.js)の
// メンバーをまとめて編成に流し込む(枠数より人数が多い/休養中で出せない
// メンバーがいる場合は先頭から詰めて埋める)。
function autoFillFromUnit(state, availableRoster, unit, activeSlots) {
  state.slotOf = {};
  state.heldIdolId = null;
  const availableIds = new Set(availableRoster.map((idol) => idol.id));
  const members = unit.memberIds.filter((id) => availableIds.has(id));
  activeSlots.forEach((slot, i) => {
    if (members[i]) state.slotOf[slot.id] = members[i];
  });
}

function template(gameState, availableRoster, stage, activeSlots, state) {
  const idolById = new Map(availableRoster.map((idol) => [idol.id, idol]));
  const assignedIds = new Set(Object.values(state.slotOf));
  const bench = availableRoster.filter((idol) => !assignedIds.has(idol.id));

  const slotsHtml = activeSlots
    .map((slot) => {
      const occupantId = state.slotOf[slot.id];
      const occupant = occupantId ? idolById.get(occupantId) : null;
      const heldClass = state.heldIdolId ? "is-targetable" : "";
      return `
        <div class="loadout-slot ${occupant ? "is-filled" : ""} ${heldClass}"
             data-slot="${slot.id}" style="left:${slot.x}%; top:${slot.y}%;">
          <div class="loadout-slot__role">${slot.label}${slot.exposed ? ` ・倍率×${slot.scoreMult}` : " ・安全"}</div>
          ${occupant ? slotChipHtml(occupant, state.heldIdolId === occupant.id, stage.scoreStats) : `<div class="loadout-slot__empty">空き</div>`}
        </div>`;
    })
    .join("");

  const sortedBench = state.benchSortByPower
    ? [...bench].sort((x, y) => statPowerOf(y, stage.scoreStats) - statPowerOf(x, stage.scoreStats))
    : bench;

  const benchHtml = sortedBench
    .map(
      (idol) => `
      <div class="list-row ${state.heldIdolId === idol.id ? "is-held" : ""}" data-bench-idol="${idol.id}" role="button">
        ${portraitAvatarHtml(idol, "sm")}
        ${rankBadgeHtml(idol)}
        <div class="list-row__name">${idol.name}</div>
        <div class="list-row__meta">${attributeSummaryHtml(idol)} ／ 戦力${statPowerHtml(idol, stage.scoreStats)}</div>
      </div>`
    )
    .join("");

  const complete = isComplete(state, activeSlots);

  // §3「オファー：グループ割り当て可能」。結成済みグループがあれば、
  // ワンタップでそのメンバーを編成へ流し込むボタンを出す。
  const groupFillButtons = (gameState.units ?? [])
    .map((unit) => `<button class="btn" data-group-fill="${unit.id}">${unit.name}で編成</button>`)
    .join("");

  // 戦略メモ(§編成前の見える化): このステージで効くステータス・想定被弾パターンを
  // 出発前に確認できるようにする(battle.jsの実計算と同じdamagePatternIdの解決)。
  const scoreStatLabels = stage.scoreStats.map((key) => STAT_LABELS[key]).join(" ／ ");
  const damagePattern = DAMAGE_PATTERNS[stage.damagePatternId] || DAMAGE_PATTERNS.single_random;
  const targetingHint = TARGETING_HINTS[damagePattern.targeting] ?? "";

  return `
    ${renderTopBar(gameState)}
    <main class="screen">
      <div class="screen-header-row">
        <h1 class="screen__title">編成 － ${stage.name}</h1>
      </div>
      <section class="card loadout-briefing">
        <p class="stat-row">評価ステータス: ${scoreStatLabels}</p>
        <p class="stat-row" title="${targetingHint}">会場特性: ${damagePattern.label}</p>
        ${targetingHint ? `<p class="stat-row stat-row--muted">${targetingHint}</p>` : ""}
      </section>
      <p class="loadout-hint">
        ${
          state.heldIdolId
            ? "配置先のスロットをタップ"
            : "アイドルをタップして持ち上げ、スロットに配置しよう"
        }
        ${stage.castSize ? `／先方オーダーにより${stage.castSize}人編成` : ""}
      </p>

      ${groupFillButtons ? `<div class="loadout-tools">${groupFillButtons}</div>` : ""}

      <section class="loadout-stage">
        ${slotsHtml}
      </section>

      <div class="loadout-bench">
        <div class="list-heading-row">
          <div class="list-heading">控え（${bench.length}人）</div>
          <button class="btn" data-action="toggle-bench-sort">${state.benchSortByPower ? "並び順に戻す" : "戦力順に並び替え"}</button>
        </div>
        <div class="list scroll-list">${benchHtml || `<div class="empty">全員配置済み</div>`}</div>
      </div>

      <div class="loadout-tools">
        <button class="btn" data-action="auto-fill">自動編成</button>
        <button class="btn" data-action="clear-loadout">リセット</button>
      </div>
    </main>
    <footer class="action-bar">
      <button class="btn" data-action="loadout-back">戻る</button>
      <button class="btn btn--primary" data-action="loadout-start" ${complete ? "" : "disabled"}>
        編成を確定する(週送りで現場へ)
      </button>
    </footer>`;
}
