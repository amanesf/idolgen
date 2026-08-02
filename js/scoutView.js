// スカウト画面。ステップ形式のウィザードにして画面遷移を明確にする
// (§画面遷移の再設計): スカウトボタン→場所選択→候補選択→アイドル表示→
// お試しステージ実施→アイドル表示→契約交渉。常時表示の「口説き中の候補一覧」
// は廃止し、候補プール(gameState.scoutLeads)は「候補選択」ステップでのみ見せる。
// 志望職種・性格タイプ・属性は常に見えるが、7ステータス・成長度・資質グレードは
// お試しステージで観測するまで伏せられる(§スカウトに賭けと発見を持たせる)。
// 「行き先へ出向く/公募をかける」自体は週を送らない(即座にその場で候補が
// 見つかる)。gameState.scoutedLocationId(週次でnullに戻る)で「今週すでに
// 出向いた先」を記録し、違う行き先へはその週もう行けない(同じ行き先への
// 複数回はOK)。顔ポートレートのcanvas描画があるため専用のDOMコントローラ
// として実装する。

import { renderTopBar, drawQueuedPortraits } from "./ui.js?v=1785558404241";
import { BALANCE, JOB_TYPES, SCOUT_STAT_KEYS } from "./masterData.js?v=1785558404241";
import { getAvailableScoutOptions, createScoutLead, SCOUT_METHOD_REFERRAL, SCOUT_METHOD_AUDITION } from "./scoutGenerator.js?v=1785558404241";
import { createBattleState, primeTelegraph } from "./battle.js?v=1785558404241";
import {
  saveGameState,
  selectAffinityAction,
  confirmAffinityAction,
  setLeadMoneyOffer,
  setLeadJobType,
  hireLeadCandidate,
  selectObservationParam,
  getJudgeThreshold,
} from "./state.js?v=1785558404241";
import {
  leadCardHtml,
  leadHeaderHtml,
  leadHeaderCompactHtml,
  leadStatsHtml,
  leadTrialHtml,
  leadNegotiateHtml,
  OBSERVABLE_PARAM_LABELS,
} from "./scoutLeadCard.js?v=1785558404241";
import { morph } from "./domMorph.js?v=1785558404241";

// 「コーチの能力を超えている」項目か(§コーチの能力に応じてコーチが倒される)。
// 臨時の低レベルコーチはjudgeRankCeiling(D)までしか正確に目利きできないので、
// 実力が既にその閾値以上ならコーチ自身が力不足で一撃で終わる。成長度は
// ランクの概念がないので常に「通常」扱い。
function isCoachOverpowered(lead, param) {
  if (!SCOUT_STAT_KEYS.includes(param)) return false;
  const threshold = getJudgeThreshold(BALANCE.scouting.trial.judgeRankCeiling);
  return lead.stats[param] >= threshold;
}

// お試しステージの観客席(§お試しステージは選択項目数に合わせて観客席を
// 増やす)。選んだ観測項目1つにつき1席、その項目名をラベルにして並べる。
// コーチの能力を超えている項目の席はfixedMaxHp:1にして必ず一撃で倒れる
// ようにする(§D以上の能力は1撃でいい。weightの端数丸めに頼ると0や2以上に
// なり得て「必ず1撃」を保証できないため、battle.js:buildAudienceBoardの
// fixedMaxHp指定を使う)。
function buildTrialAudienceLayout(lead, paramKeys) {
  const cols = Math.ceil(Math.sqrt(paramKeys.length)) || 1;
  const blocks = paramKeys.map((key, i) => {
    const overpowered = isCoachOverpowered(lead, key);
    return {
      id: `seat_${key}`,
      label: OBSERVABLE_PARAM_LABELS[key] ?? key,
      icon: overpowered ? "🏳️" : "👁️",
      row: Math.floor(i / cols),
      col: i % cols,
      ...(overpowered ? { fixedMaxHp: 1 } : { weight: 1 }),
    };
  });
  const rows = Math.max(1, Math.ceil(paramKeys.length / cols));
  return { cols, rows, blocks };
}

