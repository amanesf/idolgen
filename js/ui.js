// 画面描画（DOM生成のみを担当。ゲームロジックは持たない）
// 陣形パズル画面(battleView.js)は演出のため専用のDOMコントローラを使うので、
// ここでは「ホーム」と「仕事選択」のような瞬時に描画し直してよい画面のみ扱う。

import {
  FORMATIONS,
  BALANCE,
  ATTRIBUTES,
  STAFF,
  TRAINING_FACILITIES,
  OFFICE_EQUIPMENT,
  getAgeBand,
  SCOUT_STAT_KEYS,
  rankLabel,
  getStageCategoryLabel,
  JOB_TYPES,
  TASK_TYPES,
} from "./masterData.js?v=1785558404241";
import { reputationLabel, getMonthlyRent, getAvailableVentures, getRosterCapacity } from "./office.js?v=1785558404241";
import { getClientReputation, getReputationRewardMultiplier } from "./state.js?v=1785558404241";

function attributeLabelOf(key) {
  return ATTRIBUTES.find((a) => a.key === key)?.label ?? key;
}

// メイン画面最上部に表示するタイトル文言(§1/§2)。renderStart()のタイトルと揃える。
export const GAME_TITLE = "Procedural-DOL GENERATIONS";

// カレンダー表示(§永続ループ)。gameState.day(週の絶対カウンタ、1始まり)から
// 年/月/週を逆算する。weeksPerMonth=4・monthsPerYear=12が基準。
export function formatCalendar(day) {
  const { weeksPerMonth, monthsPerYear } = BALANCE.calendar;
  const index = day - 1;
  const week = (index % weeksPerMonth) + 1;
  const month = (Math.floor(index / weeksPerMonth) % monthsPerYear) + 1;
  const year = Math.floor(index / (weeksPerMonth * monthsPerYear)) + 1;
  return `${year}年目${month}月${week}週`;
}

// 通貨表示(§金額の実スケール化)。万円単位・端数なし(四捨五入)で表示する。
// 円のまま表示したい特別なケースは呼び出し側で個別にtoLocaleString()する。
export function formatMan(yen) {
  const man = Math.round(yen / 10000);
  return `${man.toLocaleString()}万円`;
}

// 基礎ステータス(SCOUT_STAT_KEYS)の表示名。英語表記をやめ日本語に統一する。
// idolDetailView.js/scoutView.js/trainingView.js/ui.jsの全画面で共有する。
export const STAT_LABELS = {
  vocal: "ボーカル（歌唱力）",
  dance: "ダンス",
  talk: "トーク",
  acting: "演技",
  looks: "ルックス",
  charm: "愛嬌",
  mental: "メンタル（スタミナ最大値・耐性）",
};

// 一覧の1行表示など、スペースが狭い場所向けの短縮表記。
export const STAT_LABELS_SHORT = {
  vocal: "ボ",
  dance: "ダ",
  talk: "ト",
  acting: "演",
  looks: "ル",
  charm: "愛",
  mental: "メ",
};

// モーダル本体(§全画面スクロール禁止)。main.js側のopenModal(文字列id)と
// data-modal-idを突き合わせてhidden属性を切り替える(再描画駆動の画面向け)。
// 閉じるのは明示的な「閉じる」ボタンのみ(背景タップでは閉じない、実装をシンプルに保つため)。
export function modalHtml(id, title, bodyHtml, openModalId) {
  return `
    <div class="modal-backdrop" data-modal-id="${id}" ${openModalId === id ? "" : "hidden"}>
      <div class="modal">
        <h2 class="card__heading">${title}</h2>
        ${bodyHtml}
        <button class="btn btn--block" data-action="close-modal">閉じる</button>
      </div>
    </div>`;
}

// 役割(role)ごとのアイコン。battleView.js(バトル中のチップ)とloadout.js
// (編成画面)の両方で使う共通の表示マッピング。
export const ROLE_ICONS = { attacker: "⚔️", defender: "🛡", supporter: "💚", allrounder: "🃏" };

export function attributeOf(key) {
  return ATTRIBUTES.find((a) => a.key === key) ?? null;
}

// 編成画面(loadout.js)向け: 攻撃/防御/回復とレア度を1行で見せる戦略プレビュー。
// 表示は短く(役割アイコン+3軸+レア度)に絞り、特性名はtitleツールチップに回す。
// 例:「☀️ 陽 ⚔️ 攻4/防1/回1 ★1」(title="スポットライト: 🎯狙い撃ち攻撃")
export function attributeSummaryHtml(idol) {
  const attribute = attributeOf(idol.attribute);
  if (!attribute) return idol.attributeLabel ?? "";
  const roleIcon = ROLE_ICONS[attribute.role] ?? "";
  const stars = "★".repeat(attribute.rarity);
  return `<span title="${attribute.traitLabel}">${idol.attributeLabel} ${roleIcon} 攻${attribute.atk}/防${attribute.def}/回${attribute.heal} ${stars}</span>`;
}

// 経歴(salaryTier)・場所(rankShift)のレベル表示(§経歴や場所にも★マーク)。
// ATTRIBUTESのレア度表示(★リピート)と同じ表記に揃える。
export function levelStarsHtml(level) {
  return "★".repeat(Math.max(0, level));
}

const STAFF_CATEGORY_LABELS = {
  scout: "スカウトマン",
  manager: "マネージャー",
  promoter: "プロモーター",
  agent: "エージェント",
};

// 総合評価ランク(§8「全パラメータをパワプロの選手画面みたいに表示」)。
// 全ステータスの平均値をそのままランクに当てはめる。
export function overallRank(idol) {
  const avg = SCOUT_STAT_KEYS.reduce((sum, key) => sum + idol.stats[key], 0) / SCOUT_STAT_KEYS.length;
  return rankLabel(avg);
}

export function rankBadgeHtml(idol) {
  const rank = overallRank(idol);
  return `<span class="rank-badge rank-badge--${rank}">${rank}</span>`;
}

export function avatarHtml(idol, size = "md") {
  const hue = idol.avatarHue ?? 300;
  return `
    <div class="avatar avatar--${size}" style="--hue:${hue}">
      <span>${idol.avatarInitial ?? idol.stageName?.[0] ?? "?"}</span>
    </div>`;
}

// 顔アイコン(§12.1)。idol.portraitがあればcanvasに切り出して描画し(drawPortraitOnCanvas)、
// 無ければ既存のavatarHtml(色相+イニシャル)にフォールバックする。canvasはDOM挿入前は
// 描画できないため、HTML生成と実描画の2段階になる。canvasIdを明示すれば呼び出し側が
// 自分でdrawPortraitOnCanvasを呼ぶ従来の使い方(battleView.js/idolDetailView.js)のまま
// 使えるが、省略した場合は自動採番のうえportraitDrawQueueに積まれるので、呼び出し側は
// container.innerHTML代入の直後にdrawQueuedPortraits()を1回呼ぶだけでよい。
const AVATAR_PIXEL_SIZE = { sm: 32, md: 44, lg: 64 };
let portraitDrawQueue = [];
let portraitAutoIdCounter = 0;

// 顔アイコンのcanvasは幅/高さ属性(=実ピクセルバッファ)をCSS表示サイズと
// 同じ値にしていたため、高DPI(Retina等)画面ではCSSピクセルより実ピクセルの
// 密度が高く、少ないバッファを引き伸ばして表示することになりぼやけ・
// ジャギーの原因になっていた(§バトル画面のアイコンが薄い気がする/ジャギジャギ)。
// devicePixelRatio分だけバッファを大きく取り、表示サイズはCSS側([.avatar--sm/md/lg]等)
// に任せることで解消する(3倍を超える端末は過剰なメモリ消費を避けるため頭打ちにする)。
export function devicePixelRatioClamped() {
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  return Math.min(Math.max(dpr, 1), 3);
}

