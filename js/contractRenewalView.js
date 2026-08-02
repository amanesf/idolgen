// 契約更改画面(§スカウト充実化「1年に1回契約交渉」/§契約更改の駆け引き強化/
// §給与体系の月給化)。スカウト画面の契約交渉(scoutView.js)と同じ構造の、
// 最大数ラウンドの往復交渉。「満額のむ」「契約満了で送り出す」はその場で
// 即終了する単発アクション、「歩み寄る」「現状維持を貫く」はラウンドを消費する
// 駆け引きで、後者を繰り返すほど独立(departure)のリスクが積み上がる。
// ファン人気が一定を超えた固定給メンバーには、本人からの歩合制への切り替え
// 提案(§人気が出れば歩合制も選べるように)も表示される。顔ポートレートを
// 出すため(他の一覧画面と同様)、専用のDOMコントローラとして実装する。

import { renderTopBar, portraitAvatarHtml, drawQueuedPortraits, formatMan } from "./ui.js?v=1785558404241";
import { BALANCE } from "./masterData.js?v=1785558404241";
import { computeRenewalDemand, offersCommissionSwitch, getNegotiationPersonality } from "./state.js?v=1785558404241";
import { morph } from "./domMorph.js?v=1785558404241";

const STANCES = [
  { id: "meet", label: "歩み寄る", hint: "要求とのギャップを半分ずつ埋める" },
  { id: "hold", label: "現状維持を貫く", hint: "月給は上げない。繰り返すほど独立リスクが増える" },
];

