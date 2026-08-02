// マスターデータ / バランス定義
// §13「パラメータ直書き禁止」ルールに従い、ゲームロジック側に数値を直書きせず
// すべてここに集約する。ロジック(battle.js)はこれらの値を参照するのみ。
//
// 「ターン」という言い方はUI上は使わず「n曲目」と呼ぶ。内部カウンタ名は
// 引き続き turn を使うが、表示文言はbattleView側で「◯曲目」に変換する。

// 通貨スケール(§経済リアルスケール化)。旧数値(プロトタイプ時代のおもちゃの
// 金額感)に一律で掛けて実額に引き上げる。この値だけ変えれば経済全体の
// スケールを再調整できる(§13「パラメータ直書き禁止」の精神を経済リスケールにも適用)。
const ECONOMY_SCALE = 200;

export const BALANCE = {
  // カレンダー(§永続ループ)。gameState.dayは「週」の絶対カウンタとして
  // 増え続け(リセットしない)、ここから年/月/週を逆算して表示する
  // (例: day=1→1年目1月1週、day=5→1年目2月1週)。
  calendar: {
    weeksPerMonth: 4,
    monthsPerYear: 12,
  },
  startingCash: 10000000, // 1000万円

  minPerformers: 1,        // これを下回ると「放送事故（総崩れ）」

  // 持ち曲数＝ライブのターン上限（ドラマ/映画/トーク番組は"尺"という
  // 別の固定値を使う。stage.turnLimitModeで切り替える）。
  // 持ち曲のうち習熟済みの曲数はそれより少ないことがあり、習熟数を
  // 超えた曲（＝ぶっつけ本番の曲）を歌うターンはスコア効率が落ち、
  // 被弾もしやすくなる。
  repertoire: {
    startingSongCount: 6,
    startingMasteredCount: 4,
    unpracticedPenalty: {
      scoreMultiplier: 0.65,
      extraDamageChance: 0.25,
    },
    // シングル売上枚数(§UI改修計画⑪-1)。ライブでのファン獲得分(1人あたり)を
    // 何枚の売上に換算するかの倍率。
    salesPerFanShare: 40,
  },

  // タスク(§タレント関連「タスク」)。個人 or グループ(units.js)へ割り当てる
  // 「新曲制作」。完成した曲は割当先の持ち曲(repertoire)に追加され、
  // 事務所全体の持ち曲数(songCount、ライブのターン上限)も1曲分伸びる
  // (習熟済み扱いにはならない=repertoire.unpracticedPenaltyの対象になる)。
  task: {
    newSongCost: 4000 * ECONOMY_SCALE,
    mvShootCost: 6000 * ECONOMY_SCALE,
    mvShootFansGain: 60,
  },

  stamina: {
    base: 60,              // 全アイドル共通の基礎最大スタミナ
    mentalScale: 0.65,      // mentalステータス1につき最大スタミナ+0.65
  },

  heat: {
    min: 0,
    max: 100,
    start: 50,
    efficiencyAtMin: 0.6,
    efficiencyAtMax: 1.6,
  },

  scoreBaseUnit: 42,

  // 自分の意思で途中棄権したときのペナルティ（違約金）。
  // 尺/持ち曲切れで自然に終わる"timeup"にはこのペナルティはかからない。
  retreat: {
    cashPenalty: 8000 * ECONOMY_SCALE,
  },

  // 曲を重ねる（＝送らずに耐える）ほどスコア効率が上がる「粘りコンボ」。
  // 送る(advance)と0にリセットされる、いわゆるプッシュユアラック要素。
  combo: {
    perHoldBonus: 0.08,     // 1曲耐えるごとの倍率上昇
    maxBonus: 0.4,          // 上限(+40%)
  },

  // 被弾の「予兆」。前の曲の終わりに次の曲の被弾有無・対象スロットを
  // 先に決めておき、プレイヤーはそれを見てから送る/耐えるを選べる。
  telegraph: {
    chance: 0.65,           // 次の曲で被弾イベントが発生する確率
    amount: 10,
  },

  // バトル再設計(客席ボード方式)。属性は「攻撃/防御/回復」の3軸プロファイル
  // (ATTRIBUTESのatk/def/heal、1〜5)だけを持ち、個別の属性ごとの特殊計算式は
  // 持たない。ここではその3軸の数値をゲーム内効果量に変換する共通係数だけを
  // 定義する(§13「パラメータ直書き禁止」に従い数値はすべてここに集約)。
  attributeScaling: {
    // ⚔️攻撃: atk(1〜5)ごとのスコア倍率をそのまま一覧できるテーブル。
    // atk=3を基準(1.0倍)に、1離れるごとに±14%という計算式の結果を直書きしてある
    // (1→0.72倍・2→0.86倍・3→1.0倍・4→1.14倍・5→1.28倍)。
    atkScoreMultiplier: { 1: 0.72, 2: 0.86, 3: 1.0, 4: 1.14, 5: 1.28 },
    defenseReductionPerPoint: 2,       // 🛡防御: defが1につき被ダメ軽減量+2(岩盤・万能の光)
    substitutionPercentPerPoint: 0.08, // 🎭身代わり: defが1につき肩代わり割合+8%
    counterPercentPerPoint: 0.06,      // 🌪反撃: defが1につき反撃威力(被弾量ベース)+6%
    healPerPoint: 3,           // 💚回復: healが1につきスタミナ回復量+3(氷雨・隠れた一撃)
    buffPercentPerPoint: 0.05, // 💚バフ: healが1につき味方のスコア倍率+5%(華の支援)
    rallyPerPoint: 3,          // 💚鼓舞: healが1につき熱量ゲージ下限+3(虹)
    maxStaminaBonusPerDefPoint: 2, // 防御力=タフさとして、defが1につき最大スタミナ+2
    rangedBackstageScoreMult: 1.0, // 🏹遠距離: 非露出(scoreMult0)スロットからでも攻撃できる際の基礎倍率
  },

  // やる気(§スカウト再設計のinterest、0〜100)によるボーナス属性攻撃(§ボリューム拡張)。
  // その曲で通常の属性攻撃を行ったメンバーが、やる気に応じた確率で
  // もう1回分(同じ量)のボーナス攻撃を追加で叩き込む。やる気が無指定
  // (創業メンバー等)の場合はdefaultInterestを使う。1人につき1回のステージ
  // (仕事)で最大1回だけ発動する(battle.js: performer.moraleAttackUsed)。
  moraleAttack: {
    maxChancePercent: 50,  // やる気100で発動確率50%(上限)
    defaultInterest: 50,   // やる気が未設定のメンバー(創業メンバー等)の代用値
    bonusDamageRatio: 1.0, // ボーナス攻撃の威力(通常攻撃分に対する比率)
  },

  // 1曲の演出タイミング(ms)。ボタン一発で瞬時に結果が出ないよう、
  // 段階的に事象を再生する。合計でおよそ5〜10秒に収まるよう調整する。
  timing: {
    preTurnDelay: 300,
    advanceDuration: 900,     // フォーメーション移動(FLIP)の所要時間
    scoreStepInterval: 460,
    heatSettleDelay: 320,
    damageWindupDelay: 350,
    damageHitDuration: 750,
    retireRevealDelay: 700,
    resultRevealDelay: 900,
    speechDuration: 1800,     // ②吹き出しの表示時間
  },

  // スカウト候補の初期値ランダム生成(§5「プロシージャル・スカウトシステム」/
  // §ステータス生成バランス再設計)。各ステータス(7種)は独立に、
  // 「経歴ベース(0〜25、ORIGIN_ATTRIBUTES.statBase)」+
  // 「年齢分(0〜25、GROWTH_TYPES.ageCurveを適齢期まで積み上げた分)」+
  // 「資質ロール(0〜quality.max、レアリティ付き連続乱数)」+
  // 「場所・スカウト社員による補正(既存のロケーション選択の意味づけをそのまま維持)」
  // の合算で決まる。経歴と年齢分は誰でも適齢期に到達すれば確保できる保証枠
  // (=平均的に合計50点前後)、資質と後々のレッスン/仕事(training.js)が
  // 100点までの差別化枠、という設計。
  scouting: {
    statFloor: 1,
    statCeil: 100,
    ageMin: 14,
    ageMax: 24,
    // 5段階ピラミッド重み(合計100、Tier1が最も出やすくTier5が最も出にくい)。
    // 属性(ATTRIBUTES.rarity、★1〜5)・経歴(ORIGIN_ATTRIBUTES.salaryTier、1〜5)の
    // 両方でこの1つの表を共有する(§重み付けの共通化)。indexはTier-1。
    // ガイドページ(guideView.js)もこの値を直接参照して確率表を出す
    // (ハードコーディングしない、§確率を確認できるように)。
    tierPyramidWeights: [40, 25, 20, 10, 5],
    // 年齢分(0〜25)。GROWTH_TYPES.ageCurveの比率にこれを掛けて求める。
    ageFactorMax: 25,
    // レッスン上限(training.jsが実際にクランプに使う値)の個人差。
    // 乱数(資質ロール)は全盛期(statCaps)側で既に確定しているので、ここでは
    // 二重に乱数をかけず、全盛期に一律lessonCapVariance点を足した値
    // (成長タイプ共通の絶対上限でクランプ)にする。誰でも「レッスンで追加に
    // 伸ばせる幅」がきっちりlessonCapVariance点になる(scoutGenerator.js:
    // rollLessonCaps参照)。
    lessonCapVariance: 25,
    // §ステータス生成ばらつき改善: 7ステータスそれぞれをRANK_THRESHOLDS
    // (S/A/B/C/D/E/F/G)のランクから直接ロールし、それを「レッスン上限」
    // (成長+レッスン込みの最終到達点)にする(scoutGenerator.js: rollRankIndex/
    // rollRankValue参照)。
    // rankPyramidWeights: S/A/B/C/D/E/F/G(RANK_THRESHOLDSと同じ並び順)の重み、
    // 合計100。S・Aは場所・経歴・特能に関係なく常にこの固定確率で、一切底上げ
    // されない(=どんな好条件でも常に稀少)。B〜Gだけが、SCOUT_LOCATIONS.rankShiftや
    // 経歴の得意ステータス補正・特能「幸運体質」の分だけ、この6段階の中で
    // 良い方(Bに向かって)にロール結果をずらす対象になる(Bで頭打ち、S・Aの
    // 領域には食い込まない、§rollRankIndex参照)。
    // 総合評価(qualityGrade)は個別ステータスと同じRANK_THRESHOLDS(S/A/B/C/D/E/F/G)
    // をそのまま使う(scoutGenerator.js: rankLabel(avgQuality)参照)。以前は
    // ワンランク上の呼び名(SS/S/A/B)+D以下を全部Cに潰す5段階の別表だったが、
    // D以下の違いが総合評価に一切出ない不具合があったため廃止した。
    quality: {
      rankPyramidWeights: [2, 4, 5, 7, 11, 16, 23, 32],
    },
    // §経歴はレッスン度に影響: 経歴のsalaryTier(1〜5)に応じて、得意ステータス
    // (statBaseが高い順)が何個・どれだけ「既にレッスン済み」かを決める。
    // indexはtier-1(tier1→index0)。lessonProgress=1.0なら年齢に関係なく
    // レッスン上限(lessonCaps)そのものになる(=マックスだとレッスン済状態)。
    // 給料のoriginTierBonusYenと同じtierを共有するので、経歴が高いほど
    // 給料も高くレッスン度も高い(逆転しない)。
    originTraining: {
      lessonProgressByTier: [0, 0.25, 0.5, 0.5, 0.5],
      lessonTargetCountByTier: [0, 1, 1, 2, 3],
    },
    // 契約金(§契約金は基本ゼロスタート)。新人なので「言い値」は常に0円にする。
    // お金でどうしても口説き落としたい(ゴリ押しする)場合は、leads.moneyOfferRange
    // のfeeOfferAmountスライダーで実額を積む(closingProgress側のmoneyScoreに
    // 反映される。詳細はleads側のコメント参照)。
    contractFee: 0,
    // 候補プール制(§スカウト再設計「登用交渉」)。単発ガチャの代わりに、
    // 候補は複数人が同時にプールされ(maxPoolSize)、ホーム画面の地図に
    // ピン表示される。残り週数(lifespanWeeksMin〜Max)が尽きる、または
    // ライバル事務所に横取りされる(rivalPoachChance系)と消滅するため、
    // 放置すると機会損失になる希少性を演出する。
    // 「口説き切る」判定はrequiredClosingByGrade(資質グレードごとの必要値)を
    // 好感度(baseAffinity=やる気interest+差し入れ等の積み上げaffinity)と
    // お金(moneyScore、給与/歩合/契約金上乗せの寛大さを標準との差分でスコア化)で
    // 埋める形にする(§柔軟な条件交渉・好感度のやる気ベース化)。
    // affinityMaxShareByGradeは「好感度側だけで賄える割合の上限」で、資質グレードが
    // 高いほど低く設定し、良い人材ほど好感度だけでは口説き切れずお金も積む必要が
    // ある(お金側には上限を設けない=お金は誰にでも常に効く。ただし標準より悪い
    // 条件を出すとマイナスにもなる)。
    // requiredByGradeは、やる気(interest)の抽選幅(平均40〜70程度)だけで
    // 満たされきらないよう、旧数値(好感度が0から積み上げる前提)より高めに設定する。
    // actions: 好感度の積み上げ手段。gift(差し入れ)/meal(食事)/liveInvite(ライブ招待)の
    // 3段階。money系スライダー(いくらでも積める)と違い、事務所全体で共有の
    // 週次アクション枠(種類ごとに週1回まで、gameState.affinityActionWeeksで管理)
    // なので「誰に使うか」を選ぶ資源になる(§行動制限による差別化)。
    // staffAffinityPerWeekはSTAFF(category:"scout")を雇っている人数分、
    // 週送りのたびに全候補へ自動加算される(誰が担当でも効く簡易版、週次枠の対象外)。
    leads: {
      maxPoolSize: 4,
      spawnChancePerWeek: 0.5,
      lifespanWeeksMin: 2,
      lifespanWeeksMax: 6,
      rivalInterestChance: 0.25,
      rivalPoachChanceBase: 0.05,
      rivalPoachChanceRivalFlagMult: 2.5,
      requiredClosingByGrade: { SS: 120, S: 100, A: 80, B: 60, C: 40 },
      affinityMaxShareByGrade: { SS: 0.5, S: 0.65, A: 0.8, B: 1.0, C: 1.0 },
      // 費用は演出上の絶対額であり、他の値のようなECONOMY_SCALE換算はかけない
      // (差し入れ20万円/食事50万円/ライブ招待100万円、そのままの金額)。
      actions: {
        gift: { cost: 200000, affinityGain: 8, cooldownWeeks: 1 },
        meal: { cost: 500000, affinityGain: 20, cooldownWeeks: 1 },
        liveInvite: { cost: 1000000, affinityGain: 40, cooldownWeeks: 1 },
        staffAffinityPerWeek: 3,
      },
      // お金側(moneyScore)の重み。契約金のゴリ押し(feeOfferAmount、実額)・固定給の
      // 上乗せ(salaryBumpRatio)・歩合率の譲歩(commissionRateOffer)を、標準
      // (feeOfferAmount=0、salaryBumpRatio=0、commissionRateOffer=標準歩合率)からの
      // 差分に応じて加重和でスコア化する。標準より悪い条件(歩合率の上乗せ=
      // 事務所取り分増)を提示すると符号が反転してマイナスにもなる
      // (§柔軟な条件交渉、標準より悪い条件も選べるようにする)。
      moneyScore: {
        feeOfferToScoreScale: 0.00003,    // feeOfferAmount(実額円、負なし)にこの倍率をかけてスコア化(例: 500万円→150点)
        salaryBumpToScoreScale: 150,      // salaryBumpRatio(標準比、負も可)にこの倍率をかけてスコア化
        commissionGenerosityToScoreScale: 300, // (標準歩合率-offer歩合率)にこの倍率をかけてスコア化(歩合制のみ、負も可)
      },
      // スライダーで動かせる範囲(min/max/step)。feeOfferAmountは実額の円
      // (§実額でスライドしたい)、他は標準からの比率で0が標準条件。
      moneyOfferRange: {
        feeOfferAmount: { min: 0, max: 100000000, step: 1000000 }, // 0〜1億円、100万円刻み(将来の引き抜き等も見据えた幅)
        salaryBumpRatio: { min: -0.3, max: 0.5, step: 0.05 },
        commissionRateOffer: { min: 0.2, max: 0.8, step: 0.05 },
      },
      // 何としてデビューさせるか(JOB_TYPES)が本人の志望(desiredJobType)と
      // 一致/不一致のとき、好感度の口説き具合(closingProgress)に加算/減算する
      // ボーナス/ペナルティ(§スカウト再設計: 契約時のやる気ではなく、
      // 口説いている最中の好感度に反映するよう変更)。
      jobMatchBonus: 15,
      jobMismatchPenalty: 20,
    },
    // お試しステージ(§スカウトに賭けと発見を持たせる)。契約前の候補は
    // OBSERVABLE_SCOUT_PARAMS(7ステータス+成長度)が基本的に伏せられており、
    // 観測したい項目を好きなだけ選んで1回のお試しで全部観測できる(選択数の
    // 上限はない)。costPerItemは1項目あたりの実額(円)で、ECONOMY_SCALE換算は
    // しない(そのまま20万円)。スタッフ・設備のtrialCostMultiplierで割引が乗る
    // (js/state.js参照)。
    // ただし観測係は臨時で雇った外部の低レベルコーチなので、目利き自体に
    // 上限がある(judgeRankCeiling、RANK_THRESHOLDSの文字ランク)。7ステータス
    // いずれも、この上限ランクの一つ上のランクの下限値未満(=judgeRankCeiling
    // 以下の実力)なら正確な数値が分かるが、それ以上の実力は「◯以上」という
    // 下限しか分からない(=臨時コーチの目利きを超えた実力は測れない)。
    // 成長タイプ・資質グレードはランクの概念ではないので、観測すればそのまま
    // 正確に分かる(fogの対象外)。judgeRankCeiling自体は今のところ固定
    // (将来、事務所の成長で引き上げられるようにする余地を残す)。
    trial: {
      costPerItem: 200000, // 1項目20万円(実額)
      judgeRankCeiling: "D", // 序盤は低い(RANK_THRESHOLDS参照)。事務所の成長が必要
    },
    // 顔アイコンは円形マスク(border-radius:50%)で切り抜いて表示するが、
    // 元画像は正方形セルの端(特に左右の中央付近)まで背景色が残っていることが
    // あり、円マスクの一番外側(=辺の中央)でその背景が黒い縁として見えてしまう
    // ことがある(元画像側の構図の問題)。切り出し矩形を中心から一回り小さく
    // 取ることでこれを軽減する(0.03=各辺3%ずつ内側にズームする)。
    portraitCropZoom: 0.03,
    // ポートレート描画時に後がけする厚塗り風Canvasフィルター
    // (js/portraitPaintFilter.js)のデフォルト強度。元のスプライトシート
    // 画像は書き換えず、描画のたびにこの設定で合成する。
    // ポートレート元画像はcellSize=256px(Geminiで2K化済み)を前提とした
    // ぼかし半径(px)。
    paintFilter: {
      softenBlurPx: 2,          // 陰影をなじませるためのぼかし半径(px)
      softenOpacity: 0.09,      // なじませブレンドの不透明度
      softenBlendMode: "overlay",
      bloomThreshold: 0.88,     // これより明るい部分だけをブルーム対象にする(0〜1)
      bloomBlurPx: 3,           // ブルームのぼかし半径(px)
      bloomOpacity: 0.18,       // ブルームの不透明度
      saturate: 1.06,           // 最終的な彩度倍率
      contrast: 1.06,           // 最終的なコントラスト倍率
    },
  },

  // 給与体系(§スカウト再設計/§給与体系の月給化/§給料は経歴・場所・年齢・
  // 開示度で決める)。雇用時に固定給/歩合制のどちらかを選ぶ(後から交渉でも
  // 変更可能)。固定給は月次(月が変わるタイミング、§月次経費)で引き落とされ、
  // 歩合制は月次の引き落としがない代わりに、ステージ成功報酬から
  // commissionRate分が天引きされる。
  // 固定給の基準額(state.js: getBaseSalary())は「実力の値踏み」ではなく
  // 年齢・経歴・場所・属性という常に見えている情報だけの足し算にし、お試しステージで
  // 観測できていない項目数ぶんだけ「不確実性への割増」を上乗せする(ランクその
  // ものでは変えない。正確に測れるようになった時点で割増は消える)。
  salary: {
    ageYen: 10000,               // 年齢ベース: 1歳につき1万円
    originTierBonusYen: [0, 50000, 100000, 150000, 200000], // 経歴salaryTier(1〜5)ごとの加算。
    // 属性ATTRIBUTES.rarity(★1〜5)もindex(rarity-1)でこの表をそのまま流用する
    // (★1で0円・★5で20万円、経歴・場所と同じ形の単純加算に揃える)。
    locationBonusPerShiftYen: 50000, // 場所rankShift(0〜4)1につき5万円加算
    unresolvedPenaltyYen: 50000,  // 7ステータス中、正確な数値が未判明の項目1つにつき5万円
    commissionRate: 0.5,      // 歩合制: ステージ成功報酬からの天引き率(§UI改修計画⑧-5、20%は低すぎるため引き上げ)
    renegotiateSuccessChance: 0.7, // 交渉での変更が成功する確率
  },

  // 契約更改(§スカウト充実化「1年に1回契約交渉」/§契約更改の駆け引き強化)。
  // 固定給メンバーは在籍からintervalWeeks(=1年)ごとに契約更改のタイミングを
  // 迎え、ファン人気・天狗度に応じた昇給要求(demandedSalary)を突きつけられる
  // (歩合制は報酬が既に業績連動のため対象外)。
  contractRenewal: {
    intervalWeeks: 48, // calendar.weeksPerMonth(4) × monthsPerYear(12) = 1年
    baseDemandRatio: 0.1,      // 最低限の物価上昇分の昇給要求率
    // 個人ファン数÷これ が要求率に加算される。旧200000は、通常プレイで
    // 個人ファン数が数千〜数万止まりのこの経済スケールでは実質ほぼ0にしか
    // ならず「ファン人気を考慮しているはずなのに全く効かない」状態だったため、
    // 数年在籍した人気メンバーで意味のある差が付く水準まで下げた
    // (例: ファン1万人で+0.25、2万人で+0.5)。
    fansDemandDivisor: 40000,
    tenguDemandDivisor: 250,   // 天狗度÷これ が要求率に加算される(例: 天狗度25で+0.1)
    maxDemandRatio: 0.6,       // 要求率の上限(月給が最大でも+60%まで)
    // 歩合制への切り替え要求(§人気が出れば歩合制も選べるように)。固定給の
    // 個人ファン数がこれ以上のメンバーは、契約更改のたびに「歩合制の方が
    // 稼げるはず」と自分から切り替えを提案してくる(プレイヤーは応じても
    // 断って通常の昇給交渉を続けてもよい)。
    commissionRequestFansThreshold: 15000,
    // 契約交渉(§スカウト交渉の駆け引きに寄せた再設計)。1人につき最大maxRounds回、
    // ラウンドごとにスタンスを選べる。「満額のむ」「契約満了で送り出す」は
    // その場で即終了する単発アクション。「歩み寄る」は要求とのギャップを
    // gapCloseRatioずつ埋める(複数ラウンド粘るほど要求に近づく)。「現状維持を
    // 貫く」は月給を上げない代わりに天狗度・ストレスが上がり、繰り返すほど
    // 独立(departure)のリスクが跳ね上がる(scoutGeneratorの強気スタンスと同じ
    // 「押すほどリスクが増す」設計)。
    negotiation: {
      maxRounds: 3,
      fullAcceptTenguRelief: 30, // 満額のむと天狗度が大きく鎮まる
      meet: {
        gapCloseRatio: 0.5,       // 現在給与と要求額の差をこの割合ずつ埋める
        tenguDeltaStep: -6,       // 通常は少し機嫌が良くなる
        annoyedChance: 0.2,       // ただし低確率で「まだ足りない」と不満を持たれる
        tenguDeltaStepIfAnnoyed: 8,
      },
      hold: {
        tenguDeltaStep: 18,
        stressDeltaStep: 8,
        departureChanceBase: 0.12,
        departureChancePerPriorHold: 0.12, // 「現状維持」を選ぶたびに独立リスクが積み上がる
      },
    },
  },

  // 育成（レッスン）システム(§4.1・§2ステップ2)。
  // 「1日1人」ではなく、施設(モノ)×トレーナー(ヒト)で決まる1日あたりの
  // レッスン枠(スロット)を、ロースター全員に対して自由に割り当てる方式。
  // 枠の割り当ては手動でも「自動割り当て」でも行える。
  // 効果量は施設・トレーナーの倍率でスケールする(倍率1.0がトレーナー無し/
  // 最低ランク施設のみの基準値)。
  training: {
    costPerSession: 800 * ECONOMY_SCALE, // レッスン1件(1人×1カテゴリ)あたりの費用
    statGainMin: 1,            // 1回のレッスンで伸びる基礎ステータスの最小値
    statGainMax: 4,            // 同・最大値
  },

  // クライアント格付け(§6.2)。クリーン案件は安定志向、グレー案件は
  // 高報酬・高難度に加えて成功時にも悪評リスク(スキャンダルの簡易版)を負う。
  clientTiers: {
    clean: {
      label: "クリーン案件",
      targetScoreMultiplier: 1.0,
      rewardMultiplier: 1.0,
      staminaCostMultiplier: 1.0,
      scandalChance: 0,
    },
    gray: {
      label: "グレー案件",
      targetScoreMultiplier: 1.25,   // 期待値ラインが高い
      rewardMultiplier: 1.6,         // その分、報酬(現金・ファン)も大きい
      staminaCostMultiplier: 1.15,   // スタミナ経済も厳しい
      scandalChance: 0.12,           // 成功しても一定確率でファンが離反する
      scandalFansPenalty: 60,
    },
  },

  // 取引先評価(§ボリューム拡張)。STAGE(個々の取引先)ごとに0〜100で管理し、
  // 成功/撤退/失敗のたびに増減する(state.js: applyBattleResult)。評価が
  // 高いほど同じ仕事でも報酬倍率が上がり、低いほど下がる。オファー選別
  // (受動営業)では、評価がhideBelowReputationを下回った取引先はもう
  // オファーを出してこなくなる(jobBoard.js: getAvailableStages)。
  clientReputation: {
    start: 50,
    min: 0,
    max: 100,
    successGain: 6,
    retreatLoss: 5,
    failLoss: 10,
    rewardMultiplierAtMin: 0.7,
    rewardMultiplierAtMax: 1.4,
    hideBelowReputation: 15,
  },

  // トレンド倍率(§11の簡易版)。仕事ごとに設定された「今の流行り属性」に
  // 合致するメンバーはスコア効率が上がり、外れた属性は下がる。
  trend: {
    matchedMultiplier: 1.2,
    mismatchedMultiplier: 0.9,
  },

  // バーター営業(§6.2)。ステージの推奨レベル(recommendedStatLevel)を
  // 大きく下回る編成で挑むと、実力不足を知名度で押し切る「バーター」扱いになり、
  // 期待値ラインが上がる代わりにファンの伸びが上乗せされる。
  barter: {
    statGapThreshold: 15,      // 推奨レベルよりこれ以上低いとバーター判定
    targetScoreMultiplier: 1.2,
    bonusFans: 80,
  },

  // 特能(§4.4)ごとの効果係数。付与判定自体はscouting.successionで行う。
  // 29個全てに実際の効果を実装済み(battle.js/training.js/scoutGenerator.js/
  // state.js側)。「早熟」「大器晩成」「早熟の反動」の3特能はGROWTH_TYPES
  // (全アイドル共通属性)に統合されたため廃止済み。「大厄年」はBALANCE.aging
  // (state.js側のapplyAging、週次の経年劣化・一時的な大厄年デバフ)を土台に動作する。
  talentEffects: {
    stage_strong: { scoreThresholdRatio: 0.8, scoreBonusMultiplier: 1.25 }, // 大舞台○: 目標に近いほど伸びる
    mood_maker: { heatFloorBonus: 15 },                                     // ムードメーカー: 熱量の下限を底上げ
    underdog: { lateThresholdRatio: 0.6, scoreBonusMultiplier: 1.2 },       // 負けず嫌い: 終盤(ターン進行度60%超)かつ未達成なら伸びる
    center_born: { centerScoreBonusMultiplier: 1.15 },                      // 天性のセンター: センター枠でさらに伸びる
    guts: { minStaminaOnce: 1 },                                            // 根性: スタミナ0寸前の強制引退を一度だけ回避

    glass_throat: { damageTakenMultiplier: 1.3 },                          // ガラスの喉: 被弾がやや重い
    stage_fright: { unpracticedScoreMultiplier: 0.85 },                     // あがり症: ぶっつけ本番のペナルティが悪化
    center_phobia: { centerScorePenaltyMultiplier: 0.85 },                  // センター恐怖症: センター枠で伸びが鈍る
    burnout: { comboPenaltyPerHold: 0.05, maxPenalty: 0.3 },                // 燃え尽き症候群: 粘るほど逆に効率が落ちる
    my_pace: { heatGainMultiplier: 0.6 },                                   // マイペース: 熱量ゲージの上昇を妨げる
    fragile: { postHitScoreMultiplier: 0.85 },                              // 打たれ弱い: 被弾した次の曲だけ効率が落ちる

    iron_core: { maxStaminaBonus: 8 },                                      // 鋼の体幹: 最大スタミナ+8
    weak_stamina: { maxStaminaPenalty: 6 },                                 // スタミナ切れ体質: 最大スタミナ-6
    energy_saver: { staminaCostMultiplier: 0.85 },                          // 省エネ体質: 消費が全体的に軽い
    high_upkeep: { staminaCostMultiplier: 1.15 },                           // 燃費が悪い: 消費が全体的に重い
    bond_proof: { adjacentScoreBonusMultiplier: 1.08 },                     // 絆の証: 隣接に仲間がいると双方少し底上げ(孤高だと無効)
    good_listener: { matchingStat: "talk", scoreBonusMultiplier: 1.12 },    // 聞き上手: トーク系ステージでボーナス
    charisma: { matchingStat: "charm", scoreBonusMultiplier: 1.12 },        // カリスマ性: charm関連ステージでボーナス
    shy: { matchingStat: "talk", scorePenaltyMultiplier: 0.9 },             // 人見知り: トーク系ステージで効率低下
    demand_mismatch: { matchingStat: "looks", scorePenaltyMultiplier: 0.9 }, // 需要とのズレ: looks関連ステージで効率低下
    unlucky_body: { damageTakenMultiplier: 1.15 },                          // 不運体質: 被弾量がやや増える
    lucky_body: { scoutRankShiftPerHolder: 1 },                             // 幸運体質: 在籍人数分だけスカウト時の全ステータスのランクを底上げ

    // ここから育成(training.js)側の効果。ぶっつけ本番ペナルティ(battle.js)にも
    // 一部またがるものがある。
    practice_bug: { statGainMultiplier: 1.2, unpracticedScoreMultiplier: 1.15 }, // 練習の虫: レッスンの伸びが早く、ぶっつけ本番のペナルティも軽い
    practice_hater: { statGainMultiplier: 0.85 },                           // 練習嫌い: レッスンの伸びが遅い
    clumsy: { statGainMultiplier: 0.8 },                                    // 不器用: 成長量が少ない
    specialist: { statGainMultiplier: 1.2 },                                // 一点集中: 現時点の最高ステータスがさらに伸びやすい
    crowd_favorite: { fansGainBonusPerHolder: 0.08 },                       // 人気者: 出演していた人数分だけファンの伸びが上乗せ

    // 覚醒(§4.4「放送事故などのピンチで突然全ステータスSになるロマン枠」)。
    // 自分のスタミナが尽きかけている(staminaCrisisRatio以下)瞬間だけ発動判定し、
    // 成功したその曲だけ実質ステータスをS相当(statPowerOverride)まで底上げする。
    // 1ステージにつき1回だけ(gutsやmoraleAttackと同じ「使い切り」方式)。
    awakening: { staminaCrisisRatio: 0.25, chance: 0.15, statPowerOverride: 100 },
  },

  // 加齢・継承(§9)。
  succession: {
    talentChance: 0.18,      // スカウト生成時に特能を持って生まれる確率
    inheritChance: 0.25,     // 前衛ベテラン+隣接後衛ルーキーが揃った時の継承確率
    veteranMinAge: 22,       // 継承元になれる年齢(バフの司令塔世代)
    rookieMaxAge: 16,        // 継承先になれる年齢(ガラスの大砲世代)
  },

  // 解雇(§ボリューム拡張)。即座にロースターから除籍する。ファンへの
  // 心証は多少悪くなるため、わずかにファンを失う(ラストダンス卒業とは違い
  // 円満な引退ではないため)。
  firing: {
    fansPenalty: 20,
  },

  // 加齢によるステータス増減(§9.1の延長)。advanceDay()で毎日判定する。
  // 「大器晩成」「大厄年」の2特能は、これが土台としてないと成立しなかったため新設した。
  aging: {
    // 経年劣化のグローバル既定値(擦り切れ度の蓄積開始年齢、state.js: applyMentalStats)。
    // 経年劣化そのもの(下げ幅・下げ止まり)は成長タイプごとにdeclineStartAgeで
    // 個別管理する(GROWTH_TYPES参照、state.js: applyAging)。
    declineStartAge: 22,
    // 大厄年: 低確率で一時的にステータスが下がり、durationDays後に元へ戻る。
    badYear: {
      dailyChance: 0.01,          // 通常時の1日・1人あたりの発生確率
      holderDailyChance: 0.1,     // 特能「大厄年」保持者の発生確率
      statDropPercent: 0.12,      // 該当ステータスをこの割合だけ一時的に下げる
      durationDays: 3,            // これだけ経つと自動で元に戻る
    },
  },

  // 力尽き休養(§burnout)。ステージ中にスタミナが尽きて強制退場(battle.js側は
  // 引き続き"retired"という名前のバトル内フラグを使うが、事務所側の結末は
  // ここで決まる)した場合、即座の永久引退ではなく段階的な休養にする。
  // retireAtCount回目で初めて永久引退(ロースターから除籍)になる。
  burnout: {
    retireAtCount: 3, // 3回目でロースターから完全に除籍
    restWeeksByCount: {
      1: 4,  // 1回目: 1ヶ月(4週)休養
      2: 12, // 2回目: 3ヶ月(12週)休養
    },
  },

  // ラストダンス(§9.3)。引退宣言した最後のライブは、スタミナ消費ゼロ・
  // 全盛期を超える限界突破ステータスの特別枠として扱う。
  lastDance: {
    statBonusMultiplier: 1.3,
  },

  // セカンドキャリア(§9.4)。ラストダンスを経て引退したタレントのみが
  // コーチ枠として残留し、育成(レッスン)に恩恵を与える。
  secondCareer: {
    trainingStatGainBonusPerCoach: 0.5, // コーチ1人につきレッスンの基礎伸び幅に加算
  },

  // 応援ブースト(§3.6・§10)。大型イベント/アワード(stage.isMilestone)限定の
  // 当日介入要素。現金消費で対象アイドルのスタミナを即時回復し、
  // 発動した次のターンだけそのメンバーのスコア効率が上がる。課金要素ではない
  // (あくまでゲーム内資金を消費する経営判断)。
  cheerBoost: {
    cost: 15000 * ECONOMY_SCALE,
    staminaRestore: 30,
    scoreBoostMultiplier: 1.5,
    maxUsesPerBattle: 2,
  },

  // 大型イベント／アワード(§10、甲子園相当のマイルストーン)。
  milestone: {
    // 実力で勝っていても、大手事務所の政治力で理不尽にアワードを奪われることがある。
    // 成功はするが、その場合はファンの伸びが大きく目減りする(業界の談合・大人の事情)。
    collusionChance: 0.25,
    collusionFansMultiplier: 0.4,
  },

  // 資金調達(§8)。
  finance: {
    bankLoan: {
      amount: 80000 * ECONOMY_SCALE,
      dailyRepayment: 6000 * ECONOMY_SCALE, // 完済するまで日次で自動引き落とされる
    },
    patron: {
      amount: 120000 * ECONOMY_SCALE,
      darkEventChance: 0.08,      // タニマチの意向が絡む闇イベントが日次で発生しうる
      darkEventFansPenalty: 100,
    },
  },

  // 記者会見(社長の3択ジレンマ、§8)。グレー案件の悪評(scandal)が発生した
  // ターンに限り選択できる。cleanliness(事務所の「裏の顔」蓄積の裏返し、§11)は
  // 100が最も清廉、下がるほど今後の悪評・談合の確率が上がる。
  pressConference: {
    coverUp: { cashCost: 25000 * ECONOMY_SCALE, cleanlinessDelta: -15 },          // もみ消す: 現金で悪評を打ち消す
    apology: { fansPenaltyMultiplier: 0.5, cleanlinessDelta: 5 }, // 全面謝罪: 悪評を半分に抑え信頼を回復
    denial: { successChance: 0.4, failFansMultiplier: 2, cleanlinessDelta: -5 }, // 事実無根で強行突破: 賭け
    tailCutting: { cashCost: 15000 * ECONOMY_SCALE, cleanlinessDelta: -30 },      // トカゲの尻尾切り: 安いが最も裏の顔が濃くなる
  },

  // 週刊の噂話イベント(§ボリューム拡張)。ステージの結果に関係なく、
  // 毎週わずかな確率でスキャンダル(悪い噂)かプラスの出来事(良い噂)が起こる。
  // 記者会見(pressConference)のような選択の余地はなく、即座に効果が適用される
  // 「小さな出来事」という位置づけ(大きな不祥事は既存のグレー案件経由の
  // 記者会見システムが担当する)。
  randomEvents: {
    scandalChanceBase: 0.05, // cleanlinessRiskMultiplierでさらに悪化しうる
    plusChanceBase: 0.08,
    logLimit: 20, // gameState.eventLogの保持件数上限
  },

  // 連鎖退職(§8)。cleanliness低下時のリスク。
  risk: {
    chainResignationCleanlinessThreshold: 40,
    chainResignationChance: 0.1,
    // cleanliness(0〜100)がこの係数で悪評・談合の確率を上下させる。
    // 100(清廉)で1.0倍、0(裏の顔まみれ)でこの倍率まで悪化する。
    cleanlinessRiskMultiplierAtZero: 1.8,
  },

  // マクロ環境(§11)。本来は数年周期の話だが、1週間ループの中で体感できる
  // よう「数日周期」に圧縮したパラダイムシフトとして表現する。
  // gameState.eraが現在のトレンド属性を持ち、日次(advanceDay)で入れ替わる。
  macroEra: {
    shiftIntervalDays: 2,             // このペースでトレンドが入れ替わる
    peakMultiplier: 1.35,             // シフト直後(先行者利益)の一致ボーナス
    staleMultiplier: 1.05,            // 賞味期限切れが近づくと一致ボーナスがここまで下がる
    staleAfterDays: 4,                // これだけ同じトレンドが続くと賞味期限切れ扱い
    antiTrendChance: 0.3,             // シフト時、通常のトレンドではなく「暗黒期」になる確率
    antiTrendPenaltyMultiplier: 0.6,  // 暗黒期に該当属性で出演すると効率がさらに下がる
  },

  // グループ結成の闇(§11)。ユニット結成による副次的なファン増加がある一方、
  // センター格差(出演メンバー間のスコア偏重)が続くとギスギス度が蓄積し、
  // 一定値を超えると強制解散してファンが離れる。
  groups: {
    minMembers: 2,
    maxMembers: 7, // FORMATIONS.grand_septet(7人編成)に合わせる(§UI改修計画⑥-1)
    imbalanceThreshold: 0.6,   // (最大-最小)/最大 がこれを超えるとセンター格差とみなす
    tensionGainOnImbalance: 18,
    tensionDecayOtherwise: 8,
    dissolveThreshold: 100,
    dissolutionFansPenalty: 150,
    fanBonusPercent: 0.08,     // 結成メンバーが共演した回、成功報酬のファン増加に上乗せ
    leaveTensionGain: 12,      // 加入脱退(§): 誰かが脱退すると残ったメンバーのギスギス度が少し上がる
  },

  // 倒産(§8)。月次決算(settleMonthlyExpense)後の時点で現金がマイナスのまま
  // 2ヶ月連続になったらゲームオーバーにする。1ヶ月だけのマイナスは「警告」に留め、
  // 立て直すチャンスを残す(gameState.cashNegativeLastMonthEndで前月分の状態を覚えておく)。
  bankruptcy: {
    consecutiveNegativeMonthsToFail: 2,
  },

  // 個人単位のメンタル・人間関係パラメータ(§4.3、完全隠蔽・変動パラメータ)。
  // UIには一切数値を出さず、スキャンダル確率・病気休養・給料アップ要求/独立画策
  // という「見えない形での挙動」にのみ反映する。
  mentalStats: {
    // ストレス: 現場(ライブ)・レッスンで溜まり、何もしない週は自然に下がる。
    stressPerBattle: 10,
    stressPerLesson: 5,
    stressWeeklyDecay: 8,
    // 限界(§4.3「病気休業やスキャンダル確率が上昇」)。
    stressScandalThreshold: 70,
    stressScandalRiskMultiplier: 1.6,
    stressIllnessThreshold: 90,
    stressIllnessWeeklyChance: 0.1,
    stressIllnessRestWeeks: 2,

    // 天狗度(プライド): 人気(ファン)が伸びるほど上がり、何もない週は落ち着く。
    tenguGainPerFanShare: 0.02,
    tenguWeeklyDecay: 2,
    // 限界(§4.3「給料アップ要求・命令無視・独立画策の引き金」)。固定給メンバーのみ対象。
    tenguDemandThreshold: 70,
    tenguDemandWeeklyChance: 0.12,
    tenguDemandRaiseChance: 0.7,  // 残りの確率で「独立画策」(自主退所)に振れる
    tenguDemandSalaryBumpPercent: 0.15,
    tenguDemandRelief: 25,

    // 擦り切れ度: 現場経験とキャリアの蓄積で上がる(現状は表示のみの隠しパラメータ)。
    surikirePerBattle: 2,
    surikireWeeklyAgeGain: 0.3,
  },
};

