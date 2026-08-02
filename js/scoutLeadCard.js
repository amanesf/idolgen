// スカウト候補プール(§スカウト再設計「登用交渉」)の候補1人分のカード/詳細/
// 成長グラフを描画する。ホーム画面の地図ピン(ui.js)とスカウト画面の一覧
// (scoutView.js)の両方から共有するため、循環importを避けて独立ファイルにする。
// §スカウトに賭けと発見を持たせる: 性格タイプ・属性・年齢・経歴・志望職種は
// 常に見えるが、7ステータス・成長度・資質グレードはお試しステージで観測する
// まで伏せられる(state.js: getParamRevealState参照)。成長パターン(早熟/
// 大器晩成などgrowthTypeそのもの)は雇うまでずっと分からない(観測対象にすら
// ならない、成長度=今の育ち具合とは別物)。

import { BALANCE, JOB_TYPES, OBSERVABLE_SCOUT_PARAMS, ORIGIN_ATTRIBUTES, SCOUT_LOCATIONS } from "./masterData.js?v=1785558404241";
import { portraitAvatarHtml, scoutPortraitHtml, formatMan, attributeSummaryHtml, STAT_LABELS, levelStarsHtml } from "./ui.js?v=1785558404241";
import { closingProgress, getParamRevealState, getBaseSalary, unresolvedStatCount, getTrialCostPerItem } from "./state.js?v=1785558404241";
import { getRosterCapacity } from "./office.js?v=1785558404241";
import { statGrowthChartHtml } from "./statGrowthChart.js?v=1785558404241";
import { getGrowthPhase } from "./scoutGenerator.js?v=1785558404241";

export const OBSERVABLE_PARAM_LABELS = { ...STAT_LABELS, growthDegree: "成長度" };

// 段階(1〜7)ごとのラベル。成長中の4段階もそれぞれ別の名前にする
// (§成長度7段階は成長中のラベルを4つに分けて)。
const GROWTH_STAGE_LABELS = ["", "未成長", "芽生え", "成長中", "全盛間近", "全盛期", "下降中", "衰え"];

// 成長度タグ。観測済みなら「成長度 全盛期 ?%」のような表示、未観測なら
// "成長度: ?"にする。スカウト画面では正確な%は最後まで伏せ、段階名だけを
// 見せる(§成長度は●○不要、idolDetailView.jsは無条件・数値表示のまま)。
function growthDegreeTagHtml(lead) {
  if (getParamRevealState(lead, "growthDegree") !== "revealed") {
    return `<span class="scout-tag">成長度: ?</span>`;
  }
  const { stage, phase } = getGrowthPhase(lead);
  const stageLabel = GROWTH_STAGE_LABELS[stage];
  const isWarn = phase === "declining" || phase === "withered";
  return `<span class="scout-tag ${isWarn ? "scout-tag--warn" : ""}" title="正確な%は分からない">成長度 ${stageLabel} ?%</span>`;
}

// 資質グレードのバッジ。主評価/サブ評価はそれぞれ独立に、元になるステータスが
// 全部観測済みになった時点で自動開示される(§お試しステージから総合評価は
// 選択できないように、getParamRevealState参照)。
function qualityBadgeHtml(lead) {
  const mainRevealed = getParamRevealState(lead, "qualityGrade") === "revealed";
  const subRevealed = getParamRevealState(lead, "subQualityGrade") === "revealed";
  return (
    (mainRevealed ? `<span class="rank-badge rank-badge--${lead.qualityGrade}">${lead.qualityGrade}</span>` : `<span class="rank-badge">?</span>`) +
    `<span class="rank-badge-sep">/</span>` +
    (subRevealed
      ? `<span class="rank-badge rank-badge--${lead.subQualityGrade}" title="サブ総合評価(志望職種以外の3ステータス平均)">${lead.subQualityGrade}</span>`
      : `<span class="rank-badge">?</span>`)
  );
}

