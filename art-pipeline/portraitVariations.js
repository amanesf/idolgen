// Gemini画像生成用のプロンプト元データ(開発時のアセット生成パイプライン専用。
// ゲーム本体(js/)からは参照しない。§13「Geminiは開発時のアセット生成パイプライン
// としてのみ使用」という方針に基づくツール)。
//
// 方針:
// - 配色は「1パターン固定」ではなく8つの配色テーマを用意し、独立に周回させる。
//   これによりユーザー添付の参考画像(銀髪×グリーン)に寄りすぎず、320枚全体で
//   見た目の第一印象がちゃんと分かれるようにする。各テーマ内では髪ベース/
//   髪の差し色/瞳/衣装ベース/衣装の差し色/肌の6チャンネルを明確に指定し、
//   ソフトな陰影・ハイライトは許容しつつ色相の混線だけは避ける(完全フラット
//   塗りは指定しない＝可愛さを優先)。
// - 髪型(8)×前髪(5)×顔つき(8) = 320 で主要3軸の重複なしを保証。
//   「表情」ではなく「顔つき」(恒常的な顔の印象)にして、ウインクや驚き顔のような
//   一時的な感情は入れない(静止アイコンとして不自然になるため)。
// - 衣装(8)・アクセサリー(8)・配色テーマ(8)は独立に周回させ、同じ髪型/前髪/
//   顔つきでも被らないようにする(mod 8だが位相をずらしてある)。
//
// 実行: node art-pipeline/portraitVariations.js > art-pipeline/portrait-prompts.json

const COLOR_THEMES = [
  {
    name: "シルバー×エメラルド",
    hairBase: "プラチナホワイト(銀白色)",
    hairAccent: "エメラルドグリーン",
    eyes: "エメラルドグリーン",
    outfitBase: "漆黒(つや消しブラック)",
    outfitAccent: "エメラルドグリーン",
    skin: "アイボリーホワイト",
  },
  {
    name: "ブラック×ヴァイオレット",
    hairBase: "漆黒",
    hairAccent: "ディープバイオレット",
    eyes: "アメジストパープル",
    outfitBase: "チャコールグレー",
    outfitAccent: "ライラック",
    skin: "ポーセリンホワイト",
  },
  {
    name: "ピンクベージュ×ゴールド",
    hairBase: "ピンクベージュ",
    hairAccent: "シャンパンゴールド",
    eyes: "アンバー(琥珀色)",
    outfitBase: "アイボリー",
    outfitAccent: "ゴールド",
    skin: "ピーチベージュ",
  },
  {
    name: "ネイビー×スカイブルー",
    hairBase: "ネイビーブルー",
    hairAccent: "スカイブルー",
    eyes: "サファイアブルー",
    outfitBase: "ネイビー",
    outfitAccent: "ホワイト",
    skin: "アイボリーホワイト",
  },
  {
    name: "アッシュブラウン×コーラル",
    hairBase: "アッシュブラウン",
    hairAccent: "コーラルピンク",
    eyes: "ヘーゼルブラウン",
    outfitBase: "テラコッタ",
    outfitAccent: "クリームホワイト",
    skin: "ウォームベージュ",
  },
  {
    name: "プラチナブロンド×ルビー",
    hairBase: "プラチナブロンド",
    hairAccent: "ルビーレッド",
    eyes: "ルビーレッド",
    outfitBase: "オフホワイト",
    outfitAccent: "ワインレッド",
    skin: "アイボリーホワイト",
  },
  {
    name: "ダークグリーン×マスタード",
    hairBase: "ダークグリーン",
    hairAccent: "マスタードイエロー",
    eyes: "オリーブグリーン",
    outfitBase: "カーキ",
    outfitAccent: "マスタードイエロー",
    skin: "ウォームベージュ",
  },
  {
    name: "ラベンダー×ミント",
    hairBase: "ラベンダーパープル",
    hairAccent: "ミントグリーン",
    eyes: "アメジストパープル",
    outfitBase: "オフホワイト",
    outfitAccent: "ミントグリーン",
    skin: "ポーセリンホワイト",
  },
];

const HAIRSTYLES = [
  "ロングストレート",
  "ハーフツイン(サイドツインテール)",
  "ショートボブ",
  "高い位置のポニーテール",
  "ハーフアップお団子",
  "緩やかなウェーブロング",
  "片側だけ結んだサイドテール",
  "マッシュ系ベリーショート",
  "三つ編みツインテール",
  "低い位置でまとめたポニーテール",
  "レイヤー入りボブ",
  "巻き髪のセミロング",
  "姫カット(サイドの一部を短く残したロング)",
  "編み込みハーフアップ",
  "ローポニーテール+三つ編み",
  "くるりんぱのハーフアップ",
  "ショートツインテール",
  "肩に少しかかるストレートセミロング",
  "パーマがかった無造作ロング",
  "片編み込みを流したサイドスタイル",
];

