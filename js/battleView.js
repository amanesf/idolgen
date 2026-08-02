// 陣形パズル画面のDOMコントローラ。
// battle.js が返す「イベント列」を、時間をかけて（1曲5〜10秒程度）
// 順番に再生する。ボタンを押した瞬間にステータスが変わることは意図的に避け、
// スコア獲得・被弾・引退・フォーメーション移動などを1つずつ演出する。
//
// スロット(位置)はフォーメーション定義から来る固定の座標で、動くのは
// 「どのスロットに誰がいるか」だけ。移動はFLIPで滑らかにスライドさせる。

import { BALANCE } from "./masterData.js?v=1785558404241";
import { renderTopBar, portraitAvatarHtml, drawPortraitOnCanvas, attributeOf, ROLE_ICONS, formatMan, rankBadgeHtml } from "./ui.js?v=1785558404241";

function getPerformer(battleState, id) {
  return battleState.performers.find((p) => p.id === id);
}

function chipHtml(performer) {
  const pct = Math.round((performer.stamina / performer.maxStamina) * 100);
  const attribute = attributeOf(performer.attribute);
  const canvasId = `chip-face-${performer.id}`;
  return `
    <div class="chip" id="chip-${performer.id}">
      <div class="chip__face-wrap">
        ${portraitAvatarHtml(performer, "md", canvasId)}
        ${attribute ? `<span class="chip__attr-badge" title="${attribute.traitLabel}">${attribute.label.split(" ")[0]}</span>` : ""}
        ${attribute ? `<span class="chip__role-badge" title="${attribute.role}">${ROLE_ICONS[attribute.role] ?? ""}</span>` : ""}
        <span class="chip__rank-badge" title="適正評価">${rankBadgeHtml(performer)}</span>
      </div>
      <div class="chip__name">${performer.name}</div>
      <div class="chip__bar"><div class="chip__bar-fill" id="chip-stamina-${performer.id}" style="width:${pct}%"></div></div>
    </div>`;
}

// portraitAvatarHtmlがcanvasのマークアップだけ返すため、DOM挿入後にこれを呼んで実描画する。
function drawPendingPortrait(performer) {
  if (!performer.portrait) return;
  const canvas = document.getElementById(`chip-face-${performer.id}`);
  if (canvas) drawPortraitOnCanvas(canvas, performer.portrait);
}

function emptySlotHtml() {
  return `<div class="chip chip--empty">空席</div>`;
}

function audienceBlockHtml(block) {
  const pct = Math.max(0, Math.min(100, Math.round((block.hp / block.maxHp) * 100)));
  const isDown = block.hp <= 0;
  const isLow = !isDown && pct <= 35;
  return `
    <div class="audience-block ${isDown ? "is-down" : ""} ${isLow ? "is-low" : ""}" id="audience-block-${block.id}">
      <div class="audience-block__icon">${block.icon}</div>
      <div class="audience-block__label">${block.label}</div>
      <div class="audience-block__bar"><div class="audience-block__bar-fill" id="audience-bar-${block.id}" style="width:${pct}%"></div></div>
    </div>`;
}

function telegraphText(pendingDamage, unitLabel) {
  if (!pendingDamage) return "";
  if (!pendingDamage.willHappen) return "⚠️ 客席は静か……今のところ大きな動きはなさそう";
  return `⚠️ 次の${unitLabel}、<b>${pendingDamage.slotLabel}</b>に視線が集中しそう…`;
}

function turnLabel(battleState) {
  const unit = battleState.stage.turnUnitLabel ?? "ターン";
  return `${battleState.turn}/${battleState.turnLimit}${unit}`;
}

