# コンテンツボリューム拡張 記録

`docs/economy_calendar_redesign.md`(スカウト・経済再設計)の続き。各要素の
「個数」を増やす回。データ駆動(BALANCE/カタログ配列)の構造のまま、
数を増やす作業なのでロジックの変更は最小限に留めた。

## 実施内容

### 1. 姓名の拡張

- `SURNAME_FIRST_KANJI`(100字)×`SURNAME_SECOND_KANJI`(100字)、
  計200字の漢字プールを新設(masterData.js)。scoutGenerator.jsが
  各プールから1字ずつ選んで連結し、姓を生成する(理論上100×100=1万通り)。
  従来の固定20件の`SURNAMES`配列は廃止。
- `GIVEN_NAMES`を20→100件に拡張。

### 2. 事務所ランクを4→10段階に拡張

`AGENCY_RANKS`に6段階を追加。既存id(`local`/`rising`/`major`)は
SCOUT_LOCATIONS/SCOUT_METHODS/STAGES/VENTURE_TYPESのminRankIdから参照
されているため維持し、間に新ランクを挿入する形にした。

### 3. 事務所の「広さ」(ロースター上限)

- `TRAINING_FACILITIES`各設備に`rosterCapacity`を追加し、最上位設備
  「グランドタワースタジオ」を新設(定員50人)。
- `office.js: getRosterCapacity()`が所有施設のうち最も広いものを採用する
  (複数所有しても合算はしない)。
- `state.js: hireIdol()`が上限チェックを行い、`{ success: false, reason: "capacity" }`
  を返すよう変更。呼び出し側(main.js/scoutView.js)を合わせて更新し、
  スカウト画面に「事務所が手狭です」の表示と雇用ボタンの無効化を追加。
  事務所運営画面(施設モーダル)にも現在の在籍人数/定員を表示。

### 4. 事務所設備(OFFICE_EQUIPMENT)を新設

TRAINING_FACILITIES(稽古場そのものの規模)とは別に、買い切りの備品5種を
新設。継続コストはなく、所有している間ずっと効果を発揮する。

| 設備 | 効果 |
|---|---|
| 鏡張り稽古場改修 | レッスンの成長量+15% |
| 自社録音・配信ブース | 投資/コンテンツの収益+15% |
| 専属ヘアメイク室 | 悪評・スキャンダル発生率-15% |
| 専用トレーニングジム | 清廉度が週次で+2自然回復 |
| 来客応接ラウンジ | スカウト契約金-10% |

`office.js: getEquipmentEffects()`/`purchaseEquipment()`を新設し、
training.js(統計成長)・office.js(venture収益・清廉度)・
scoutGenerator.js(契約金)・state.js(スキャンダル確率)へ配線した。
事務所運営画面に🛋️設備モーダルを追加。

### 5. 投資/コンテンツ(VENTURE_TYPES)を9→15件に拡張

追加6件: メンバーブログ/SNS運用(ongoing、低コスト低効果の入門枠)、
グッズ定期便/サブスク(ongoing)、クラウドファンディング(campaign、
少額の元手で支援金が積み上がる)、他事務所コラボ企画(campaign)、
年末特番出演(campaign、露出量特大の一過性イベント)、
海外進出(campaign、メジャー事務所ランク以降・莫大な投資+長期間の
じわ効き)。既存の仕組み(mode: campaign/ongoing、activeVentures、
settleVentures)をそのまま使い、新規ロジックの追加は不要だった。

### 6. 仕事(STAGES)を11→100件に拡張

手作りの11件(stage_001〜011、stage_006/007のマイルストーンは個別維持)は
そのまま残し、`STAGE_CATEGORY_DEFS`(9カテゴリ×名前候補配列)×
`STAGE_TIER_CURVE`(tier1〜5の目標スコア・報酬・推奨レベルの基準値)を
掛け合わせるプロシージャル生成(`buildGeneratedStages()`)で89件を追加し、
合計100件にした。新規カテゴリとして「映画」「コラボ企画」を追加
(既存7カテゴリ: live/drama/variety/cm/gravure/stage_play/radioと合わせて9)。
数値のハードコードを避けるため、tierカーブ配列から決定的に算出している
(実行のたびに変わらない)。

