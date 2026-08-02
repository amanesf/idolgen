# 経済・カレンダー・スカウト再設計 検討メモ（進行中）

バトル再設計(`docs/battle_redesign_discussion.md`)とは別の検討ライン。カレンダー表示・
通貨の実スケール化・月次経費・表示名(フルネーム)・日本語表記の統一・
スカウトシステム本体(場所選択・募集方法・やる気・給与体系)・タレント仕事・
投資/コンテンツ共通カタログ(広告/楽曲/グッズ/YouTube/ラジオ/ファンクラブ等)まで、
§1で決定した内容は全て実装済み。

## 1. 決定事項（ユーザー確認済み）

1. **カレンダー**: `weekComplete`による7日リセットを廃止し、セーブが続く限り永続する
   カレンダーにする（GDD §11「無限ループ」を先取り）。
2. **給与体系**: 雇用時に固定給/歩合制を決定し、後から交渉で変更も可能にする
   （交渉アクション自体はまだ未実装）。
3. **知り合いのつて(スカウト方法)**: 既存の`AGENCY_RANKS`で解放する。
4. **月次経費**: 週次のスタッフ/トレーナー給与とは別に、月が変わるタイミングで
   まとめて1回引き落とす固定費を新設する。
5. **YouTube番組は「継続運営型」**: 一括投資→期間終了ではなく、毎週固定費がかかり
   続ける代わりに毎週収益も出る、プレイヤーが辞めるまで続く形にする。
6. **一覧の見せ方(全画面スクロール禁止との関連)**: コンパクト行+ページネーション
   （既にPhase 8で実装済みの方針を踏襲）。

## 2. 実装済み

### 2.1 カレンダー（永続化）

- `BALANCE.calendar = { weeksPerMonth: 4, monthsPerYear: 12 }`(masterData.js)。
- `gameState.day`は「週」の絶対カウンタとしてリセットせず増え続ける
  (`totalDays`/`weekComplete`は完全に撤去)。
- `ui.js`に`formatCalendar(day)`を新設し、topbar・履歴表示で「1年目6月2週」形式に統一。

### 2.2 通貨の実スケール化・万円表示

- `masterData.js`に`ECONOMY_SCALE = 200`を新設。旧数値(プロトタイプ時代の金額感)は
  すべて`旧値 * ECONOMY_SCALE`の形で残し、1箇所の定数を変えるだけで経済全体の
  スケールを再調整できるようにした。
- `startingCash`は1000万円に変更。
- `ui.js`に`formatMan(yen)`(端数なし、四捨五入で整数万円表示)を新設し、
  `¥12,345`のような生の円表示を全箇所置き換え。

### 2.3 月次経費

- `BALANCE.office.monthlyExpense = 5,000,000`(500万円/月。新設値なので
  ECONOMY_SCALEは掛けていない)。
- `office.js`に`settleMonthlyExpense(gameState)`を新設。
- `state.js`の`advanceDay()`で、月の最後の週(`day % weeksPerMonth === 0`)を
  送るタイミングで1回だけ呼ぶ。週次のスタッフ/トレーナー給与(`settleDailyFinances`、
  据え置き)とは完全に別建て。

### 2.4 表示名(常にフルネーム)

- バトル中のperformer名・ロースター一覧・編成画面・育成画面・オフィス箱庭・
  グループ結成のメンバー表示など、単独で名前を出す箇所は`idol.name`(本名フルネーム)
  に統一。
- アイドル詳細・スカウト画面のような「大きい名前+小さい補足」の二段表示は、
  本名を主表示、芸名(`stageName`)を括弧書きの補足に変更(以前は逆だった)。

### 2.5 日本語表記の統一

- `idolDetailView.js`/`scoutView.js`/`trainingView.js`に重複していた`STAT_LABELS`
  (英語混じり: Vocal/Dance/Vo/Da等)を`ui.js`の`STAT_LABELS`(フル、例:「ダンス」)・
  `STAT_LABELS_SHORT`(短縮、例:「ダ」)に統一。
- topbarの「DAY」、cleanlinessの英語ラベルなども日本語に修正。
- 「本日」「日次」など日単位の言い回しを「今週」「週次」に修正(カレンダーの
  単位が週になったことに合わせて)。

### 2.6 月次経費の内訳を「設備の家賃」に修正

最初に月次経費を実装した際、内訳のない固定500万円/月にしてしまい、初期資金
1000万円に対して重すぎた(2ヶ月で枯渇)。ユーザー指摘を受けて以下に修正。

- `TRAINING_FACILITIES`の各設備に`monthlyRent`を追加(簡易レッスンスタジオ=20万円/月、
  本格レッスンスタジオ=300万円/月、新設した旗艦スタジオ=800万円/月)。
- `office.js`に`getMonthlyRent(gameState)`(所有設備の家賃合計)と
  `purchaseFacility(gameState, facilityId)`(設備購入。従来カタログはあったが
  購入するUI/アクション自体が無かったため新設)を追加。