function template(gameState, battleState) {
  const formation = battleState.formation;
  const slotsHtml = battleState.activeSlots
    .map((slot) => {
      const idolId = battleState.slotOf[slot.id];
      const performer = idolId ? getPerformer(battleState, idolId) : null;
      return `
        <div class="stage-slot ${slot.exposed ? "is-exposed" : "is-safe"}" style="left:${slot.x}%; top:${slot.y}%;">
          <div class="stage-slot__label">${slot.label}</div>
          <div class="stage-slot__body" id="slot-body-${slot.id}">
            ${performer ? chipHtml(performer) : emptySlotHtml()}
          </div>
        </div>`;
    })
    .join("");

  return `
    ${renderTopBar(gameState)}
    <main class="screen battle-screen">
      <div class="battle-screen__header">
        <div class="battle-screen__header-text">
          <h1 class="screen__title">${battleState.stage.name}</h1>
          <div class="formation-tag">${formation.label}</div>
        </div>
        <button class="log-toggle-btn" data-action="toggle-log">📜 ログ</button>
      </div>

      <section class="card gauge-card">
        <div class="gauge">
          <div class="gauge__label"><span>スコア</span><span id="score-label">${battleState.score} / ${battleState.targetScore}</span></div>
          <div class="gauge__track"><div class="gauge__fill gauge__fill--score" id="score-fill" style="width:0%"></div></div>
        </div>
        <div class="gauge">
          <div class="gauge__label"><span>熱量ゲージ</span><span id="heat-label">${battleState.heat}%</span></div>
          <div class="gauge__track"><div class="gauge__fill gauge__fill--heat" id="heat-fill" style="width:${battleState.heat}%"></div></div>
        </div>
        <div class="turn-row">
          <span class="turn-count" id="turn-count">${turnLabel(battleState)}</span>
          <span class="combo-badge" id="combo-badge"></span>
          <span class="practice-badge" id="practice-badge"></span>
        </div>
      </section>

      <section class="stage">${slotsHtml}</section>

      <section class="audience-board" style="grid-template-columns:repeat(${battleState.boardCols}, 1fr); grid-template-rows:repeat(${battleState.boardRows}, 1fr);">${battleState.audienceBoard.map(audienceBlockHtml).join("")}</section>

      <div class="telegraph" id="telegraph">${telegraphText(battleState.pendingDamage, battleState.stage.turnUnitLabel ?? "ターン")}</div>
    </main>

    <div class="modal-backdrop" id="log-modal" hidden>
      <div class="modal">
        <h2 class="card__heading">経過</h2>
        <ul class="log" id="battle-log"></ul>
        <button class="btn btn--block" data-action="close-log">閉じる</button>
      </div>
    </div>

    <div id="result-slot"></div>

    <div class="turn-lock" id="turn-lock" hidden><span>演出中…</span></div>

    <footer class="action-bar ${battleState.stage.isMilestone ? "action-bar--quad" : "action-bar--triple"}">
      ${
        battleState.stage.isMilestone
          ? `<button class="btn btn--boost" data-action="cheer-boost">📣 応援ブースト(${formatMan(BALANCE.cheerBoost.cost)})</button>`
          : ""
      }
      <button class="btn" data-action="hold-turn">耐える</button>
      <button class="btn btn--primary" data-action="advance-turn">送る</button>
      <button class="btn btn--danger" data-action="retreat">撤退</button>
    </footer>`;
}

