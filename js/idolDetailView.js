// アイドル詳細画面。ポートレートを持つ(スカウト生成済みの)アイドルは
// canvas描画が必要なため、専用のDOMコントローラとして実装する。

import {
  renderTopBar,
  avatarHtml,
  drawPortraitOnCanvas,
  formatMan,
  rankBadgeHtml,
  attributeSummaryHtml,
  levelStarsHtml,
  devicePixelRatioClamped,
} from "./ui.js?v=1785558404241";
import {
  TALENTS,
  BALANCE,
  getAgeBand,
  JOB_TYPES,
  rankLabel,
  ORIGIN_ATTRIBUTES,
  SCOUT_LOCATIONS,
} from "./masterData.js?v=1785558404241";
import { getGrowthPhase } from "./scoutGenerator.js?v=1785558404241";
import { getStaffEffects } from "./office.js?v=1785558404241";
import { statGrowthChartHtml } from "./statGrowthChart.js?v=1785558404241";
import { morph } from "./domMorph.js?v=1785558404241";

export function mountIdolDetailView(container, gameState, idolId, callbacks) {
  const idol = gameState.roster.find((i) => i.id === idolId);
  if (!idol) {
    callbacks.onBack();
    return;
  }

  const state = { message: "" };

  function render() {
    morph(container, template(gameState, idol, state.message));
    state.message = "";
    if (idol.portrait) drawPortraitOnCanvas(document.getElementById("idol-detail-canvas"), idol.portrait);
  }

  // morph()で差分更新するためDOM要素は使い回される。要素ごとにリスナーを
  // 付け直すと再描画のたびに二重登録されてしまうので、container自体に
  // 一度だけ委譲リスナーを張る。container(=app)は画面遷移をまたいで使い回される
  // 要素なので、この画面を離れる際は必ず解除する。
  container.addEventListener("click", handleClick);

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;

    switch (target.dataset.action) {
      case "idol-detail-back":
        container.removeEventListener("click", handleClick);
        callbacks.onBack();
        break;

      case "declare-last-dance":
        callbacks.onDeclareLastDance(idol.id);
        render();
        break;

      case "negotiate-salary": {
        const result = callbacks.onNegotiateSalary(idol.id, target.dataset.salary);
        state.message = result.success ? "交渉が成立しました" : "交渉は決裂しました";
        render();
        break;
      }

      case "fire-idol":
        container.removeEventListener("click", handleClick);
        callbacks.onFireIdol(idol.id);
        break;

      case "open-lastdance-modal": {
        const modal = container.querySelector("#last-dance-modal");
        if (modal) modal.hidden = false;
        break;
      }

      case "open-fire-modal": {
        const modal = container.querySelector("#fire-modal");
        if (modal) modal.hidden = false;
        break;
      }

      case "close-modal": {
        const lastDanceModal = container.querySelector("#last-dance-modal");
        const fireModal = container.querySelector("#fire-modal");
        if (lastDanceModal) lastDanceModal.hidden = true;
        if (fireModal) fireModal.hidden = true;
        break;
      }
    }
  }

  render();
}

// 個人単位のメンタル(§4.3、完全隠蔽)は本来一切表示しないが、超敏腕マネージャー
// (STAFF: manager_ace、effect.revealsMentalStats)を雇っている間だけ、事務所の
// 分析力として全開示する。
function hasMentalStatsReveal(gameState) {
  return getStaffEffects(gameState, "manager").some((e) => e.revealsMentalStats);
}

function mentalStatRowHtml(label, value) {
  return `
    <div class="stat-rank-row" title="本来は完全隠蔽(§4.3)。超敏腕マネージャーの分析力で数値まで見えている">
      <span class="stat-rank-row__label">🧠${label}</span>
      <span class="stat-rank-row__rank">${rankLabel(value)}</span>
      <span class="stat-rank-row__value">${Math.round(value)}</span>
    </div>`;
}

// 特殊能力(§UI改修計画③-6)。TALENTS全件を表示し、非所持は薄く、所持は
// プラス=青・マイナス=赤で強調する。idolが持つのは単一の特能(idol.talent)。
function talentGridHtml(idol) {
  return TALENTS.map((t) => {
    const owned = idol.talent === t.id;
    const colorClass = owned ? (t.kind === "minus" ? "talent-chip--minus" : "talent-chip--plus") : "talent-chip--dim";
    return `<span class="talent-chip ${colorClass}" title="${t.description}">${t.label}</span>`;
  }).join("");
}

