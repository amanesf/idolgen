// 生成確率ガイド(§確率を確認できるように)。タイトル画面から遷移する読み物画面。
// ハードコーディングした数字を並べるのではなく、masterData.jsの設定値
// (BALANCE.scouting.tierPyramidWeights/quality.rankPyramidWeights等)を直接
// 参照して表を組み立てる。数値を調整すればこのガイドの表示も自動で追従する。
// gameStateに依存しない純粋な描画関数のみで構成する(renderStart.jsと同じ形)。

import { BALANCE, ATTRIBUTES, ORIGIN_ATTRIBUTES, SCOUT_LOCATIONS, RANK_THRESHOLDS, GROWTH_TYPES } from "./masterData.js?v=1785558404241";
import { formatMan } from "./ui.js?v=1785558404241";
import { growthAgeFactorRatio } from "./scoutGenerator.js?v=1785558404241";

// 5段階ピラミッド重み(属性・経歴で共有)から各Tierの%を計算する。
function tierPercents() {
  const weights = BALANCE.scouting.tierPyramidWeights;
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => Math.round((w / total) * 1000) / 10); // 小数1桁
}

function attributeGuideRowsHtml() {
  const percents = tierPercents();
  return [1, 2, 3, 4, 5]
    .map((tier) => {
      const members = ATTRIBUTES.filter((a) => a.rarity === tier);
      return `
        <tr>
          <td>${"★".repeat(tier)}</td>
          <td>${percents[tier - 1]}%</td>
          <td>${members.map((a) => a.label).join("・")}</td>
        </tr>`;
    })
    .join("");
}

function originGuideRowsHtml() {
  const percents = tierPercents();
  const salaryCfg = BALANCE.salary;
  const trainingCfg = BALANCE.scouting.originTraining;
  return [1, 2, 3, 4, 5]
    .map((tier) => {
      const members = ORIGIN_ATTRIBUTES.filter((o) => o.salaryTier === tier);
      const salaryBonus = salaryCfg.originTierBonusYen[tier - 1] ?? 0;
      const lessonProgress = Math.round((trainingCfg.lessonProgressByTier[tier - 1] ?? 0) * 100);
      const targetCount = trainingCfg.lessonTargetCountByTier[tier - 1] ?? 0;
      return `
        <tr>
          <td>${"★".repeat(tier)}</td>
          <td>${percents[tier - 1]}%</td>
          <td>${formatMan(salaryBonus)}</td>
          <td>${lessonProgress}%(${targetCount}項目)</td>
          <td>${members.map((o) => o.label).join("・")}</td>
        </tr>`;
    })
    .join("");
}

function rankGuideRowsHtml() {
  const weights = BALANCE.scouting.quality.rankPyramidWeights;
  const total = weights.reduce((sum, w) => sum + w, 0);
  const sIndex = RANK_THRESHOLDS.findIndex((r) => r.label === "S");
  const aIndex = RANK_THRESHOLDS.findIndex((r) => r.label === "A");
  return RANK_THRESHOLDS.map((r, i) => {
    const percent = Math.round((weights[i] / total) * 1000) / 10;
    const isFixed = i === sIndex || i === aIndex;
    const minLabel = r.min === -Infinity ? "〜" : `${r.min}〜`;
    return `
      <tr>
        <td>${r.label}</td>
        <td>${minLabel}</td>
        <td>${percent}%</td>
        <td>${isFixed ? "常に固定(シフトの影響を受けない)" : "場所・経歴・特能でBに向けてシフトする対象"}</td>
      </tr>`;
  }).join("");
}

// 成長タイプ(§成長曲線の再設計)。年齢ごとの比率(0/20/40/60/80/100%のみ)を
// そのまま表にする。ハードコーディングせずGROWTH_TYPESを直接参照するので、
// 数値を調整すればこのガイドの表示も自動で追従する。
const GROWTH_TYPE_GUIDE_AGES = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34];