export function mountBattleView(container, gameState, battleState, callbacks) {
  container.innerHTML = template(gameState, battleState);
  battleState.performers.forEach(drawPendingPortrait);

  const els = {
    scoreFill: container.querySelector("#score-fill"),
    scoreLabel: container.querySelector("#score-label"),
    heatFill: container.querySelector("#heat-fill"),
    heatLabel: container.querySelector("#heat-label"),
    turnCount: container.querySelector("#turn-count"),
    comboBadge: container.querySelector("#combo-badge"),
    practiceBadge: container.querySelector("#practice-badge"),
    telegraph: container.querySelector("#telegraph"),
    log: container.querySelector("#battle-log"),
    lock: container.querySelector("#turn-lock"),
    resultSlot: container.querySelector("#result-slot"),
    logModal: container.querySelector("#log-modal"),
    advanceBtn: container.querySelector('[data-action="advance-turn"]'),
    holdBtn: container.querySelector('[data-action="hold-turn"]'),
    retreatBtn: container.querySelector('[data-action="retreat"]'),
    cheerBoostBtn: container.querySelector('[data-action="cheer-boost"]'),
  };

  // 経過ログはモーダル表示(§一切スクロールしない画面設計)。トグルボタン/
  // 閉じるボタン/背景タップのいずれでも開閉できる。
  container.querySelector('[data-action="toggle-log"]')?.addEventListener("click", () => {
    els.logModal.hidden = false;
  });
  container.querySelector('[data-action="close-log"]')?.addEventListener("click", () => {
    els.logModal.hidden = true;
  });
  els.logModal.addEventListener("click", (event) => {
    if (event.target === els.logModal) els.logModal.hidden = true;
  });

  updateScoreGauge(els, battleState.score, battleState.targetScore);
  updateComboBadge(els, battleState);
  updatePracticeBadge(els, battleState);
  updateCheerBoostButton(els, gameState, battleState);

  els.advanceBtn.addEventListener("click", () => callbacks.onTurn(true));
  els.holdBtn.addEventListener("click", () => callbacks.onTurn(false));
  els.retreatBtn.addEventListener("click", () => callbacks.onRetreat());
  els.cheerBoostBtn?.addEventListener("click", () => {
    const ev = callbacks.onCheerBoost?.();
    if (ev) {
      pushLog(`📣 応援ブースト発動！${getPerformer(battleState, ev.idolId)?.name}のスタミナが回復した`);
      updateChipStamina(ev.idolId, ev.staminaAfter, battleState);
    }
    updateCheerBoostButton(els, gameState, battleState);
  });
  container.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="finish-battle"]')) callbacks.onFinish();
  });

  function pushLog(text) {
    const li = document.createElement("li");
    li.innerHTML = text;
    els.log.prepend(li);
    while (els.log.children.length > 6) els.log.lastChild.remove();
  }

  function lockControls(locked) {
    els.lock.hidden = !locked;
    els.advanceBtn.disabled = locked;
    els.holdBtn.disabled = locked;
    els.retreatBtn.disabled = locked || !!battleState.result;
    if (els.cheerBoostBtn) els.cheerBoostBtn.disabled = locked || !!battleState.result || !canCheerBoost(gameState, battleState);
  }

  function playEvents(events, onDone) {
    lockControls(true);
    els.turnCount.textContent = turnLabel(battleState);
    updateComboBadge(els, battleState);
    updatePracticeBadge(els, battleState);
    const timing = BALANCE.timing;
    let i = 0;

    const step = () => {
      if (i >= events.length) {
        if (!battleState.result) lockControls(false);
        onDone?.();
        return;
      }
      const ev = events[i++];
      handleEvent(ev, step, timing);
    };

    setTimeout(step, timing.preTurnDelay);
  }

  function handleEvent(ev, next, timing) {
    switch (ev.type) {
      case "advance": {
        animateAdvance(battleState, ev.slotOf);
        pushLog("🔁 送った！ フォーメーションが1つ進んだ");
        setTimeout(next, timing.advanceDuration);
        break;
      }

      case "score": {
        const performer = getPerformer(battleState, ev.idolId);
        showFloatie(ev.idolId, `+${ev.amount}`, "score");
        updateScoreGauge(els, ev.scoreAfter, battleState.targetScore);
        pushLog(`${performer.name}が${ev.amount}pt獲得`);
        setTimeout(next, timing.scoreStepInterval);
        break;
      }

      case "morale_attack": {
        const performer = getPerformer(battleState, ev.idolId);
        pushLog(`✨ ${performer?.name}がやる気全開のボーナス攻撃！`);
        setTimeout(next, 80);
        break;
      }

      case "audience_hit": {
        updateAudienceBlock(ev.blockId, ev.hpAfter, ev.maxHp);
        const block = document.getElementById(`audience-block-${ev.blockId}`);
        block?.classList.add("is-hit");
        setTimeout(() => block?.classList.remove("is-hit"), 400);
        pushLog(
          ev.counter
            ? `🌪 ${ev.blockLabel}に反撃！-${ev.amount}`
            : `${ev.blockLabel}に-${ev.amount}${ev.collapsed ? "(陥落！)" : ""}`
        );
        setTimeout(next, 120);
        break;
      }

      case "stamina": {
        updateChipStamina(ev.idolId, ev.staminaAfter, battleState);
        setTimeout(next, 50);
        break;
      }

      case "heat": {
        updateHeatGauge(els, ev.heatAfter);
        setTimeout(next, timing.heatSettleDelay);
        break;
      }

      case "damage": {
        setTimeout(() => {
          const performer = getPerformer(battleState, ev.idolId);
          const chip = document.getElementById(`chip-${ev.idolId}`);
          chip?.classList.add("is-hit");
          showFloatie(ev.idolId, `-${ev.amount}`, "damage");
          updateChipStamina(ev.idolId, ev.staminaAfter, battleState);
          pushLog(`💥 ${ev.slotLabel}の${performer.name}に被弾！`);
          setTimeout(() => chip?.classList.remove("is-hit"), timing.damageHitDuration);
          setTimeout(next, timing.damageHitDuration);
        }, timing.damageWindupDelay);
        break;
      }

      case "target_creep": {
        updateScoreGauge(els, battleState.score, ev.targetScoreAfter);
        pushLog("📈 目標の逆行……期待値ラインが伸びた");
        setTimeout(next, 150);
        break;
      }

      case "damage_miss": {
        pushLog("客席は静かなまま……今回は何も起きなかった");
        setTimeout(next, 200);
        break;
      }

      case "unpracticed": {
        pushLog("⚠️ ぶっつけ本番……練習不足のまま本番を迎えてしまった");
        setTimeout(next, 200);
        break;
      }

      case "speech": {
        showSpeech(ev.idolId, ev.line);
        setTimeout(next, 60);
        break;
      }

      case "retire": {
        const performer = getPerformer(battleState, ev.idolId);
        const chip = document.getElementById(`chip-${ev.idolId}`);
        if (chip) {
          chip.classList.add("is-retired");
          chip.insertAdjacentHTML("beforeend", `<div class="chip__badge">緊急降板</div>`);
        }
        pushLog(`💥 ${performer.name}は力尽きて緊急降板…そのまま強制引退`);
        setTimeout(next, timing.retireRevealDelay);
        break;
      }

      case "awakening": {
        const performer = getPerformer(battleState, ev.idolId);
        const chip = document.getElementById(`chip-${ev.idolId}`);
        chip?.classList.add("is-awakened");
        pushLog(`🌟 ${performer?.name}が覚醒した…！限界突破のパフォーマンス！`);
        setTimeout(() => chip?.classList.remove("is-awakened"), 900);
        setTimeout(next, 300);
        break;
      }

      case "guts_save": {
        const performer = getPerformer(battleState, ev.idolId);
        pushLog(`🔥 ${performer.name}が根性で持ちこたえた！`);
        setTimeout(next, 200);
        break;
      }

      case "telegraph": {
        els.telegraph.innerHTML = telegraphText(battleState.pendingDamage, battleState.stage.turnUnitLabel ?? "ターン");
        setTimeout(next, 250);
        break;
      }

      case "result": {
        setTimeout(() => {
          showResultBanner(els, ev.result, battleState.stage);
          pushLog(resultLogText(ev.result));
          next();
        }, timing.resultRevealDelay);
        break;
      }

      default:
        next();
    }
  }

  return { playEvents };
}