export function portraitAvatarHtml(idol, size = "md", canvasId) {
  if (!idol.portrait) return avatarHtml(idol, size);
  const px = AVATAR_PIXEL_SIZE[size] ?? 44;
  const bufferPx = Math.round(px * devicePixelRatioClamped());
  const id = canvasId ?? `portrait-auto-${++portraitAutoIdCounter}`;
  if (!canvasId) portraitDrawQueue.push({ canvasId: id, portrait: idol.portrait });
  return `<canvas class="avatar avatar--${size} avatar--portrait" id="${id}" width="${bufferPx}" height="${bufferPx}"></canvas>`;
}

// canvasId省略でportraitAvatarHtmlを呼んだ分をまとめて実描画する。
export function drawQueuedPortraits() {
  const queue = portraitDrawQueue;
  portraitDrawQueue = [];
  for (const { canvasId, portrait } of queue) {
    const canvas = document.getElementById(canvasId);
    if (canvas) drawPortraitOnCanvas(canvas, portrait);
  }
}

// スカウト画面の大きい顔ポートレート(§スカウト画面をジェネレータに合わせる)。
// portraitAvatarHtmlの円形avatarとは別に、scout-viewer.html/idolDetailView.jsと
// 同じ角丸長方形の.scout-portraitで統一する。canvasId省略時は同じ
// portraitDrawQueue/drawQueuedPortraits()に相乗りする。
export function scoutPortraitHtml(entity, canvasId) {
  if (!entity.portrait) return avatarHtml(entity, "lg");
  // .scout-portraitは画面によって表示サイズが180/120/84pxと変わる(CSS側で決まる)。
  // 最大の180pxを基準にdevicePixelRatio分のバッファを確保しておけば、
  // どの表示サイズでも高DPI画面でぼやけない(256は元の切り出し解像度なので
  // それを下回らないようにする)。
  const bufferPx = Math.max(256, Math.round(180 * devicePixelRatioClamped()));
  const id = canvasId ?? `portrait-auto-${++portraitAutoIdCounter}`;
  if (!canvasId) portraitDrawQueue.push({ canvasId: id, portrait: entity.portrait });
  return `<canvas class="scout-portrait" id="${id}" width="${bufferPx}" height="${bufferPx}"></canvas>`;
}

// idolDetailView.js(育成画面の大きい顔)とbattleView.js(バトル中の小さい顔)の
// 両方から呼ばれる共通のポートレート描画ロジック。厚塗りフィルター(portraitPaintFilter.js、
// window.PortraitPaintFilterとして読み込まれるプレーンスクリプト)を後がけする。
export function drawPortraitOnCanvas(canvas, portrait) {
  if (!canvas || !portrait) return;
  const ctx = canvas.getContext("2d");
  // 256px元画像をcanvasバッファ(devicePixelRatio分拡張済み、上記各Html関数参照)
  // へ引き伸ばして描くため、拡大時の補間品質を上げてぼやけ・ジャギーを抑える。
  ctx.imageSmoothingQuality = "high";
  const img = new Image();
  img.onload = () => {
    // 円形マスク(border-radius:50%)は辺の中央で正方形の端に接するため、
    // 元画像の端に残る背景色がそこだけ黒い縁として見えることがある
    // (§顔アイコンの黒い縁)。切り出し矩形を中心からportraitCropZoom分だけ
    // 小さく取ってズームすることでこれを軽減する。
    const zoom = BALANCE.scouting.portraitCropZoom ?? 0;
    const inset = portrait.cellSize * zoom;
    const sx = portrait.col * portrait.cellSize + inset;
    const sy = portrait.row * portrait.cellSize + inset;
    const sSize = portrait.cellSize - inset * 2;
    const base = document.createElement("canvas");
    base.width = portrait.cellSize;
    base.height = portrait.cellSize;
    base.getContext("2d").drawImage(img, sx, sy, sSize, sSize, 0, 0, portrait.cellSize, portrait.cellSize);
    const painted = window.PortraitPaintFilter
      ? window.PortraitPaintFilter.applyPaintFilter(base, BALANCE.scouting.paintFilter)
      : base;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(painted, 0, 0, portrait.cellSize, portrait.cellSize, 0, 0, canvas.width, canvas.height);
  };
  img.src = portrait.sheetFile;
}

const AGE_BAND_ICONS = {
  debut_bud: "🌱",
  glass_cannon: "🌸",
  workhorse: "💪",
  peak_bloom: "🔥",
  commander: "👑",
  living_legend: "⭐",
};

// 社員(§7 STAFF)のフロア表示用アイコン。専用スプライトが無いため、
// カテゴリごとの絵文字で代替する(idolのavatarHtmlと同じ枠に収める)。
const STAFF_FLOOR_ICONS = { scout: "🕵️", manager: "👔", promoter: "📣", agent: "🤝" };

function staffAvatarHtml(staff) {
  return `
    <div class="avatar avatar--sm avatar--staff">
      <span>${STAFF_FLOOR_ICONS[staff.category] ?? "🧑‍💼"}</span>
    </div>`;
}

// 疑似3D（クォータービュー）箱庭の簡易版(§12)。本格的な3Dエンジンではなく、
// 純CSSのアイソメトリック風配置でオフィス空間を表現する。専用の立ち絵・
// クォータービュー用スプライトはまだ無いため、既存のアバター(avatarHtml)を
// 格子状に斜め配置するだけの軽量な代替実装。年齢帯アイコンだけ、加齢に
// よる見た目の違いの手がかりとして添える(実際の年齢テクスチャ差し替え
// (§12.1、14/18/24歳の立ち絵差分)は専用アセットが無いため未着手)。
// 所属タレントに加え、雇用済み社員(gameState.ownedStaffIds)もフロアに表示し、
// 常時ゆっくり歩き回っているように見せる(office-floor__tile--walkでCSSアニメーション)。
function renderOfficeFloor(gameState, compact = false) {
  const roster = gameState.roster;
  const staffActors = (gameState.ownedStaffIds ?? [])
    .map((id) => STAFF.find((s) => s.id === id))
    .filter(Boolean);
  // §創業メンバー0人化により開始直後は在籍0人・社員0人が普通の状態になった。
  // 従来通り空文字を返すとオフィス風景の枠(固定高さ・背景テクスチャ)ごと
  // 消えてホーム画面上部が広く白抜けして見えてしまう(§全体に白っぽくなってる)
  // ため、枠自体は残してプレースホルダーを表示する。
  if (roster.length === 0 && staffActors.length === 0) {
    return `<div class="office-floor ${compact ? "office-floor--compact" : ""} office-floor--empty">
      <span class="empty">まだ誰もいません。スカウトで迎え入れましょう</span>
    </div>`;
  }

  if (compact) {
    // ホーム画面に常時表示する縮小版。等間隔の横並び+ジグザグの縦ズレで
    // 「ぞろぞろ行き交っている」ふうに見せる、アイソメ配置の簡易版。
    const shown = [...roster.slice(0, 4), ...staffActors.slice(0, 2)].slice(0, 6);
    const tiles = shown
      .map((actor, i) => {
        const left = 8 + (i * (84 / Math.max(1, shown.length - 1 || 1)));
        const top = i % 2 === 0 ? 30 : 60;
        const isStaff = !roster.includes(actor);
        const body = isStaff
          ? staffAvatarHtml(actor)
          : portraitAvatarHtml(actor, "sm");
        const label = isStaff ? `title="${actor.label}"` : `title="${actor.name}"`;
        return `
          <div class="office-floor__tile office-floor__tile--walk" style="left:${left}%; top:${top}%; --tile-i:${i};" ${label}>
            ${body}
          </div>`;
      })
      .join("");
    return `<div class="office-floor office-floor--compact">${tiles}</div>`;
  }

  const cols = 4;
  const actors = [...roster, ...staffActors];
  const tiles = actors
    .map((actor, i) => {
      const gx = i % cols;
      const gy = Math.floor(i / cols);
      const left = 50 + (gx - gy) * 11;
      const top = 14 + (gx + gy) * 13;
      const isStaff = !roster.includes(actor);
      if (isStaff) {
        return `
          <div class="office-floor__tile office-floor__tile--walk" style="left:${left}%; top:${top}%; --tile-i:${i};" title="${actor.label}">
            ${staffAvatarHtml(actor)}
            <div class="office-floor__name">${actor.label}</div>
          </div>`;
      }
      const ageBand = getAgeBand(actor.age);
      return `
        <div class="office-floor__tile office-floor__tile--walk" style="left:${left}%; top:${top}%; --tile-i:${i};" data-action="view-idol" data-idol="${actor.id}">
          ${portraitAvatarHtml(actor, "sm")}
          <span class="office-floor__age-badge" title="${ageBand.label}">${AGE_BAND_ICONS[ageBand.id] ?? ""}</span>
          <div class="office-floor__name">${actor.name}</div>
        </div>`;
    })
    .join("");
  return `<div class="office-floor">${tiles}</div>`;
}