// 年齢の横に表示する成長度(§UI改修計画③-4)。scoutGenerator.js: getGrowthPhase()
// (growthType自体ではなく現在の育ち具合だけを返す純粋関数)を成長中/全盛期/
// 下降中の矢印付きタグに整形する。
function growthPhaseHtml(idol) {
  const { percent, phase } = getGrowthPhase(idol);
  if (phase === "withered") {
    return `<span class="scout-tag scout-tag--warn">成長度${percent}% 衰え ↓</span>`;
  }
  if (phase === "declining") {
    return `<span class="scout-tag scout-tag--warn">成長度${percent}% 下降中 ↓</span>`;
  }
  if (phase === "peak") {
    return `<span class="scout-tag">成長度${percent}% 全盛期 →</span>`;
  }
  return `<span class="scout-tag">成長度${percent}% 成長中 ↑</span>`;
}

function template(gameState, idol, message) {
  const revealMental = hasMentalStatsReveal(gameState);
  // §役割の強みパラメータ表示: 現在のjobTypeで強みになるステータス行を目立たせる。
  const relevantStats = JOB_TYPES.find((j) => j.key === idol.jobType)?.relevantStats;
  // §スカウト再設計: スカウト画面と同じ成長グラフ部品を使う(統一)。
  const statsHtml =
    statGrowthChartHtml(idol, undefined, relevantStats) +
    (revealMental
      ? `<div class="modal-section">` +
        mentalStatRowHtml("ストレス", idol.stress ?? 0) +
        mentalStatRowHtml("天狗度", idol.tenguDo ?? 0) +
        mentalStatRowHtml("擦り切れ度", idol.surikireDo ?? 0) +
        `</div>`
      : "");
  // .idol-detail-card .scout-portraitは120px表示(css/style.css)。高DPI画面で
  // ぼやけないようdevicePixelRatio分バッファを確保する(§バトル画面のアイコンが
  // 薄い気がする/ジャギジャギ、ui.js:scoutPortraitHtml参照)。
  const portraitBufferPx = Math.max(256, Math.round(120 * devicePixelRatioClamped()));
  const portraitHtml = idol.portrait
    ? `<canvas class="scout-portrait" id="idol-detail-canvas" width="${portraitBufferPx}" height="${portraitBufferPx}"></canvas>`
    : `<div class="idol-detail__avatar">${avatarHtml(idol, "lg")}</div>`;

  const ageBand = getAgeBand(idol.age);
  const songsHtml =
    (idol.repertoire ?? [])
      .map((song) => `<li>${song}<span class="stat-row--muted"> ・ ${Math.round(gameState.songSales?.[song] ?? 0).toLocaleString()}枚</span></li>`)
      .join("") || `<li class="empty">持ち曲なし</li>`;
  const jobLabel = JOB_TYPES.find((j) => j.key === idol.jobType)?.label ?? "";
  // §経歴や場所にも★マーク(レベル表示)。経歴はsalaryTier(1〜5)、場所は
  // rankShift(0〜4、+1して同じ5段階に揃える)をそのまま星の数にする。
  const originStars = levelStarsHtml(ORIGIN_ATTRIBUTES.find((o) => o.key === idol.origin)?.salaryTier ?? 0);
  const location = SCOUT_LOCATIONS.find((l) => l.id === idol.locationId);
  const locationStars = location ? levelStarsHtml((location.rankShift ?? 0) + 1) : "";

  // 歩合制の場合、直近1年(52週)分の支払い履歴合計を表示する(§UI改修計画③-7)。
  // idol.commissionHistoryはstate.js側の月次精算で記録される({day, amount}の配列)。
  const commissionHistory = idol.commissionHistory ?? [];
  const recentCommissionTotal = commissionHistory
    .filter((h) => h.day > gameState.day - 52)
    .reduce((sum, h) => sum + h.amount, 0);

  const salaryBody = idol.salaryType
    ? `
      ${message ? `<p class="stat-row stat-row--muted">${message}</p>` : ""}
      ${
        idol.salaryType === "fixed"
          ? `<p class="stat-row">固定給: 月${formatMan(idol.monthlySalary ?? 0)}</p>
             <button class="btn btn--block" data-action="negotiate-salary" data-salary="commission">歩合制に交渉する</button>`
          : `<p class="stat-row">歩合制: 成功報酬の${Math.round((idol.commissionRate ?? 0) * 100)}%を天引き</p>
             <p class="stat-row stat-row--muted">直近1年間の支払合計 ${formatMan(recentCommissionTotal)}</p>
             <button class="btn btn--block" data-action="negotiate-salary" data-salary="fixed">固定給に交渉する</button>`
      }
      <p class="stat-row stat-row--muted">交渉成功率${Math.round(BALANCE.salary.renegotiateSuccessChance * 100)}%</p>`
    : `<p class="stat-row stat-row--muted">創業メンバーには給与体系の概念がありません。</p>`;

  const lastDanceBody = idol.lastDance
    ? `<p class="stat-row stat-row--muted">次に出演するステージが有終の美(ラストダンス)になります。終了後、ロースターを卒業しセカンドキャリアへ進みます。</p>`
    : `<button class="btn btn--block" data-action="declare-last-dance">🌅 ラストダンスを宣言する</button>
       <p class="stat-row stat-row--muted">次のステージを最後の花道にします(スタミナ消費ゼロ・被弾なし・全盛期超えの限界突破)。終了後は引退しセカンドキャリアへ進みます。</p>`;

  return `
    ${renderTopBar(gameState)}
    <main class="screen idol-detail-screen">
      <div class="screen-header-row">
        <h1 class="screen__title">${idol.name}のプロフィール</h1>
      </div>
      <section class="card idol-detail-card">
        ${portraitHtml}
        <div class="scout-name">${idol.name} ${rankBadgeHtml(idol)}</div>
        ${jobLabel ? `<div class="stat-row stat-row--muted">${jobLabel}</div>` : ""}
        <div class="scout-tags">
          <span class="scout-tag">${attributeSummaryHtml(idol)}</span>
          <span class="scout-tag">${idol.age}歳</span>
          ${growthPhaseHtml(idol)}
          ${idol.originLabel ? `<span class="scout-tag">${idol.originLabel} ${originStars}</span>` : ""}
          ${location ? `<span class="scout-tag">${location.label} ${locationStars}</span>` : ""}
          ${idol.negotiationPersonalityLabel ? `<span class="scout-tag" title="${idol.negotiationPersonalityDescription ?? ""}">性格: ${idol.negotiationPersonalityLabel}</span>` : ""}
          <span class="scout-tag">👤 ファン${(idol.fans ?? 0).toLocaleString()}人</span>
          ${idol.interest != null ? `<span class="scout-tag">やる気${idol.interest}</span>` : ""}
          ${idol.lastDance ? `<span class="scout-tag scout-tag--warn">🌅 ラストダンス予定</span>` : ""}
          ${idol.statDebuff ? `<span class="scout-tag scout-tag--warn">😷 ${ageBand.label}で一時的に低下中</span>` : ""}
          ${idol.resting ? `<span class="scout-tag scout-tag--warn">😴 休養中(復帰まであと${Math.max(0, idol.restUntilDay - gameState.day)}週)</span>` : ""}
          ${idol.burnoutCount ? `<span class="scout-tag" title="スタミナ切れによる強制退場の累計回数">力尽き ${idol.burnoutCount}/${BALANCE.burnout.retireAtCount}回</span>` : ""}
        </div>

        <div class="idol-detail-scroll">
          <div class="modal-section">
            <h3 class="modal-section__heading">給与体系</h3>
            ${salaryBody}
          </div>

          <div class="modal-section">
            <h3 class="modal-section__heading">ステータス</h3>
            <div class="scout-stats scout-stats--rank">${statsHtml}</div>
          </div>

          <div class="modal-section">
            <h3 class="modal-section__heading">特殊能力</h3>
            <div class="talent-grid">${talentGridHtml(idol)}</div>
          </div>

          <div class="modal-section">
            <button class="modal-toggle-btn" data-action="open-lastdance-modal">🌅 ラストダンス</button>
            <button class="modal-toggle-btn" data-action="open-fire-modal">🚪 解雇</button>
          </div>

          <div class="modal-section">
            <h3 class="modal-section__heading">持ち曲</h3>
            <ul class="song-list">${songsHtml}</ul>
          </div>
        </div>
      </section>
    </main>

    <div class="modal-backdrop" id="last-dance-modal" hidden>
      <div class="modal">
        <h2 class="card__heading">🌅 ラストダンス</h2>
        ${lastDanceBody}
        <button class="btn btn--block" data-action="close-modal">閉じる</button>
      </div>
    </div>

    <div class="modal-backdrop" id="fire-modal" hidden>
      <div class="modal">
        <h2 class="card__heading">🚪 解雇</h2>
        <p class="stat-row stat-row--muted">${idol.name}を即座に事務所から解雇します。この操作は取り消せません。円満な引退ではないため、ファンが${BALANCE.firing.fansPenalty}人離れます。</p>
        <button class="btn btn--danger btn--block" data-action="fire-idol">解雇する</button>
        <button class="btn btn--block" data-action="close-modal">やめておく</button>
      </div>
    </div>

    <footer class="action-bar">
      <button class="btn" data-action="idol-detail-back">戻る</button>
    </footer>`;
}