// お試しステージ実施用の1人ソロ編成のダミーステージ(§お試しステージ実施は
// バトル画面で行う)。報酬・仕事一覧とは無関係の使い捨て定義で、観測結果
// (パラメータの開示)には影響しない(勝敗にかかわらず選択済み項目を開示する)。
// 勝敗の見せ方だけは専用の文言にする(§候補者が勝ったら「コーチ以上の能力」、
// 負けたら「観測終了」)。
function buildTrialStage(lead, paramKeys) {
  const jobType = JOB_TYPES.find((j) => j.key === lead.jobType) ?? JOB_TYPES[0];
  const relevant = jobType.relevantStats ?? ["vocal", "dance"];
  const scoreStats = [relevant[1] ?? relevant[0], relevant[2] ?? relevant[0]];
  return {
    id: "scout_trial",
    name: "お試しステージ",
    turnUnitLabel: "曲目",
    formationId: "solo_spotlight",
    audienceLayout: buildTrialAudienceLayout(lead, paramKeys),
    // 客席は全体に薄く配分する固定の攻撃形にする(§①、毎ターンのスコアを
    // 全席にまんべんなく配分。属性由来の狙い撃ち/貫通などは使わせない)。
    forceAttackShape: "all",
    turnLimitMode: "fixed",
    maxTurns: 4,
    scoreStats,
    targetScore: 1200,
    clientTier: "clean",
    resultLabels: {
      success: "🌟 コーチ以上の能力",
      fail: "📋 観測終了",
      timeup: "📋 観測終了",
      retreat: "📋 観測終了",
    },
  };
}

function buildTrialBattleState(gameState, lead, paramKeys) {
  const stage = buildTrialStage(lead, paramKeys);
  const performerIdol = {
    id: lead.id,
    name: lead.name,
    stats: lead.stats,
    age: lead.age,
    attribute: lead.attribute,
    attributeLabel: lead.attributeLabel,
    talent: lead.talent ?? null,
    interest: lead.interest,
    lastDance: false,
    fans: 0,
    stress: 0,
    tenguDo: 0,
    avatarInitial: lead.name?.[0],
    avatarHue: 300,
    portrait: lead.portrait ?? null,
  };
  return createBattleState([performerIdol], stage, { C: lead.id }, gameState.songCount, gameState.masteredSongCount, gameState.era);
}