// 事務所ランク(§6.1)。累計ファン数の閾値で決まり、ランクによって
// 「ドブ板営業（能動）」か「オファー選別（受動）」かの営業モードが
// 自動で切り替わる。営業モード自体は仕事選択画面(jobBoard.js)が使う。
// 事務所ランク(10段階)。累計ファン数の閾値で自動昇格する。序盤3段階は
// 「ドブ板営業(能動)」、4段階目以降は「オファー選別(受動)」に切り替わる
// (jobBoard.js: getAvailableStages)。既存id(local/rising/major)は
// SCOUT_LOCATIONS/SCOUT_METHODS/STAGES/VENTURE_TYPESのminRankIdから
// 参照されているため維持し、間に新ランクを挿入する形で10段階化した。
export const AGENCY_RANKS = [
  { id: "no_name", label: "無名事務所", fansThreshold: 0, salesMode: "active" },
  { id: "local", label: "地元密着事務所", fansThreshold: 500, salesMode: "active" },
  { id: "town", label: "地域一番事務所", fansThreshold: 1500, salesMode: "active" },
  { id: "rising", label: "新進事務所", fansThreshold: 3500, salesMode: "passive" },
  { id: "notable", label: "注目株事務所", fansThreshold: 7000, salesMode: "passive" },
  { id: "established", label: "中堅事務所", fansThreshold: 13000, salesMode: "passive" },
  { id: "leading", label: "大手候補事務所", fansThreshold: 24000, salesMode: "passive" },
  { id: "major", label: "メジャー事務所", fansThreshold: 42000, salesMode: "passive" },
  { id: "top_tier", label: "最大手事務所", fansThreshold: 70000, salesMode: "passive" },
  { id: "legendary", label: "伝説の事務所", fansThreshold: 110000, salesMode: "passive" },
];