function animateAdvance(battleState, newSlotOf) {
  const before = {};
  for (const idolId of Object.values(newSlotOf)) {
    const chip = document.getElementById(`chip-${idolId}`);
    if (chip) before[idolId] = chip.getBoundingClientRect();
  }

  for (const slot of battleState.activeSlots) {
    const body = document.getElementById(`slot-body-${slot.id}`);
    if (!body) continue;
    const idolId = newSlotOf[slot.id];
    if (idolId) {
      let chip = document.getElementById(`chip-${idolId}`);
      if (!chip) {
        const performer = getPerformer(battleState, idolId);
        body.innerHTML = chipHtml(performer);
        chip = document.getElementById(`chip-${idolId}`);
        drawPendingPortrait(performer);
      } else {
        body.replaceChildren(chip);
      }
      if (before[idolId]) applyFlip(chip, before[idolId]);
    } else {
      body.innerHTML = emptySlotHtml();
    }
  }
}

function applyFlip(chip, beforeRect) {
  const afterRect = chip.getBoundingClientRect();
  const dx = beforeRect.left - afterRect.left;
  const dy = beforeRect.top - afterRect.top;
  if (dx === 0 && dy === 0) return;
  chip.style.transition = "none";
  chip.style.transform = `translate(${dx}px, ${dy}px)`;
  // 強制リフローしてから次のフレームでトランジションを効かせる
  // eslint-disable-next-line no-unused-expressions
  chip.getBoundingClientRect();
  requestAnimationFrame(() => {
    chip.style.transition = `transform ${BALANCE.timing.advanceDuration}ms cubic-bezier(.2,.8,.2,1)`;
    chip.style.transform = "";
  });
}