// 口説き進捗ゲージ。closingProgress().requiredは資質グレードから直接決まる値
// なので、資質未観測のままそのまま数値表示すると「必要額から逆算して資質が
// バレる」抜け道になってしまう(§費用で能力がわかってしまうのは避けたい)。
// 資質グレード観測済みなら正確な数値、未観測ならratioを4段階に丸めた
// 手応え表現のみにして、必要値そのものは見せない。
function closingGaugeInfo(lead, progress) {
  const revealed = getParamRevealState(lead, "qualityGrade") === "revealed";
  if (revealed) {
    const pct = Math.max(0, Math.min(100, Math.round((progress.total / progress.required) * 100)));
    return { pct, label: `${Math.round(progress.total)} / ${progress.required}` };
  }
  const ratio = progress.total / progress.required;
  const pct = progress.canHire ? 100 : ratio >= 0.7 ? 60 : ratio >= 0.4 ? 30 : 10;
  const label = progress.canHire ? "手応えあり" : ratio >= 0.7 ? "あと一押し" : ratio >= 0.4 ? "まだ足りない" : "全然足りない";
  return { pct, label };
}

// 一覧(scoutView.js「候補選択」ステップ)向けの簡易カード。タップで
// アイドル表示ステップへ進む(data-action="select-lead" data-lead)。
export function leadCardHtml(lead) {
  const progress = closingProgress(lead);
  const gauge = closingGaugeInfo(lead, progress);
  return `
    <div class="lead-card" data-action="select-lead" data-lead="${lead.id}" role="button">
      ${portraitAvatarHtml(lead, "md")}
      <div class="lead-card__main">
        <div class="lead-card__name-row">
          <span class="lead-card__name">${lead.name}</span>
          <span class="rank-badge-label">総合評価${qualityBadgeHtml(lead)}</span>
        </div>
        <div class="lead-card__tags">
          <span class="scout-tag">${lead.age}歳</span>
          <span class="scout-tag">${attributeSummaryHtml(lead)}</span>
          <span class="scout-tag">志望: ${lead.desiredJobTypeLabel}</span>
          <span class="scout-tag" title="${lead.negotiationPersonalityDescription ?? ""}">${lead.negotiationPersonalityLabel}</span>
          ${lead.rivalInterest ? `<span class="scout-tag scout-tag--warn">👀 他事務所も接触中</span>` : ""}
        </div>
        <div class="lead-card__footer">
          <span class="lead-card__weeks ${lead.remainingWeeks <= 2 ? "lead-card__weeks--urgent" : ""}">残り${lead.remainingWeeks}週</span>
          <div class="gauge__track" style="flex:1;">
            <div class="gauge__fill gauge__fill--score" style="width:${gauge.pct}%"></div>
          </div>
        </div>
      </div>
    </div>`;
}

// 地図ピン(ホーム画面、ui.js)。タップでスカウト画面のウィザードへ遷移し、
// そのままアイドル表示ステップを開く(§ホーム画面の地図ピンをスカウト画面と
// 共有化: 別モーダルの全部入り表示は廃止し、スカウト画面と同じ導線にする)。
// left/topは.office-map内に散らして置くための座標(%)。indexから決定論的に
// 散らす(同じ候補は再描画のたびに同じ位置に留まる)。
function leadPinHtml(lead, index) {
  const left = 12 + ((index * 23) % 76);
  const top = 22 + ((index * 37) % 56);
  const mainRevealed = getParamRevealState(lead, "qualityGrade") === "revealed";
  const subRevealed = getParamRevealState(lead, "subQualityGrade") === "revealed";
  return `
    <button class="map-pin ${lead.remainingWeeks <= 2 ? "map-pin--urgent" : ""}" style="left:${left}%; top:${top}%;" data-action="view-lead" data-lead="${lead.id}" title="${lead.name}(総合評価${mainRevealed ? lead.qualityGrade : "?"}/${subRevealed ? lead.subQualityGrade : "?"}・残り${lead.remainingWeeks}週)">
      ${qualityBadgeHtml(lead)}
      <span class="map-pin__label">残り${lead.remainingWeeks}週</span>
    </button>`;
}

// ホーム画面の地図(<main>内)に挿入する候補ピン一式。main.jsが事前に
// レンダリングしてrenderHome()へ渡す(ui.js側からscoutLeadCard.jsを
// 直接importしないための循環import回避)。
export function scoutLeadsPinsHtml(gameState) {
  const leads = gameState.scoutLeads ?? [];
  if (leads.length === 0) return "";
  return `<div class="office-map office-map--home office-map--leads">${leads.map((lead, i) => leadPinHtml(lead, i)).join("")}</div>`;
}