export function renderTopBar(gameState) {
  return `
    <header class="topbar">
      <div class="topbar__item">
        <span class="topbar__label">カレンダー</span>
        <span class="topbar__value">${formatCalendar(gameState.day)}</span>
      </div>
      <div class="topbar__item">
        <span class="topbar__label">所持金</span>
        <span class="topbar__value ${gameState.cash < 0 ? "topbar__value--danger" : ""}">${gameState.cash < 0 ? "⚠️ " : ""}${formatMan(gameState.cash)}</span>
      </div>
      <div class="topbar__item">
        <span class="topbar__label">ファン</span>
        <span class="topbar__value">${gameState.fans.toLocaleString()}人</span>
      </div>
    </header>`;
}

// 「ランキング」配下の2モーダルの中身(§UI改修計画⑪)。タレント一覧と同じ
// 1行カード(talentListRowHtml)を流用し、見た目を統一する。引退・解雇済みの
// アイドルもgameState.retiredIdolsArchive(state.js側で退避)とマージして
// 表示することで、ランキングから消えないようにする(§UI改修計画⑪-2)。
function rankingPopularityModalBody(gameState) {
  const allIdols = [...gameState.roster, ...(gameState.retiredIdolsArchive ?? [])];
  const byFans = allIdols.sort((a, b) => (b.fans ?? 0) - (a.fans ?? 0));
  const rowsHtml = byFans
    .map((idol, i) =>
      talentListRowHtml(idol, {
        extraRight: `<span class="ranking-row__rank">${i + 1}位</span><span class="ranking-row__value">${(idol.fans ?? 0).toLocaleString()}人</span>`,
      })
    )
    .join("");
  return `<div class="scroll-list">${rowsHtml || `<p class="stat-row stat-row--muted">所属タレントがいません</p>`}</div>`;
}

// シングル売上枚数(§UI改修計画⑪-1)はgameState.songSales(曲タイトル→枚数)を参照する。
// 曲の所有者名は現役ロースター+永続アーカイブの両方から解決する。
function rankingSongsModalBody(gameState) {
  const allIdols = [...gameState.roster, ...(gameState.retiredIdolsArchive ?? [])];
  const seenTitles = new Set();
  const songs = [];
  for (const idol of allIdols) {
    for (const title of idol.repertoire ?? []) {
      if (seenTitles.has(title)) continue;
      seenTitles.add(title);
      songs.push({ title, owner: idol });
    }
  }
  songs.sort((a, b) => (gameState.songSales[b.title] ?? 0) - (gameState.songSales[a.title] ?? 0));
  const rowsHtml = songs
    .map(
      (row, i) => `
      <div class="talent-row">
        ${portraitAvatarHtml(row.owner, "sm")}
        <div class="talent-row__main">
          <div class="talent-row__name">${row.title}</div>
          <div class="talent-row__meta">
            <span class="tag">${row.owner.name}</span>
            <span class="tag">${Math.round(gameState.songSales[row.title] ?? 0).toLocaleString()}枚</span>
          </div>
        </div>
        <span class="ranking-row__rank">${i + 1}位</span>
      </div>`
    )
    .join("");
  return `<div class="scroll-list">${rowsHtml || `<p class="stat-row stat-row--muted">まだ曲がありません</p>`}</div>`;
}

// タスク画面の中身(§UI改修計画④)。大枠はグループ単位のプルダウン一括指定。
// グループに指定しなければ、その中の個人も個別に選択可能(グループ側で
// 指定済みの間は個人側を無効化する)。無所属のタレントは常に個人枠に単独表示。
// 割り当ては即時実行せず、週送り(state.js: advanceDay)でまとめて適用する
// (gameState.pendingTasks)。
function taskAssignSelectHtml(gameState, availableTasks, selected, dataAttrs) {
  const options = availableTasks
    .map((t) => `<option value="${t.id}" ${selected === t.id ? "selected" : ""}>${t.label}</option>`)
    .join("");
  return `<select class="task-assign-select" ${dataAttrs}><option value="" ${selected ? "" : "selected"}>しない</option>${options}</select>`;
}

function renderTaskBoardBody(gameState) {
  gameState.pendingTasks ??= { groups: {}, individuals: {} };
  const availableTasks = TASK_TYPES.filter((t) => !t.unlockVentureId || (gameState.unlockedTaskIds ?? []).includes(t.id));
  const groupedIds = new Set(gameState.units.flatMap((u) => u.memberIds));

  const groupRowsHtml = gameState.units
    .map((unit) => {
      const selected = gameState.pendingTasks.groups[unit.id] ?? "";
      const memberRowsHtml = selected
        ? ""
        : unit.memberIds
            .map((id) => gameState.roster.find((i) => i.id === id))
            .filter(Boolean)
            .map((member) =>
              talentListRowHtml(member, {
                extraRight: taskAssignSelectHtml(
                  gameState,
                  availableTasks,
                  gameState.pendingTasks.individuals[member.id],
                  `data-action="set-individual-task" data-idol="${member.id}"`
                ),
              })
            )
            .join("");
      return `
      <div class="stage-card" style="margin-bottom:8px;">
        <div class="stat-row">
          <b>${unit.name}（${unit.memberIds.length}人）</b>
          ${taskAssignSelectHtml(gameState, availableTasks, selected, `data-action="set-group-task" data-unit="${unit.id}"`)}
        </div>
        ${selected ? `<p class="stat-row stat-row--muted">グループ全員に週送り時実行されます(個人指定は無効)</p>` : memberRowsHtml}
      </div>`;
    })
    .join("");

  const ungroupedRowsHtml = gameState.roster
    .filter((idol) => !groupedIds.has(idol.id))
    .map((idol) =>
      talentListRowHtml(idol, {
        extraRight: taskAssignSelectHtml(
          gameState,
          availableTasks,
          gameState.pendingTasks.individuals[idol.id],
          `data-action="set-individual-task" data-idol="${idol.id}"`
        ),
      })
    )
    .join("");

  return `
    <p class="stat-row stat-row--muted">週送り(次の週へ)のタイミングでまとめて実行されます。</p>
    <div class="modal-section">
      <h3 class="modal-section__heading">グループへ割り当て</h3>
      ${groupRowsHtml || `<p class="stat-row stat-row--muted">まだグループがありません(タレント→グループから結成できます)</p>`}
    </div>
    <div class="modal-section">
      <h3 class="modal-section__heading">個人へ割り当て</h3>
      ${ungroupedRowsHtml || `<p class="stat-row stat-row--muted">無所属のタレントがいません</p>`}
    </div>`;
}