// スカウト先(§スカウト再設計)。「予算を選ぶ」のではなく「場所を選んで行く」形。
// 出向くこと自体は週を送らず即座に候補が1人見つかる。rankShiftは
// ステータスのランクピラミッド(BALANCE.scouting.quality)をどれだけ良い方に
// 底上げするか(scoutGenerator.js: rollRankIndex参照)。最大でもピークがB止まりに
// なるよう、rankShiftは5を超えないようにしてある(Sが最頻になるのはゲームとして
// 不健全なため)。
// minRankIdはAGENCY_RANKSのid。到達するまで一覧に出さない(undefinedなら常時解放)。
export const SCOUT_LOCATIONS = [
  { id: "local_town", label: "地元", description: "近場で手軽に探す。粒は小粒。",
    rankShift: 0 },
  { id: "regional_city", label: "地方都市", description: "少し足を伸ばして近隣の都市まで探しに行く。",
    rankShift: 1 },
  { id: "capital_city", label: "都心", description: "人材の層が厚い都心まで足を伸ばす。",
    rankShift: 1 },
  { id: "idol_convention", label: "アイドル合同オーディション会", description: "各地から志望者が集まる合同オーディションに参加する。",
    rankShift: 2, minRankId: "town" },
  { id: "arts_school", label: "芸能学校", description: "専門教育を受けた生徒に絞って探す。",
    rankShift: 2, minRankId: "local" },
  { id: "talent_agency_network", label: "芸能プロ人脈紹介", description: "他事務所の人脈を頼りに、選りすぐりの逸材を紹介してもらう。",
    rankShift: 3, minRankId: "notable" },
  { id: "overseas", label: "海外", description: "海外まで遠征する。粒ぞろい。",
    rankShift: 3, minRankId: "rising" },
  { id: "global_academy", label: "海外エリート養成校", description: "世界トップクラスの養成校まで直談判しに行く。粒違い。",
    rankShift: 4, minRankId: "leading" },
];

// §UI改修計画⑦: 「スカウト」(行き先を選んで出向く)と「公募」(募集をかける)は
// 別々の行動として分離した(以前は1画面で「行き先」「募集方法」を同時に選ばせて
// いたが、両者は本来独立した行動)。SCOUT_METHODSは各行動の固定パラメータ
// (interestMin/Max=やる気の抽選幅、costMultiplier=契約金倍率)として、
// プレイヤーには選択させず内部でそれぞれ1つずつ紐づけて使う。
// referral(知り合いのつて)→「スカウト」(行き先選択と一緒に人脈を辿る)。
// audition(公募オーディション)→「公募」(広く募集をかける)。
export const SCOUT_METHODS = [
  { id: "audition", label: "公募オーディション", description: "広く募集をかける。応募してくる時点でやる気は高め。",
    costMultiplier: 1.0, interestMin: 40, interestMax: 100 },
  { id: "referral", label: "知り合いのつて", description: "人脈を辿って口説き落とす。やる気はまちまちだが、口説き料がかさむ。",
    costMultiplier: 1.25, interestMin: 0, interestMax: 60 },
];

// 投資/コンテンツの共通カタログ(§3.2)。広告・楽曲・グッズ・YouTube・ラジオ・
// ファンクラブ・スポンサー契約を、個別システムではなく1つの型で表現する。
// mode: "campaign"(単発投資→期間中だけ週次で効果、期間終了で自動終了・再開可) /
//   "ongoing"(即座に開始、毎週固定費+収益が発生し続ける。プレイヤーが
//   任意に解約するまで続く)。gameState.activeVenturesで進行中のものを管理し、
//   office.js: settleVentures()がadvanceDay()から呼ばれ週次精算する
//   (個別システムを増やさない設計、§ユーザー指摘「構造化していれば大改修にならない」)。
// cost: campaign開始時の一括費用。weeklyCost/weeklyRevenue: ongoingの週次収支。
// weeklyCashGain/weeklyFansGain: 効果が有効な間、週次で加算される額(両モード共通)。
// durationWeeks: campaignの効果継続週数。minRankId: AGENCY_RANKSで解放。
export const VENTURE_TYPES = [
  {
    id: "tv_ad", label: "テレビCM出稿", category: "ad", mode: "campaign",
    description: "テレビで大々的に露出する。効果は大きいが一括費用も大きい。",
    cost: 80000 * ECONOMY_SCALE, durationWeeks: 4, weeklyFansGain: 150,
  },
  {
    id: "web_ad", label: "ネット広告出稿", category: "ad", mode: "campaign",
    description: "SNS広告を短期集中で打つ。手頃だが効果は控えめ。",
    cost: 20000 * ECONOMY_SCALE, durationWeeks: 2, weeklyFansGain: 60,
  },
  {
    // §UI改修計画⑩-2: シングルリリースは収益施策ではなく、新タスク
    // 「MV撮影」を解禁する一度きりの条件解放(ゲート)として扱う。
    // oneTime:trueのventureはactiveVenturesに乗らず、office.js側で
    // gameState.unlockedTaskIds/onceStartedVentureIdsへ直接反映する。
    id: "single_release", label: "シングルリリース", category: "music", mode: "campaign", oneTime: true,
    unlocksTaskId: "mv_shoot",
    description: "新曲をリリースし、タスク「MV撮影」を解禁する(条件解放のみ・一度きり)。",
    cost: 60000 * ECONOMY_SCALE,
  },
  {
    id: "merch_launch", label: "グッズ展開", category: "merch", mode: "campaign",
    description: "グッズラインを立ち上げる。しばらく安定した売上が続く。",
    cost: 30000 * ECONOMY_SCALE, durationWeeks: 8, weeklyCashGain: 8000 * ECONOMY_SCALE,
  },
  {
    id: "fan_meeting", label: "ファンミーティング開催", category: "event", mode: "campaign",
    description: "握手会つきのファンミーティングを開催する。単発でファンとの結びつきが強まる。",
    cost: 15000 * ECONOMY_SCALE, durationWeeks: 1, weeklyFansGain: 200,
  },
  {
    id: "youtube_show", label: "YouTube番組運営", category: "youtube", mode: "ongoing",
    description: "冠YouTube番組を持つ。撮影・編集費が継続でかかる代わりに広告収益とファンの伸びが続く。",
    weeklyCost: 15000 * ECONOMY_SCALE, weeklyRevenue: 25000 * ECONOMY_SCALE, weeklyFansGain: 100,
  },
  {
    id: "radio_show", label: "レギュラーラジオ番組", category: "radio", mode: "ongoing",
    description: "帯ラジオ番組のレギュラー枠を持つ。出演料は安定するがファンの伸びは控えめ。",
    weeklyCost: 4000 * ECONOMY_SCALE, weeklyRevenue: 10000 * ECONOMY_SCALE, weeklyFansGain: 30,
    minRankId: "local",
  },
  {
    id: "fan_club", label: "公式ファンクラブ運営", category: "fanclub", mode: "ongoing",
    description: "会員制ファンクラブを運営する。会費収入が安定して入り続ける。",
    weeklyCost: 8000 * ECONOMY_SCALE, weeklyRevenue: 18000 * ECONOMY_SCALE, weeklyFansGain: 40,
  },
  {
    id: "sponsorship", label: "スポンサー契約", category: "sponsor", mode: "ongoing",
    description: "企業スポンサーがつく。事務所ランクが上がるほど大型契約が狙える。",
    weeklyCost: 0, weeklyRevenue: 20000 * ECONOMY_SCALE, weeklyFansGain: 0,
    minRankId: "rising",
  },
  {
    id: "member_blog_sns", label: "メンバーブログ/SNS運用", category: "sns", mode: "ongoing",
    description: "所属メンバーが日々SNSを更新する。手軽に始められる代わり効果は小さい。",
    weeklyCost: 1000 * ECONOMY_SCALE, weeklyRevenue: 3000 * ECONOMY_SCALE, weeklyFansGain: 15,
  },
  {
    id: "goods_subscription", label: "グッズ定期便(サブスク)", category: "merch", mode: "ongoing",
    description: "グッズを定期便で届けるサブスクリプションサービスを運営する。",
    weeklyCost: 5000 * ECONOMY_SCALE, weeklyRevenue: 12000 * ECONOMY_SCALE, weeklyFansGain: 20,
    minRankId: "local",
  },
  {
    id: "crowdfunding", label: "クラウドファンディング", category: "funding", mode: "campaign",
    description: "企画をクラウドファンディングで公募する。小さな元手で支援金が積み上がる。",
    cost: 5000 * ECONOMY_SCALE, durationWeeks: 3, weeklyCashGain: 20000 * ECONOMY_SCALE, weeklyFansGain: 60,
  },
  {
    id: "cross_collab", label: "他事務所とのコラボ企画", category: "event", mode: "campaign",
    description: "他事務所のグループと合同企画を行う。話題性でファンが一気に伸びる。",
    cost: 25000 * ECONOMY_SCALE, durationWeeks: 2, weeklyFansGain: 180,
    minRankId: "notable",
  },
  {
    id: "yearend_special", label: "年末特番出演", category: "event", mode: "campaign",
    description: "年末の大型特番に出演する。一過性だが露出量は破格。",
    cost: 100000 * ECONOMY_SCALE, durationWeeks: 1, weeklyFansGain: 400,
    minRankId: "established",
  },
  {
    id: "overseas_expansion", label: "海外進出", category: "expansion", mode: "campaign",
    description: "海外マーケットに本格進出する。莫大な投資が要るが、長期間じわじわ効いてくる。",
    cost: 500000 * ECONOMY_SCALE, durationWeeks: 12, weeklyCashGain: 20000 * ECONOMY_SCALE, weeklyFansGain: 150,
    minRankId: "major",
  },
];

// 年齢帯による役割推移(§9.1、§ボリューム拡張で6段階化)。陣形パズル上の
// 傾向を係数として表現する。14〜999を隙間なくカバーする(getAgeBandが
// 必ずどれか1つに一致する)。年齢が上がるほどmaxStaminaMultiplier/
// exposedScoreMultiplierは下がっていく代わりに、後半の帯ほど
// supportBonusMultiplier(支援効果の強化倍率)が上がっていく設計。
export const AGE_BANDS = [
  {
    id: "debut_bud",
    label: "デビュー前の蕾",
    minAge: 14,
    maxAge: 15,
    maxStaminaMultiplier: 0.75,
    exposedScoreMultiplier: 1.3,
  },
  {
    id: "glass_cannon",
    label: "ガラスの大砲",
    minAge: 16,
    maxAge: 18,
    maxStaminaMultiplier: 0.85,
    exposedScoreMultiplier: 1.15,
  },
  {
    id: "workhorse",
    label: "ワークホース",
    minAge: 19,
    maxAge: 21,
    maxStaminaMultiplier: 1.0,
    exposedScoreMultiplier: 1.0,
  },
  {
    id: "peak_bloom",
    label: "全盛期",
    minAge: 22,
    maxAge: 25,
    maxStaminaMultiplier: 1.05,
    exposedScoreMultiplier: 0.95,
    supportBonusMultiplier: 1.15,
  },
  {
    id: "commander",
    label: "バフの司令塔",
    minAge: 26,
    maxAge: 30,
    maxStaminaMultiplier: 0.9,
    exposedScoreMultiplier: 0.85,
    supportBonusMultiplier: 1.4, // 🌸華属性としての支援効果がこの倍率で強化される
  },
  {
    id: "living_legend",
    label: "生ける伝説",
    minAge: 31,
    maxAge: 999,
    maxStaminaMultiplier: 0.75,
    exposedScoreMultiplier: 0.75,
    supportBonusMultiplier: 1.6,
  },
];

export function getAgeBand(age) {
  return AGE_BANDS.find((band) => age >= band.minAge && age <= band.maxAge) ?? AGE_BANDS.find((b) => b.id === "workhorse");
}

// 週刊の噂話イベント(§ボリューム拡張)のカタログ。kind: "scandal"(悪い噂) |
// "plus"(良い噂)。state.js: rollRandomEvent()がBALANCE.randomEventsの確率で
// 毎週いずれか1件を抽選し、即座に効果を適用する(選択の余地はない小さな出来事)。
export const EVENT_TYPES = [
  { id: "dating_scoop", kind: "scandal", label: "熱愛スクープ",
    description: "メンバーの熱愛が週刊誌にスクープされた。", fansDelta: -80, cleanlinessDelta: -8 },
  { id: "sns_flame", kind: "scandal", label: "SNS炎上",
    description: "投稿が誤解を招き、SNSで炎上した。", fansDelta: -50, cleanlinessDelta: -5 },
  { id: "late_habit", kind: "scandal", label: "遅刻常習が発覚",
    description: "現場での遅刻癖がネットで話題になった。", fansDelta: -30, cleanlinessDelta: -3 },
  { id: "power_harassment", kind: "scandal", label: "パワハラ疑惑",
    description: "現場でのパワハラ疑惑が報じられ、示談金を支払った。", cleanlinessDelta: -12, cashDelta: -20000 * ECONOMY_SCALE },
  { id: "leaked_info", kind: "scandal", label: "内部告発",
    description: "元スタッフによる内部告発でブラックな労働環境が発覚した。", fansDelta: -60, cleanlinessDelta: -15 },
  { id: "rival_beef", kind: "scandal", label: "同業者との確執",
    description: "他事務所との確執がSNSで表面化した。", fansDelta: -40, cleanlinessDelta: -4 },
  { id: "viral_clip", kind: "plus", label: "出演動画がバズる",
    description: "何気ない出演シーンの切り抜きがSNSでバズった。", fansDelta: 150 },
  { id: "kind_deed", kind: "plus", label: "神対応が話題に",
    description: "街中でのファン対応の良さが話題になった。", fansDelta: 90 },
  { id: "surprise_cm_offer", kind: "plus", label: "大手からCMオファー",
    description: "大手企業から予定外のCM出演オファーが舞い込んだ。", cashDelta: 30000 * ECONOMY_SCALE },
  { id: "tv_feature", kind: "plus", label: "情報番組で特集",
    description: "朝の情報番組で特集が組まれ、注目度が上がった。", fansDelta: 120, cashDelta: 10000 * ECONOMY_SCALE },
  { id: "award_nomination", kind: "plus", label: "賞レースにノミネート",
    description: "業界内の賞レースにノミネートされた。", fansDelta: 200 },
  { id: "fan_letter_boost", kind: "plus", label: "ファンレターが殺到",
    description: "励ましのファンレターが殺到し、現場の士気が上がった。", fansDelta: 40, cleanlinessDelta: 3 },
];