- `settleMonthlyExpense`は固定値ではなく`getMonthlyRent()`を参照するように変更。
- `ui.js`の事務所運営画面に🏢設備モーダルを追加(所有状況・家賃・購入ボタン)。
- 初期状態(簡易レッスンスタジオのみ)の家賃は20万円/月で、1000万円の初期資金なら
  何もしなくても50ヶ月分は持つ計算になり、序盤で詰むことはない。

## 3. 未実装（次にやること）

### 3.1 スカウト再設計(本体) — 実装済み

- `SCOUT_LOCATIONS`(地元/都心/芸能学校/海外)、`SCOUT_METHODS`(公募オーディション/
  知り合いのつて)を新設(masterData.js)。つては`AGENCY_RANKS`(新進事務所以上)で解放。
  芸能学校・海外もランクで段階的に解放。
- スカウト画面(scoutView.js)を「場所→方法を選んで出発する(travelWeeks分advanceDay
  を呼ぶ)→現地で見つかった候補を見て雇うか見送るか」の2フェーズ構成に変更。
- 候補生成(scoutGenerator.js)に「やる気(interest、0〜100)」を追加。方法ごとの
  interestMin/Maxから抽選し、契約金に`BALANCE.scouting.interest`の倍率を反映
  (やる気が高いほど契約金が下がる)。
- 雇用時に給与体系(固定給/歩合制)を選択(state.js: hireIdol)。固定給は
  `BALANCE.salary.fixedPerStatPoint`からstatSum比例の週給を算出し、
  `settleDailyFinances`(office.js)で週次に引き落とす。歩合制は週給なしの代わり、
  ステージ成功時の報酬から`BALANCE.salary.commissionRate`分を天引き
  (state.js: applyBattleResult)。
- アイドル詳細画面(idolDetailView.js)に💰モーダルを追加し、`renegotiateSalary`
  (成功率`BALANCE.salary.renegotiateSuccessChance`)で雇用後も給与体系を交渉変更できる。
- スカウトマン(顔役・人脈)の社員効果を`budgetMaxBonus`(廃止した予算スライダー用)
  から`statBonus`(候補の基礎ステータス底上げ)に付け替え。

### 3.2 「投資/コンテンツ」共通カタログ — 実装済み

`VENTURE_TYPES`(masterData.js)として、9件を1つの型で実装した。

- `mode: "campaign"`(単発投資): テレビCM出稿、ネット広告出稿、シングルリリース、
  グッズ展開、ファンミーティング開催。開始時に一括費用を払い、
  `durationWeeks`の間だけ週次で`weeklyCashGain`/`weeklyFansGain`が積み上がり、
  期間終了で自動的にactiveVenturesから外れる。
- `mode: "ongoing"`(継続運営、決定事項5): YouTube番組運営、レギュラーラジオ番組、
  公式ファンクラブ運営、スポンサー契約(新進事務所ランク以降で解放)。即座に
  開始でき、`weeklyCost`/`weeklyRevenue`/`weeklyFansGain`がプレイヤーが
  解約するまで毎週発生し続ける。
- `gameState.activeVentures`(`{ ventureId, startedOnDay, endsOnDay? }`の配列)で
  進行中のventureを管理し、`office.js: settleVentures()`が`advanceDay()`から
  呼ばれて週次精算・campaignの期限切れ処理をまとめて行う(個別システムを
  増やさない設計)。`startVenture`/`cancelVenture`で開始・解約する。
- 事務所運営画面(ui.js: renderOffice)に📢投資/コンテンツモーダルを追加し、
  一覧・週次収支・残り期間・開始/解約ボタンを表示する(main.jsに
  `start-venture`/`cancel-venture`アクションを追加)。

未着手のアイデア(将来の拡張候補、優先度は低い): CM出演/雑誌グラビア/舞台/
ラジオパーソナリティは§3.3のタレント仕事(単発)として実装済み。
事務所移転・海外進出(買い切りアンロック)、年末特番(カレンダー連動
マイルストーン)、クロスコラボは未着手。

### 3.3 タレント仕事 — 実装済み

- 既存`STAGES`全件に`category`フィールド(live/drama/variety/cm/gravure/
  stage_play/radio)を追加。判定ロジックはscoreStatsの組み合わせのままで、
  categoryは分類ラベルに過ぎない(tierLabelに反映済みなので表示側の変更は不要)。
- 新規タレント仕事として4件追加: CM出演(化粧品ブランドCM撮影、looks/charm)、
  雑誌グラビア(週刊誌グラビア撮影、looks/mental、グレー案件)、
  舞台(小劇場ミュージカル公演、acting/vocal)、ラジオ(深夜ラジオ帯番組
  パーソナリティ、talk/mental)。

## 4. 次に着手する順番（提案）

1. ~~スカウト再設計(§3.1)~~ — 実装済み。
2. ~~タレント仕事(§3.3)~~ — 実装済み。
3. ~~投資/コンテンツ共通カタログ(§3.2)~~ — 実装済み。§2・§3で挙がった項目は全て実装済み。