### 7. 週刊の噂話イベント(スキャンダル/プラス)

ステージの結果とは無関係に、`advanceDay()`のたびに毎週わずかな確率で
スキャンダル(悪い噂)かプラスの出来事(良い噂)が1件だけ起こり、即座に
効果(fansDelta/cashDelta/cleanlinessDelta)が適用される。既存の「グレー案件
経由の記者会見(3択ジレンマ)」とは別枠の、選択の余地がない小さな出来事として
実装した。

- `EVENT_TYPES`(masterData.js): scandal 6件・plus 6件、計12件。
- `BALANCE.randomEvents`: scandalChanceBase(5%)はcleanliness低下で
  `cleanlinessRiskMultiplier`(office.jsの既存ヘルパー)により悪化する。
  plusChanceBase(8%)は固定。
- `state.js: rollRandomEvent()`をadvanceDay()から呼び、
  `gameState.eventLog`(新しい順、最大20件)に記録する。
- ホーム画面に📰「最近の出来事」モーダルを追加。

### 8. 力尽き休養(即引退→段階的休養に変更)

ステージ中にスタミナが尽きて強制退場した場合、これまでは即座にロースターから
永久除籍していたが、段階的な休養に変更した。

- `BALANCE.burnout`: `retireAtCount: 3`、`restWeeksByCount: { 1: 4, 2: 12 }`
  (1回目=1ヶ月/4週、2回目=3ヶ月/12週の休養。3回目でついに永久引退)。
- `idol.burnoutCount`(累計回数)・`idol.resting`・`idol.restUntilDay`を新設。
  `state.js: applyBattleResult()`が強制退場のたびに`burnoutCount`を
  加算し、上限未満なら休養、上限到達で従来通りロースターから除籍する。
- `state.js: applyRestRecovery()`をadvanceDay()から呼び、
  `restUntilDay`を過ぎたメンバーを自動的に復帰させる。
- 休養中のメンバーは編成(loadout.js)・育成(training.js/trainingView.js)・
  グループ結成(ui.js)の対象から除外。ホーム画面のロースター一覧・
  アイドル詳細画面・戦績履歴に休養/引退の表示を追加。

### 9. 陣形(FORMATIONS)を2→4種に拡張

少人数編成「トリオ編成」(`trio_fan`、3人・C/L/Rのシンプルな三角形)と
大人数編成「グランド扇形陣形」(`grand_septet`、7人・扇形の大型フォーメーション)
を新設。既存の`v_conveyor`(5人)・`two_row`(4人)と合わせて4種になり、
仕事の人数構成(castSize)にバリエーションが出せるようになった。
`buildActiveTopology`によるcastSizeトリミングは既存ロジックのまま
(新フォーメーションもpriorityOrder/adjacency/advanceを定義しているため
無改修で動作する)。

### 10. 客席レイアウトを4種に拡張

`AUDIENCE_BOARD_BLOCKS`(単一の3×3レイアウト)を`AUDIENCE_BOARD_LAYOUTS`
(4種の3×3レイアウト)に再構成した。バトル画面のCSSグリッドが3×3固定の
ため、ブロック数(9)は全レイアウト共通のまま、ラベル・アイコン・weight配分
だけを会場ごとに変える設計にした。

- `standard_hall`(既存、ライブ/舞台/コラボ企画向け): 審査員/客席/クルー。
- `broadcast_studio`(ドラマ/CM/グラビア/映画向け): 監督・プロデューサー・
  スポンサー/照明部・カメラマン・スタイリスト/広報・SNS・見学ファン。
- `arena_award`(tier5・milestone向け): 審査員長級+プレス/大観衆/VIP席と、
  全体的にweightが高く「大舞台の手強さ」を表現。
- `radio_booth`(ラジオ向け): 音響ブース・共演者・スポンサー読み+電話/
  お便り/配信リスナー。