// §4「希望する仕事」。スカウト中にプレイヤーが「何としてデビューさせるか」を
// 選ぶ選択肢。候補本人の本当の志望(desiredJobType)と食い違うと口説き具合
// (好感度、BALANCE.scouting.leads.jobMismatchPenalty)にペナルティが乗る
// (state.js: closingProgress()で判定)。
// relevantStats: その職種で強みになるステータス(§役割の強みパラメータ表示)。
// ステータス画面(statGrowthChart.js)で該当項目に★マークを付けて目立たせる。
// 全職種共通で必ず4つ(mentalを固定枠にして、残り3つが職種色)。
// scoutGenerator.jsのqualityGrade算出(desiredJobTypeのrelevantStats平均÷4)
// にも使うため、必ず4個ちょうどにする(§7ステータス全部の平均だとS/SSが
// 事実上出現しない不具合があったため、志望職種に関係する4つだけの平均にした)。
export const JOB_TYPES = [
  { key: "idol", label: "アイドル", relevantStats: ["mental", "vocal", "dance", "charm"] },
  { key: "voiceActor", label: "声優", relevantStats: ["mental", "vocal", "talk", "acting"] },
  { key: "actor", label: "俳優", relevantStats: ["mental", "acting", "talk", "looks"] },
  { key: "talent", label: "タレント", relevantStats: ["mental", "talk", "charm", "looks"] },
  { key: "singer", label: "歌手", relevantStats: ["mental", "vocal", "charm", "looks"] },
  { key: "announcer", label: "アナウンサー", relevantStats: ["mental", "talk", "acting", "charm"] },
];

// レッスンメニュー(§UI改修計画④-1)。単独ステータス強化(single、既存の7項目)に加え、
// 複数ステータスへ広く薄く効く総合メニュー(wide)を用意する。wideはgainMultiplierで
// 1項目あたりの伸び幅を落とす代わりに、対象ステータス全部に同時に効く。
// defaultForJobTypes: 自動割り当て(§UI改修計画④-4)でこの職種に優先的に選ばれるメニュー。
export const TRAINING_MENUS = [
  { id: "vocal", label: "ボーカル", type: "single", statKeys: ["vocal"] },
  { id: "dance", label: "ダンス", type: "single", statKeys: ["dance"] },
  { id: "talk", label: "トーク", type: "single", statKeys: ["talk"] },
  { id: "acting", label: "演技", type: "single", statKeys: ["acting"] },
  { id: "looks", label: "ルックス", type: "single", statKeys: ["looks"] },
  { id: "charm", label: "愛嬌", type: "single", statKeys: ["charm"] },
  { id: "mental", label: "メンタル", type: "single", statKeys: ["mental"] },
  {
    id: "idol_wide", label: "アイドル総合メニュー", type: "wide", gainMultiplier: 0.5,
    statKeys: ["vocal", "dance", "looks", "charm"], defaultForJobTypes: ["idol"],
    description: "アイドル関連の能力を広く薄く伸ばす",
  },
  {
    id: "voiceactor_wide", label: "声優総合メニュー", type: "wide", gainMultiplier: 0.5,
    statKeys: ["talk", "acting", "mental"], defaultForJobTypes: ["voiceActor"],
    description: "声優関連の能力を広く薄く伸ばす",
  },
];

// タスク種別(§UI改修計画④)。「新曲制作」固定だったタスクを汎用化し、投資
// (VENTURE_TYPES)等で解除される複数のタスクをタレント/グループごとに選択実行
// できるようにする。unlockVentureId未指定のタスクは最初から実行できる。
export const TASK_TYPES = [
  {
    id: "new_song", label: "新曲制作", unlockVentureId: null,
    cost: BALANCE.task.newSongCost,
    description: "完成した曲は持ち曲に加わり、事務所全体の持ち曲数(ライブのターン上限)も1曲分伸びる。",
  },
  {
    id: "mv_shoot", label: "MV撮影", unlockVentureId: "single_release",
    cost: BALANCE.task.mvShootCost, fansGain: BALANCE.task.mvShootFansGain,
    description: "持ち曲のミュージックビデオを撮影する。ファンが増える。",
  },
];

// §4「元何かの属性」。本人の経歴。交渉の粘り強さ(negotiationResistance)に
// 加えて「経歴ベース」ステータス(statBase、7ステータスそれぞれ0〜25)を決める。
// 経歴によって得意分野が変わる(=生まれ持った初期適性)、という設計。
// statBaseの合計はどの経歴も概ね95〜105になるよう揃えてある。
// 契約金は§契約金は基本ゼロスタートにより経歴による値付けは行わない。
// salaryTier(1〜5): §給料は経歴・場所・年齢・開示度で決める。negotiationResistance
// の高さで5段階に振り分けた、給料の経歴ボーナス用ランク(BALANCE.salary.
// originTierBonusYenのindexに対応)。
export const ORIGIN_ATTRIBUTES = [
  // ── salaryTier1(給料+0万・レッスン度0%・特化なし): 素材そのまま ──
  { key: "general", label: "一般人", negotiationResistance: 0.85, salaryTier: 1,
    statBase: { vocal: 15, dance: 15, talk: 15, acting: 15, looks: 15, charm: 15, mental: 15 } },
  { key: "streetCasting", label: "スカウト直行", negotiationResistance: 0.8, salaryTier: 1,
    statBase: { vocal: 12, dance: 12, talk: 12, acting: 12, looks: 12, charm: 12, mental: 12 } },
  { key: "student", label: "学生", negotiationResistance: 0.82, salaryTier: 1,
    statBase: { vocal: 14, dance: 14, talk: 14, acting: 14, looks: 14, charm: 14, mental: 14 } },
  { key: "freeter", label: "フリーター", negotiationResistance: 0.81, salaryTier: 1,
    statBase: { vocal: 14, dance: 14, talk: 14, acting: 14, looks: 14, charm: 14, mental: 14 } },
  { key: "frequentMover", label: "引っ越し組", negotiationResistance: 0.83, salaryTier: 1,
    statBase: { vocal: 15, dance: 15, talk: 15, acting: 15, looks: 15, charm: 15, mental: 15 } },
  { key: "familyBusiness", label: "家業手伝い", negotiationResistance: 0.8, salaryTier: 1,
    statBase: { vocal: 14, dance: 14, talk: 14, acting: 14, looks: 14, charm: 14, mental: 14 } },
  { key: "selfTaught", label: "独学派", negotiationResistance: 0.86, salaryTier: 1,
    statBase: { vocal: 15, dance: 15, talk: 15, acting: 15, looks: 15, charm: 15, mental: 15 } },

  // ── salaryTier2(給料+5万・レッスン度25%・特化1つ): 我流の実地経験 ──
  { key: "athlete", label: "体育会系出身", negotiationResistance: 0.9, salaryTier: 2,
    statBase: { vocal: 10, dance: 18, talk: 11, acting: 10, looks: 12, charm: 12, mental: 23 } },
  { key: "undergroundIdol", label: "地下アイドル出身", negotiationResistance: 0.95, salaryTier: 2,
    statBase: { vocal: 16, dance: 17, talk: 14, acting: 11, looks: 12, charm: 19, mental: 9 } },
  { key: "varietyShow", label: "演芸番組出身", negotiationResistance: 0.92, salaryTier: 2,
    statBase: { vocal: 12, dance: 11, talk: 22, acting: 14, looks: 13, charm: 16, mental: 12 } },
  { key: "shopStreetIdol", label: "商店街のマドンナ", negotiationResistance: 0.94, salaryTier: 2,
    statBase: { vocal: 12, dance: 11, talk: 14, acting: 11, looks: 16, charm: 22, mental: 14 } },
  { key: "cosplayer", label: "コスプレイヤー出身", negotiationResistance: 0.91, salaryTier: 2,
    statBase: { vocal: 11, dance: 12, talk: 12, acting: 15, looks: 22, charm: 14, mental: 14 } },
  { key: "choir", label: "合唱部出身", negotiationResistance: 0.93, salaryTier: 2,
    statBase: { vocal: 22, dance: 11, talk: 12, acting: 12, looks: 13, charm: 14, mental: 16 } },
  { key: "streetDancer", label: "ストリートダンサー出身", negotiationResistance: 0.96, salaryTier: 2,
    statBase: { vocal: 12, dance: 22, talk: 12, acting: 11, looks: 14, charm: 14, mental: 15 } },

  // ── salaryTier3(給料+10万・レッスン度50%・特化1つ): 専門的に訓練済み ──
  { key: "danceSchool", label: "ダンス教室出身", negotiationResistance: 1.0, salaryTier: 3,
    statBase: { vocal: 13, dance: 24, talk: 11, acting: 12, looks: 14, charm: 13, mental: 16 } },
  { key: "vocalTrained", label: "音楽教室出身", negotiationResistance: 1.02, salaryTier: 3,
    statBase: { vocal: 24, dance: 11, talk: 12, acting: 12, looks: 13, charm: 13, mental: 15 } },
  { key: "dramaClub", label: "演劇部出身", negotiationResistance: 1.04, salaryTier: 3,
    statBase: { vocal: 12, dance: 11, talk: 17, acting: 23, looks: 13, charm: 12, mental: 15 } },
  { key: "voiceActingSchool", label: "声優養成所出身", negotiationResistance: 1.06, salaryTier: 3,
    statBase: { vocal: 18, dance: 9, talk: 14, acting: 24, looks: 11, charm: 12, mental: 12 } },
  { key: "debateClub", label: "弁論部出身", negotiationResistance: 1.03, salaryTier: 3,
    statBase: { vocal: 10, dance: 9, talk: 24, acting: 14, looks: 12, charm: 14, mental: 17 } },
  { key: "modelSchool", label: "モデル塾出身", negotiationResistance: 1.05, salaryTier: 3,
    statBase: { vocal: 9, dance: 12, talk: 13, acting: 12, looks: 24, charm: 16, mental: 14 } },
  { key: "teaFlowerCeremony", label: "茶道・華道出身", negotiationResistance: 1.08, salaryTier: 3,
    statBase: { vocal: 10, dance: 11, talk: 12, acting: 13, looks: 14, charm: 16, mental: 24 } },

  // ── salaryTier4(給料+15万・レッスン度50%・特化2つ): 複合的な訓練 ──
  { key: "childActor", label: "子役", negotiationResistance: 1.2, salaryTier: 4,
    statBase: { vocal: 12, dance: 11, talk: 17, acting: 23, looks: 16, charm: 14, mental: 13 } },
  { key: "returnee", label: "帰国子女", negotiationResistance: 1.25, salaryTier: 4,
    statBase: { vocal: 11, dance: 10, talk: 21, acting: 12, looks: 18, charm: 16, mental: 14 } },
  { key: "idolTrainee", label: "アイドル研修生出身", negotiationResistance: 1.15, salaryTier: 4,
    statBase: { vocal: 21, dance: 19, talk: 11, acting: 11, looks: 14, charm: 14, mental: 10 } },
  { key: "announcerTrainee", label: "女子アナ候補生", negotiationResistance: 1.18, salaryTier: 4,
    statBase: { vocal: 9, dance: 9, talk: 22, acting: 12, looks: 20, charm: 14, mental: 14 } },
  { key: "balletAbroad", label: "バレエ留学組", negotiationResistance: 1.22, salaryTier: 4,
    statBase: { vocal: 9, dance: 23, talk: 10, acting: 12, looks: 14, charm: 11, mental: 21 } },
  { key: "musicUniversity", label: "名門音楽大学出身", negotiationResistance: 1.24, salaryTier: 4,
    statBase: { vocal: 23, dance: 10, talk: 11, acting: 11, looks: 13, charm: 11, mental: 21 } },
  { key: "theaterFamily", label: "舞台俳優一家出身", negotiationResistance: 1.17, salaryTier: 4,
    statBase: { vocal: 10, dance: 10, talk: 13, acting: 22, looks: 13, charm: 20, mental: 12 } },

  // ── salaryTier5(給料+20万・レッスン度50%・特化3つ): 最高峰・実績十分 ──
  { key: "readerModel", label: "読者モデル", negotiationResistance: 1.3, salaryTier: 5,
    statBase: { vocal: 9, dance: 8, talk: 16, acting: 10, looks: 23, charm: 19, mental: 15 } },
  { key: "influencer", label: "インフルエンサー", negotiationResistance: 1.35, salaryTier: 5,
    statBase: { vocal: 8, dance: 8, talk: 21, acting: 13, looks: 17, charm: 20, mental: 13 } },
  { key: "ojou", label: "令嬢・名門校出身", negotiationResistance: 1.4, salaryTier: 5,
    statBase: { vocal: 17, dance: 8, talk: 12, acting: 10, looks: 14, charm: 21, mental: 18 } },
  { key: "formerChildStar", label: "元子役スター", negotiationResistance: 1.32, salaryTier: 5,
    statBase: { vocal: 9, dance: 9, talk: 18, acting: 22, looks: 13, charm: 20, mental: 9 } },
  { key: "overseasMusicAcademy", label: "海外名門音楽院出身", negotiationResistance: 1.38, salaryTier: 5,
    statBase: { vocal: 23, dance: 9, talk: 10, acting: 10, looks: 11, charm: 19, mental: 18 } },
  { key: "majorAgencyTransfer", label: "大手芸能事務所出身(移籍)", negotiationResistance: 1.36, salaryTier: 5,
    statBase: { vocal: 20, dance: 19, talk: 10, acting: 18, looks: 11, charm: 12, mental: 10 } },
  { key: "competitionChampion", label: "全国コンクール優勝経験", negotiationResistance: 1.42, salaryTier: 5,
    statBase: { vocal: 21, dance: 20, talk: 9, acting: 10, looks: 10, charm: 11, mental: 19 } },
];

// 交渉性格タイプ(§契約交渉に性格を持たせる)。スカウト時に全アイドル共通の
// 属性として1つ抽選される(ORIGIN_ATTRIBUTES=経歴、GROWTH_TYPES=成長曲線とは
// 独立した第三の軸)。「金で口説く」以外の駆け引きを生むため、お金・好感度・
// 役割一致それぞれへの反応の強さを倍率で持たせ、候補プールの口説き交渉
// (state.js: closingProgress)と、在籍者の契約更改交渉(contractRenewalView.js)の
// 両方で同じ性格データを参照する(§これで契約更改とかと合わせられればいいね)。
// 隠しパラメータは持たない方針(§4.1廃止)なので、候補カード・タレント詳細の
// どちらでも性格タグとして常に見える形で表示する。
// - moneyWeights: 契約金上乗せ/固定給上乗せ/歩合率譲歩それぞれのmoneyScoreへの倍率。
//   1.0が標準、高いほどその条件によく反応し、低いほど反応が鈍い(0にはしない=
//   お金は誰にでも「多少は」効く、を維持する)。
// - affinityWeight: 差し入れ・ライブ招待・スタッフ効果による「積み上げ好感度」
//   (interestは含まない、本人の素のやる気は性格と無関係)への倍率。
// - jobMatchWeight: 希望する役割との一致/不一致(jobMatchBonus/jobMismatchPenalty)への倍率。
// - closingBonus: 口説き具合(closingProgress.total)への固定加算。熱望型のみ
//   正の値を持ち、「放っておいても口説きやすい」を表現する。
// - demandRatioMultiplier: 契約更改(computeRenewalDemand)の昇給要求率への倍率。
// - patienceMultiplier: 契約更改交渉での「不満(annoyed)」「独立(departure)」の
//   発生確率を割る値。高いほど機嫌を損ねにくく、独立しにくい(気が長い)。
export const NEGOTIATION_PERSONALITIES = [
  {
    id: "steady", label: "堅実型",
    description: "毎月の安定を重視する。固定給の上乗せによく反応するが、歩合や契約金の一括増額にはあまり心を動かされない。契約更改でも過大な要求はせず、機嫌を損ねにくい。",
    moneyWeights: { feeTopUp: 0.6, salaryBump: 1.6, commissionGenerosity: 0.6 },
    affinityWeight: 1.0,
    jobMatchWeight: 1.0,
    closingBonus: 0,
    demandRatioMultiplier: 0.7,
    patienceMultiplier: 1.3,
  },
  {
    id: "results", label: "実力主義型",
    description: "頑張った分だけ稼ぎたい。歩合率の譲歩に強く反応するが、固定給を積んでもあまり響かない。契約更改でも人気に見合った額をはっきり要求してくる。",
    moneyWeights: { feeTopUp: 0.6, salaryBump: 0.6, commissionGenerosity: 1.6 },
    affinityWeight: 1.0,
    jobMatchWeight: 1.0,
    closingBonus: 0,
    demandRatioMultiplier: 1.2,
    patienceMultiplier: 1.0,
  },
  {
    id: "warmhearted", label: "人情家型",
    description: "お金だけでは心が動かない。差し入れやライブ招待など、真心を見せる行動がよく効く。契約更改でも強気に出ず、歩み寄りをよく受け入れてくれる。",
    moneyWeights: { feeTopUp: 0.4, salaryBump: 0.4, commissionGenerosity: 0.4 },
    affinityWeight: 1.6,
    jobMatchWeight: 1.0,
    closingBonus: 0,
    demandRatioMultiplier: 0.8,
    patienceMultiplier: 1.5,
  },
  {
    id: "ambitious", label: "野心家型",
    description: "今すぐ大きく稼ぎたい。契約金の一括上乗せには強く反応するが、月々の数字にはあまり興味がない。契約更改でも強気な要求を崩さず、現状維持を続けると愛想を尽かしやすい。",
    moneyWeights: { feeTopUp: 1.8, salaryBump: 0.5, commissionGenerosity: 0.5 },
    affinityWeight: 1.0,
    jobMatchWeight: 0.6,
    closingBonus: 0,
    demandRatioMultiplier: 1.4,
    patienceMultiplier: 0.6,
  },
  {
    id: "role_focused", label: "役割重視型",
    description: "何がやりたいかが全て。希望する役割で迎え入れるかどうかに強く反応する(不一致だと大きく心証を害する)。お金にはあまり動かされない。",
    moneyWeights: { feeTopUp: 0.5, salaryBump: 0.5, commissionGenerosity: 0.5 },
    affinityWeight: 1.0,
    jobMatchWeight: 2.0,
    closingBonus: 0,
    demandRatioMultiplier: 0.9,
    patienceMultiplier: 1.0,
  },
  {
    id: "eager", label: "熱望型",
    description: "どうしてもこの事務所に入りたい。放っておいても口説きやすく、条件面はあまり重視しない。契約更改でも多くを求めず、機嫌も損ねにくい。",
    moneyWeights: { feeTopUp: 1.0, salaryBump: 1.0, commissionGenerosity: 1.0 },
    affinityWeight: 1.0,
    jobMatchWeight: 1.0,
    closingBonus: 20,
    demandRatioMultiplier: 0.5,
    patienceMultiplier: 1.5,
  },
];