function growthTypeGuideRowsHtml() {
  const total = GROWTH_TYPES.reduce((sum, g) => sum + (g.rarityWeight ?? 1), 0);
  return GROWTH_TYPES.map((g) => {
    const percent = Math.round(((g.rarityWeight ?? 1) / total) * 1000) / 10;
    const curveCells = GROWTH_TYPE_GUIDE_AGES.map((age) => {
      const ratio = Math.round(growthAgeFactorRatio(g, age) * 100);
      const isDecline = age >= g.declineStartAge;
      return `<td class="${isDecline ? "guide-table__decline" : ""}">${ratio}%</td>`;
    }).join("");
    return `
      <tr>
        <td>${g.label}</td>
        <td>${percent}%</td>
        <td>${g.declineStartAge}歳</td>
        ${curveCells}
      </tr>`;
  }).join("");
}

function locationShiftRowsHtml() {
  return SCOUT_LOCATIONS.map(
    (loc) => `
      <tr>
        <td>${loc.label}</td>
        <td>${"★".repeat((loc.rankShift ?? 0) + 1)}</td>
        <td>目利き+${loc.rankShift ?? 0}</td>
      </tr>`
  ).join("");
}

export function renderGuideHtml() {
  return `
    <main class="screen guide-screen">
      <div class="screen-header-row">
        <h1 class="screen__title">生成確率ガイド</h1>
        <button class="btn" data-action="guide-back">戻る</button>
      </div>
      <div class="idol-detail-scroll">
        <section class="card">
          <h3 class="modal-section__heading">属性(★レア度)</h3>
          <p class="stat-row stat-row--muted">5段階ピラミッド抽選(経歴と共通の重み表)。★1が最も出やすく★5が最も出にくい。</p>
          <table class="guide-table">
            <thead><tr><th>★</th><th>確率</th><th>該当属性</th></tr></thead>
            <tbody>${attributeGuideRowsHtml()}</tbody>
          </table>
        </section>

        <section class="card">
          <h3 class="modal-section__heading">経歴(Tier)</h3>
          <p class="stat-row stat-row--muted">属性と同じ5段階ピラミッド抽選。Tierが上がるほど給料ボーナスとレッスン度(最初から仕上がっている度合い)も上がる。</p>
          <table class="guide-table">
            <thead><tr><th>Tier</th><th>確率</th><th>給料ボーナス</th><th>レッスン度</th><th>該当経歴</th></tr></thead>
            <tbody>${originGuideRowsHtml()}</tbody>
          </table>
        </section>

        <section class="card">
          <h3 class="modal-section__heading">ステータスランク(S〜G)</h3>
          <p class="stat-row stat-row--muted">
            7ステータスそれぞれのレッスン上限をこのランクからロールする。S・Aはどんな好条件でも常に固定確率(底上げされない)。
            B〜Gだけが、場所(目利き+0〜+4)・経歴の得意ステータス(+1)・特能「幸運体質」(所持者数×+1)の分だけBに向かってシフトする(Bで頭打ち)。
          </p>
          <table class="guide-table">
            <thead><tr><th>ランク</th><th>基準値</th><th>確率(シフト0)</th><th>備考</th></tr></thead>
            <tbody>${rankGuideRowsHtml()}</tbody>
          </table>
        </section>

        <section class="card">
          <h3 class="modal-section__heading">成長タイプ</h3>
          <p class="stat-row stat-row--muted">
            出現率の重み付き抽選。年齢ごとの成長度(比率)は0/20/40/60/80/100%のいずれかで、
            下降開始年齢(背景色つきのセル)からは経年劣化で実際のステータスも落ちていく。
          </p>
          <div class="guide-table-scroll">
            <table class="guide-table">
              <thead>
                <tr>
                  <th>タイプ</th><th>確率</th><th>下降開始</th>
                  ${GROWTH_TYPE_GUIDE_AGES.map((age) => `<th>${age}歳</th>`).join("")}
                </tr>
              </thead>
              <tbody>${growthTypeGuideRowsHtml()}</tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <h3 class="modal-section__heading">場所ごとの目利きシフト</h3>
          <p class="stat-row stat-row--muted">スカウト先の場所によって、上のB〜Gシフトがどれだけ良い方に動くか。</p>
          <table class="guide-table">
            <thead><tr><th>場所</th><th>レベル</th><th>シフト量</th></tr></thead>
            <tbody>${locationShiftRowsHtml()}</tbody>
          </table>
        </section>
      </div>
    </main>`;
}