// initialLeadId: ホーム画面の地図ピンから遷移した場合など、最初から特定の
// 候補のアイドル表示ステップを開いた状態で入りたいときに渡す(§ホーム画面の
// 地図ピンをスカウト画面と共有化)。プールに存在しなければ通常通り行き先選択
// から始める。
export function mountScoutView(container, gameState, callbacks, initialLeadId = null) {
  const options = getAvailableScoutOptions(gameState);
  const initialLeadExists = initialLeadId != null && (gameState.scoutLeads ?? []).some((l) => l.id === initialLeadId);
  // phase: "location"(行き先選択) | "select"(候補選択) | "profile"(アイドル表示) |
  // "trial"(お試しステージ) | "negotiate"(契約交渉)
  const state = {
    phase: initialLeadExists ? "profile" : "location",
    activeLeadId: initialLeadExists ? initialLeadId : null,
  };

  function activeLead() {
    return (gameState.scoutLeads ?? []).find((l) => l.id === state.activeLeadId) ?? null;
  }

  // activeLeadIdが指す候補がプールから消えていたら(雇用済み・期限切れ等)
  // 候補選択ステップへ引き戻す(§画面遷移の再設計、迷子にしない)。
  function guardActiveLead() {
    if (["profile", "trial", "negotiate"].includes(state.phase) && !activeLead()) {
      state.phase = "select";
      state.activeLeadId = null;
    }
  }

  function render() {
    guardActiveLead();
    morph(container, template(gameState, state, options));
    drawQueuedPortraits();
  }

  // 行き先ボタンを押した瞬間に出発する。スカウト自体は週を送らない
  // (即座にその場で候補が見つかる)。targetId: SCOUT_LOCATIONS.idか"audition"。
  // 今週すでに違う行き先へ出向いていたらブロックする(同じ行き先への
  // 複数回の出発は許す)。生成後は「候補選択」ステップへ進む(§画面遷移の
  // 再設計: 新しく見つかった子だけでなく、既存プールからも選べるように)。
  function goScout(targetId) {
    if ((gameState.scoutLeads ?? []).length >= BALANCE.scouting.leads.maxPoolSize) return;
    const lockedId = gameState.scoutedLocationId;
    if (lockedId != null && lockedId !== targetId) return;
    const isAudition = targetId === "audition";
    const location = isAudition ? null : options.locations.find((l) => l.id === targetId);
    if (!isAudition && !location) return;
    const method = isAudition ? SCOUT_METHOD_AUDITION : SCOUT_METHOD_REFERRAL;
    gameState.scoutLeads.push(createScoutLead({ gameState, location, method }));
    gameState.scoutedLocationId = targetId;
    state.phase = "select";
    saveGameState(gameState);
    render();
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
      case "scout-go":
        goScout(target.dataset.target);
        break;

      case "view-pool":
        state.phase = "select";
        render();
        break;

      case "select-lead":
        state.activeLeadId = target.dataset.lead;
        state.phase = "profile";
        render();
        break;

      case "go-trial":
        state.phase = "trial";
        render();
        break;

      case "go-negotiate":
        state.phase = "negotiate";
        render();
        break;

      case "select-affinity-action":
        selectAffinityAction(gameState, target.dataset.lead, target.dataset.affinityAction);
        render();
        break;

      case "confirm-affinity-action":
        confirmAffinityAction(gameState, target.dataset.lead);
        saveGameState(gameState);
        render();
        break;

      case "set-lead-salary":
        setLeadMoneyOffer(gameState, target.dataset.lead, { salaryType: target.dataset.salary });
        saveGameState(gameState);
        render();
        break;

      case "set-lead-jobtype":
        setLeadJobType(gameState, target.dataset.lead, target.dataset.jobtype);
        saveGameState(gameState);
        render();
        break;

      case "select-observation-param":
        selectObservationParam(gameState, target.dataset.lead, target.dataset.param);
        render();
        break;

      case "adjust-fee-offer": {
        const lead = activeLead();
        if (!lead) break;
        setLeadMoneyOffer(gameState, lead.id, { feeOfferAmount: (lead.feeOfferAmount ?? 0) + Number(target.dataset.delta) });
        saveGameState(gameState);
        render();
        break;
      }

      case "adjust-salary-bump": {
        const lead = activeLead();
        if (!lead) break;
        setLeadMoneyOffer(gameState, lead.id, { salaryBumpRatio: (lead.salaryBumpRatio ?? 0) + Number(target.dataset.delta) });
        saveGameState(gameState);
        render();
        break;
      }

      case "adjust-commission-offer": {
        const lead = activeLead();
        if (!lead) break;
        setLeadMoneyOffer(gameState, lead.id, {
          commissionRateOffer: (lead.commissionRateOffer ?? BALANCE.salary.commissionRate) + Number(target.dataset.delta),
        });
        saveGameState(gameState);
        render();
        break;
      }

      case "run-trial": {
        // お試しステージ実施はバトル画面で行う(§お試しステージ実行でバトル
        // 画面が始まるように)。この画面(scoutView)は一旦離れるのでリスナーを
        // 解除し、main.js側にバトル状態を渡して画面遷移してもらう。バトル終了後は
        // main.js側がrunTrialPerformance()で選択済み項目の開示・費用精算を行い、
        // このアイドル表示ステップへ戻ってくる(勝敗そのものは観測結果に影響しない)。
        const lead = activeLead();
        const paramKeys = lead?.pendingObservationParams ?? [];
        if (!lead || paramKeys.length === 0) break;
        const trialBattleState = buildTrialBattleState(gameState, lead, paramKeys);
        primeTelegraph(trialBattleState);
        container.removeEventListener("click", handleClick);
        callbacks.onStartTrial(trialBattleState, lead.id);
        return;
      }

      case "lead-hire": {
        const result = hireLeadCandidate(gameState, target.dataset.lead);
        if (result.success) {
          state.phase = "location";
          state.activeLeadId = null;
        }
        saveGameState(gameState);
        render();
        break;
      }

      case "scout-back":
        if (state.phase === "profile") {
          state.phase = "select";
        } else if (state.phase === "trial" || state.phase === "negotiate") {
          state.phase = "profile";
        } else if (state.phase === "select") {
          state.phase = "location";
        } else {
          container.removeEventListener("click", handleClick);
          callbacks.onBack();
          return;
        }
        render();
        break;
    }
  }

  render();
}