// 成長タイプ(§ステータス生成バランス再設計)。全アイドル共通の属性として
// スカウト時に1つ抽選される(旧「早熟」「大器晩成」「早熟の反動」特能を統合・置換)。
// ageCurve: [年齢, 比率(0〜1)]の配列。年齢分ステータス(0〜25)＝25×比率を
// 折れ線補間で求める(scoutGenerator.js: growthAgeFactorRatio)。範囲外の年齢は
// 端の値でクランプする。比率は必ず0/0.2/0.4/0.6/0.8/1.0のいずれかを使う
// (§成長曲線の再設計、キリの良い数字に統一)。
// declineStartAge以降、週次で経年劣化(state.js: applyAging)の対象になる。
// 下げ止まり(下限)はこのタイプ固有の値ではなく「そのアイドル個人のレッスン込み
// 最終到達点(lessonCaps)の半分」を、declineStartAgeに達した時点で1回だけ算出して
// 使う(能力が高い子ほど下限も高い)。そこへdeclineStartAge到達から1年(48週)かけて
// 直線的に落ちきり、以降は下げ止まる(§成長度下降中の再設計)。
// 早熟〜大器晩成の5タイプは「2歳ごとに+20%、100%到達後4年キープ、下降開始の
// 直前2年で80%まで落ち着く」という共通ルールで統一し、隣り合うタイプの差は
// どの年齢で切っても20%ちょうど(早熟が最速で16歳到達、以降2歳ずつ遅れて
// やや早熟18歳→標準20歳→やや晩成24歳→大器晩成28歳)。持続・一貫・鍋底・
// 二段階成長・ムラの5タイプはこの共通ルールに縛られず、それぞれの個性に
// 合わせた形にしている(持続=標準と同じ登りだが100%を10年キープ、一貫=
// 踊り場を作らず一直線に伸び続け下降開始後も80%へ落ちない唯一の例外、
// 鍋底=早期に一度100%へ届いてから沈み這い上がる、二段階成長=20%→60%→100%と
// 二段のジャンプ、ムラ=2年ごとに20%/80%を乱高下)。
// statCapはこの成長タイプの上限(通常100、早熟だけやや低い＝早熟の反動を統合)。
export const GROWTH_TYPES = [
  { id: "early", label: "早熟", rarityWeight: 13, statCap: 92,
    description: "10代半ばで一気に完成に近づくが、18歳から急速に衰える",
    ageCurve: [[14, 1.0], [16, 1.0], [18, 0.8]],
    declineStartAge: 18 },
  { id: "slightlyEarly", label: "やや早熟", rarityWeight: 12, statCap: 100,
    description: "早めに開花するタイプ。早熟ほど極端ではないが、下降も少し早め",
    ageCurve: [[14, 0.8], [16, 1.0], [18, 1.0], [20, 1.0], [22, 0.8]],
    declineStartAge: 22 },
  { id: "normal", label: "標準", rarityWeight: 24, statCap: 100,
    description: "もっとも一般的な成長曲線",
    ageCurve: [[14, 0.4], [16, 0.6], [18, 0.8], [20, 1.0], [22, 1.0], [24, 1.0], [26, 0.8]],
    declineStartAge: 26 },
  { id: "slightlyLate", label: "やや晩成", rarityWeight: 12, statCap: 100,
    description: "遅咲きで伸び幅が大きい。下降も緩やか",
    ageCurve: [[14, 0], [16, 0.2], [18, 0.4], [20, 0.6], [22, 0.8], [24, 1.0], [26, 1.0], [28, 1.0], [30, 0.8]],
    declineStartAge: 30 },
  { id: "late", label: "大器晩成", rarityWeight: 9, statCap: 100,
    description: "とにかく時間がかかるが、育てば長く一線級で戦える",
    ageCurve: [[14, 0], [16, 0], [18, 0], [20, 0.2], [22, 0.4], [24, 0.6], [26, 0.8], [28, 1.0], [30, 1.0], [32, 1.0], [34, 0.8]],
    declineStartAge: 34 },
  { id: "sustained", label: "持続", rarityWeight: 8, statCap: 100,
    description: "立ち上がりは標準並みに早いのに、ピークが驚くほど長続きする",
    ageCurve: [[14, 0.4], [16, 0.6], [18, 0.8], [20, 1.0], [30, 1.0], [32, 0.8]],
    declineStartAge: 32 },
  { id: "consistent", label: "一貫", rarityWeight: 6, statCap: 100,
    description: "瞬発力はないが、年齢を重ねてもレッスンの伸びしろを失わない",
    ageCurve: [[14, 0], [34, 1.0]],
    declineStartAge: 34 },
  { id: "valley", label: "鍋底", rarityWeight: 6, statCap: 100,
    description: "10代後半で一度100%に届くが、そこから沈み込み、20代後半に再び這い上がる",
    ageCurve: [[14, 0.2], [16, 0.6], [18, 1.0], [20, 0.6], [22, 0.4], [24, 0.2], [26, 0.4], [28, 0.6], [30, 0.8], [32, 1.0], [34, 0.8]],
    declineStartAge: 34 },
  { id: "stepped", label: "二段階成長", rarityWeight: 6, statCap: 100,
    description: "20%で足踏みしたのち60%まで一段階、24歳前後にもう一段跳ね上がって完成する",
    ageCurve: [[14, 0.2], [16, 0.2], [18, 0.6], [20, 0.6], [22, 0.6], [24, 1.0], [26, 1.0], [28, 0.8]],
    declineStartAge: 28 },
  { id: "volatile", label: "ムラ", rarityWeight: 4, statCap: 100,
    description: "絶好調と不調の波が激しい。2年おきに乱高下し、当たった年は爆発的に伸びる",
    ageCurve: [[14, 0.2], [16, 0.8], [18, 0.2], [20, 0.8], [22, 0.2], [24, 1.0], [26, 0.8]],
    declineStartAge: 24 },
];

// 特能(§4.4、パワプロ方式)。付与はscoutGenerator側でBALANCE.succession.talentChanceに
// 従って抽選する。効果係数はBALANCE.talentEffectsに集約する。
// kind: "plus"(プラス特性・良い個性) | "minus"(マイナス特性・悪い個性)。プラス14・
// マイナス15の計29個。バトルに関わるものはtalentEffectsに実装済み、経営/育成/加齢に
// 関わるものはカタログ(ラベル・説明文)のみで、実装は各システム側の担当フェーズで行う。
// 旧「早熟」「大器晩成」「早熟の反動」はGROWTH_TYPES(全アイドル共通属性)に統合済み。
export const TALENTS = [
  // --- プラス特性(14) ---
  { id: "stage_strong", label: "大舞台○", kind: "plus", description: "期待値ラインに近づくほどスコア効率が上がる" },
  { id: "mood_maker", label: "ムードメーカー", kind: "plus", description: "在籍しているだけで熱量の下限を底上げする" },
  { id: "underdog", label: "負けず嫌い", kind: "plus", description: "目標未達の終盤ほど得点効率が上がる(逆転)" },
  { id: "center_born", label: "天性のセンター", kind: "plus", description: "センタースロットでのスコア倍率がさらに上昇する" },
  { id: "practice_bug", label: "練習の虫", kind: "plus", description: "習熟済み曲数が伸びやすく、ぶっつけ本番のペナルティも軽い" },
  { id: "iron_core", label: "鋼の体幹", kind: "plus", description: "最大スタミナが増加する" },
  { id: "energy_saver", label: "省エネ体質", kind: "plus", description: "スタミナ消費が全体的に軽い" },
  { id: "crowd_favorite", label: "人気者", kind: "plus", description: "契約金交渉・ファン人気の伸びが良い" },
  { id: "good_listener", label: "聞き上手", kind: "plus", description: "トーク系ステージでボーナスを得る" },
  { id: "charisma", label: "カリスマ性", kind: "plus", description: "charm関連のステージでボーナスを得る" },
  { id: "guts", label: "根性", kind: "plus", description: "スタミナ0寸前からの強制引退を一度だけ回避できる" },
  { id: "lucky_body", label: "幸運体質", kind: "plus", description: "スカウト時の資質ロールが底上げされる" },
  { id: "bond_proof", label: "絆の証", kind: "plus", description: "隣接する仲間がいると双方少し底上げされる" },
  { id: "specialist", label: "一点集中", kind: "plus", description: "得意ステータスがさらに伸びやすい(特化型成長)" },
  { id: "awakening", label: "覚醒", kind: "plus", description: "絶体絶命(スタミナ枯渇寸前)の場面で低確率に覚醒し、その曲だけ全パラメータが限界突破する(激レア・ロマン枠)" },

  // --- マイナス特性(15) ---
  { id: "glass_throat", label: "ガラスの喉", kind: "minus", description: "被弾ダメージがやや重くなる" },
  { id: "stage_fright", label: "あがり症", kind: "minus", description: "ぶっつけ本番のペナルティがさらに悪化する" },
  { id: "weak_stamina", label: "スタミナ切れ体質", kind: "minus", description: "最大スタミナが減少する" },
  { id: "center_phobia", label: "センター恐怖症", kind: "minus", description: "センタースロットでスコア効率が下がる" },
  { id: "practice_hater", label: "練習嫌い", kind: "minus", description: "トレーニングの習熟度が伸びにくい" },
  { id: "burnout", label: "燃え尽き症候群", kind: "minus", description: "粘りコンボを重ねるほど逆に効率が落ちる" },
  { id: "my_pace", label: "マイペース", kind: "minus", description: "熱量ゲージの上昇を妨げる" },
  { id: "clumsy", label: "不器用", kind: "minus", description: "トレーニングの成長量が少ない" },
  { id: "shy", label: "人見知り", kind: "minus", description: "トーク系ステージで効率が下がる" },
  { id: "demand_mismatch", label: "需要とのズレ", kind: "minus", description: "looks関連ステージで効率が下がる" },
  { id: "bad_year", label: "大厄年", kind: "minus", description: "特定年齢帯で一時的にステータスが下がる" },
  { id: "fragile", label: "打たれ弱い", kind: "minus", description: "被弾した次の曲だけさらに効率が落ちる(連鎖)" },
  { id: "loner", label: "孤高", kind: "minus", description: "隣接ボーナス系の恩恵を受けられない" },
  { id: "unlucky_body", label: "不運体質", kind: "minus", description: "被弾の発生率・被弾量がやや増える" },
  { id: "high_upkeep", label: "燃費が悪い", kind: "minus", description: "スタミナ消費が全体的に重い" },
];

// バトル中の吹き出し(§②)。ロール(役割)/被弾/引退/特能ごとのセリフ集。
// battle.js側が1ターンにつき最大1〜2件、優先度(引退>大ダメージ被弾>大きい得点>その他)で
// 抽選して{ type: "speech", idolId, line }イベントを積む。
export const BATTLE_LINES = {
  attacker_score: ["見てて、これが本気!", "決まった!", "まだまだ行ける!", "ここが見せ場!"],
  defender_guard: ["私が壁になる!", "ここは通さない!", "守り切ってみせる!"],
  supporter_score: ["まだいける、頑張ろ!", "みんな、こっちだよ!", "支えるから前に出て!"],
  allrounder_score: ["どっちも本気でいくよ!", "攻めも守りも任せて!"],
  hit_common: ["きゃっ…", "うそ、効いた…", "くっ…!", "これくらいなんてことない…!"],
  retire_common: ["ここまで…あとは頼んだ…", "ごめん…もう…", "よく頑張った…あとを頼む"],
  // やる気ボーナス攻撃(§ボリューム拡張)発動時の専用セリフ。
  morale_attack: ["今のわたし、見て!", "やる気全開でいくよ!", "ここが勝負どころ!", "本気、見せちゃう!"],
};

// ---------------------------------------------------------------------
// 育成関連カタログ（施設・トレーナー）。§7の社員システム実装時に
// トレーナーの雇用UI・施設の設備投資UIを追加しても、この構造自体は
// 変更不要なように、カタログとして独立させてある。
// ---------------------------------------------------------------------

// レッスン施設カタログ。ownedFacilityIds(state.js)に含まれるものだけが
// 有効になる。1日あたりのレッスン枠(slots)と効果倍率を提供する。
// monthlyRent: 事務所の月次経費(§月次経費)は所有中の設備の家賃合計として
// 計算する(office.js: getMonthlyRent)。設備を増やす/上位設備に切り替えるほど
// 家賃も上がる。starter_studioは最低限の小部屋なので家賃も小さい。
// rosterCapacity: 事務所の「広さ」(所属できるアイドルの人数上限)。
// 所有施設のうち最も広いものが採用される(office.js: getRosterCapacity)。
// 上位施設に建て替えるほど、より多くのアイドルを抱えられるようになる。
export const TRAINING_FACILITIES = [
  {
    id: "starter_studio",
    name: "簡易レッスンスタジオ",
    description: "事務所設立時から使える最低限の練習部屋。",
    slots: 3,
    statMultiplier: 1.0,
    rosterCapacity: 10,
    purchaseCost: 0, // 初期所持
    monthlyRent: 200000, // 20万円/月
  },
  {
    id: "pro_studio",
    name: "本格レッスンスタジオ",
    description: "防音・鏡張りの本格設備。レッスン効果と1日の枠数が上がる。",
    slots: 5,
    statMultiplier: 1.3,
    rosterCapacity: 18,
    purchaseCost: 400000 * ECONOMY_SCALE,
    monthlyRent: 3000000, // 300万円/月
  },
  {
    id: "flagship_studio",
    name: "旗艦スタジオ",
    description: "複数のブースを備えた大型施設。レッスン効果・枠数がさらに上がる分、家賃も高い。",
    slots: 8,
    statMultiplier: 1.5,
    rosterCapacity: 30,
    purchaseCost: 1200000 * ECONOMY_SCALE,
    monthlyRent: 8000000, // 800万円/月
  },
  {
    id: "grand_tower_studio",
    name: "グランドタワースタジオ",
    description: "自社ビル1棟を丸ごと稽古場にした最上位施設。事務所の規模自体が桁違いになる。",
    slots: 12,
    statMultiplier: 1.7,
    rosterCapacity: 50,
    purchaseCost: 3000000 * ECONOMY_SCALE,
    monthlyRent: 18000000, // 1800万円/月
  },
];

// 事務所設備(TRAINING_FACILITIESとは別枠)。1回買い切りの備品で、家賃のような
// 継続コストは発生せず、所有している間ずっと効果を発揮し続ける
// (gameState.ownedEquipmentIds、office.js: getEquipmentEffects)。
// TRAINING_FACILITIESが「稽古場そのものの規模(枠数・定員・家賃)」を表すのに対し、
// OFFICE_EQUIPMENTは「稽古場に置く個別の備品による細かい上乗せ」という位置づけ。
export const OFFICE_EQUIPMENT = [
  {
    id: "dance_mirror_hall", label: "鏡張り稽古場改修", category: "training",
    description: "壁一面を鏡張りに改修する。レッスンの成長量が底上げされる。",
    cost: 250000 * ECONOMY_SCALE, effect: { trainingStatGainMultiplier: 1.15 },
  },
  {
    id: "recording_booth", label: "自社録音・配信ブース", category: "content",
    description: "簡易収録ブースを常設する。楽曲・YouTube等の投資/コンテンツの収益が上がる。",
    cost: 300000 * ECONOMY_SCALE, effect: { ventureRevenueMultiplier: 1.15 },
  },
  {
    id: "hair_makeup_room", label: "専属ヘアメイク室", category: "risk",
    description: "身だしなみを常に整えられる専属ルームを設ける。悪評・スキャンダルの発生率が下がる。",
    cost: 200000 * ECONOMY_SCALE, effect: { scandalChanceMultiplier: 0.85 },
  },
  {
    id: "gym_room", label: "専用トレーニングジム", category: "wellness",
    description: "体調管理用のジムを設ける。事務所の清廉度が週次でわずかに自然回復するようになる。",
    cost: 220000 * ECONOMY_SCALE, effect: { cleanlinessRegenPerWeek: 2 },
  },
  {
    id: "reception_lounge", label: "来客応接ラウンジ", category: "scout",
    description: "商談用の応接ラウンジを設ける。事務所の格が伝わり、ゴリ押しで積んだ契約金が同じ提示額でも実際の支払いは少なく済むようになる。",
    cost: 260000 * ECONOMY_SCALE, effect: { feeOfferDiscountMultiplier: 0.9 },
  },
  {
    id: "trial_stage_seating", label: "特別観覧席の増設", category: "scout",
    description: "お試しステージの観測係の質が上がり、1項目あたりの単価が下がる。",
    cost: 400000 * ECONOMY_SCALE, effect: { trialCostMultiplier: 0.8 },
  },
];

// トレーナーカタログ。categoryをnullにすると全カテゴリに効果を持つ
// 汎用トレーナーとして扱う。ownedTrainerIds(state.js)に含まれるものだけが
// 効果を発揮する(§7の社員雇用システムで拡張予定、現状は初期雇用なし)。
export const TRAINERS = [
  {
    id: "vocal_trainer_a",
    name: "ボイストレーナー",
    category: "vocal",
    statMultiplier: 1.4,
    hireCostPerDay: 1500 * ECONOMY_SCALE,
  },
  {
    id: "dance_trainer_a",
    name: "ダンストレーナー",
    category: "dance",
    statMultiplier: 1.4,
    hireCostPerDay: 1500 * ECONOMY_SCALE,
  },
  {
    id: "generalist_trainer_a",
    name: "何でも屋トレーナー",
    category: null, // 全カテゴリに薄く効く汎用型
    statMultiplier: 1.15,
    hireCostPerDay: 1200 * ECONOMY_SCALE,
  },
];

// ---------------------------------------------------------------------
// 社員システム(§7)。スカウトマン・マネージャー・プロモーター・エージェントの
// 4職種。所有分はgameState.ownedStaffIdsで管理し、日次(js/office.js)で
// hireCostPerDayが自動引き落とされる(§8「月次決算」の簡易版)。
// 効果はeffectオブジェクトの各キーとして表現し、参照側(office.js/scoutGenerator.js/
// state.js/jobBoard.js)がそれぞれ該当するキーだけを見る。
// ---------------------------------------------------------------------

export const STAFF = [
  { id: "scout_eye", category: "scout", label: "凄腕スカウト（眼力）",
    description: "掘り出し物に出会いやすくなる", hireCostPerDay: 2000 * ECONOMY_SCALE,
    effect: { gemChanceBonus: 0.05 } },
  { id: "scout_deal", category: "scout", label: "敏腕スカウト（交渉力）",
    description: "ゴリ押しで積んだ契約金が同じ提示額でも実際の支払いは少なく済む", hireCostPerDay: 1800 * ECONOMY_SCALE,
    effect: { feeOfferDiscountMultiplier: 0.85 } },
  { id: "scout_network", category: "scout", label: "顔役スカウト（人脈）",
    description: "候補の基礎ステータスが底上げされる", hireCostPerDay: 2200 * ECONOMY_SCALE,
    effect: { statBonus: 8 } },
  { id: "manager_care", category: "manager", label: "ベテランマネージャー（メンタルケア）",
    description: "グレー案件の悪評リスクが下がる", hireCostPerDay: 2500 * ECONOMY_SCALE,
    effect: { scandalChanceMultiplier: 0.6 } },
  { id: "manager_ace", category: "manager", label: "超敏腕マネージャー（全解析）",
    description: "所属タレントの隠しパラメータ(ストレス・天狗度・擦り切れ度)を完全開示する",
    hireCostPerDay: 5000 * ECONOMY_SCALE,
    effect: { revealsMentalStats: true } },
  { id: "promoter_sns", category: "promoter", label: "SNS担当プロモーター",
    description: "成功時のファン増加量が上がる", hireCostPerDay: 2000 * ECONOMY_SCALE,
    effect: { fansGainMultiplier: 1.2 } },
  { id: "promoter_crisis", category: "promoter", label: "火消し担当プロモーター",
    description: "悪評・談合が起きた時のファン減少量が下がる", hireCostPerDay: 2400 * ECONOMY_SCALE,
    effect: { scandalPenaltyMultiplier: 0.5 } },
  { id: "agent_connection", category: "agent", label: "敏腕エージェント（コネクション）",
    description: "オファー選別で1ランク上の仕事も出るようになる", hireCostPerDay: 3000 * ECONOMY_SCALE,
    effect: { rankSkip: 1 } },
];