`battle.js`は`stage.audienceLayoutId`(未指定は`standard_hall`)からレイアウトを
選び、`battleState.boardLayoutBlocks`として保持する。「目標の逆行」
(target_creep、客席HPの追加配分)もこのbattleState内の値を参照するよう修正した
(以前はグローバル定数を直接参照していたため、レイアウトを可変にするには
この修正が必須だった)。

### 11. STAGESに新陣形/客席レイアウト/castSizeを配線

- 手作り11件: ドラマ/覆面配信/バラエティ特番/CM/グラビア/ラジオに
  `broadcast_studio`または`radio_booth`を設定。milestoneの2件(stage_006/007)
  には`arena_award`を設定(フォーメーション自体は既存のバランスを崩さない
  よう変更していない)。CM・グラビア・ラジオの3件は`formationId`を
  `trio_fan`に変更(3人の小規模編成が仕事の内容に合う)。
- 生成ロジック(`STAGE_CATEGORY_DEFS`): drama/movieに`castSize: 3`、
  cm/gravure/radioに`formationId: "trio_fan"`、該当カテゴリに
  `audienceLayoutId`を設定。さらに最高tier(5)は カテゴリを問わず
  `grand_septet`+`arena_award`で統一し、「大舞台になるほど大所帯・
  大会場になる」という進行感を演出した。

### 12. スカウト場所を4→8箇所に拡張

`SCOUT_LOCATIONS`に4箇所追加: 地方都市(地元と都心の中間)、
アイドル合同オーディション会(地域一番事務所ランクで解放)、
芸能プロ人脈紹介(注目株事務所ランクで解放、芸能学校と海外の中間)、
海外エリート養成校(大手候補事務所ランクで解放、海外よりさらに上位)。
既存4箇所と合わせ、事務所ランク10段階の進行に沿った選択肢の密度になった。

### 13. 年齢帯(AGE_BANDS)を3→6段階に拡張

14〜999を隙間なくカバーする6段階に再設計: デビュー前の蕾(14-15)→
ガラスの大砲(16-18)→ワークホース(19-21)→全盛期(22-25、新設)→
バフの司令塔(26-30)→生ける伝説(31-999、新設)。年齢が上がるほど
maxStaminaMultiplier/exposedScoreMultiplierは下がる代わりに、後半の帯ほど
supportBonusMultiplierが上がっていく(若いほどハイリスク・ハイリターンの
アタッカー適性、年齢を重ねるほど支援役としての価値が上がる、という
既存デザインの延長)。`getAgeBand`のフォールバックも、配列インデックス
依存(`AGE_BANDS[1]`)からid検索に変更し、並び順の変更に強くした。

## 動作確認

`node --check`全ファイル通過に加え、以下をNodeシミュレーションで確認:

- 姓の組み合わせ生成(漢字2文字)。
- 事務所ランク10段階での`getAvailableStages`(能動/受動の切り替え)。
- ロースター上限チェック(超過時に雇用がブロックされ、施設アップグレード後は
  解除される)。
- 事務所設備の購入・効果(清廉度の週次回復、venture収益倍率、育成の成長倍率)。
- 15件のventureのカタログロード、STAGES100件の一意性・カテゴリ分布。
- スカウト→雇用→施設/設備購入→venture開始→育成→給与交渉→複数週送りの
  一連の流れを通しで実行し、エラーが出ないことを確認。
- 強制退場を3回連続で発生させ、1回目=4週休養→復帰、2回目=12週休養→復帰、
  3回目=ロースターから除籍、という想定通りの遷移を確認。
- 週刊イベントのロール分布(20,000回試行でscandal/plusの発生率が
  設定値通りになること)を確認。
- 新設フォーメーション(trio_fan/grand_septet)の`buildActiveTopology`
  (castSizeトリミング含む)と、STAGES全100件のformationId/audienceLayoutId
  参照が実在のFORMATIONS/AUDIENCE_BOARD_LAYOUTSキーと一致することを確認。
- 4種の陣形それぞれで実際にバトルを1ターン進め、客席ボードが常に9ブロックで
  構築されることを確認。
- 事務所ランクを最上位まで上げた状態でスカウト場所8箇所すべてが解放され、
  各地でのstatBonus/年齢帯の反映が想定通りであることを確認。
