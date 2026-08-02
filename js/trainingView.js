// 育成（レッスン）画面。§UI改修計画④: レッスン枠(スロット)の概念を廃止し、
// ロースター全員に無制限でメニューを割り当てられる。「レッスン実行」ボタンは
// 廃止し、割り当てはgameState.pendingTrainingに保存されるだけ。実際の適用は
// 週送り(state.js: advanceDay、applyTraining呼び出し)でまとめて行う。

import { renderTopBar, drawQueuedPortraits, formatMan, talentListRowHtml } from "./ui.js?v=1785558404241";
import { BALANCE, TRAINING_MENUS } from "./masterData.js?v=1785558404241";
import { autoAssignTraining } from "./training.js?v=1785558404241";
import { morph } from "./domMorph.js?v=1785558404241";

export function mountTrainingView(container, gameState, callbacks) {
  const activeRoster = gameState.roster.filter((idol) => !idol.retired && !idol.resting);
  gameState.pendingTraining ??= {};

  function menuOptionsHtml(idol) {
    const selected = gameState.pendingTraining[idol.id] ?? "";
    const options = TRAINING_MENUS.map(
      (menu) => `<option value="${menu.id}" ${selected === menu.id ? "selected" : ""}>${menu.label}</option>`
    ).join("");
    return `<option value="" ${selected === "" ? "selected" : ""}>レッスンしない</option>${options}`;
  }

  function rowHtml(idol) {
    return talentListRowHtml(idol, {
      extraRight: `<select class="training-row__select" data-idol="${idol.id}">${menuOptionsHtml(idol)}</select>`,
    });
  }

  function template() {
    const assignedCount = Object.values(gameState.pendingTraining).filter(Boolean).length;
    const cost = assignedCount * BALANCE.training.costPerSession;
    const rowsHtml = activeRoster.map(rowHtml).join("") || `<div class="empty">所属アイドルがいません……</div>`;

    return `
      ${renderTopBar(gameState)}
      <main class="screen">
        <h1 class="screen__title">育成（レッスン）</h1>
        <section class="card">
          <h2 class="card__heading">今週の割り当て</h2>
          <div class="stat-row">
            <span>割り当て済み ${assignedCount}人（枠の上限なし）</span>
            <span>見込み費用 ${formatMan(cost)}</span>
          </div>
          <p class="stat-row stat-row--muted">週送り(次の週へ)のタイミングでまとめて実行されます。</p>
        </section>
        <div class="list scroll-list">${rowsHtml}</div>
      </main>
      <footer class="action-bar">
        <button class="btn" data-action="training-back">戻る</button>
        <button class="btn" data-action="training-auto">自動割り当て</button>
        <button class="btn" data-action="training-clear">割り当て解除</button>
      </footer>`;
  }

  function render() {
    morph(container, template());
    drawQueuedPortraits();
  }

  // morph()で差分更新するためDOM要素は使い回される。要素ごとにリスナーを
  // 付け直すと再描画のたびに二重登録されてしまうので、container自体に
  // 一度だけ委譲リスナーを張る。container(=app)は画面遷移をまたいで使い回される
  // 要素なので、この画面を離れる際は必ず解除する。
  container.addEventListener("click", handleClick);
  container.addEventListener("change", handleChange);

  function handleChange(event) {
    const select = event.target.closest(".training-row__select");
    if (!select) return;
    const idolId = select.dataset.idol;
    if (select.value) gameState.pendingTraining[idolId] = select.value;
    else delete gameState.pendingTraining[idolId];
    callbacks.onChange();
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    switch (target.dataset.action) {
      case "training-auto":
        gameState.pendingTraining = autoAssignTraining(gameState);
        callbacks.onChange();
        render();
        break;

      case "training-clear":
        gameState.pendingTraining = {};
        callbacks.onChange();
        render();
        break;

      case "training-back":
        container.removeEventListener("click", handleClick);
        container.removeEventListener("change", handleChange);
        callbacks.onBack();
        break;
    }
  }

  render();
}