// ホーム画面下部の地図(§2「下部は地図」)。個別案件ではなく、案件種別
// (得意先の代わりとなる分類軸。stage.categoryを流用)ごとの件数だけを
// 示す非リンクの集計表示にする(§UI改修計画①-4)。
function officeMapSummaryHtml(offerStages) {
  const counts = {};
  for (const stage of offerStages) {
    const key = stage.category ?? "other";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const chips = Object.entries(counts)
    .map(([key, count]) => `<span class="map-summary-chip">${getStageCategoryLabel(key)} ${count}件</span>`)
    .join("");
  return `<div class="office-map office-map--home"><div class="map-summary">${chips}</div></div>`;
}

// uiState: { openModal: string|null, expandedCategory: string|null }(main.jsが保持)
// offerInfo: jobBoard.getAvailableStages()の戻り値 { rank, mode, stages }(main.jsが渡す)。
// scoutLeadsPins: スカウト候補プール(§スカウト再設計)の地図ピン(<main>内)の
// 描画済みHTML文字列。タップするとスカウト画面のウィザードへ遷移し、その候補の
// アイドル表示ステップを直接開く(§ホーム画面の地図ピンをスカウト画面と共有化)。
// scoutLeadCard.jsがui.jsに依存しているため、循環importを避けてmain.js側で
// 事前にレンダリングして渡してもらう。
// §UI再設計(Attempt2): メイン画面はタイトル/カレンダー/所持金/ファン(最上部)、
// オフィス風景(上部、タレント一覧は置かない)、地図(下部)だけの構成。
// 最下部固定行(タレント/事務所/ランキング/次の週へ)のいずれかをタップすると、
// その1個上にサブ項目行が展開される(画面遷移はしない)。設定は右上の
// 専用ボタンから常時アクセスできる。
export function renderHome(gameState, offerInfo, uiState = {}, scoutLeadsPins = "") {
  const openModal = uiState.openModal ?? null;
  const expandedCategory = uiState.expandedCategory ?? null;

  // 地図(§2「下部は地図」)。個別案件ではなく種別ごとの件数集計のみを表示し、
  // 非リンクにする(§UI改修計画①)。個別案件の閲覧・挑戦は「タレント」→「オファー」から。
  const offerStages = offerInfo?.stages ?? [];

  const talentSubRow = `
    <div class="nav-sub-row" ${expandedCategory === "talent" ? "" : "hidden"}>
      <button class="btn nav-sub-btn" data-action="go-to-talent-list">📋 一覧</button>
      <button class="btn nav-sub-btn" data-action="go-to-training" ${gameState.roster.length === 0 ? "disabled" : ""}>🎓 レッスン</button>
      <button class="btn nav-sub-btn" data-action="go-to-task-board">📝 タスク</button>
      <button class="btn nav-sub-btn" data-action="go-to-work">🗺️ オファー</button>
      <button class="btn nav-sub-btn" data-action="go-to-unit-editor">🎶 グループ</button>
      <button class="btn nav-sub-btn" data-action="go-to-scout">🔍 スカウト</button>
    </div>`;

  const officeSubRow = `
    <div class="nav-sub-row nav-sub-row--pair" ${expandedCategory === "office" ? "" : "hidden"}>
      <button class="btn nav-sub-btn" data-action="open-modal" data-modal="office-info">📊 情報</button>
      <button class="btn nav-sub-btn" data-action="open-modal" data-modal="office-ventures">📢 投資・宣伝</button>
      <button class="btn nav-sub-btn" data-action="open-modal" data-modal="office-staff-facilities">🏗 設備・採用</button>
      <button class="btn nav-sub-btn" data-action="open-modal" data-modal="office-finance">💴 融資</button>
    </div>`;

  const rankingSubRow = `
    <div class="nav-sub-row" ${expandedCategory === "ranking" ? "" : "hidden"}>
      <button class="btn nav-sub-btn" data-action="open-modal" data-modal="ranking-songs">🎵 曲</button>
      <button class="btn nav-sub-btn" data-action="open-modal" data-modal="ranking-popularity">⭐ 人気</button>
    </div>`;

  const activeRosterCount = gameState.roster.filter((i) => !i.retired).length;
  const staffCount = (gameState.ownedStaffIds ?? []).length;

  return `
    <button class="settings-corner-btn" data-action="open-modal" data-modal="settings">⚙️ 設定</button>
    <div class="game-title">${GAME_TITLE}</div>
    ${renderTopBar(gameState)}
    <main class="screen">
      ${
        gameState.cashNegativeLastMonthEnd
          ? `<div class="bankruptcy-warning">⚠️ 資金がマイナスです。来月末もマイナスのままだと倒産します。</div>`
          : ""
      }

      <div class="office-floor-wrap">
        ${renderOfficeFloor(gameState, true)}
        <div class="office-floor__summary">在籍 ${activeRosterCount}人・社員 ${staffCount}人</div>
      </div>

      ${offerStages.length > 0 ? officeMapSummaryHtml(offerStages) : `<div class="office-map office-map--home office-map--empty"><span class="empty">現在受けられる仕事がありません</span></div>`}
      ${scoutLeadsPins}
    </main>

    ${modalHtml("office-info", "事務所：情報", infoModalBody(gameState), openModal)}
    ${modalHtml("office-ventures", "事務所：投資・宣伝", venturesModalBody(gameState), openModal)}
    ${modalHtml("office-staff-facilities", "事務所：設備・採用", staffFacilitiesModalBody(gameState), openModal)}
    ${modalHtml("office-finance", "事務所：融資", financeModalBody(gameState), openModal)}
    ${modalHtml("ranking-songs", "ランキング：曲", rankingSongsModalBody(gameState), openModal)}
    ${modalHtml("ranking-popularity", "ランキング：人気", rankingPopularityModalBody(gameState), openModal)}
    ${modalHtml("settings", "設定", saveModalBody() + backToTitleModalBody(), openModal)}

    <footer class="action-bar nav-bar">
      <div class="nav-main-row">
        <button class="btn ${expandedCategory === "talent" ? "is-active" : ""}" data-action="toggle-category" data-category="talent">👤 タレント ${expandedCategory === "talent" ? "▲" : "▽"}</button>
        <button class="btn ${expandedCategory === "office" ? "is-active" : ""}" data-action="toggle-category" data-category="office">🏢 事務所 ${expandedCategory === "office" ? "▲" : "▽"}</button>
        <button class="btn ${expandedCategory === "ranking" ? "is-active" : ""}" data-action="toggle-category" data-category="ranking">🏆 ランキング ${expandedCategory === "ranking" ? "▲" : "▽"}</button>
        <button class="btn btn--primary" data-action="next-day">▶ 次の週へ</button>
      </div>
      ${talentSubRow}
      ${officeSubRow}
      ${rankingSubRow}
    </footer>`;
}

function emptyRosterHtml() {
  return `<div class="empty">所属アイドルがいません……</div>`;
}

// 「タレント」→「一覧」画面(§UI再設計)。旧ホーム画面のタレント一覧カードを
// 分離したもの。タップすると詳細(idolDetailView)へ遷移する。
// タレント一覧の1行カード(§UI改修計画②)。ポートレート・氏名・役割・属性・
// 総合ランクを1行にまとめ、右端の「詳細」ボタンで詳細画面へ遷移する。
// レッスン一覧(trainingView.js)・グループ選択(renderUnitEditor)など、他の
// 一覧画面でも同じ見た目を流用する。
// 各ステータスのパワプロ式ランク文字だけを並べた簡略表示(数字は出さない)。
// タレント一覧・レッスン一覧・グループ選択など、1行カードを使う画面で共有する。
function statRankChipsHtml(idol) {
  return SCOUT_STAT_KEYS.map(
    (key) => `<span class="stat-rank-chip">${STAT_LABELS_SHORT[key]}${rankLabel(idol.stats[key])}</span>`
  ).join("");
}

export function talentListRowHtml(idol, { action = "view-idol", extraRight = "" } = {}) {
  const jobLabel = JOB_TYPES.find((j) => j.key === idol.jobType)?.label ?? "";
  return `
    <div class="talent-row">
      ${portraitAvatarHtml(idol, "sm")}
      <div class="talent-row__main">
        <div class="talent-row__name">${idol.name}${idol.resting ? " 😴" : ""}</div>
        <div class="talent-row__meta">
          ${rankBadgeHtml(idol)}
          ${jobLabel ? `<span class="tag">${jobLabel}</span>` : ""}
          <span class="tag">${idol.attributeLabel}</span>
        </div>
        <div class="talent-row__stats">${statRankChipsHtml(idol)}</div>
      </div>
      ${extraRight || `<button class="btn talent-row__detail" data-action="${action}" data-idol="${idol.id}">詳細</button>`}
    </div>`;
}

export function renderTalentList(gameState) {
  const rosterRows = gameState.roster.map((idol) => talentListRowHtml(idol)).join("");

  return `
    ${renderTopBar(gameState)}
    <main class="screen">
      <h1 class="screen__title">タレント一覧（${gameState.roster.length}人）</h1>
      <div class="scroll-list">${rosterRows || emptyRosterHtml()}</div>
    </main>
    <footer class="action-bar">
      <button class="btn" data-action="back-home">戻る</button>
    </footer>`;
}

// 「タスク」画面(§UI改修計画⓪・④)。複数ステップの選択操作を伴うため、
// モーダルではなく戻るボタン付きの別画面にする。
export function renderTaskBoard(gameState) {
  return `
    ${renderTopBar(gameState)}
    <main class="screen">
      <h1 class="screen__title">タスク</h1>
      <div class="scroll-list">${renderTaskBoardBody(gameState)}</div>
    </main>
    <footer class="action-bar">
      <button class="btn" data-action="back-home">戻る</button>
    </footer>`;
}

// 「グループ」画面(§UI改修計画⓪・⑥)。複数人選択の対話的操作を伴うため、
// モーダルではなく戻るボタン付きの別画面にする。
export function renderUnitEditor(gameState) {
  return `
    ${renderTopBar(gameState)}
    <main class="screen">
      <h1 class="screen__title">グループ</h1>
      ${renderUnitsSection(gameState)}
    </main>
    <footer class="action-bar">
      <button class="btn" data-action="back-home">戻る</button>
    </footer>`;
}

// 案件の難易度(§案件一覧で人数と難易度がわかるようにしてほしい)。
// recommendedStatLevel(この仕事が想定する編成の平均ステータス目安)を、
// アイドルの総合評価と同じRANK_THRESHOLDS(S〜G)のグレードに変換する。
// 総合評価が案件と同格以上ならおおむね余裕を持ってクリアでき、大きく
// 下回るとバーター営業判定(§6.2、目標スコアが割増しになる)でぐっと
// 厳しくなる(2段階下くらいで五分五分のイメージ)。
function stageDifficultyGrade(stage) {
  return stage.recommendedStatLevel != null ? rankLabel(stage.recommendedStatLevel) : null;
}

// 必要人数。castSize指定があればその人数、無指定ならフォーメーションの
// 全枠数を上限人数として表示する(§案件一覧で人数がわかるようにしてほしい)。
function stageMemberCount(stage) {
  return stage.castSize ?? FORMATIONS[stage.formationId]?.slots.length ?? null;
}

// 仕事詳細モーダルの中身(§ジョブボード)。ホーム画面の地図(renderHome)と
// 仕事選択画面の地図(renderStageSelect)の両方から共有する。
function stageDetailModalBody(gameState, stage) {
  const clientConf = BALANCE.clientTiers[stage.clientTier] || BALANCE.clientTiers.clean;
  const isGray = stage.clientTier === "gray";
  const reputation = getClientReputation(gameState, stage.id);
  const repMult = getReputationRewardMultiplier(gameState, stage.id);
  const grade = stageDifficultyGrade(stage);
  const memberCount = stageMemberCount(stage);
  return `
    <div class="stat-row">
      <span class="tag ${isGray ? "tag--warn" : ""}">${clientConf.label}</span>
      ${stage.trendAttribute ? `<span class="tag">トレンド ${attributeLabelOf(stage.trendAttribute)}</span>` : ""}
    </div>
    <div class="stat-row">
      ${grade ? `<span class="rank-badge-label">難易度<span class="rank-badge rank-badge--${grade}">${grade}</span></span>` : ""}
      <span>${memberCount != null ? `${memberCount}人編成` : "編成自由"}</span>
    </div>
    <p class="stat-row stat-row--muted">総合評価が難易度と同格以上なら余裕を持ってクリアできる目安。大きく下回るとバーター営業(目標スコア×${BALANCE.barter.targetScoreMultiplier})でぐっと厳しくなる。</p>
    <div class="stat-row">
      <span>陣形 ${FORMATIONS[stage.formationId].label}</span>
      <span>目標スコア ${stage.targetScore}</span>
    </div>
    <div class="stat-row stat-row--muted">
      <span>${stage.turnLimitMode === "fixed" ? `尺 ${stage.maxTurns}${(stage.turnUnitLabel ?? "").replace(/目$/, "")}分` : `持ち曲数まで`}</span>
      <span>取引先評価 ${reputation}/100</span>
    </div>
    <div class="stat-row stat-row--muted">
      <span>報酬倍率 ×${repMult.toFixed(2)}</span>
      <span>報酬 ${formatMan(Math.round(stage.rewardCash * clientConf.rewardMultiplier * repMult))}</span>
      <span>ファン +${Math.round(stage.rewardFans * clientConf.rewardMultiplier * repMult)}</span>
    </div>
    <button class="btn btn--primary btn--block" data-action="start-battle" data-stage="${stage.id}">
      ${(gameState.pendingBattles ?? []).some((b) => b.stageId === stage.id) ? "編成を変更する" : "編成する（週送りで現場へ）"}
    </button>`;
}

// offerInfo: jobBoard.getAvailableStages()の戻り値 { rank, mode, stages }。
// mode==="active"ならドブ板営業(能動・解放済み全件)、"passive"ならオファー
// 選別(受動・本日のオファーのみ提示)であることを示すバナーを添える(§6.1)。
// uiState: { pageState, openModal }(main.jsが保持)。仕事詳細は
// stage-detail-${stage.id} というモーダルidで、タップした行の分だけ開く。
// オファー一覧の1行(§UI改修計画⑤)。地図表示をやめ、難易度(取引先種別)・
// 報酬を要約した行の画面内スクロール一覧にする。タップすると従来通り
// stage-detail-*モーダル(挑戦するボタン込み)を開く。
// §案件一覧で人数と難易度がわかるようにしてほしい: 難易度は総合評価と同じ
// S〜Gバッジで表示し、人数(必要編成人数)も並べる。
function offerRowHtml(gameState, stage) {
  const clientConf = BALANCE.clientTiers[stage.clientTier] || BALANCE.clientTiers.clean;
  const isGray = stage.clientTier === "gray";
  const repMult = getReputationRewardMultiplier(gameState, stage.id);
  const cash = Math.round(stage.rewardCash * clientConf.rewardMultiplier * repMult);
  const fans = Math.round(stage.rewardFans * clientConf.rewardMultiplier * repMult);
  const grade = stageDifficultyGrade(stage);
  const memberCount = stageMemberCount(stage);
  // §UI改修計画⑤: 編成完了後は一覧に戻り「編成済み」マークを出す。実際の対戦は
  // 週送り(次の週へ)のタイミングでまとめて行われる(main.js: pendingBattles)。
  const isAssigned = (gameState.pendingBattles ?? []).some((b) => b.stageId === stage.id);
  return `
    <button class="talent-row" data-action="open-modal" data-modal="stage-detail-${stage.id}">
      <div class="talent-row__main">
        <div class="talent-row__name">${stage.name}${isAssigned ? ' <span class="tag tag--assigned">編成済み</span>' : ""}</div>
        <div class="talent-row__meta">
          <span class="tag ${isGray ? "tag--warn" : ""}">${clientConf.label}</span>
          ${grade ? `<span class="rank-badge-label">難易度<span class="rank-badge rank-badge--${grade}">${grade}</span></span>` : ""}
          ${memberCount != null ? `<span class="tag">${memberCount}人</span>` : ""}
          <span class="tag">目標${stage.targetScore}</span>
          <span class="tag">${formatMan(cash)}</span>
          <span class="tag">ファン+${fans}</span>
        </div>
      </div>
    </button>`;
}

export function renderStageSelect(gameState, offerInfo, uiState = {}) {
  const { mode, stages } = offerInfo;
  const openModal = uiState.openModal ?? null;

  const detailModals = stages
    .map((stage) => modalHtml(`stage-detail-${stage.id}`, stage.name, stageDetailModalBody(gameState, stage), openModal))
    .join("");

  const modeLabel = mode === "passive" ? "オファー選別（受動）" : "ドブ板営業（能動）";

  return `
    ${renderTopBar(gameState)}
    <main class="screen">
      <h1 class="screen__title">仕事を選ぶ（${modeLabel}）</h1>
      <div class="scroll-list">
        ${stages.length > 0 ? stages.map((stage) => offerRowHtml(gameState, stage)).join("") : `<div class="empty">現在受けられる仕事がありません</div>`}
      </div>
    </main>
    ${detailModals}
    <footer class="action-bar">
      <button class="btn" data-action="back-home">戻る</button>
    </footer>`;
}

export function resultLabel(result) {
  switch (result) {
    case "success":
      return "🎉 成功";
    case "fail":
      return "💥 放送事故";
    case "retreat":
      return "🏳 撤退";
    case "timeup":
      return "⏱ 力及ばず";
    default:
      return "-";
  }
}

// 「事務所」ハブ画面(§UI再設計)。社員システム(§7)・資金調達(§8)などを
// 情報／投資・宣伝／設備・採用／融資の4モーダルに整理する。DOM生成のみで、
// 雇用/解雇・融資/出資のアクションは他画面と同じくdata-action委譲(main.js)で処理する。
// 「事務所」配下の4モーダルの中身(§UI再設計)。ホーム画面の下部ナビ
// (事務所を展開→情報/投資・宣伝/設備・採用/融資)から開く。
function staffFacilitiesModalBody(gameState) {
  const byCategory = {};
  for (const staff of STAFF) {
    (byCategory[staff.category] ??= []).push(staff);
  }

  const staffSectionHtml = Object.entries(byCategory)
    .map(([category, list]) => {
      const rows = list
        .map((staff) => {
          const owned = gameState.ownedStaffIds.includes(staff.id);
          return `
          <div class="list-row list-row--wrap">
            <div class="list-row__name">
              ${staff.label}
              <div class="list-row__meta">${staff.description} ・ ${formatMan(staff.hireCostPerDay)}/週</div>
            </div>
            <button class="list-row__btn" data-action="${owned ? "fire-staff" : "hire-staff"}" data-staff="${staff.id}">
              ${owned ? "解雇" : "雇う"}
            </button>
          </div>`;
        })
        .join("");
      return `<div class="modal-section"><h3 class="modal-section__heading">${STAFF_CATEGORY_LABELS[category] ?? category}</h3>${rows}</div>`;
    })
    .join("");

  const activeRosterCount = gameState.roster.filter((i) => !i.retired).length;
  const facilitiesSectionHtml =
    `<div class="modal-section"><h3 class="modal-section__heading">施設</h3>` +
    `<div class="stat-row stat-row--muted">現在の在籍人数 ${activeRosterCount}/${getRosterCapacity(gameState)}人</div>` +
    TRAINING_FACILITIES.map((facility) => {
      const owned = gameState.ownedFacilityIds.includes(facility.id);
      return `
      <div class="list-row list-row--wrap">
        <div class="list-row__name">
          ${facility.name}${owned ? " ✅" : ""}
          <div class="list-row__meta">${facility.description} ・ 家賃${formatMan(facility.monthlyRent)}/月 ・ 定員${facility.rosterCapacity}人</div>
        </div>
        ${
          owned
            ? ""
            : `<button class="list-row__btn" data-action="purchase-facility" data-facility="${facility.id}"
                 ${gameState.cash < facility.purchaseCost ? "disabled" : ""}>
                 ${formatMan(facility.purchaseCost)}で購入
               </button>`
        }
      </div>`;
    }).join("") +
    `</div>`;

  const equipmentSectionHtml =
    `<div class="modal-section"><h3 class="modal-section__heading">設備</h3>` +
    OFFICE_EQUIPMENT.map((equipment) => {
      const owned = gameState.ownedEquipmentIds.includes(equipment.id);
      return `
      <div class="list-row list-row--wrap">
        <div class="list-row__name">
          ${equipment.label}${owned ? " ✅" : ""}
          <div class="list-row__meta">${equipment.description}</div>
        </div>
        ${
          owned
            ? ""
            : `<button class="list-row__btn" data-action="purchase-equipment" data-equipment="${equipment.id}"
                 ${gameState.cash < equipment.cost ? "disabled" : ""}>
                 ${formatMan(equipment.cost)}で購入
               </button>`
        }
      </div>`;
    }).join("") +
    `</div>`;

  return staffSectionHtml + facilitiesSectionHtml + equipmentSectionHtml;
}

function financeModalBody(gameState) {
  const loanHtml = gameState.loan
    ? `<div class="stat-row stat-row--muted"><span>返済残り ${formatMan(gameState.loan.remaining)}(週次${formatMan(gameState.loan.dailyRepayment)}ずつ自動返済)</span></div>`
    : `<button class="btn btn--block" data-action="take-bank-loan">銀行融資を受ける（${formatMan(BALANCE.finance.bankLoan.amount)}）</button>`;

  const patronHtml = gameState.patronActive
    ? `<div class="stat-row stat-row--muted"><span>タニマチ出資中(週次で悪評リスクあり)</span></div>`
    : `<button class="btn btn--block" data-action="take-patron">タニマチ出資を受ける（${formatMan(BALANCE.finance.patron.amount)}）</button>`;
  return `<div class="modal-section"><h3 class="modal-section__heading">融資</h3>${loanHtml}</div><div class="modal-section"><h3 class="modal-section__heading">タニマチ出資</h3>${patronHtml}</div>`;
}

function venturesModalBody(gameState) {
  const ventures = getAvailableVentures(gameState);
  return ventures
    .map((venture) => {
      // §UI改修計画⑩-2: oneTimeのventureは収益施策ではなく一度きりのタスク解除
      // ゲート。専用の行(解禁済み/未解禁)を出し、通常の開始/解約UIとは分ける。
      if (venture.oneTime) {
        const used = (gameState.oneTimeVenturesUsed ?? []).includes(venture.id);
        return `
        <div class="list-row list-row--wrap">
          <div class="list-row__name">
            ${venture.label}${used ? " ✅解禁済み" : ""}
            <div class="list-row__meta">${venture.description}</div>
            ${!used ? `<div class="list-row__meta">${formatMan(venture.cost)}(一度きり)</div>` : ""}
          </div>
          ${
            used
              ? ""
              : `<button class="list-row__btn" data-action="start-venture" data-venture="${venture.id}" ${gameState.cash < venture.cost ? "disabled" : ""}>実行</button>`
          }
        </div>`;
      }
      const active = gameState.activeVentures.find((a) => a.ventureId === venture.id);
      const weeklyNet =
        (venture.weeklyRevenue ?? 0) - (venture.weeklyCost ?? 0) + (venture.weeklyCashGain ?? 0);
      const weeklyLabel = `週次${weeklyNet >= 0 ? "+" : ""}${formatMan(weeklyNet)}${venture.weeklyFansGain ? ` ・ ファン+${venture.weeklyFansGain}` : ""}`;
      const statusLabel =
        venture.mode === "campaign"
          ? active
            ? `残り${active.endsOnDay - gameState.day}週`
            : `${formatMan(venture.cost)}・${venture.durationWeeks}週間`
          : active
            ? "運営中"
            : "未開始";
      return `
      <div class="list-row list-row--wrap">
        <div class="list-row__name">
          ${venture.label}${active ? " ✅" : ""}
          <div class="list-row__meta">${venture.description}</div>
          <div class="list-row__meta">${weeklyLabel} ・ ${statusLabel}</div>
        </div>
        ${
          active
            ? venture.mode === "ongoing"
              ? `<button class="list-row__btn" data-action="cancel-venture" data-venture="${venture.id}">解約</button>`
              : ""
            : `<button class="list-row__btn" data-action="start-venture" data-venture="${venture.id}"
                 ${venture.mode === "campaign" && gameState.cash < venture.cost ? "disabled" : ""}>
                 開始
               </button>`
        }
      </div>`;
    })
    .join("");
}

// 「情報」= 清廉度・マクロ環境・社員/施設概要・最近の結果・最近の出来事・
// コーチ一覧を1箇所に集約したダッシュボード(§UI再設計、旧ホーム画面の
// モーダル群をここへ統合)。
// 清廉度をドーナツ型SVGゲージで表示する(§UI改修計画⑨、テキスト+棒ゲージだけの
// 味気なさを解消)。外部ライブラリは使わず、円弧のstroke-dasharrayだけで描く。
function donutGaugeSvg(value, max, colorVar) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, value / max));
  return `
    <svg width="72" height="72" viewBox="0 0 72 72" class="donut-gauge">
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--border)" stroke-width="8" />
      <circle cx="36" cy="36" r="${r}" fill="none" stroke="${colorVar}" stroke-width="8"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - ratio)}"
        stroke-linecap="round" transform="rotate(-90 36 36)" />
      <text x="36" y="41" text-anchor="middle" font-size="18" font-weight="800" fill="var(--text)">${value}</text>
    </svg>`;
}