const GIFT_ICON = "🎁";
const MEAL_ICON = "🍽️";
const LIVE_ICON = "🎤";

function signedPercent(ratio) {
  const pct = Math.round(ratio * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

// §行動制限による差別化: 差し入れ/食事/ライブ招待は候補ごとではなく
// 事務所全体で共有のクールダウン(gameState.affinityActionWeeks[action])。
function cooldownRemaining(gameState, action, cooldownWeeks) {
  const lastWeek = gameState.affinityActionWeeks?.[action];
  if (lastWeek == null) return 0;
  return Math.max(0, cooldownWeeks - (gameState.day - lastWeek));
}

// ヘッダーのコア部分(顔・名前・総合評価)。フル版/簡易版どちらからも使う。
function leadHeaderCore(lead) {
  return `
    ${scoutPortraitHtml(lead)}
    <div class="scout-name">${lead.name}（${lead.age}）</div>
    <div style="text-align:center; margin: 4px 0 8px;">
      <span class="rank-badge-label">総合評価${qualityBadgeHtml(lead)}</span>
    </div>`;
}

// 簡易ヘッダー(顔・名前・総合評価のみ)。お試しステージ/契約交渉では
// 「誰の話をしているか」さえ分かれば十分で、情報グリッド以下は不要
// (§お試しステージ/契約交渉は総合評価までの表示でいい)。
export function leadHeaderCompactHtml(lead) {
  return leadHeaderCore(lead);
}

// フルヘッダー(顔・名前・総合評価・情報グリッド・残り週数など)。候補を
// 選ぶ判断材料が全部欲しいプロフィール表示ステップでのみ使う。
export function leadHeaderHtml(lead) {
  const originStars = levelStarsHtml(ORIGIN_ATTRIBUTES.find((o) => o.key === lead.origin)?.salaryTier ?? 0);
  const location = SCOUT_LOCATIONS.find((l) => l.id === lead.locationId);
  const locationStars = location ? levelStarsHtml((location.rankShift ?? 0) + 1) : "";

  return `
    ${leadHeaderCore(lead)}

    <div class="scout-info-grid">
      <span class="scout-tag">${attributeSummaryHtml(lead)}</span>
      <span class="scout-tag" title="まだ雇用していないため未定">現職種: ー</span>
      <span class="scout-tag">やる気${lead.interest}</span>
      <span class="scout-tag">給料 月${formatMan(getBaseSalary(lead, unresolvedStatCount(lead)))}</span>
      <span class="scout-tag" title="雇うまで分からない">成長タイプ: ?</span>
      ${growthDegreeTagHtml(lead)}
      <span class="scout-tag">${lead.originLabel} ${originStars}</span>
      ${location ? `<span class="scout-tag">${location.label} ${locationStars}</span>` : `<span class="scout-tag">${lead.methodId === "audition" ? "募集" : "応募"}</span>`}
      <span class="scout-tag" title="${lead.negotiationPersonalityDescription ?? ""}">性格: ${lead.negotiationPersonalityLabel}</span>
      <span class="scout-tag">志望: ${lead.desiredJobTypeLabel}</span>
    </div>

    <div class="scout-tags">
      <span class="scout-tag ${lead.remainingWeeks <= 2 ? "scout-tag--warn" : ""}">⏳ 残り${lead.remainingWeeks}/${lead.totalLifespanWeeks}週</span>
      ${lead.rivalInterest ? `<span class="scout-tag scout-tag--warn">👀 他事務所も接触中(放置すると横取りされることがある)</span>` : ""}
    </div>`;
}

// 能力(成長込み)グラフ。観測済みの項目だけ分かる(§スカウト画面では
// 成長・レッスン分も伏せる、revealGrowthLesson=false)。
export function leadStatsHtml(lead) {
  const relevantStats = JOB_TYPES.find((j) => j.key === lead.jobType)?.relevantStats;
  return `
    <div class="modal-section">
      <h3 class="modal-section__heading">能力(成長込み)</h3>
      <p class="stat-row stat-row--muted">現状の実力は観測済みの項目だけ分かる。成長・レッスンの伸びしろは雇うまで分からない。</p>
      ${statGrowthChartHtml(lead, (key) => getParamRevealState(lead, key), relevantStats, false)}
    </div>`;
}

// お試しステージ(§スカウトに賭けと発見を持たせる)。選択数の上限なく好きな
// だけ選んで1回のお試しで全部観測できる(costPerItem×項目数の実額)。既に
// 観測済みの項目もボタン上で分かるようにしておく(選び直しても無駄撃ちに
// なるだけで害はない)。
export function leadTrialHtml(gameState, lead) {
  const trialCfg = BALANCE.scouting.trial;
  const trialCostPerItem = getTrialCostPerItem(gameState);
  const pendingParams = lead.pendingObservationParams ?? [];
  const paramButtonsHtml = OBSERVABLE_SCOUT_PARAMS.map((param) => {
    const state = getParamRevealState(lead, param);
    const isPending = pendingParams.includes(param);
    const suffix = state === "revealed" ? " ✓" : state === "floor" ? " (下限判明)" : "";
    return `
      <button class="btn ${isPending ? "btn--primary" : ""} ${state === "revealed" ? "is-held" : ""}"
        data-action="select-observation-param" data-lead="${lead.id}" data-param="${param}">
        ${OBSERVABLE_PARAM_LABELS[param]}${suffix}
      </button>`;
  }).join("");
  const trialTotalCost = trialCostPerItem * pendingParams.length;

  return `
    <div class="modal-section">
      <h3 class="modal-section__heading">お試しステージ</h3>
      <p class="stat-row stat-row--muted">
        観測したい項目を好きなだけ選んで実行できる(1項目${formatMan(trialCostPerItem)})。
        観測係は臨時の低レベルコーチなので目利きは${trialCfg.judgeRankCeiling}ランクまで。
        それを超える実力は「◯以上」としか分からない。
      </p>
      <div class="scout-negotiate-grid">${paramButtonsHtml}</div>
      <button class="btn btn--primary btn--block" data-action="run-trial" data-lead="${lead.id}" ${pendingParams.length === 0 ? "disabled" : ""}>
        お試し実行(${formatMan(trialTotalCost)}・${pendingParams.length}項目観測)
      </button>
    </div>`;
}

// 契約交渉一式(何としてデビューさせるか/条件を積む/好感度を積む/口説き具合/雇うボタン)。
export function leadNegotiateHtml(gameState, lead) {
  const cfg = BALANCE.scouting.leads;
  const progress = closingProgress(lead);
  const detailGauge = closingGaugeInfo(lead, progress);
  const giftCooldown = cooldownRemaining(gameState, "gift", cfg.actions.gift.cooldownWeeks);
  const mealCooldown = cooldownRemaining(gameState, "meal", cfg.actions.meal.cooldownWeeks);
  const inviteCooldown = cooldownRemaining(gameState, "invite", cfg.actions.liveInvite.cooldownWeeks);
  const activeCount = gameState.roster.filter((i) => !i.retired).length;
  const atCapacity = activeCount >= getRosterCapacity(gameState);

  const leadUnresolvedCount = unresolvedStatCount(lead);
  const baseMonthlySalary = getBaseSalary(lead, leadUnresolvedCount);
  const commissionOffer = lead.commissionRateOffer ?? BALANCE.salary.commissionRate;
  const feeOfferAmount = lead.feeOfferAmount ?? 0;
  const salaryBumpRatio = lead.salaryBumpRatio ?? 0;
  const moneyRange = BALANCE.scouting.leads.moneyOfferRange;

  // スライダーの代わりに±ボタンで1刻みずつ調整する(§契約交渉のスライダー廃止)。
  // 実際のクランプはstate.js:setLeadMoneyOffer側でも行うため、ここでのdisabled
  // 判定は見た目上の上下限表示にすぎない。
  function stepperRowHtml({ label, valueLabel, action, value, range, note }) {
    return `
      <div class="scout-stepper-row">
        <div class="scout-stepper-row__head">
          <span>${label}</span>
          <span>${valueLabel}</span>
        </div>
        <div class="scout-stepper-row__controls">
          <button class="btn scout-stepper-btn" data-action="${action}" data-lead="${lead.id}" data-delta="${-range.step}" ${value <= range.min ? "disabled" : ""}>−</button>
          <button class="btn scout-stepper-btn" data-action="${action}" data-lead="${lead.id}" data-delta="${range.step}" ${value >= range.max ? "disabled" : ""}>＋</button>
        </div>
        ${note ?? ""}
      </div>`;
  }

  const feeOfferStepperHtml = stepperRowHtml({
    label: "契約金をゴリ押しで積む",
    valueLabel: formatMan(feeOfferAmount),
    action: "adjust-fee-offer",
    value: feeOfferAmount,
    range: moneyRange.feeOfferAmount,
  });

  const salaryBumpStepperHtml = stepperRowHtml({
    label: `固定給の上乗せ${signedPercent(salaryBumpRatio)}`,
    valueLabel: `月${formatMan(Math.round(baseMonthlySalary * (1 + salaryBumpRatio)))}`,
    action: "adjust-salary-bump",
    value: salaryBumpRatio,
    range: moneyRange.salaryBumpRatio,
    note:
      leadUnresolvedCount > 0
        ? `<p class="stat-row stat-row--muted">未観測${leadUnresolvedCount}項目ぶんの不確実性割増込み(お試しで観測すると下がることがある)</p>`
        : "",
  });

  const commissionOfferStepperHtml = stepperRowHtml({
    label: `歩合率(標準${Math.round(BALANCE.salary.commissionRate * 100)}%)`,
    valueLabel: `${Math.round(commissionOffer * 100)}%天引き`,
    action: "adjust-commission-offer",
    value: commissionOffer,
    range: moneyRange.commissionRateOffer,
  });

  const jobTypeButtonsHtml = JOB_TYPES.map(
    (jt) => `
      <button class="btn ${lead.jobType === jt.key ? "btn--primary" : ""}" data-action="set-lead-jobtype" data-lead="${lead.id}" data-jobtype="${jt.key}">
        ${jt.label}${jt.key === lead.desiredJobType ? "(志望)" : ""}
      </button>`
  ).join("");

  // 差し入れ/食事/ライブ招待は即実行せず、まず選ぶ(pendingAffinityAction)→
  // プレビューを見せた上で「決定」を押して初めて実行する(§スカウト再設計:
  // いきなりお金が減って驚かないように)。
  const pending = lead.pendingAffinityAction;
  const pendingCfg =
    pending === "gift" ? cfg.actions.gift : pending === "meal" ? cfg.actions.meal : pending === "invite" ? cfg.actions.liveInvite : null;
  const pendingCooldown = pending === "gift" ? giftCooldown : pending === "meal" ? mealCooldown : pending === "invite" ? inviteCooldown : 0;
  const pendingLabel =
    pending === "gift" ? `${GIFT_ICON} 差し入れ` : pending === "meal" ? `${MEAL_ICON} 食事` : pending === "invite" ? `${LIVE_ICON} ライブ招待` : "";

  return `
    <div class="modal-section">
      <h3 class="modal-section__heading">何としてデビューさせるか</h3>
      <div class="scout-negotiate-grid">${jobTypeButtonsHtml}</div>
      <p class="stat-row stat-row--muted">本人の志望と一致すると口説き具合+${cfg.jobMatchBonus}、食い違うと${cfg.jobMismatchPenalty}(契約後のパラメータには影響しない)。</p>
    </div>

    <div class="modal-section">
      <h3 class="modal-section__heading">契約金を積む</h3>
      ${feeOfferStepperHtml}
    </div>

    <div class="modal-section">
      <h3 class="modal-section__heading">条件を積む(お金)</h3>
      <div class="scout-negotiate-row">
        <button class="btn ${lead.salaryType === "fixed" ? "btn--primary" : ""}" data-action="set-lead-salary" data-lead="${lead.id}" data-salary="fixed">
          固定給<br>月${formatMan(baseMonthlySalary)}〜
        </button>
        <button class="btn ${lead.salaryType === "commission" ? "btn--primary" : ""}" data-action="set-lead-salary" data-salary="commission" data-lead="${lead.id}">
          歩合制<br>${Math.round(commissionOffer * 100)}%天引き
        </button>
      </div>
      <p class="stat-row stat-row--muted">±ボタンで条件を調整できる(給与・歩合は標準より悪い条件にすると口説き具合が下がる)。</p>
      ${lead.salaryType === "fixed" ? salaryBumpStepperHtml : commissionOfferStepperHtml}
    </div>

    <div class="modal-section">
      <h3 class="modal-section__heading">好感度を積む</h3>
      <p class="stat-row stat-row--muted">差し入れ・食事・ライブ招待はそれぞれ事務所全体で週1回まで(候補プール全員で共有)。誰に使うか選ぶ資源です。</p>
      <div class="scout-negotiate-row">
        <button class="btn ${pending === "gift" ? "btn--primary" : ""}" data-action="select-affinity-action" data-affinity-action="gift" data-lead="${lead.id}" ${giftCooldown > 0 ? "disabled" : ""}>
          ${GIFT_ICON} 差し入れ${giftCooldown > 0 ? `(あと${giftCooldown}週)` : ""}
        </button>
        <button class="btn ${pending === "meal" ? "btn--primary" : ""}" data-action="select-affinity-action" data-affinity-action="meal" data-lead="${lead.id}" ${mealCooldown > 0 ? "disabled" : ""}>
          ${MEAL_ICON} 食事${mealCooldown > 0 ? `(あと${mealCooldown}週)` : ""}
        </button>
        <button class="btn ${pending === "invite" ? "btn--primary" : ""}" data-action="select-affinity-action" data-affinity-action="invite" data-lead="${lead.id}" ${inviteCooldown > 0 ? "disabled" : ""}>
          ${LIVE_ICON} ライブ招待${inviteCooldown > 0 ? `(あと${inviteCooldown}週)` : ""}
        </button>
      </div>
      ${
        pendingCfg
          ? `<p class="stat-row stat-row--muted">${pendingLabel}: ${formatMan(pendingCfg.cost)}を払って好感度+${pendingCfg.affinityGain}${pendingCooldown > 0 ? "(現在はクールダウン中で決定できません)" : ""}</p>
             <button class="btn btn--primary btn--block" data-action="confirm-affinity-action" data-lead="${lead.id}" ${pendingCooldown > 0 ? "disabled" : ""}>決定</button>`
          : ""
      }
    </div>

    <div class="modal-section">
      <h3 class="modal-section__heading">口説き具合</h3>
      <div class="gauge">
        <div class="gauge__label"><span>${detailGauge.label}</span></div>
        <div class="gauge__track"><div class="gauge__fill gauge__fill--score" style="width:${detailGauge.pct}%"></div></div>
      </div>
      <p class="stat-row stat-row--muted">
        好感度 ${Math.round(lead.interest ?? 50)}(やる気) + ${Math.round(lead.affinity)}(積み上げ)(反映上限${
          getParamRevealState(lead, "qualityGrade") === "revealed" ? Math.round(progress.effectiveAffinity) : "?"
        })
        + お金評価 ${progress.moneyScore >= 0 ? "+" : ""}${Math.round(progress.moneyScore)}
        ${progress.jobMatchScore ? ` + 志望${progress.jobMatchScore > 0 ? "一致" : "不一致"} ${progress.jobMatchScore > 0 ? "+" : ""}${Math.round(progress.jobMatchScore)}` : ""}
        ${progress.personality.closingBonus ? ` + 熱望ボーナス +${progress.personality.closingBonus}` : ""}
      </p>
      <p class="stat-row stat-row--muted">${lead.negotiationPersonalityLabel}: ${lead.negotiationPersonalityDescription}</p>
    </div>

    ${atCapacity ? `<p class="stat-row stat-row--muted">事務所が手狭です(在籍${activeCount}/${getRosterCapacity(gameState)}人)。設備を建て替えて広げてください。</p>` : ""}
    <button class="btn btn--primary btn--block" data-action="lead-hire" data-lead="${lead.id}" ${progress.canHire && !atCapacity ? "" : "disabled"}>
      ${!progress.canHire ? "まだ口説き切れていない" : atCapacity ? "事務所が手狭で雇えない" : "雇う"}
    </button>`;
}