const BANGS = [
  "パッツン前髪",
  "センター分け前髪",
  "斜め流し前髪",
  "シースルーバング",
  "かきあげ前髪",
  "眉上のショート前髪",
  "前髪なし(オールバック寄り)",
  "束感のある軽めの前髪",
];

// 「表情」ではなく恒常的な"顔つき"(骨格・目の形の印象)。口元は全パターン共通で
// 自然な微笑みに固定し、感情の一時的な揺れ(ウインク・驚き等)は含めない。
// 幼くなりすぎないことは大前提としつつ、目つきが強く/悪く見えすぎないよう
// 優しい系と凛とした系のバランスを取る(元は「大人びた」を全項目に強く
// 効かせすぎて目つきが悪い印象に偏った反省を反映)。
const FACIAL_FEATURES = [
  "たれ目がちで優しい顔つき",
  "つり目がちだが柔らかい印象の顔つき",
  "ジト目で気だるげな大人っぽい顔つき",
  "くりくり大きな丸目で愛らしい顔つき",
  "切れ長の目で落ち着いた大人びた顔つき",
  "涼しげな目元で穏やかな顔つき",
  "キリッとした眉と目で凛々しいが親しみやすい顔つき",
  "アーモンドアイで優しく知的な顔つき",
  "ぱっちりした二重で人懐っこい顔つき",
  "細めの目で上品な顔つき",
  "少し垂れ気味の丸目でおっとりした顔つき",
  "はっきりした二重でさっぱりした顔つき",
];

const OUTFITS = [
  "ハイネックのボディスーツ+ショートケープ",
  "オフショルダーのステージ衣装+フリル",
  "ミリタリー風ジャケット+ショートパンツ",
  "チャイナ襟のマイクロドレス",
  "パーカー+ショートパンツのストリート系",
  "セーラー風アイドル衣装",
  "コルセット付きゴシック風ドレス",
  "スポーティなクロップトップ+レギンス",
  "ケープ付きのAラインワンピース",
  "フリルブラウス+サスペンダースカート",
  "レザージャケット+タイトスカート",
  "ノースリーブニット+プリーツスカート",
  "アシンメトリーなワンピース",
  "学ラン風ジャケット+リボンタイ",
  "デニムジャケット+ショートオーバーオール",
  "シフォンブラウス+ハイウエストスカート",
  "ノースリーブタートルネック+ロングスカート",
  "ベロア素材のジャケット+ミニスカート",
  "サロペット風ワンピース",
  "ラッフル袖ブラウス+キュロット",
];

// 髪型自体は通常の範囲(HAIRSTYLES)に留め、ここでは控えめな装飾品のみを扱う。
// 猫耳ヘッドホン等の目立つコスチューム系小物は不要(過剰に頻出したため削除)。
const ACCESSORIES = [
  "小さな一粒ピアス",
  "シンプルなヘアクリップ",
  "細いチョーカー",
  "小さなリボンの髪飾り",
  "片耳だけの小さなピアス",
  "アクセサリーなし(素顔のまま)",
  "小ぶりのフープピアス",
  "髪に挿した一輪の花飾り",
  "軽めのシルバーネックレス",
  "丸メガネ(伊達)",
  "小さな星形の髪飾り",
  "細めのヘアバンド",
];

// FULL_SPACE = 髪型×前髪×顔つきの組み合わせ総数(14*8*12=1344)。
// 実際に書き出す人数(OUTPUT_COUNT=320)より意図的にかなり大きくしてあり、
// 「組み合わせを一巡させて使い回す」のではなく、大きなプールからその都度
// 違う組み合わせを引けるようにしている(＝組み合わせの母数自体を増やす)。
const FULL_SPACE = HAIRSTYLES.length * BANGS.length * FACIAL_FEATURES.length;
const OUTPUT_COUNT = 320;

// 決め打ちの周回順のままだと、先頭からの連続64件のような部分区間で
// 遅く周回する軸(顔つき等)がほとんど変化せず偏ってしまう
// (実際に発生したバグ: バッチ1の64件で顔つきが8種中2種しか出なかった)。
// シード固定の擬似乱数でシャッフルした順序を経由することで、
// どの範囲を切り取っても各軸がまんべんなく混ざるようにする。
// シードは固定なので再生成しても毎回同じ並びになる(再現性は保つ)。
const SHUFFLE_SEED = 20260725;