// 行き先チップ一覧(§スカウト画面のナビゲーション再設計: スカウト画面に
// 入った瞬間から出ている、タップで即出発)。SCOUT_LOCATIONS各1つ+公募1つ。
// 今週すでに他の行き先へ出向いていたら、それ以外はdisabledにする
// (同じ行き先への複数回はOK)。
function locationTemplate(gameState, options) {
  const lockedId = gameState.scoutedLocationId ?? null;
  const leads = gameState.scoutLeads ?? [];
  const cfg = BALANCE.scouting.leads;
  const poolFull = leads.length >= cfg.maxPoolSize;
  const method = SCOUT_METHOD_AUDITION;

  const locationButtonsHtml = options.locations
    .map((loc) => {
      const locked = lockedId != null && lockedId !== loc.id;
      return `
      <button class="list-row list-row--column" data-action="scout-go" data-target="${loc.id}" ${poolFull || locked ? "disabled" : ""}>
        <span class="list-row__name">${loc.label}</span>
        <span class="list-row__meta">目利き+${loc.rankShift}</span>
      </button>`;
    })
    .join("");

  const auditionLocked = lockedId != null && lockedId !== "audition";
  const auditionButtonHtml = `
    <button class="list-row list-row--column" data-action="scout-go" data-target="audition" ${poolFull || auditionLocked ? "disabled" : ""}>
      <span class="list-row__name">公募</span>
      <span class="list-row__meta">やる気${method.interestMin}〜${method.interestMax}</span>
    </button>`;

  const lockNote = lockedId
    ? `<p class="stat-row stat-row--muted">今週は${lockedId === "audition" ? "公募" : options.locations.find((l) => l.id === lockedId)?.label ?? "?"}に専念中。他の行き先は来週以降。</p>`
    : "";
  const poolFullNote = poolFull
    ? `<p class="stat-row stat-row--muted">候補プールが満杯です。誰か雇うか、期限切れを待つまで新しい伝手は探せません。</p>`
    : "";

  const body = `
    <section class="card scout-select-card">
      <h2 class="screen__subtitle">行き先を選ぶ</h2>
      ${lockNote}
      ${poolFullNote}
      <div class="scout-option-list">${locationButtonsHtml}${auditionButtonHtml}</div>
    </section>
    ${
      leads.length
        ? `<footer class="action-bar" style="position:static; margin-top:8px;">
            <button class="btn btn--block" data-action="view-pool">口説き中の候補を見る（${leads.length}/${cfg.maxPoolSize}）</button>
          </footer>`
        : ""
    }`;
  const footer = `
    <footer class="action-bar">
      <button class="btn" data-action="scout-back">戻る</button>
    </footer>`;
  return { title: "スカウト", body, footer };
}