function showFloatie(idolId, text, kind) {
  const chip = document.getElementById(`chip-${idolId}`);
  if (!chip) return;
  const el = document.createElement("span");
  el.className = `floatie floatie--${kind}`;
  el.textContent = text;
  chip.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

// ②吹き出し。チップ真上にポップし、一定時間で自動的にフェードアウトする。
function showSpeech(idolId, line) {
  const chip = document.getElementById(`chip-${idolId}`);
  if (!chip) return;
  chip.querySelector(".speech")?.remove();
  const el = document.createElement("div");
  el.className = "speech";
  el.textContent = line;
  chip.appendChild(el);
  setTimeout(() => el.remove(), BALANCE.timing.speechDuration);
}

function updateChipStamina(idolId, staminaAfter, battleState) {
  const performer = getPerformer(battleState, idolId);
  const bar = document.getElementById(`chip-stamina-${idolId}`);
  if (!bar || !performer) return;
  const pct = Math.max(0, Math.min(100, Math.round((staminaAfter / performer.maxStamina) * 100)));
  bar.style.width = `${pct}%`;
}

function updateAudienceBlock(blockId, hpAfter, maxHp) {
  const bar = document.getElementById(`audience-bar-${blockId}`);
  if (!bar) return;
  const pct = Math.max(0, Math.min(100, Math.round((hpAfter / maxHp) * 100)));
  bar.style.width = `${pct}%`;
  const block = document.getElementById(`audience-block-${blockId}`);
  if (block) {
    block.classList.toggle("is-down", hpAfter <= 0);
    block.classList.toggle("is-low", hpAfter > 0 && pct <= 35);
  }
}

function updateScoreGauge(els, score, target) {
  const pct = Math.max(0, Math.min(100, Math.round((score / target) * 100)));
  els.scoreFill.style.width = `${pct}%`;
  els.scoreLabel.textContent = `${score} / ${target}`;
}

function updateHeatGauge(els, heat) {
  els.heatFill.style.width = `${heat}%`;
  els.heatLabel.textContent = `${Math.round(heat)}%`;
}

// 応援ブースト(§10)は大型イベント/アワード限定の当日介入要素。現金・
// 発動回数のどちらも足りていれば使える。
function canCheerBoost(gameState, battleState) {
  if (!battleState.stage.isMilestone || battleState.result) return false;
  const used = battleState.cheerBoostsUsed ?? 0;
  return gameState.cash >= BALANCE.cheerBoost.cost && used < BALANCE.cheerBoost.maxUsesPerBattle;
}

function updateCheerBoostButton(els, gameState, battleState) {
  if (!els.cheerBoostBtn) return;
  els.cheerBoostBtn.disabled = !canCheerBoost(gameState, battleState);
  const used = battleState.cheerBoostsUsed ?? 0;
  const remaining = BALANCE.cheerBoost.maxUsesPerBattle - used;
  els.cheerBoostBtn.textContent = `📣 応援ブースト(${formatMan(BALANCE.cheerBoost.cost)}・残り${remaining}回)`;
}

function updateComboBadge(els, battleState) {
  const { perHoldBonus, maxBonus } = BALANCE.combo;
  const bonus = Math.min(maxBonus, battleState.comboStreak * perHoldBonus);
  els.comboBadge.textContent = bonus > 0 ? `🔥 粘りコンボ +${Math.round(bonus * 100)}%` : "";
}

function updatePracticeBadge(els, battleState) {
  // 次のターンがぶっつけ本番になるかを予告する(予兆と同じく先読み表示)
  const nextIsUnpracticed = battleState.turn + 1 > battleState.masteredLimit && !battleState.result;
  els.practiceBadge.textContent = nextIsUnpracticed ? "🔰 次はぶっつけ本番" : "";
}

function showResultBanner(els, result, stage) {
  // 結果はモーダル表示にする(§一切スクロールしない画面設計)。
  els.resultSlot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal result-banner result-banner--${result}">
        ${resultLabel(result, stage)}
        <button class="btn btn--primary btn--block" data-action="finish-battle">結果を確認する</button>
      </div>
    </div>`;
}

// stage.resultLabelsがあれば通常の勝敗ラベルより優先する(§お試しステージの
// バトルは勝敗を「コーチ以上の能力」/「観測終了」という専用の文言で見せる、
// scoutView.js:buildTrialStage参照)。
function resultLabel(result, stage) {
  const override = stage?.resultLabels?.[result];
  if (override) return override;
  switch (result) {
    case "success":
      return "🎉 目標スコア達成！大成功";
    case "fail":
      return "💥 放送事故発生……";
    case "retreat":
      return "🏳 撤退した";
    case "timeup":
      return "⏱ 力及ばず……持ち曲/尺が尽きた";
    default:
      return "-";
  }
}

function resultLogText(result) {
  switch (result) {
    case "success":
      return "🎉 目標スコア達成！大成功";
    case "fail":
      return "放送事故発生……ステージが成立しなくなった";
    case "retreat":
      return "撤退を選択した（違約金が発生する）";
    case "timeup":
      return "力及ばず……目標に届かないまま持ち曲/尺が尽きた";
    default:
      return "";
  }
}