export function mountContractRenewalView(container, gameState, idolId, callbacks) {
  const idol = gameState.roster.find((i) => i.id === idolId);
  if (!idol) {
    callbacks.onGone();
    return;
  }

  const cfg = BALANCE.contractRenewal;
  const { demandRatio, currentSalary, demandedSalary } = computeRenewalDemand(idol);
  const personality = getNegotiationPersonality(idol);

  const state = {
    round: 0,
    salaryOffer: currentSalary, // このラウンドまでの提示額(歩み寄るたびにdemandedSalaryへ近づく)
    tenguDelta: 0,
    stressDelta: 0,
    holdCount: 0, // 「現状維持を貫く」を選んだ回数(独立リスクの積み上がりに使う)
    finished: false,
    outcome: null, // { released? , departed? } 決着後の分岐表示用
  };

  function render() {
    morph(container, template());
    drawQueuedPortraits();
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
      case "renewal-stance":
        chooseStance(target.dataset.stance);
        break;
      case "renewal-full":
        chooseFullAccept();
        break;
      case "renewal-release":
        chooseRelease();
        break;
      case "renewal-commission":
        chooseCommissionSwitch();
        break;
      case "renewal-finalize":
        finalizeNow();
        break;
      case "renewal-continue":
        container.removeEventListener("click", handleClick);
        callbacks.onGone();
        break;
    }
  }

  // 満額のむ: その場で要求額を丸呑みし、大きく機嫌を良くして即終了する。
  function chooseFullAccept() {
    if (state.finished) return;
    resolve({ newSalary: demandedSalary, tenguDelta: -cfg.negotiation.fullAcceptTenguRelief, stressDelta: 0 });
  }

  // 契約満了で送り出す: 円満に契約を終える(解雇と違いファンへの心証は悪化しない)。
  function chooseRelease() {
    if (state.finished) return;
    resolve({ released: true });
  }

  // 歩合制に切り替える(§人気が出れば歩合制も選べるように)。本人からの
  // 提案に応じる形で、月給の代わりにステージ成功報酬から歩合が天引きされる
  // 契約に切り替わる。以後この人は契約更改の対象から外れる。
  function chooseCommissionSwitch() {
    if (state.finished) return;
    resolve({ switchToCommission: true });
  }

  function chooseStance(stance) {
    if (state.finished) return;
    if (stance === "meet") {
      const mcfg = cfg.negotiation.meet;
      const gap = demandedSalary - state.salaryOffer;
      state.salaryOffer = Math.round(state.salaryOffer + gap * mcfg.gapCloseRatio);
      // §契約交渉に性格を持たせる: 気が長い性格(patienceMultiplierが高い)ほど、
      // 歩み寄りに対して「まだ足りない」と不満を持ちにくい。
      const annoyed = Math.random() < mcfg.annoyedChance / personality.patienceMultiplier;
      state.tenguDelta += annoyed ? mcfg.tenguDeltaStepIfAnnoyed : mcfg.tenguDeltaStep;
      state.round += 1;
      advanceOrFinish();
    } else if (stance === "hold") {
      const hcfg = cfg.negotiation.hold;
      // 気が長い性格ほど、現状維持を貫かれても独立を決意しにくい。
      const departureChance =
        (hcfg.departureChanceBase + state.holdCount * hcfg.departureChancePerPriorHold) / personality.patienceMultiplier;
      state.holdCount += 1;
      if (Math.random() < departureChance) {
        resolve({ departed: true });
        return;
      }
      state.tenguDelta += hcfg.tenguDeltaStep;
      state.stressDelta += hcfg.stressDeltaStep;
      state.round += 1;
      advanceOrFinish();
    }
  }

  function advanceOrFinish() {
    if (state.round >= cfg.negotiation.maxRounds) {
      finalizeNow();
    } else {
      render();
    }
  }

  // ラウンド途中でも現在の条件のまま交渉を打ち切って確定する
  // (§スカウト交渉の「ここで手を打つ」と同じ役割)。
  function finalizeNow() {
    if (state.finished) return;
    resolve({ newSalary: state.salaryOffer, tenguDelta: state.tenguDelta, stressDelta: state.stressDelta });
  }

  function resolve(outcome) {
    state.finished = true;
    state.outcome = outcome;
    callbacks.onResolve(outcome);
    render();
  }

  function template() {
    if (state.outcome) return resultTemplate();

    const stancesHtml = STANCES.map(
      (s) => `
      <div class="card stage-card">
        <div class="stage-card__name">${s.label}</div>
        <div class="stat-row stat-row--muted"><span>${s.hint}</span></div>
        <button class="btn btn--block" data-action="renewal-stance" data-stance="${s.id}">選ぶ</button>
      </div>`
    ).join("");

    const showCommissionOffer = offersCommissionSwitch(idol);

    return `
      ${renderTopBar(gameState)}
      <main class="screen">
        <h1 class="screen__title">契約更改</h1>
        <section class="card scout-candidate-card">
          <div class="chip__face-wrap" style="margin:0 auto;">${portraitAvatarHtml(idol, "lg")}</div>
          <div class="scout-name" style="text-align:center;">
            ${idol.name}
            <span class="scout-tag" title="${personality.description}">${personality.label}</span>
          </div>
          <p class="stat-row stat-row--muted">
            契約が満期(1年)を迎えた。現在の人気(ファン${(idol.fans ?? 0).toLocaleString()}人)を踏まえ、
            月給を<b>${formatMan(currentSalary)}</b>から<b>${formatMan(demandedSalary)}</b>(+${Math.round(demandRatio * 100)}%)への増額要求が来ている。
          </p>
          <p class="stat-row stat-row--muted">${personality.description}</p>
          <div class="scout-fee">
            現在の提示 ${formatMan(state.salaryOffer)}
            <span class="scout-fee__original">目標 ${formatMan(demandedSalary)}</span>
          </div>
          <p class="stat-row stat-row--muted">
            交渉 ${state.round}/${cfg.negotiation.maxRounds}ラウンド目
          </p>
        </section>
        ${
          showCommissionOffer
            ? `<section class="card stage-card">
                <div class="stage-card__name">歩合制への切り替えを希望している</div>
                <div class="stat-row stat-row--muted"><span>人気が出てきたこともあり、${idol.name}は歩合制の方が稼げると考えている(ステージ成功報酬から${Math.round(BALANCE.salary.commissionRate * 100)}%天引きになる代わり、月給の定額払いはなくなる)。応じるとその場で契約更改は終了する。</span></div>
                <button class="btn btn--block" data-action="renewal-commission">歩合制に切り替える</button>
              </section>`
            : ""
        }
        <section class="card-list">
          ${stancesHtml}
          <div class="card stage-card">
            <div class="stage-card__name">満額のむ</div>
            <div class="stat-row stat-row--muted"><span>要求どおり月給${formatMan(demandedSalary)}を即受諾する。機嫌が大きく良くなる</span></div>
            <button class="btn btn--block" data-action="renewal-full">選ぶ</button>
          </div>
          <div class="card stage-card">
            <div class="stage-card__name">契約満了で送り出す</div>
            <div class="stat-row stat-row--muted"><span>円満に契約を終了する。解雇と違いファンへの心証は悪化しない</span></div>
            <button class="btn btn--danger btn--block" data-action="renewal-release">選ぶ</button>
          </div>
        </section>
        ${state.round > 0 ? `<button class="btn btn--block" data-action="renewal-finalize">ここで決める(月給${formatMan(state.salaryOffer)}で確定)</button>` : ""}
      </main>`;
  }

  function resultTemplate() {
    const message = state.outcome.released
      ? `${idol.name}と円満に契約満了した。`
      : state.outcome.departed
        ? `${idol.name}は交渉決裂の末、事務所を去ってしまった…`
        : state.outcome.switchToCommission
          ? `${idol.name}と歩合制の契約に切り替えた。`
          : `${idol.name}との契約が更改された(月給${formatMan(state.outcome.newSalary)})。`;
    return `
      ${renderTopBar(gameState)}
      <main class="screen">
        <h1 class="screen__title">契約更改</h1>
        <section class="card">
          <p>${message}</p>
        </section>
        <button class="btn btn--primary btn--block" data-action="renewal-continue">次へ</button>
      </main>`;
  }

  render();
}