// 候補選択ステップ。プール中の候補(新しく見つかった子も含む)を一覧し、
// タップで選んでアイドル表示ステップへ進む(§画面遷移の再設計)。
function selectTemplate(gameState) {
  const leads = gameState.scoutLeads ?? [];
  const cfg = BALANCE.scouting.leads;

  const listHtml = leads.length
    ? leads.map((lead) => leadCardHtml(lead)).join("")
    : `<div class="empty">今は口説いている候補がいません。行き先を選んで新しい伝手を探しましょう。</div>`;

  const body = `
    <section class="card">
      <div class="list-heading-row">
        <div class="list-heading">候補を選ぶ（${leads.length}/${cfg.maxPoolSize}）</div>
      </div>
      <div class="list scroll-list">${listHtml}</div>
    </section>`;
  const footer = `
    <footer class="action-bar">
      <button class="btn" data-action="scout-back">戻る</button>
    </footer>`;
  return { title: "候補選択", body, footer };
}

// アイドル表示ステップ。ヘッダー(顔・名前・情報グリッド)と能力グラフだけを
// 見せ、お試しステージ/契約交渉への入口をフッターに置く(§画面遷移の再設計)。
function profileTemplate(gameState, lead) {
  const body = `
    <section class="card">
      ${leadHeaderHtml(lead)}
    </section>
    <section class="card">
      ${leadStatsHtml(lead)}
    </section>`;
  const footer = `
    <footer class="action-bar">
      <button class="btn" data-action="scout-back">戻る</button>
      <button class="btn" data-action="go-trial" data-lead="${lead.id}">お試しステージへ</button>
      <button class="btn btn--primary" data-action="go-negotiate" data-lead="${lead.id}">契約交渉へ</button>
    </footer>`;
  return { title: lead.name, body, footer };
}

// お試しステージ実施ステップ。ヘッダーは総合評価までの簡易版で十分
// (§お試しステージ/契約交渉は総合評価までの表示でいい)。
function trialTemplate(gameState, lead) {
  const body = `
    <section class="card">
      ${leadHeaderCompactHtml(lead)}
    </section>
    <section class="card">
      ${leadTrialHtml(gameState, lead)}
    </section>`;
  const footer = `
    <footer class="action-bar">
      <button class="btn" data-action="scout-back">戻る</button>
    </footer>`;
  return { title: "お試しステージ", body, footer };
}

// 契約交渉ステップ(何としてデビューさせるか/条件を積む/好感度を積む/
// 口説き具合/雇うボタン)。ヘッダーは総合評価までの簡易版で十分
// (§お試しステージ/契約交渉は総合評価までの表示でいい)。
function negotiateTemplate(gameState, lead) {
  const body = `
    <section class="card">
      ${leadHeaderCompactHtml(lead)}
    </section>
    <section class="card">
      ${leadNegotiateHtml(gameState, lead)}
    </section>`;
  const footer = `
    <footer class="action-bar">
      <button class="btn" data-action="scout-back">戻る</button>
    </footer>`;
  return { title: "契約交渉", body, footer };
}

function template(gameState, state, options) {
  const lead = state.phase === "profile" || state.phase === "trial" || state.phase === "negotiate"
    ? (gameState.scoutLeads ?? []).find((l) => l.id === state.activeLeadId)
    : null;

  const { title, body, footer } =
    state.phase === "select"
      ? selectTemplate(gameState)
      : state.phase === "profile" && lead
        ? profileTemplate(gameState, lead)
        : state.phase === "trial" && lead
          ? trialTemplate(gameState, lead)
          : state.phase === "negotiate" && lead
            ? negotiateTemplate(gameState, lead)
            : locationTemplate(gameState, options);

  return `
    ${renderTopBar(gameState)}
    <main class="screen scout-screen">
      <h1 class="screen__title">${title}</h1>
      ${body}
    </main>
    ${footer}`;
}