- 14〜999歳の全年齢でgetAgeBand()が必ず1つの帯に一致すること(隙間なし)を
  確認。

## 第3弾: 陣形の人数可変化・客席サイズ可変化・取引先評価・解雇

前回(§9〜13)の続き。ユーザーから「陣形をもっと増やしてソロ/デュオも
できるように」「客席レイアウトも仕事によっては1とか3とかあるはず」
「取引先からの評価が欲しい(失敗/断ると下がる、上がるといい仕事が来る)」
「解雇はできる?」という追加要望を受けて実装した。

### 14. 陣形を4→8種に拡張(ソロ/デュオ含む完全可変化)

`castSize`によるトリミング機構自体は既存のどの陣形にも適用できたが、
既存陣形は最小3人(trio_fan)からで、1〜2人にトリムすると3〜7人前提の
座標がそのまま間引かれるだけで不自然だった。そこで専用陣形を新設:

- `solo_spotlight`(1人): 送る(advance)先が自分自身しかなく、休める枠が
  無い代わりにscoreMultは全陣形中最大。
- `duo_mirror`(2人): 2人とも常に露出したまま、送るとメイン/サブの役割が
  入れ替わる。
- `quartet_diamond`(4人): 2列陣形の別案。前後まるごと入れ替えではなく、
  前衛→左衛→右衛→後衛と一方通行で巡回するひし形。
- `hex_wheel`(6人): トリオとグランド扇形の間を埋める中規模編成。
  センター枠を持たない左右対称アンサンブル。

既存の`v_conveyor`(5人)・`two_row`(4人)・`trio_fan`(3人)・
`grand_septet`(7人)と合わせて8種、1〜7人まですべての人数をカバーする。

### 15. 客席レイアウトを可変サイズ化(1/2/3/6/9)

これまで`AUDIENCE_BOARD_LAYOUTS`は中身(ラベル/アイコン/weight)は
4種あったが、ブロック数は常に9(3×3固定)だった。「仕事によっては1とか
3とかあるはず」という指摘を受け、`{ cols, rows, blocks }`の形に再構成し、
ブロック数が可変になるようにした。

- `solo_focus`(1ブロック、1×1): ソロ仕事向け。「世間の目」1枚。
- `duo_spotlight`(2ブロック、2×1): デュオ仕事向け。
- `trio_intimate`(3ブロック、3×1): トリオ仕事向け(CM・グラビア・ラジオ)。
- `hex_theater`(6ブロック、3×2): 中規模(hex_wheel)向け。
- 既存4種(standard_hall/broadcast_studio/arena_award/radio_booth)は
  9ブロック(3×3)のフルキャスト向けのまま維持。

技術的には、`ATTACK_SHAPES`のcolumn狙い撃ち・row近隣splashが`block.row`/
`block.col`を参照しているため、ブロック数を減らしても壊れないことを
確認した上で実装した(1ブロックならcolumn/rowが常に自分自身、3ブロックの
1行構成ならrow近隣が残り2ブロックにsplashする、という具合に自然に縮退する)。
battleView.jsは`battleState.boardCols`/`boardRows`からCSSグリッドを
動的に組み立てる(`grid-template-columns`/`rows`をインラインstyleで
上書き)。battle.js側で唯一ハードコードされていた列数3(column狙いの
フォールバック)も`battleState.boardCols`参照に修正した。

### 16. STAGESに新陣形/客席サイズを配線

- CM: `duo_mirror`+`duo_spotlight`と`trio_fan`+`trio_intimate`を
  nameIndexで交互に使用(`formationVariants`という新しい仕組み)。
- グラビア: `solo_spotlight`+`solo_focus`(ソロ写真集)と
  `trio_fan`+`trio_intimate`(合同グラビア)を交互に使用。手作りの
  週刊誌グラビア撮影(stage_009)もソロ仕様に変更(targetScoreも
  1人編成向けに按分し直した)。
- ラジオ: `duo_mirror`(2人パーソナリティ)と`trio_fan`(3人パネル)を交互。
- バラエティ: 既存のv_conveyor/two_rowに加え、`hex_wheel`+`hex_theater`
  (6人ゲーム番組枠)を3択で交互に使用。