// 直近の結果推移を棒グラフSVGで表示する(§UI改修計画⑨)。ファン増減(fansDelta)を
// 直近8件分、正は主色・負は警告色のバーにする。
function fansTrendSvg(history) {
  const recent = [...history].slice(0, 8).reverse();
  if (recent.length === 0) return `<p class="stat-row stat-row--muted">まだ結果がありません</p>`;
  const maxAbs = Math.max(1, ...recent.map((h) => Math.abs(h.fansDelta ?? 0)));
  const barW = 28;
  const gap = 6;
  const height = 60;
  const width = recent.length * (barW + gap);
  const bars = recent
    .map((h, i) => {
      const delta = h.fansDelta ?? 0;
      const barH = Math.round((Math.abs(delta) / maxAbs) * (height / 2 - 4));
      const x = i * (barW + gap);
      const isPositive = delta >= 0;
      const y = isPositive ? height / 2 - barH : height / 2;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1, barH)}" rx="3" fill="${isPositive ? "var(--accent)" : "var(--danger)"}" />`;
    })
    .join("");
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="trend-chart">
      <line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="var(--border)" stroke-width="1" />
      ${bars}
    </svg>`;
}

function infoModalBody(gameState) {
  const ownedCount = gameState.ownedStaffIds.length;
  const historyHtml = gameState.history
    .slice(0, 10)
    .map(
      (h) => `
      <li class="history__item history__item--${h.result}">
        <span>${formatCalendar(h.day)} ${h.stageName}${h.collusion ? " 🏛️談合" : ""}${h.scandal ? " ⚠️悪評" : ""}${h.graduates?.length ? ` 🌅${h.graduates.join("・")}引退` : ""}${h.restedMembers?.length ? ` 😴${h.restedMembers.map((r) => `${r.name}(${r.weeks}週休養)`).join("・")}` : ""}${h.permanentRetirements?.length ? ` 🏳️${h.permanentRetirements.join("・")}引退` : ""}${h.reputationDelta ? ` 🤝評価${h.reputationDelta > 0 ? "+" : ""}${h.reputationDelta}` : ""}</span>
        <span>${resultLabel(h.result)}</span>
      </li>`
    )
    .join("");

  const eventLogHtml = (gameState.eventLog ?? [])
    .map(
      (e) => `
      <li class="history__item history__item--${e.kind === "scandal" ? "fail" : "success"}">
        <span>${formatCalendar(e.day)} ${e.kind === "scandal" ? "⚠️" : "✨"}${e.label}</span>
        <span>${e.description}</span>
      </li>`
    )
    .join("");

  const coachesHtml = (gameState.secondCareerCoaches ?? [])
    .map(
      (coach) => `
      <div class="list-row">
        ${portraitAvatarHtml(coach, "sm")}
        <div class="list-row__name">${coach.name}</div>
        <div class="list-row__meta">${coach.attributeLabel}</div>
      </div>`
    )
    .join("");

  return `
    <div class="modal-section">
      <h3 class="modal-section__heading">事務所の清廉度（${reputationLabel(gameState.cleanliness)}）</h3>
      <div class="stat-row" style="align-items:center; gap:14px;">
        ${donutGaugeSvg(gameState.cleanliness, 100, "var(--accent)")}
        <span class="stat-row--muted">100点満点。悪評イベントで下がり、良い出来事や時間経過で回復する。</span>
      </div>
    </div>
    <div class="modal-section">
      <h3 class="modal-section__heading">マクロ環境</h3>
      <div class="stat-row">
        <span class="tag ${gameState.era.antiTrend ? "tag--warn" : ""}">
          ${gameState.era.antiTrend ? "🌑 暗黒期" : "📈 トレンド"}: ${attributeLabelOf(gameState.era.trendAttribute)}
        </span>
      </div>
    </div>
    <div class="modal-section">
      <h3 class="modal-section__heading">社員・施設の概要</h3>
      <div class="stat-row stat-row--muted">社員 ${ownedCount}人在籍・月次家賃 ${formatMan(getMonthlyRent(gameState))}（詳細は「設備・採用」から）</div>
    </div>
    <div class="modal-section">
      <h3 class="modal-section__heading">最近の結果（ファン増減の推移）</h3>
      <div class="trend-chart-wrap">${fansTrendSvg(gameState.history)}</div>
      <ul class="history">${historyHtml || `<li class="stat-row stat-row--muted">まだ結果がありません</li>`}</ul>
    </div>
    <div class="modal-section">
      <h3 class="modal-section__heading">最近の出来事</h3>
      <ul class="history">${eventLogHtml || `<li class="stat-row stat-row--muted">まだ出来事がありません</li>`}</ul>
    </div>
    <div class="modal-section">
      <h3 class="modal-section__heading">セカンドキャリア（コーチ ${gameState.secondCareerCoaches?.length ?? 0}人）</h3>
      <div class="list">${coachesHtml || `<p class="stat-row stat-row--muted">まだコーチはいません</p>`}</div>
    </div>`;
}

// 「設定」配下の2モーダルの中身(§UI再設計)。ホーム画面の下部ナビ
// (設定は右上の専用ボタンから)から開く。
function saveModalBody() {
  return `
    <p class="stat-row stat-row--muted">現在の進行状況をJSONファイルとして書き出せます。バックアップや別端末への移行に使えます。</p>
    <button class="btn btn--block" data-action="export-save">📤 書き出す(エクスポート)</button>
    <p class="stat-row stat-row--muted">ファイルから読み込むと、現在の進行状況は上書きされます。</p>
    <button class="btn btn--block" data-action="import-save">📥 読み込む(インポート)</button>`;
}

function backToTitleModalBody() {
  return `
    <p class="stat-row stat-row--muted">現在の進行状況はセーブ済みです。タイトル画面に戻りますか?</p>
    <button class="btn btn--danger btn--block" data-action="back-to-title">トップに戻る</button>`;
}

// グループ結成の闇(§11・§グループ加入脱退対応)。既存ユニットの一覧
// (ギスギス度ゲージ+メンバーごとの脱退ボタン+加入フォーム+解散ボタン)と、
// 新規結成フォーム(名前入力+メンバーのチェックボックス)を描画する。
// グループ画面(§UI改修計画⑥)。タレント一覧と同じ1行カード(talentListRowHtml)
// を使い、既存メンバーは「脱退」ボタン、結成候補は選択式チェックボックスにする。
function renderUnitsSection(gameState) {
  const cfg = BALANCE.groups;
  const groupedIds = new Set(gameState.units.flatMap((u) => u.memberIds));
  const available = gameState.roster.filter((idol) => !groupedIds.has(idol.id) && !idol.lastDance && !idol.resting);

  const unitsHtml = gameState.units
    .map((unit) => {
      const memberRowsHtml = unit.memberIds
        .map((id) => gameState.roster.find((i) => i.id === id))
        .filter(Boolean)
        .map((member) =>
          talentListRowHtml(member, {
            extraRight: `<button class="btn talent-row__detail" data-action="leave-unit" data-unit="${unit.id}" data-idol="${member.id}">脱退</button>`,
          })
        )
        .join("");
      const canJoin = unit.memberIds.length < cfg.maxMembers && available.length > 0;
      return `
      <div class="stage-card" style="margin-bottom:8px;">
        <div class="stat-row"><b>${unit.name}</b><span>${unit.memberIds.length}/${cfg.maxMembers}人</span></div>
        <div class="gauge">
          <div class="gauge__label"><span>ギスギス度</span><span>${unit.tension}/100</span></div>
          <div class="gauge__track"><div class="gauge__fill gauge__fill--heat" style="width:${unit.tension}%"></div></div>
        </div>
        <div class="scroll-list" style="max-height:200px;">${memberRowsHtml}</div>
        ${
          canJoin
            ? `<div class="stat-row">
                <select id="join-select-${unit.id}">
                  ${available.map((idol) => `<option value="${idol.id}">${idol.name}</option>`).join("")}
                </select>
                <button class="btn" data-action="join-unit" data-unit="${unit.id}">加入させる</button>
              </div>`
            : ""
        }
        <button class="btn btn--danger btn--block" data-action="disband-unit" data-unit="${unit.id}">解散する</button>
      </div>`;
    })
    .join("");

  const selectRowsHtml = available
    .map((idol) =>
      talentListRowHtml(idol, {
        extraRight: `<label class="unit-member-checkbox-label"><input type="checkbox" class="unit-member-checkbox" value="${idol.id}" /></label>`,
      })
    )
    .join("");

  return `
    <p class="stat-row stat-row--muted">${cfg.minMembers}〜${cfg.maxMembers}人。センター格差が続くとギスギス度が上がり、上限で強制解散する</p>
    ${unitsHtml || `<p class="stat-row stat-row--muted">結成中のグループはありません</p>`}
    <div class="modal-section">
      <h3 class="modal-section__heading">新しく結成する</h3>
      <div class="stat-row">
        <input type="text" id="unit-name-input" placeholder="グループ名" />
      </div>
      <div class="scroll-list" style="max-height:280px;">${selectRowsHtml || `<p class="stat-row stat-row--muted">結成できるメンバーがいません</p>`}</div>
      <button class="btn btn--primary btn--block" data-action="form-unit">結成する</button>
    </div>`;
}

// 記者会見(社長の3択+トカゲの尻尾切り、§8)。悪評発生時のみ遷移する画面。
export function renderPressConference(gameState) {
  const pending = gameState.pendingPressConference;
  const cfg = BALANCE.pressConference;

  return `
    ${renderTopBar(gameState)}
    <main class="screen">
      <h1 class="screen__title">記者会見</h1>
      <section class="card">
        <p>「${pending?.stageName ?? "現場"}」での不祥事が週刊誌に嗅ぎつけられた……社長として、どう対応する？</p>
      </section>
      <section class="card-list">
        <div class="card stage-card">
          <div class="stage-card__name">もみ消す</div>
          <div class="stat-row stat-row--muted"><span>現金${formatMan(cfg.coverUp.cashCost)}で悪評を完全に打ち消す。事務所の裏の顔が濃くなる</span></div>
          <button class="btn btn--block" data-action="press-cover-up">選ぶ</button>
        </div>
        <div class="card stage-card">
          <div class="stage-card__name">全面謝罪</div>
          <div class="stat-row stat-row--muted"><span>ファンの減少を半分に抑えつつ、誠実な対応で信頼を回復する</span></div>
          <button class="btn btn--block" data-action="press-apology">選ぶ</button>
        </div>
        <div class="card stage-card">
          <div class="stage-card__name">事実無根で強行突破</div>
          <div class="stat-row stat-row--muted"><span>賭けに出る。うまくいけば無傷、失敗すればより大きな反発を招く</span></div>
          <button class="btn btn--block" data-action="press-denial">選ぶ</button>
        </div>
        <div class="card stage-card">
          <div class="stage-card__name">トカゲの尻尾切り</div>
          <div class="stat-row stat-row--muted"><span>現金${formatMan(cfg.tailCutting.cashCost)}で穏便に済ませる。最も裏の顔が濃くなる極悪コマンド</span></div>
          <button class="btn btn--block" data-action="press-tail-cutting">選ぶ</button>
        </div>
      </section>
    </main>`;
}

// 契約更改画面は専用コントローラ(contractRenewalView.js、§契約更改の駆け引き強化)に
// 移設した。

// スタート画面。セーブデータの有無で「続ける」の活性/非活性を切り替える。
export function renderStart(hasSave) {
  return `
    <main class="screen start-screen">
      <span class="start-screen__badge">仮タイトル・仮ロゴ</span>
      <h1 class="start-screen__title">Procedural-DOL<br />GENERATIONS</h1>
      <p class="start-screen__subtitle">無限に生成されるアイドルを率いる、事務所経営シミュレーション</p>
      <div class="start-screen__actions">
        <button class="btn btn--primary btn--block" data-action="new-game">新規で始める</button>
        <button class="btn btn--block" data-action="continue-game" ${hasSave ? "" : "disabled"}>
          ${hasSave ? "続ける" : "続ける（セーブデータなし）"}
        </button>
        <button class="btn btn--block" data-action="import-save">📥 セーブデータを読み込む</button>
        <button class="btn btn--block" data-action="go-to-guide">📊 生成確率ガイド</button>
      </div>
    </main>`;
}

// 倒産(§8)。月次決算後、現金がマイナスのまま2ヶ月連続になった時点で
// 表示される。継続不可能な結末のため、選べるアクションは「タイトルへ戻る」のみ。
export function renderBankruptcy(gameState) {
  const activeRoster = gameState.roster.filter((idol) => !idol.retired);
  return `
    <main class="screen start-screen">
      <span class="start-screen__badge">GAME OVER</span>
      <h1 class="start-screen__title">倒産</h1>
      <p class="start-screen__subtitle">
        ${formatCalendar(gameState.day)}、資金繰りが2ヶ月連続でマイナスとなり、事務所は倒産しました。
      </p>
      <div class="card" style="width:100%; max-width:320px;">
        <div class="stat-row"><span>最終所持金</span><span>${formatMan(gameState.cash)}</span></div>
        <div class="stat-row"><span>最終ファン数</span><span>${gameState.fans.toLocaleString()}人</span></div>
        <div class="stat-row"><span>在籍タレント</span><span>${activeRoster.length}人</span></div>
      </div>
      <div class="start-screen__actions">
        <button class="btn btn--primary btn--block" data-action="back-to-title">タイトルへ戻る</button>
      </div>
    </main>`;
}