function seededShuffle(array, seed) {
  const arr = array.slice();
  let s = seed >>> 0;
  function rand() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const POSITION_ORDER = seededShuffle(
  Array.from({ length: FULL_SPACE }, (_, i) => i),
  SHUFFLE_SEED
);

function buildPaletteText(theme) {
  return (
    `髪のベースカラーは${theme.hairBase}、毛束の一部(全体の1〜2割、まとまった房として)だけ` +
    `${theme.hairAccent}の差し色を入れる。瞳は${theme.eyes}。` +
    `衣装の生地本体は${theme.outfitBase}、縁取り・ラインのアクセントのみ${theme.outfitAccent}` +
    `(面積は生地全体の1割以下)。肌は${theme.skin}。` +
    `各パーツの色相がはっきり見分けられるようにしつつ、髪・瞳・肌には` +
    `自然なハイライトと柔らかい陰影を入れて可愛らしく仕上げる(完全な単色ベタ塗りにはしない)`
  );
}

function buildVariation(index) {
  // POSITION_ORDERでシャッフルした位置を経由することで、連続した範囲
  // (例:先頭64件)を切り出しても各軸がまんべんなく混ざるようにする。
  const pos = POSITION_ORDER[index];
  const hairIdx = pos % HAIRSTYLES.length;
  const bangsIdx = Math.floor(pos / HAIRSTYLES.length) % BANGS.length;
  const featureIdx =
    Math.floor(pos / (HAIRSTYLES.length * BANGS.length)) % FACIAL_FEATURES.length;
  // 衣装/アクセサリー/配色テーマは独立周回。位相をずらして髪型と連動して見えないようにする。
  const outfitIdx = (pos * 3 + 1) % OUTFITS.length;
  const accessoryIdx = (pos * 5 + 2) % ACCESSORIES.length;
  const themeIdx = (pos * 7 + 4) % COLOR_THEMES.length;
  const theme = COLOR_THEMES[themeIdx];

  const parts = {
    id: `portrait_${String(index + 1).padStart(3, "0")}`,
    colorTheme: theme.name,
    hairstyle: HAIRSTYLES[hairIdx],
    bangs: BANGS[bangsIdx],
    facialFeatures: FACIAL_FEATURES[featureIdx],
    outfit: OUTFITS[outfitIdx],
    accessory: ACCESSORIES[accessoryIdx],
  };

  parts.prompt =
    `バストアップのアニメ風女性アイドルキャラクターの顔グラフィック。` +
    `日本のフラグシップ級スマホゲーム/アニメ相当の高品質なイラスト。` +
    `プロのアニメーターによる繊細な線画と丁寧な塗り、可愛らしい絵柄。` +
    `18〜22歳程度の落ち着いた大人っぽい顔立ち(幼くなりすぎないこと)。` +
    `${buildPaletteText(theme)}。` +
    `以下は目安・参考であり、この範囲で自然になるようGemini自身の解釈で` +
    `自由にアレンジしてよい(後れ毛や小さな装飾などの細部は指定に無い範囲で` +
    `自由に描いてよく、それが自然なランダム感になる)：` +
    `髪型は${parts.hairstyle}(${parts.bangs})を参考に。` +
    `${parts.facialFeatures}を参考に、口元は自然な微笑み。` +
    `衣装は${parts.outfit}を参考に。` +
    `アクセサリーは${parts.accessory}を参考に。` +
    `構図は正面〜斜め45度程度の範囲で自然に。` +
    `256x256相当、背景は白一色、ソフトなセルシェーディング。` +
    `同じカテゴリ名の指定であっても、毛束の長さ・太さ・結び位置・ボリューム感等の` +
    `細部は自然にばらつかせ、量産的に似た見た目にならないようにすること。` +
    `(ただし配色の6項目だけは指定通り厳守すること)`;

  return parts;
}

function buildAllVariations(count = OUTPUT_COUNT) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(buildVariation(i));
  }
  return list;
}

// Node から直接実行された場合は標準出力にJSONを吐く(生成バッチの台帳として使う)
if (typeof require !== "undefined" && require.main === module) {
  const list = buildAllVariations();
  console.log(JSON.stringify(list, null, 2));
}

module.exports = { buildAllVariations, buildVariation, FULL_SPACE, OUTPUT_COUNT, COLOR_THEMES };