// ---------------------------------------------------------------------
// フォーメーション定義
// slots: 各枠のリスク/リターンと画面上の座標(%)。exposed=falseの枠は
//   被弾判定の対象にならない（が、scoreMultが0でなければ得点はする）。
// advance: 「送る」を選んだときにどの枠からどの枠へ移動するかの対応表。
// priorityOrder: 被弾対象・予兆の優先順位（露出度が高い枠から順に）。
// sequence: 隊列としての幾何学的な並び順（castSizeで枠を間引くときに使う）。
//   両端から対称に削っても隊列として成立するフォーメーションだけが持つ。
// adjacency: 物理的に隣り合う枠のID一覧。🎭影(shadow)属性の肩代わりや、
//   会場特性「クロスファイア(隣接連鎖型)」の被弾波及先の判定にのみ使う
//   (advanceの巡回順とは無関係)。
// ---------------------------------------------------------------------

export const FORMATIONS = {
  v_conveyor: {
    id: "v_conveyor",
    label: "V字コンベア",
    description: "外側→内側→センター→反対側の内側→外側、と一方通行で送られる",
    slots: [
      { id: "R2", label: "右翼外側", exposed: false, scoreMult: 0.6, staminaCost: 4, heatDelta: 2, x: 84, y: 40 },
      { id: "R1", label: "右翼", exposed: true, scoreMult: 1.8, staminaCost: 14, heatDelta: 8, x: 68, y: 62 },
      { id: "C", label: "センター", exposed: true, scoreMult: 3.2, staminaCost: 22, heatDelta: 15, x: 50, y: 82 },
      { id: "L1", label: "左翼", exposed: true, scoreMult: 1.8, staminaCost: 14, heatDelta: 8, x: 32, y: 62 },
      { id: "L2", label: "左翼外側", exposed: false, scoreMult: 0.6, staminaCost: 4, heatDelta: 2, x: 16, y: 40 },
    ],
    sequence: ["R2", "R1", "C", "L1", "L2"],
    advance: { R2: "R1", R1: "C", C: "L1", L1: "L2", L2: "R2" },
    priorityOrder: ["C", "R1", "L1", "R2", "L2"],
    adjacency: { R2: ["R1"], R1: ["R2", "C"], C: ["R1", "L1"], L1: ["C", "L2"], L2: ["L1"] },
  },

  two_row: {
    id: "two_row",
    label: "2列陣形",
    description: "前後2列。送ると前列と後列がまるごと入れ替わる",
    slots: [
      { id: "F1", label: "前列・左", exposed: true, scoreMult: 2.6, staminaCost: 20, heatDelta: 12, x: 32, y: 68 },
      { id: "F2", label: "前列・右", exposed: true, scoreMult: 2.6, staminaCost: 20, heatDelta: 12, x: 68, y: 68 },
      { id: "B1", label: "後列・左", exposed: false, scoreMult: 0, staminaCost: -20, heatDelta: -10, x: 32, y: 30 },
      { id: "B2", label: "後列・右", exposed: false, scoreMult: 0, staminaCost: -20, heatDelta: -10, x: 68, y: 30 },
    ],
    advance: { F1: "B1", F2: "B2", B1: "F1", B2: "F2" },
    priorityOrder: ["F1", "F2", "B1", "B2"],
    adjacency: { F1: ["F2", "B1"], F2: ["F1", "B2"], B1: ["F1", "B2"], B2: ["F2", "B1"] },
  },

  // 小編成(3人)向け。CM出演・雑誌グラビア・ラジオのような少人数の仕事枠で
  // 使う想定。中央が最も目立つ、シンプルな三角形。
  trio_fan: {
    id: "trio_fan",
    label: "トリオ編成",
    description: "中央→左→右と一方通行で送られる、少人数向けのシンプルな3人編成",
    slots: [
      { id: "C", label: "センター", exposed: true, scoreMult: 2.4, staminaCost: 18, heatDelta: 12, x: 50, y: 80 },
      { id: "L", label: "左", exposed: true, scoreMult: 1.4, staminaCost: 10, heatDelta: 6, x: 28, y: 55 },
      { id: "R", label: "右", exposed: true, scoreMult: 1.4, staminaCost: 10, heatDelta: 6, x: 72, y: 55 },
    ],
    sequence: ["C", "L", "R"],
    advance: { C: "L", L: "R", R: "C" },
    priorityOrder: ["C", "L", "R"],
    adjacency: { C: ["L", "R"], L: ["C"], R: ["C"] },
  },

  // 大編成(7人)向け。大型イベント/アワード相当の仕事枠で使う想定の
  // 扇形フォーメーション。外側2枠(R3/L3)はV字コンベアの外側同様、
  // 露出しない安全枠として休息にも使える。
  grand_septet: {
    id: "grand_septet",
    label: "グランド扇形陣形",
    description: "外側→中列→内側→センター→反対側、と一方通行で送られる大型の7人編成",
    slots: [
      { id: "R3", label: "右翼最外", exposed: false, scoreMult: 0.5, staminaCost: 3, heatDelta: 1, x: 92, y: 32 },
      { id: "R2", label: "右翼外", exposed: true, scoreMult: 1.2, staminaCost: 9, heatDelta: 5, x: 80, y: 52 },
      { id: "R1", label: "右翼", exposed: true, scoreMult: 2.0, staminaCost: 15, heatDelta: 9, x: 66, y: 70 },
      { id: "C", label: "センター", exposed: true, scoreMult: 3.4, staminaCost: 24, heatDelta: 16, x: 50, y: 86 },
      { id: "L1", label: "左翼", exposed: true, scoreMult: 2.0, staminaCost: 15, heatDelta: 9, x: 34, y: 70 },
      { id: "L2", label: "左翼外", exposed: true, scoreMult: 1.2, staminaCost: 9, heatDelta: 5, x: 20, y: 52 },
      { id: "L3", label: "左翼最外", exposed: false, scoreMult: 0.5, staminaCost: 3, heatDelta: 1, x: 8, y: 32 },
    ],
    sequence: ["R3", "R2", "R1", "C", "L1", "L2", "L3"],
    advance: { R3: "R2", R2: "R1", R1: "C", C: "L1", L1: "L2", L2: "L3", L3: "R3" },
    priorityOrder: ["C", "R1", "L1", "R2", "L2", "R3", "L3"],
    adjacency: {
      R3: ["R2"], R2: ["R3", "R1"], R1: ["R2", "C"], C: ["R1", "L1"],
      L1: ["C", "L2"], L2: ["L1", "L3"], L3: ["L2"],
    },
  },

  // 完全ソロ(1人)向け。送る(advance)先が自分自身しかなく、ずっと同じ
  // スポットライトに立ち続ける。休める枠が無い代わりにscoreMultは全陣形中
  // 最大。ソロ写真集・単独インタビューなど「1人だけの仕事」用。
  solo_spotlight: {
    id: "solo_spotlight",
    label: "ソロスポットライト",
    description: "たった1人だけのスポットライト。休める枠は無く、ずっと同じ場所に立ち続ける",
    slots: [
      { id: "C", label: "センター", exposed: true, scoreMult: 4.0, staminaCost: 26, heatDelta: 18, x: 50, y: 76 },
    ],
    sequence: ["C"],
    advance: { C: "C" },
    priorityOrder: ["C"],
    adjacency: { C: [] },
  },

  // デュオ(2人)向け。2人とも常に露出したまま、送るたびに役割(メイン/サブ)が
  // 入れ替わる「ミラー」形式。休める枠はない。
  duo_mirror: {
    id: "duo_mirror",
    label: "デュオミラー",
    description: "2人とも常に前へ。送ると役割(メイン/サブ)がまるごと入れ替わる",
    slots: [
      { id: "A", label: "メイン", exposed: true, scoreMult: 2.6, staminaCost: 18, heatDelta: 12, x: 38, y: 74 },
      { id: "B", label: "サブ", exposed: true, scoreMult: 2.0, staminaCost: 14, heatDelta: 9, x: 62, y: 74 },
    ],
    sequence: ["A", "B"],
    advance: { A: "B", B: "A" },
    priorityOrder: ["A", "B"],
    adjacency: { A: ["B"], B: ["A"] },
  },

  // 4人向けの別案(2列陣形の代わり)。前衛1人+左右の衛+後衛1人のひし形。
  // 2列陣形が「前後まるごと入れ替え」なのに対し、こちらは一方通行で
  // 巡回するタイプの4人編成。
  quartet_diamond: {
    id: "quartet_diamond",
    label: "ダイヤモンド編成",
    description: "前衛→左衛→右衛→後衛→前衛、と一方通行で送られるひし形の4人編成",
    slots: [
      { id: "F", label: "前衛", exposed: true, scoreMult: 2.8, staminaCost: 20, heatDelta: 13, x: 50, y: 82 },
      { id: "L", label: "左衛", exposed: true, scoreMult: 1.6, staminaCost: 12, heatDelta: 7, x: 25, y: 58 },
      { id: "R", label: "右衛", exposed: true, scoreMult: 1.6, staminaCost: 12, heatDelta: 7, x: 75, y: 58 },
      { id: "B", label: "後衛", exposed: false, scoreMult: 0.4, staminaCost: 2, heatDelta: 1, x: 50, y: 32 },
    ],
    sequence: ["F", "L", "R", "B"],
    advance: { F: "L", L: "R", R: "B", B: "F" },
    priorityOrder: ["F", "L", "R", "B"],
    adjacency: { F: ["L", "R"], L: ["F", "B"], R: ["F", "B"], B: ["L", "R"] },
  },

  // 6人向け(トリオとグランド扇形の間を埋める中規模編成)。中央枠を持たず、
  // 前列2人+中列2人+後列2人(センターレスの左右対称アンサンブル)。
  hex_wheel: {
    id: "hex_wheel",
    label: "ヘクスホイール編成",
    description: "外側→中列→前列→反対側、と一方通行で送られる中規模の6人編成(センター無し)",
    slots: [
      { id: "R3", label: "右翼最外", exposed: false, scoreMult: 0.5, staminaCost: 3, heatDelta: 1, x: 90, y: 32 },
      { id: "R2", label: "右翼中列", exposed: true, scoreMult: 1.3, staminaCost: 9, heatDelta: 5, x: 76, y: 54 },
      { id: "R1", label: "右翼前列", exposed: true, scoreMult: 2.2, staminaCost: 16, heatDelta: 10, x: 60, y: 74 },
      { id: "L1", label: "左翼前列", exposed: true, scoreMult: 2.2, staminaCost: 16, heatDelta: 10, x: 40, y: 74 },
      { id: "L2", label: "左翼中列", exposed: true, scoreMult: 1.3, staminaCost: 9, heatDelta: 5, x: 24, y: 54 },
      { id: "L3", label: "左翼最外", exposed: false, scoreMult: 0.5, staminaCost: 3, heatDelta: 1, x: 10, y: 32 },
    ],
    sequence: ["R3", "R2", "R1", "L1", "L2", "L3"],
    advance: { R3: "R2", R2: "R1", R1: "L1", L1: "L2", L2: "L3", L3: "R3" },
    priorityOrder: ["R1", "L1", "R2", "L2", "R3", "L3"],
    adjacency: {
      R3: ["R2"], R2: ["R3", "R1"], R1: ["R2", "L1"], L1: ["R1", "L2"], L2: ["L1", "L3"], L3: ["L2"],
    },
  },
};

// ---------------------------------------------------------------------
// 会場特性（ダメージパターン、§3.8）。仕事ごとにstage.damagePatternIdで
// 割り当てる。同じ期待値ライン・同じ編成でも、被弾の散らばり方が違うだけで
// まったく別の立ち回りが要求される。対象選定ロジック自体はbattle.js側に
// 実装するが、数値・種別はすべてここに集約する。
//
// targeting種別:
//   random             … 露出中の枠からランダムに1箇所(単体ランダム型のデフォルト)
//   all_exposed        … 露出中の枠すべて(前列一斉型)
//   all_present        … 出演中の全員(バックステージ含む、ジリ貧全体型)
//   lowest_stamina     … その時点でスタミナが最も少ないメンバー(狙い撃ち型)
//   center             … センター(最高scoreMult枠)固定(スポットライト型)
//   anti_trend         … トレンドに逆行する属性のメンバー優先(相性型)
//   random_multi       … ランダムに複数名、重複無し(暴走型)
//   random_repeat      … ランダムに複数回抽選、同一メンバーへの連続被弾もあり得る(乱打型)
//   chorus_burst       … chorusIntervalの周期の曲だけ、露出中の枠全員に大ダメージ(クライマックス型)
//   countdown_burst     … countdownIntervalの周期で確実に露出中の枠全員に大ダメージ(時限型)
//   lowest_fans        … ファン人気(idol.fans)が最も低いメンバー優先(人気投票型)
//   highest_instability … ストレス・天狗度(§4.3、完全隠蔽)の合計が最も高いメンバー優先(メンタル連動型)
// ---------------------------------------------------------------------

export const DAMAGE_PATTERNS = {
  single_random: {
    id: "single_random",
    label: "単体ランダム(気まぐれ型)",
    targeting: "random",
  },
  front_volley: {
    id: "front_volley",
    label: "前列一斉(熱狂型)",
    targeting: "all_exposed",
  },
  focus_weakest: {
    id: "focus_weakest",
    label: "狙い撃ち(弱肉強食型)",
    targeting: "lowest_stamina",
  },
  center_spotlight: {
    id: "center_spotlight",
    label: "センター集中(スポットライト型)",
    targeting: "center",
  },
  crossfire: {
    id: "crossfire",
    label: "クロスファイア(隣接連鎖型)",
    targeting: "random",
    chainToAdjacent: true,
    chainDamageRatio: 0.6, // 隣接メンバーへの波及ダメージは本体の60%
  },
  chaos_random: {
    id: "chaos_random",
    label: "無差別乱舞(暴走型)",
    targeting: "random_multi",
    hits: 2,
  },
  anti_trend_focus: {
    id: "anti_trend_focus",
    label: "属性狙い撃ち(相性型)",
    targeting: "anti_trend",
  },
  recovery_seal: {
    id: "recovery_seal",
    label: "回復封じ(灼熱型)",
    targeting: "random",
    recoveryMultiplier: 0.35, // バックステージ等の回復量(負のstaminaCost)を大幅減衰
  },
  attrition: {
    id: "attrition",
    label: "ジリ貧全体(消耗戦型)",
    targeting: "random", // 予兆による単発被弾は残しつつ、全員への薄いチップダメージも別途発生
    chipDamageAmount: 3,
  },
  target_creep: {
    id: "target_creep",
    label: "目標の逆行(ステージHP回復型)",
    targeting: "random",
    targetCreepPerTurn: 0.015, // 毎ターン、期待値ラインが元の値のこの割合ぶん伸びる
  },
  consecutive_random: {
    id: "consecutive_random",
    label: "連続ランダム(乱打型)",
    targeting: "random_repeat", // random_multiと違い同一メンバーへの連続被弾もあり得る(重複を許した抽選)
    hits: 3,
  },
  // タイミング型(GDD§3.8-B)。turnPhaseの概念を持たないこの実装では、
  // ターンカウンタの周期そのもの(interval)を「サビ」「カウントダウン」の
  // 到来タイミングとして扱う(primeTelegraph側で特別扱いする)。
  chorus_burst: {
    id: "chorus_burst",
    label: "サビ限定集中砲火(クライマックス型)",
    targeting: "chorus_burst",
    chorusInterval: 4, // この周期の曲(4,8,12...曲目)だけ被弾が発生する
    burstAmount: 26,   // その代わり被弾すれば前列全体に大ダメージ(通常の約2.6倍)
  },
  countdown_burst: {
    id: "countdown_burst",
    label: "カウントダウン爆発(時限型)",
    targeting: "countdown_burst",
    countdownInterval: 3, // 3曲ごとに確実に大技が来る(読んでバックステージへ退避できる)
    burstAmount: 22,
  },
  // キャラの状態と連動するパターン(GDD§3.8-C)。
  popularity_focus: {
    id: "popularity_focus",
    label: "人気投票型(不人気狙い撃ち)",
    targeting: "lowest_fans", // ファン人気(idol.fans)が最も低いメンバーを優先して狙う
  },
  mental_focus: {
    id: "mental_focus",
    label: "メンタル連動型(不安定狙い撃ち)",
    targeting: "highest_instability", // ストレス・天狗度(§4.3、完全隠蔽)が高いメンバーほど狙われる
  },
};

// ---------------------------------------------------------------------
// スカウト候補ランダム生成用のマスターデータ
// ---------------------------------------------------------------------

// 名字は「1文字目の漢字プール(100字)×2文字目の漢字プール(100字)」の組み合わせで
// 動的に生成する(合計200字の漢字から、理論上は100×100=10,000通りの姓が
// 作れる)。scoutGenerator.jsがSURNAME_FIRST_KANJI/SURNAME_SECOND_KANJIから
// それぞれ1字ずつ選んで連結し、姓を組み立てる。
// §6「キャラ名生成」。名字ランキング上位でよく使われる漢字だけをパーツに
// 使い、実在感のある名字を組み合わせで生成する(架空の当て字は使わない)。
// 1文字目/2文字目それぞれ実在の名字によく現れる漢字60字ずつ(計120字)を
// プールし、掛け合わせで3600通り以上の組み合わせを作る。
export const SURNAME_FIRST_KANJI = [
  "佐", "鈴", "高", "田", "渡", "伊", "山", "中", "小", "加",
  "吉", "井", "木", "林", "斎", "清", "森", "池", "橋", "阿",
  "石", "前", "岡", "長", "藤", "後", "近", "村", "遠", "青",
  "坂", "福", "太", "西", "金", "三", "松", "原", "竹", "和",
  "上", "柴", "酒", "菊", "工", "横", "宮", "内", "安", "谷",
  "大", "丸", "今", "浜", "野", "新", "葉", "桜", "平", "千",
];

export const SURNAME_SECOND_KANJI = [
  "藤", "木", "橋", "田", "本", "村", "山", "川", "野", "井",
  "上", "下", "沢", "崎", "谷", "原", "島", "口", "石", "森",
  "水", "海", "見", "宮", "部", "辺", "倉", "浦", "岡", "内",
  "生", "美", "代", "子", "介", "太", "郎", "尾", "松", "竹",
  "梅", "柳", "坂", "堂", "園", "里", "郷", "塚", "保", "西",
  "岸", "望", "秋", "杉", "久", "星", "服", "宅", "岩", "平",
];

