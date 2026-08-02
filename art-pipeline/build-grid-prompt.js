// N人ぶんのポートレートを1枚の8x8グリッド画像として1回のGemini呼び出しで
// 生成するためのプロンプト組み立てスクリプト。
// 使い方: node build-grid-prompt.js [batchNumber(1始まり)]
//   例: node build-grid-prompt.js 2   → portrait-prompts.jsonの65〜128件目を使う
//       省略時は1(先頭64件)。
const fs = require("fs");
const data = require("./portrait-prompts.json");

const BATCH_SIZE = 64;
const batchNumber = Number(process.argv[2] || 1);
const start = (batchNumber - 1) * BATCH_SIZE;
const batch = data.slice(start, start + BATCH_SIZE);

if (batch.length === 0) {
  throw new Error(`バッチ${batchNumber}に該当するデータが無い(start=${start}, data.length=${data.length})`);
}

const cellLines = batch.map((p, i) => {
  const row = Math.floor(i / 8) + 1;
  const col = (i % 8) + 1;
  return (
    `[${row}行${col}列] ${p.colorTheme}系。髪型:${p.hairstyle}(${p.bangs})。` +
    `顔つき:${p.facialFeatures}。衣装:${p.outfit}。アクセサリー:${p.accessory}。`
  );
});

const prompt =
  `2048x2048の正方形の画像を、256x256の${batch.length}マスからなる8行8列のグリッドとして使う。\n` +
  `日本のフラグシップ級スマホゲーム/アニメ相当の高品質なイラスト。プロのアニメーターによる` +
  `繊細な線画と丁寧な塗り。各マスにバストアップのアニメ風女性アイドルキャラクターを1人ずつ、` +
  `18〜22歳程度の顔立ちで描く(幼くなりすぎないが、目つきがきつくなりすぎないようバランスよく)。` +
  `構図は正面〜斜め45度程度の範囲で、マスごとに自然に変化させる。\n` +
  `可愛らしい絵柄。各パーツの色相がはっきり見分けられるようにしつつ、髪・瞳・肌には自然なハイライトと` +
  `柔らかい陰影を入れる(完全な単色ベタ塗りにはしない)。背景は全マス共通で白一色。\n` +
  `【最重要・とにかく全員バラけさせること】\n` +
  `- ${batch.length}マスは絶対に全員が別人であること。同じ顔・同じ髪型・同じ配色の組み合わせを` +
  `2マス以上に描いてはならない(列や行をコピーして繰り返すことも禁止)。\n` +
  `- 同じカテゴリ名の指定(例:複数人が"ツインテール"や"パーカー系")であっても、` +
  `毛束の長さ・太さ・結び位置・ボリューム感、衣装のディテールや丈の長さ等を一人ひとり自然に` +
  `ばらつかせ、量産的な使い回しに見えないようにすること。特に衣装のシルエットは、似た形の` +
  `ものが隣り合わないよう強く意識すること。\n` +
  `マスごとの指定は以下の通り(行1列1が左上、行8列8が右下)。これは目安・参考であり、` +
  `この範囲内でGemini自身の解釈で自然にアレンジしてよい(後れ毛や小物などの細部は指定に無い` +
  `範囲で自由に描いてよく、それが自然なランダム感になる。ただし配色の指定だけは厳守):\n` +
  cellLines.join("\n") +
  `\n\n繰り返すが、${batch.length}人全員が細部まで含めて明確に見分けられる別人であることが何よりも重要。` +
  `列や行で同じキャラクターを使い回さないこと。`;

const outPath = `${__dirname}/grid-prompt-batch${batchNumber}.txt`;
fs.writeFileSync(outPath, prompt, "utf8");
console.log("prompt length (chars):", prompt.length);
console.log("saved to", outPath);