- live/舞台/コラボ企画(formationId未指定のカテゴリ)は
  `DEFAULT_FORMATION_CYCLE`(v_conveyor/two_row/quartet_diamond)を
  通し番号で使うよう拡張。
- 最高tier(5)は全カテゴリ共通で`grand_septet`+`arena_award`に統一する
  仕様は維持(「大舞台になるほど大所帯になる」という進行感)。

### 17. 取引先評価システムを新設

`gameState.clientReputation`(stageId→0〜100、初期値50)を新設。
成功で+6、撤退で-5、失敗で-10(力及ばずは中立)。評価は報酬倍率
(×0.7〜×1.4)に反映され、オファー選別(受動営業)では評価が15を下回った
取引先はもうオファーを出してこなくなる(能動営業では変わらず自分から
選べる、という非対称設計)。ステージ選択画面の詳細モーダルに評価と報酬倍率を
表示。`state.js`に`getClientReputation`/`getReputationRewardMultiplier`を
新設し、実計算(applyBattleResult)と表示(ui.js)で同じ関数を共有して
ズレを防いだ。

### 18. 解雇(fireIdol)を新設

即座にロースターから除籍するアクション。円満な引退(ラストダンス)や
休養とは違い、ファンをわずかに(20人)失う。アイドル詳細画面に🚪ボタン+
確認モーダルを追加。

### 動作確認(第3弾)

- 8種の陣形すべてで`buildActiveTopology`が正しいスロット構成を返すことを確認。
- 8種の陣形×対応する客席レイアウトの組み合わせで実際にバトルを進め、
  客席ボードのmaxHp合計が常にtargetScoreと一致すること・cols×rowsが
  ブロック数と一致することを確認(1×1〜3×3まで)。
- STAGES全100件のformationId/audienceLayoutIdが実在のキーと一致することを確認。
- 取引先評価: 5連勝で50→80(報酬倍率1.05→1.26)に上昇、その後10連敗で
  0まで下落(倍率0.70)し、受動営業のオファー一覧から自動的に外れることを確認。
- 解雇: ロースターから即座に除籍されること、存在しないIDでは
  `{success:false}`を返すことを確認。
- スカウト→雇用→複数フォーメーションでのバトル(成功/失敗混在)→解雇→
  複数週送り、の一連の流れを通しで実行しエラーが出ないことを確認。

## 第4弾: やる気ボーナス攻撃

ユーザーから「やる気の高さによって属性攻撃できる確率が上がるといいかも。
最大50%とか。1回の仕事で最大1回だけ可能とか」という要望を受けて実装した。

### 19. やる気ボーナス攻撃を新設

スカウト時に決まる「やる気」(idol.interest、0〜100)を、バトル中の
ボーナス攻撃確率に転用した。仕組み:

- 毎ターン、通常の属性攻撃(既存: 各パフォーマーの属性のshapeで客席ボードを
  攻撃する仕組み)を行ったメンバーそれぞれについて、やる気に応じた確率
  (`interest/100 × 最大50%`)でもう1回分の攻撃(同じ量)を追加で放つ。
- `performer.moraleAttackUsed`で1人につき1ステージ(仕事)で最大1回に制限。
- ボーナス分もscore/客席ボードHPの両方に反映し(通常攻撃と同じ扱い)、
  両者の対応関係を崩さないようにした。
- 発動時は専用の吹き出しセリフ(`BATTLE_LINES.morale_attack`)と
  ログ(「✨〇〇がやる気全開のボーナス攻撃！」)で演出。
- やる気が未設定のメンバー(創業メンバー等)は`BALANCE.moraleAttack.defaultInterest`
  (50)を代用。
- 数値は`BALANCE.moraleAttack`に集約(maxChancePercent/defaultInterest/
  bonusDamageRatio)。

シミュレーションで、やる気100のメンバーが複数ターンにわたって発動しうる
一方、1バトル中に同一メンバーが2回以上発動しないこと、やる気0のメンバーは
一度も発動しないことを確認した。
