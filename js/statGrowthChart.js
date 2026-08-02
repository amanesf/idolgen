// ステータス表示の共通部品(§スカウト画面とタレント詳細画面の統一)。
// 「現状」「成長(鍛えなくても自然に伸びる分、entity.statCaps)」「レッスン
// (そこからさらに努力で伸ばせる分、entity.lessonCaps)」を現状→成長→レッスンの
// 順に継ぎ足す加算バーで見せる。ランク文字(rankLabel)はバーの横に置き、
// ラベルは略さずSTAT_LABELSのフル表記を使う。
// 契約済みタレント(idolDetailView.js)は無条件で全ステータスを表示する
// (第2引数を渡さない=常にrevealed扱い)。
// §スカウトに賭けと発見を持たせる: 契約前の候補(scoutLeadCard.js)は
// お試しステージで観測するまで各ステータスが伏せられるため、第2引数に
// state.js: getParamRevealState(lead, key)相当の判定関数を渡せるようにする。
// "hidden"は完全に未観測(?表示)、"floor"は臨時コーチの目利き上限
// (judgeRankCeiling)を超える実力で下限しか分からない状態(◯以上、上限は伏せる)。
// masterData.js/ui.jsのみに依存し、scoutLeadCard.js/idolDetailView.jsの
// どちらからも循環importなしで使えるようにする。
// highlightStats(第3引数、省略可): §役割の強みパラメータ表示。選択中/確定済みの
// 職種(JOB_TYPES.relevantStats)に該当するステータス行を★付きで目立たせる。
// revealGrowthLesson(第4引数、既定true): falseだと観測済み(revealed)の行でも
// 現状値だけを見せ、成長・レッスン分は「?」のまま隠す(§スカウト画面では
// 伸びしろを伏せたい)。

import { SCOUT_STAT_KEYS, rankLabel } from "./masterData.js?v=1785558404241";
import { STAT_LABELS } from "./ui.js?v=1785558404241";

function highlightMarkHtml(key, highlightStats) {
  return highlightStats?.includes(key) ? ` <span class="growth-chart__highlight-mark" title="選択中の職種の強み">★</span>` : "";
}

function hiddenRowHtml(key, highlightStats) {
  const isHighlight = highlightStats?.includes(key);
  return `
    <div class="growth-chart__row growth-chart__row--hidden ${isHighlight ? "growth-chart__row--highlight" : ""}">
      <span class="growth-chart__rank">?</span>
      <div class="growth-chart__body">
        <div class="growth-chart__label">${STAT_LABELS[key]}${highlightMarkHtml(key, highlightStats)}</div>
        <div class="growth-chart__track growth-chart__track--hidden"></div>
      </div>
      <span class="growth-chart__values">? / ? / ?</span>
    </div>`;
}

function floorRowHtml(key, floorValue, highlightStats) {
  const floorRank = rankLabel(floorValue);
  const isHighlight = highlightStats?.includes(key);
  return `
    <div class="growth-chart__row growth-chart__row--floor ${isHighlight ? "growth-chart__row--highlight" : ""}">
      <span class="growth-chart__rank">${floorRank}+</span>
      <div class="growth-chart__body">
        <div class="growth-chart__label">${STAT_LABELS[key]}${highlightMarkHtml(key, highlightStats)}</div>
        <div class="growth-chart__track">
          <div class="growth-chart__fill growth-chart__fill--current" style="left:0%; width:${floorValue}%"></div>
          <div class="growth-chart__track--unknown" style="left:${floorValue}%; width:${100 - floorValue}%"></div>
        </div>
      </div>
      <span class="growth-chart__values">${floorRank}以上・未知</span>
    </div>`;
}

export function statGrowthChartHtml(entity, getRevealState, highlightStats, revealGrowthLesson = true) {
  const rows = SCOUT_STAT_KEYS.map((key) => {
    const state = getRevealState ? getRevealState(key) : "revealed";
    if (state === "hidden") return hiddenRowHtml(key, highlightStats);
    if (state === "floor") return floorRowHtml(key, entity.revealedFloors?.[key] ?? 0, highlightStats);

    const current = entity.stats[key];
    const isHighlight = highlightStats?.includes(key);

    if (!revealGrowthLesson) {
      return `
        <div class="growth-chart__row ${isHighlight ? "growth-chart__row--highlight" : ""}">
          <span class="growth-chart__rank">${rankLabel(current)}</span>
          <div class="growth-chart__body">
            <div class="growth-chart__label">${STAT_LABELS[key]}${highlightMarkHtml(key, highlightStats)}</div>
            <div class="growth-chart__track">
              <div class="growth-chart__fill growth-chart__fill--current" style="left:0%; width:${current}%"></div>
              <div class="growth-chart__track--unknown" style="left:${current}%; width:${100 - current}%"></div>
            </div>
          </div>
          <span class="growth-chart__values">${current} / ? / ?</span>
        </div>`;
    }

    const grown = entity.statCaps?.[key] ?? entity.statCap ?? current;
    const cap = entity.lessonCaps?.[key] ?? entity.statCap ?? grown;

    return `
      <div class="growth-chart__row ${isHighlight ? "growth-chart__row--highlight" : ""}">
        <span class="growth-chart__rank">${rankLabel(current)}</span>
        <div class="growth-chart__body">
          <div class="growth-chart__label">${STAT_LABELS[key]}${highlightMarkHtml(key, highlightStats)}</div>
          <div class="growth-chart__track">
            <div class="growth-chart__fill growth-chart__fill--current" style="left:0%; width:${current}%"></div>
            <div class="growth-chart__fill growth-chart__fill--grown" style="left:${current}%; width:${grown - current}%"></div>
            <div class="growth-chart__fill growth-chart__fill--lesson" style="left:${grown}%; width:${cap - grown}%"></div>
          </div>
        </div>
        <span class="growth-chart__values">${current} / ${grown} / ${cap}</span>
      </div>`;
  }).join("");

  return `
    <div class="growth-chart">
      <div class="growth-chart__legend">
        <span><i class="growth-chart__swatch growth-chart__swatch--current"></i>現状</span>
        <span><i class="growth-chart__swatch growth-chart__swatch--grown"></i>成長(鍛えなくても自然に伸びる分)</span>
        <span><i class="growth-chart__swatch growth-chart__swatch--lesson"></i>レッスン(そこからさらに努力で伸ばせる分)</span>
      </div>
      ${rows}
    </div>`;
}