export const GIVEN_NAMES = [
  "まひろ", "つばき", "のあ", "かのん", "ゆき", "りん", "ごう", "あかり", "みお", "ひなた",
  "さくら", "つむぎ", "こはる", "いろは", "ゆずき", "まゆ", "せな", "りお", "あおい", "すず",
  "みゆ", "ののか", "いちか", "ここな", "うた", "ひまり", "つき", "ましろ", "こより", "しずく",
  "ういと", "かんな", "みなも", "さやか", "ほのか", "あさひ", "ゆあ", "みう", "りこ", "えま",
  "そら", "はな", "ここ", "ひより", "あまね", "ゆの", "さき", "みさき", "かえで", "もえ",
  "りずむ", "ゆいな", "あんな", "みらい", "のどか", "ちひろ", "まなつ", "なぎさ", "ふうか", "さつき",
  "はるひ", "ことは", "まある", "みずき", "りせ", "かこ", "ちなつ", "ひなこ", "ゆづき", "いろり",
  "あんじゅ", "ひびき", "みこと", "さと", "かのこ", "ゆらら", "もあ", "りひと", "ちさと", "まひる",
  "このは", "しおり", "ゆまり", "あかね", "ののこ", "ひなの", "まりん", "ゆづは", "さやの", "みずは",
  "このみ", "あさの", "ゆらぎ", "ちとせ", "まひな", "りずな", "ひなか", "ゆきの", "かなで", "もな",
];

// バトル再設計(客席ボード方式)の14属性。各属性は「攻撃/防御/回復」の3軸
// プロファイル(atk/def/heal、1〜5)と、固定で1つ持つ属性特性(traitLabel)だけを
// 持つ。個別の特殊計算式は持たず、3軸の数値はBALANCE.attributeScalingの共通係数で
// ゲーム内効果量に変換する(battle.js側)。
//
// role: "attacker"(攻撃特化) | "defender"(防御特化) | "supporter"(支援特化) |
//   "allrounder"(万能・レア限定)。
// shape: 攻撃の形(ATTACK_SHAPESのキー)。attacker/allrounderのみ持つ
//   (defender/supporterの攻撃寄与はshape省略時のデフォルト"random"を使う)。
// effect: 防御/支援の個性("reduction"軽減 | "substitution"身代わり | "counter"反撃 |
//   "buff"攻撃バフ | "heal"回復 | "rally"鼓舞)。defender/supporter/allrounderのみ持つ。
// rarity: 1(★1・出現しやすい)〜5(★5・最も希少)。
export const ATTRIBUTES = [
  { key: "star", label: "🌟 星", role: "attacker", rarity: 1, atk: 4, def: 1, heal: 1, shape: "snipe", traitLabel: "スポットライト" },
  { key: "rock", label: "🗿 岩", role: "defender", rarity: 1, atk: 2, def: 4, heal: 1, effect: "reduction", traitLabel: "岩盤" },
  { key: "ice", label: "❄️ 氷", role: "supporter", rarity: 1, atk: 2, def: 1, heal: 4, effect: "heal", traitLabel: "癒しの氷雨" },
  { key: "thunder", label: "⚡ 雷", role: "attacker", rarity: 2, atk: 4, def: 2, heal: 2, shape: "pierce", traitLabel: "一閃" },
  { key: "shadow", label: "🎭 影", role: "defender", rarity: 2, atk: 2, def: 4, heal: 2, effect: "substitution", traitLabel: "身代わり" },
  { key: "wave", label: "🌊 波", role: "attacker", rarity: 2, atk: 3, def: 2, heal: 4, shape: "multiHit", traitLabel: "波状攻撃" },
  { key: "flame", label: "🔥 炎", role: "attacker", rarity: 3, atk: 5, def: 2, heal: 3, shape: "splash", traitLabel: "延焼" },
  { key: "moon", label: "🌙 陰", role: "attacker", rarity: 3, atk: 3, def: 4, heal: 3, shape: "ranged", traitLabel: "月明かり" },
  { key: "flower", label: "🌸 華", role: "supporter", rarity: 3, atk: 2, def: 4, heal: 4, effect: "buff", traitLabel: "華の支援" },
  { key: "sun", label: "☀️ 陽", role: "attacker", rarity: 4, atk: 5, def: 3, heal: 3, shape: "all", traitLabel: "陽だまり" },
  { key: "storm", label: "🌪 嵐", role: "defender", rarity: 4, atk: 3, def: 5, heal: 3, effect: "counter", traitLabel: "返り討ち" },
  { key: "rainbow", label: "🌈 虹", role: "supporter", rarity: 4, atk: 3, def: 3, heal: 5, effect: "rally", traitLabel: "鼓舞" },
  { key: "light", label: "✨ 光", role: "allrounder", rarity: 5, atk: 4, def: 4, heal: 4, shape: "splash", effect: "reduction", traitLabel: "万能の光" },
  { key: "dark", label: "🌑 闇", role: "allrounder", rarity: 5, atk: 5, def: 3, heal: 5, shape: "pierce", effect: "heal", traitLabel: "隠れた一撃" },
];

// 攻撃の形(§ATTRIBUTES.shape参照)。targetingの語彙はDAMAGE_PATTERNSと対称的に揃えてある。
export const ATTACK_SHAPES = {
  snipe: { label: "🎯 狙い撃ち", targeting: "single_priority" }, // 客席ボードの優先ブロック(HPが低い方)に集中
  splash: { label: "💥 範囲", targeting: "single_plus_adjacent" }, // 対象ブロック+盤面上の隣接ブロック
  all: { label: "🌐 全体", targeting: "all" }, // 全ブロックに薄く
  pierce: { label: "🗡 貫通", targeting: "column" }, // 同じ列(縦3ブロック)を一直線に貫く
  multiHit: { label: "🔁 連続", targeting: "single_twice" }, // 同一ブロックに2回ヒット
  ranged: { label: "🏹 遠距離", targeting: "single_priority", ignoresExposedRequirement: true }, // 非露出スロットでも攻撃できる
  random: { label: "気まぐれ", targeting: "random" }, // shape未指定(defender/supporter)のデフォルト攻撃
};

// 客席ボード(3×3、§客席ボード)。row0=審査員列(狙い撃ち向け・高weight)、
// row1=客席列(範囲向け・中weight)、row2=関係者列(全体向け・低weight)。
// 各ブロックのmaxHpは、ステージのtargetScoreをweight比で配分して決める
// (battle.js側)。列(col)はATTACK_SHAPES.pierceの対象決定に使う。
// 客席レイアウト(§ボリューム拡張)。各レイアウトは{ cols, rows, blocks }の形。
// blocksの個数は必ずcols×rowsと一致させ、row/colは0始まりでcols/rows未満に
// 収める(battleView.js側がcols/rowsから実際のCSSグリッドを組み立てるため)。
// row/colはATTACK_SHAPESのcolumn狙い・row近隣splashの対象決定にも使われる
// (battle.js)。stage.audienceLayoutIdで選択し、未指定は"standard_hall"に
// フォールバックする(battle.js: createBattleState)。
// 会場規模はcastSizeと大まかに対応させる想定: 1人→solo_focus、2人→
// duo_spotlight、3人→trio_intimate、6人→hex_theater、それ以外(4〜7人の
// フルキャスト)→3×3の4レイアウト(standard_hall/broadcast_studio/
// arena_award/radio_booth)。
export const AUDIENCE_BOARD_LAYOUTS = {
  // ソロ仕事(1人)向け。世間の目そのものが1枚の壁として立ちはだかる。
  solo_focus: {
    cols: 1, rows: 1,
    blocks: [
      { id: "public_eye", label: "世間の目", icon: "👁️", row: 0, col: 0, weight: 1 },
    ],
  },
  // デュオ仕事(2人)向け。
  duo_spotlight: {
    cols: 2, rows: 1,
    blocks: [
      { id: "judge_duo", label: "審査員", icon: "🧑‍⚖️", row: 0, col: 0, weight: 1.3 },
      { id: "crowd_duo", label: "観客", icon: "👥", row: 0, col: 1, weight: 1.0 },
    ],
  },
  // トリオ仕事(3人)向け。CM・グラビア・ラジオのような少人数の仕事枠で使う。
  trio_intimate: {
    cols: 3, rows: 1,
    blocks: [
      { id: "judge_trio", label: "審査員", icon: "🧑‍⚖️", row: 0, col: 0, weight: 1.3 },
      { id: "crowd_trio", label: "客席", icon: "👥", row: 0, col: 1, weight: 1.0 },
      { id: "crew_trio", label: "スタッフ", icon: "🎬", row: 0, col: 2, weight: 0.8 },
    ],
  },
  // 中規模(6人、hex_wheel向け)。2列×3列の小劇場ライクな構成。
  hex_theater: {
    cols: 3, rows: 2,
    blocks: [
      { id: "judge_a", label: "審査員A", icon: "🧑‍⚖️", row: 0, col: 0, weight: 1.3 },
      { id: "judge_b", label: "審査員B", icon: "🧑‍⚖️", row: 0, col: 1, weight: 1.3 },
      { id: "judge_c", label: "審査員C", icon: "🧑‍⚖️", row: 0, col: 2, weight: 1.3 },
      { id: "crowd_l", label: "客席・左", icon: "👥", row: 1, col: 0, weight: 0.9 },
      { id: "crowd_c", label: "客席・中央", icon: "👥", row: 1, col: 1, weight: 0.9 },
      { id: "crowd_r", label: "客席・右", icon: "👥", row: 1, col: 2, weight: 0.9 },
    ],
  },
  // ライブ・舞台・コラボ企画などの標準的な会場(フルキャスト向け)。
  standard_hall: {
    cols: 3, rows: 3,
    blocks: [
      { id: "judge_a", label: "審査員A", icon: "🧑‍⚖️", row: 0, col: 0, weight: 1.4 },
      { id: "judge_b", label: "審査員B", icon: "🧑‍⚖️", row: 0, col: 1, weight: 1.4 },
      { id: "judge_c", label: "審査員C", icon: "🧑‍⚖️", row: 0, col: 2, weight: 1.4 },
      { id: "crowd_l", label: "客席・左", icon: "👥", row: 1, col: 0, weight: 1.0 },
      { id: "crowd_c", label: "客席・中央", icon: "👥", row: 1, col: 1, weight: 1.0 },
      { id: "crowd_r", label: "客席・右", icon: "👥", row: 1, col: 2, weight: 1.0 },
      { id: "crew_broadcast", label: "中継クルー", icon: "📷", row: 2, col: 0, weight: 0.7 },
      { id: "crew_sns", label: "SNS実況勢", icon: "📱", row: 2, col: 1, weight: 0.7 },
      { id: "crew_fan", label: "常連ファン", icon: "🎫", row: 2, col: 2, weight: 0.7 },
    ],
  },
  // ドラマ・CM・グラビア・映画などの撮影現場(フルキャスト向け)。審査員の
  // 代わりに監督/プロデューサー/スポンサーが判定役になる。
  broadcast_studio: {
    cols: 3, rows: 3,
    blocks: [
      { id: "director", label: "監督", icon: "🎬", row: 0, col: 0, weight: 1.4 },
      { id: "producer", label: "プロデューサー", icon: "🎥", row: 0, col: 1, weight: 1.4 },
      { id: "sponsor", label: "スポンサー", icon: "💼", row: 0, col: 2, weight: 1.4 },
      { id: "staff_lighting", label: "照明部", icon: "💡", row: 1, col: 0, weight: 1.0 },
      { id: "staff_camera", label: "カメラマン", icon: "📸", row: 1, col: 1, weight: 1.0 },
      { id: "staff_styling", label: "スタイリスト", icon: "👗", row: 1, col: 2, weight: 1.0 },
      { id: "crew_pr", label: "広報", icon: "📰", row: 2, col: 0, weight: 0.7 },
      { id: "crew_sns", label: "SNS担当", icon: "📱", row: 2, col: 1, weight: 0.7 },
      { id: "crew_fan", label: "見学ファン", icon: "🎫", row: 2, col: 2, weight: 0.7 },
    ],
  },
  // 大型イベント/アワード相当(tier5・milestone、フルキャスト向け)。
  // 全体的にweightが高く、客席ボードの手強さそのものが「大舞台」を表現する。
  arena_award: {
    cols: 3, rows: 3,
    blocks: [
      { id: "judge_chief", label: "審査員長", icon: "🏆", row: 0, col: 0, weight: 1.6 },
      { id: "judge_a", label: "審査員", icon: "🧑‍⚖️", row: 0, col: 1, weight: 1.4 },
      { id: "judge_b", label: "審査員", icon: "🧑‍⚖️", row: 0, col: 2, weight: 1.4 },
      { id: "press_row", label: "プレス席", icon: "📰", row: 1, col: 0, weight: 1.2 },
      { id: "crowd_arena", label: "大観衆", icon: "👥", row: 1, col: 1, weight: 1.2 },
      { id: "vip_seat", label: "VIP席", icon: "🎩", row: 1, col: 2, weight: 1.2 },
      { id: "crew_broadcast", label: "中継クルー", icon: "📷", row: 2, col: 0, weight: 0.9 },
      { id: "crew_sns", label: "SNSトレンド勢", icon: "📱", row: 2, col: 1, weight: 0.9 },
      { id: "crew_fanclub", label: "公式ファンクラブ", icon: "🎫", row: 2, col: 2, weight: 0.9 },
    ],
  },
  // ラジオ番組収録(フルキャスト向け)。客席の代わりにリスナーが並ぶ構成。
  radio_booth: {
    cols: 3, rows: 3,
    blocks: [
      { id: "producer_booth", label: "音響ブース", icon: "🎚️", row: 0, col: 0, weight: 1.3 },
      { id: "guest_host", label: "共演者", icon: "🎙️", row: 0, col: 1, weight: 1.2 },
      { id: "sponsor_slot", label: "提供読み", icon: "💼", row: 0, col: 2, weight: 1.1 },
      { id: "listener_call", label: "電話出演リスナー", icon: "📞", row: 1, col: 0, weight: 1.0 },
      { id: "listener_postcard", label: "お便りリスナー", icon: "✉️", row: 1, col: 1, weight: 1.0 },
      { id: "listener_web", label: "配信リスナー", icon: "💻", row: 1, col: 2, weight: 1.0 },
      { id: "crew_engineer", label: "音声さん", icon: "🎛️", row: 2, col: 0, weight: 0.7 },
      { id: "crew_sns", label: "実況勢", icon: "📱", row: 2, col: 1, weight: 0.7 },
      { id: "crew_fan", label: "収録見学ファン", icon: "🎫", row: 2, col: 2, weight: 0.7 },
    ],
  },
};

export const SCOUT_STAT_KEYS = ["vocal", "dance", "talk", "acting", "looks", "charm", "mental"];

// お試しステージによる目利き(§スカウトに賭けと発見を持たせる)。契約前の候補は
// 7ステータス+成長度+資質グレードの計9項目が基本的に伏せられており
// (性格タイプ・属性・年齢・経歴・志望職種は実力に直結しないフレーバーとして
// 常に見える)、観客席にコーチを座らせて実際にお試しステージを見ることで
// 初めて特定の項目が判明する。契約済みタレントは今まで通り全項目を即開示する
// (statGrowthChartHtml/idolDetailView.jsは無条件表示のまま)。
// growthDegree(成長度、scoutGenerator.js: getGrowthPhase参照)は「今どのくらい
// 育っているか」だけを表し、成長パターン(早熟/大器晩成などの曲線の形
// そのもの)は雇うまでずっと伏せたまま(観測しても分からない)にする。
// qualityGrade/subQualityGradeはここに含めない(直接観測する枠を作らない)。
// 元になる7ステータスが個別に観測済みになった時点でstate.js: getParamRevealState
// が自動導出する(主評価=志望職種の関連4ステータス、サブ評価=残り3ステータス、
// それぞれ全部観測済みで初めて開示)。
export const OBSERVABLE_SCOUT_PARAMS = [...SCOUT_STAT_KEYS, "growthDegree"];

// 総合評価ランク(S〜G)。開示済みステータスの平均値をここに当てはめる
// (js/ui.jsのoverallRank()。§4.1の情報非対称性を踏まえ、未開示のカテゴリは
// 平均の算出から除外し、開示済みのカテゴリが1つも無ければ"?"を返す)。
export const RANK_THRESHOLDS = [
  { min: 90, label: "S" },
  { min: 80, label: "A" },
  { min: 68, label: "B" },
  { min: 55, label: "C" },
  { min: 42, label: "D" },
  { min: 28, label: "E" },
  { min: 15, label: "F" },
  { min: -Infinity, label: "G" },
];

export function rankLabel(statAverage) {
  return RANK_THRESHOLDS.find((r) => statAverage >= r.min).label;
}

// 「持ち曲」(§8個人情報)の候補プール。新規タレントの初期持ち曲や、
// 今後のタスク的な曲制作コマンドで使う想定。
export const SONG_NAME_POOL = [
  "スターダストコーリング", "ネオンレイン", "夜明けのプロローグ", "カラフルリグレット",
  "アンリミテッドスマイル", "パラレルハート", "シークレットガーデン", "トゥルーカラーズ",
  "ミッドナイトパレード", "エンドレスサマー", "グラデーションスカイ", "ワンモアステップ",
  "ドリームチェイサー", "リフレクション", "オーロラダンス", "フューチャーコード",
];

// 顔グラフィックのスプライトシート(art-pipeline/sheets/生成物)。
// 320人ぶんを8x8グリッド×5シートで持つ。実ファイルはart-pipeline/sheets/
// からゲーム側の適切な場所へコピーして参照する想定。
export const PORTRAIT_SHEETS = {
  cellSize: 256,
  gridSize: 8, // 8x8 = 64人/シート
  sheets: [
    { id: "sheet1", file: "assets/portraits/sheet1.webp" },
    { id: "sheet2", file: "assets/portraits/sheet2.webp" },
    { id: "sheet3", file: "assets/portraits/sheet3.webp" },
    { id: "sheet4", file: "assets/portraits/sheet4.webp" },
    { id: "sheet5", file: "assets/portraits/sheet5.webp" },
    { id: "sheet6", file: "assets/portraits/sheet6.webp" },
    { id: "sheet7", file: "assets/portraits/sheet7.webp" },
  ],
};

// サンプルステージ（フォーメーションはstage側が指定する）
//
// turnLimitMode: "songs" ならターン上限＝事務所の持ち曲数(gameState.songCount)。
//   曲を増やすほど長丁場のライブに耐えられるようになる、成長する上限。
//   "fixed" なら stage.maxTurns が上限（＝尺）。TV/映画は放送・上映枠が
//   決まっているので、持ち曲と違って伸ばせない固定値として扱う。
// scoreStats: スコア計算に使うステータスのキー(2つの平均)。ライブは
//   Vocal/Dance、ドラマ映画はActing/Looksのように差し替えられる。
// castSize: フォーメーションの全枠数より少ない人数を先方が指定してきた
//   場合に使う。省略時はフォーメーションの全枠を使う。
// clientTier: "clean"(クリーン)/"gray"(グレー)。BALANCE.clientTiersの係数が
//   期待値ライン・報酬・スタミナ経済に乗る(§6.2)。
// trendAttribute: 今このステージで追い風になっている属性キー(§11簡易版)。
//   一致する属性のメンバーはBALANCE.trend.matchedMultiplierの恩恵を受ける。
// recommendedStatLevel: この仕事が想定する編成の平均ステータス目安。
//   実際の編成の平均がこれをBALANCE.barter.statGapThreshold以上下回ると
//   「バーター営業」判定になる(§6.2)。
// minRankId: このIDのランク(AGENCY_RANKS)に到達するまで一覧に出さない。
//   未指定は無名事務所からでも解放済み。
// damagePatternId: DAMAGE_PATTERNSのキー(§3.8)。未指定はsingle_random扱い。
// category: 仕事の種別(表示・フィルタ用のラベル)。"live"(ライブ)/"drama"(ドラマ)/
//   "variety"(バラエティ)/"cm"(CM出演)/"gravure"(雑誌グラビア)/
//   "stage_play"(舞台)/"radio"(ラジオ)。判定ロジック自体はscoreStatsの
//   組み合わせだけで決まるため、categoryは表示上の分類に過ぎない。
// 手作りの11件(stage_001〜stage_011)。stage_006/007は甲子園相当の
// マイルストーンとして個別に調整してあるため、生成ロジックの対象外にしてある。
const HAND_AUTHORED_STAGES = [
  {
    id: "stage_001",
    name: "スーパーの屋上",
    tier: 1,
    tierLabel: "Tier 1 ・ ドブ板営業",
    category: "live",
    formationId: "v_conveyor",
    turnLimitMode: "songs",
    turnUnitLabel: "曲目",
    scoreStats: ["vocal", "dance"],
    targetScore: 2600,
    rewardCash: 30000 * ECONOMY_SCALE,
    rewardFans: 200,
    clientTier: "clean",
    trendAttribute: "sun",
    recommendedStatLevel: 50,
    damagePatternId: "front_volley",
  },
  {
    id: "stage_002",
    name: "地下アイドルフェス",
    tier: 1,
    tierLabel: "Tier 1 ・ 対バンイベント",
    category: "live",
    formationId: "two_row",
    turnLimitMode: "songs",
    turnUnitLabel: "曲目",
    scoreStats: ["vocal", "dance"],
    targetScore: 1500,
    rewardCash: 18000 * ECONOMY_SCALE,
    rewardFans: 140,
    clientTier: "clean",
    trendAttribute: "flower",
    recommendedStatLevel: 45,
    damagePatternId: "crossfire",
  },
  {
    id: "stage_003",
    name: "深夜ドラマ「約束の夜に」",
    tier: 1,
    tierLabel: "Tier 1 ・ 単発ドラマ出演",
    category: "drama",
    formationId: "v_conveyor",
    audienceLayoutId: "broadcast_studio",
    castSize: 3, // 先方オーダーで3人編成に絞られている(5枠あるうち3枠のみ使用)
    turnLimitMode: "fixed",
    maxTurns: 5, // 尺(放送枠)は伸ばせない固定値
    turnUnitLabel: "シーン目",
    scoreStats: ["acting", "looks"],
    targetScore: 1400,
    rewardCash: 24000 * ECONOMY_SCALE,
    rewardFans: 120,
    clientTier: "gray", // 覆面配信者的な案件。審査ガバガバで単価は高いが不祥事リスクあり
    trendAttribute: "moon",
    recommendedStatLevel: 48,
    damagePatternId: "anti_trend_focus",
  },
  {
    id: "stage_004",
    name: "覆面配信『真夜中のオークション』",
    tier: 2,
    tierLabel: "Tier 2 ・ グレー案件",
    category: "variety",
    formationId: "two_row",
    audienceLayoutId: "broadcast_studio",
    turnLimitMode: "songs",
    turnUnitLabel: "曲目",
    scoreStats: ["vocal", "charm"],
    targetScore: 2200,
    rewardCash: 42000 * ECONOMY_SCALE,
    rewardFans: 260,
    clientTier: "gray",
    trendAttribute: "flame",
    recommendedStatLevel: 55,
    minRankId: "rising", // 新進事務所ランク以降のオファー選別で登場
    damagePatternId: "chaos_random",
  },
  {
    id: "stage_005",
    name: "全国ネットバラエティ特番",
    tier: 2,
    tierLabel: "Tier 2 ・ オファー選別",
    category: "variety",
    formationId: "v_conveyor",
    audienceLayoutId: "broadcast_studio",
    turnLimitMode: "songs",
    turnUnitLabel: "コーナー",
    scoreStats: ["talk", "charm"],
    targetScore: 3400,
    rewardCash: 55000 * ECONOMY_SCALE,
    rewardFans: 400,
    clientTier: "clean",
    trendAttribute: "thunder",
    recommendedStatLevel: 58,
    minRankId: "rising",
    damagePatternId: "target_creep",
  },
  {
    id: "stage_008",
    name: "化粧品ブランドCM撮影",
    tier: 1,
    tierLabel: "Tier 1 ・ CM出演",
    category: "cm",
    formationId: "trio_fan",
    audienceLayoutId: "trio_intimate",
    turnLimitMode: "fixed",
    maxTurns: 4, // CM尺は伸ばせない固定値
    turnUnitLabel: "カット目",
    scoreStats: ["looks", "charm"],
    targetScore: 1300,
    rewardCash: 26000 * ECONOMY_SCALE,
    rewardFans: 150,
    clientTier: "clean",
    trendAttribute: "flower",
    recommendedStatLevel: 46,
    damagePatternId: "crossfire",
  },
  {
    id: "stage_009",
    name: "週刊誌グラビア撮影",
    tier: 2,
    tierLabel: "Tier 2 ・ 雑誌グラビア",
    category: "gravure",
    formationId: "solo_spotlight",
    audienceLayoutId: "solo_focus",
    turnLimitMode: "fixed",
    maxTurns: 4,
    turnUnitLabel: "ページ目",
    scoreStats: ["looks", "mental"],
    targetScore: 1500, // ソロ1人編成向けに調整(旧トリオ版の2000から按分)
    rewardCash: 38000 * ECONOMY_SCALE,
    rewardFans: 240,
    clientTier: "gray", // 過激な誌面演出込みでオファーされる案件
    trendAttribute: "flame",
    recommendedStatLevel: 52,
    minRankId: "local",
    damagePatternId: "anti_trend_focus",
  },
  {
    id: "stage_010",
    name: "小劇場ミュージカル公演",
    tier: 3,
    tierLabel: "Tier 3 ・ 舞台",
    category: "stage_play",
    formationId: "v_conveyor",
    turnLimitMode: "songs",
    turnUnitLabel: "幕",
    scoreStats: ["acting", "vocal"],
    targetScore: 3200,
    rewardCash: 48000 * ECONOMY_SCALE,
    rewardFans: 320,
    clientTier: "clean",
    trendAttribute: "moon",
    recommendedStatLevel: 56,
    minRankId: "local",
    damagePatternId: "target_creep",
  },
  {
    id: "stage_011",
    name: "深夜ラジオ帯番組パーソナリティ",
    tier: 2,
    tierLabel: "Tier 2 ・ ラジオ",
    category: "radio",
    formationId: "trio_fan",
    audienceLayoutId: "radio_booth",
    turnLimitMode: "songs",
    turnUnitLabel: "コーナー",
    scoreStats: ["talk", "mental"],
    targetScore: 1800,
    rewardCash: 20000 * ECONOMY_SCALE,
    rewardFans: 160,
    clientTier: "clean",
    trendAttribute: "ice",
    recommendedStatLevel: 44,
    damagePatternId: "crossfire",
  },
  {
    id: "stage_006",
    name: "全国アイドルグランプリ 決勝",
    tier: 5,
    tierLabel: "Tier 5 ・ 大型イベント/アワード",
    category: "live",
    formationId: "v_conveyor",
    audienceLayoutId: "arena_award",
    turnLimitMode: "songs",
    turnUnitLabel: "曲目",
    scoreStats: ["vocal", "dance"],
    targetScore: 6000,
    rewardCash: 120000 * ECONOMY_SCALE,
    rewardFans: 900,
    clientTier: "clean",
    trendAttribute: "star",
    recommendedStatLevel: 70,
    minRankId: "major",
    damagePatternId: "chaos_random",
    isMilestone: true, // 甲子園相当のマイルストーン(§10)。応援ブースト・談合リスクの対象
  },
  {
    id: "stage_007",
    name: "年間最優秀アイドルアワード",
    tier: 5,
    tierLabel: "Tier 5 ・ 大型イベント/アワード",
    category: "variety",
    formationId: "two_row",
    audienceLayoutId: "arena_award",
    turnLimitMode: "songs",
    turnUnitLabel: "曲目",
    scoreStats: ["charm", "talk"],
    targetScore: 5200,
    rewardCash: 150000 * ECONOMY_SCALE,
    rewardFans: 1100,
    clientTier: "gray", // 大手との政治力勝負も絡む案件という位置づけ
    trendAttribute: "thunder",
    recommendedStatLevel: 68,
    minRankId: "major",
    damagePatternId: "front_volley",
    isMilestone: true,
  },
];

// ---------------------------------------------------------------------
// 仕事(STAGES)のボリューム拡張(§ボリューム拡張)。
// カテゴリ定義×tierカーブの組み合わせで、手作りの11件を約100件まで
// プロシージャルに増量する。個々の数値をハードコードせず、
// STAGE_TIER_CURVE(tierごとの目標スコア・報酬・推奨レベルの基準値)と
// STAGE_CATEGORY_DEFS(カテゴリごとのscoreStats・名前候補)の掛け合わせで
// 決定的に生成する(実行のたびに変わらない)。
// ---------------------------------------------------------------------

// tierごとの基準値。tierが上がるほど目標スコア・報酬・推奨レベルが上がり、
// 解放に必要な事務所ランクも上がる。
const STAGE_TIER_CURVE = [
  { tier: 1, targetScoreBase: 1200, rewardCashBase: 15000, rewardFansBase: 100, recommendedStatLevel: 40, minRankId: null },
  { tier: 2, targetScoreBase: 1800, rewardCashBase: 24000, rewardFansBase: 160, recommendedStatLevel: 46, minRankId: null },
  { tier: 3, targetScoreBase: 2600, rewardCashBase: 36000, rewardFansBase: 240, recommendedStatLevel: 52, minRankId: "local" },
  { tier: 4, targetScoreBase: 3600, rewardCashBase: 52000, rewardFansBase: 340, recommendedStatLevel: 58, minRankId: "rising" },
  { tier: 5, targetScoreBase: 4800, rewardCashBase: 75000, rewardFansBase: 460, recommendedStatLevel: 64, minRankId: "notable" },
];

// カテゴリごとのscoreStats・尺の単位・仕事名候補(tier1→5の順に10件、
// collabのみ9件で合計89件になるよう調整)。
// formationVariants指定時はnameIndexで順番に切り替える(少人数の仕事枠に
// バリエーションを持たせる)。formationId単独指定はそれで固定、両方未指定は
// DEFAULT_FORMATION_CYCLEを通し番号で使う(buildGeneratedStages側)。
// audienceLayoutId未指定は"standard_hall"にフォールバックする(battle.js側)。
// castSizeは少人数の仕事枠(ドラマ・映画等)で、フォーメーションの一部枠だけを
// 使うことを表す(formationVariants使用時は不要、フォーメーション自体が
// 既に少人数のため)。
// 得意先件数集計(§UI改修計画①-4、ホーム画面の地図)がSTAGE_CATEGORY_DEFSの
// ラベルをそのまま使えるよう、id→labelだけを外部公開する。
export function getStageCategoryLabel(categoryId) {
  return STAGE_CATEGORY_DEFS.find((c) => c.id === categoryId)?.label ?? categoryId;
}

const STAGE_CATEGORY_DEFS = [
  { id: "live", label: "ライブ", scoreStats: ["vocal", "dance"], turnUnitLabel: "曲目", names: [
    "商店街ふれあいライブ", "大学祭ゲストライブ", "深夜ラジオ公開収録ライブ", "地方ホールワンマン", "野外夏祭りステージ",
    "対バンサーキット", "駅前ゲリラライブ", "ファン感謝祭ライブ", "冬の氷上特設ステージ", "アリーナ夏フェス",
  ] },
  { id: "drama", label: "ドラマ", scoreStats: ["acting", "looks"], turnUnitLabel: "シーン目", audienceLayoutId: "broadcast_studio", castSize: 3, names: [
    "学園青春ドラマ", "刑事サスペンスドラマ", "昼ドラ復讐劇", "タイムスリップ時代劇", "医療ヒューマンドラマ",
    "ラブコメ連続ドラマ", "ミステリー2時間ドラマ", "近未来SFドラマ", "家族群像ドラマ", "戦国絵巻大河",
  ] },
  { id: "variety", label: "バラエティ", scoreStats: ["talk", "charm"], turnUnitLabel: "コーナー",
    formationVariants: [
      { formationId: "v_conveyor", audienceLayoutId: "broadcast_studio" },
      { formationId: "two_row", audienceLayoutId: "broadcast_studio" },
      { formationId: "hex_wheel", audienceLayoutId: "hex_theater" }, // 6人ゲーム番組枠
    ],
    names: [
    "深夜トークバラエティ", "大食い対決番組", "ロケ企画バラエティ", "ものまね頂上決戦", "クイズ特番",
    "街ブラロケ番組", "運動会体育会系企画", "脱出ゲーム番組", "格付けバラエティ", "大型改編特番",
  ] },
  { id: "cm", label: "CM出演", scoreStats: ["looks", "charm"], turnUnitLabel: "カット目",
    formationVariants: [
      { formationId: "duo_mirror", audienceLayoutId: "duo_spotlight" },
      { formationId: "trio_fan", audienceLayoutId: "trio_intimate" },
    ],
    names: [
    "飲料メーカーCM", "スマホアプリCM", "化粧品CM", "家電メーカーCM", "アパレルブランドCM",
    "エナジードリンクCM", "地方銀行CM", "ファストフードCM", "旅行代理店CM", "自動車メーカーCM",
  ] },
  { id: "gravure", label: "雑誌グラビア", scoreStats: ["looks", "mental"], turnUnitLabel: "ページ目",
    formationVariants: [
      { formationId: "solo_spotlight", audienceLayoutId: "solo_focus" }, // ソロ写真集
      { formationId: "trio_fan", audienceLayoutId: "trio_intimate" }, // 合同グラビア
    ],
    names: [
    "週刊誌巻頭グラビア", "水着グラビア撮影", "写真集撮影合宿", "カレンダー撮影", "ファッション誌表紙",
    "アイドル誌単独特集", "デジタル写真集配信", "スポーツ紙グラビア", "タイアップグラビア", "記念グラビアブック",
  ] },
  { id: "stage_play", label: "舞台", scoreStats: ["acting", "vocal"], turnUnitLabel: "幕", names: [
    "小劇場ストレートプレイ", "歌劇風ミュージカル", "朗読劇公演", "2.5次元舞台", "地方公演ツアー",
    "野外劇場公演", "一人芝居企画", "時代劇舞台", "冬季特別公演", "記念公演千秋楽",
  ] },
  { id: "radio", label: "ラジオ", scoreStats: ["talk", "mental"], turnUnitLabel: "コーナー",
    formationVariants: [
      { formationId: "duo_mirror", audienceLayoutId: "duo_spotlight" }, // 2人パーソナリティ
      { formationId: "trio_fan", audienceLayoutId: "trio_intimate" }, // 3人パネル
    ],
    names: [
    "深夜ラジオ帯番組", "週末ラジオ特番", "ネットラジオ配信", "地方局レギュラー", "公開ラジオ収録",
    "リクエスト特番", "トークラジオ企画", "音楽ラジオ番組", "深夜通しラジオ", "年末ラジオSP",
  ] },
  { id: "movie", label: "映画", scoreStats: ["acting", "mental"], turnUnitLabel: "シーン目", audienceLayoutId: "broadcast_studio", castSize: 3, names: [
    "青春映画主演", "サスペンス映画出演", "アニメ実写化映画", "短編オムニバス映画", "ドキュメンタリー映画",
    "時代劇映画", "ホラー映画出演", "恋愛映画ヒロイン", "スポーツ映画出演", "大作映画出演",
  ] },
  { id: "collab", label: "コラボ企画", scoreStats: ["charm", "dance"], turnUnitLabel: "曲目", names: [
    "他事務所合同ライブ", "異業種コラボ企画", "ゲームタイアップ企画", "アニメ作品コラボ", "地方自治体PRコラボ",
    "スポーツチーム応援コラボ", "企業ブランドコラボ", "フェス合同ステージ", "周年記念コラボ企画",
  ] },
];

// formationId/formationVariantsどちらも未指定なカテゴリ(live/stage_play/collab)が
// 使う既定の巡回。フルキャスト向けの3陣形を通し番号で切り替える。
const DEFAULT_FORMATION_CYCLE = ["v_conveyor", "two_row", "quartet_diamond"];

// STAGE_CATEGORY_DEFS×STAGE_TIER_CURVEを掛け合わせて仕事を量産する。
// 各カテゴリの名前配列を先頭から2件ずつtier1→5の順に割り当てていく
// (collabのみ9件なのでtier5は1件だけになる)。値はSTAGE_TIER_CURVEの基準値に
// 同一tier内の通し番号による小さな増分(バリエーション)を乗せて決める。
// tier5(最高ランク)は例外的にカテゴリを問わず7人のgrand_septet編成+
// arena_award客席にし、「大舞台感」を演出する。
function buildGeneratedStages() {
  const damagePatternIds = Object.keys(DAMAGE_PATTERNS);
  const trendAttributeKeys = ATTRIBUTES.map((a) => a.key);
  const stages = [];
  let globalIndex = 0;

  for (const categoryDef of STAGE_CATEGORY_DEFS) {
    categoryDef.names.forEach((name, nameIndex) => {
      const tierCurveIndex = Math.floor(nameIndex / 2); // 2件ごとにtierを1つ進める
      const curve = STAGE_TIER_CURVE[Math.min(tierCurveIndex, STAGE_TIER_CURVE.length - 1)];
      const variantInTier = nameIndex % 2;
      const isTopTier = curve.tier === STAGE_TIER_CURVE[STAGE_TIER_CURVE.length - 1].tier;

      const targetScore = curve.targetScoreBase + variantInTier * 150;
      const rewardCash = (curve.rewardCashBase + variantInTier * 4000) * ECONOMY_SCALE;
      const rewardFans = curve.rewardFansBase + variantInTier * 30;
      const isGray = globalIndex % 4 === 3; // 4件に1件はグレー案件にして高単価・高リスクを混ぜる

      const formationChoice = categoryDef.formationVariants
        ? categoryDef.formationVariants[nameIndex % categoryDef.formationVariants.length]
        : {
            formationId: categoryDef.formationId ?? DEFAULT_FORMATION_CYCLE[globalIndex % DEFAULT_FORMATION_CYCLE.length],
            audienceLayoutId: categoryDef.audienceLayoutId,
          };

      stages.push({
        id: `stage_gen_${String(globalIndex + 1).padStart(3, "0")}`,
        name,
        tier: curve.tier,
        tierLabel: `Tier ${curve.tier} ・ ${categoryDef.label}`,
        category: categoryDef.id,
        formationId: isTopTier ? "grand_septet" : formationChoice.formationId,
        audienceLayoutId: isTopTier ? "arena_award" : formationChoice.audienceLayoutId,
        ...(!isTopTier && !categoryDef.formationVariants && categoryDef.castSize ? { castSize: categoryDef.castSize } : {}),
        turnLimitMode: "songs",
        turnUnitLabel: categoryDef.turnUnitLabel,
        scoreStats: categoryDef.scoreStats,
        targetScore,
        rewardCash,
        rewardFans,
        clientTier: isGray ? "gray" : "clean",
        trendAttribute: trendAttributeKeys[globalIndex % trendAttributeKeys.length],
        recommendedStatLevel: curve.recommendedStatLevel,
        ...(curve.minRankId ? { minRankId: curve.minRankId } : {}),
        damagePatternId: damagePatternIds[globalIndex % damagePatternIds.length],
      });
      globalIndex++;
    });
  }

  return stages;
}

export const STAGES = [...HAND_AUTHORED_STAGES, ...buildGeneratedStages()];
