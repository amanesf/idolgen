// 5バッチぶんのグリッド画像(各2048x2048、8x8=64人分)を、切り出さずに
// スプライトシートのままWebPへ圧縮してsheets/へまとめる。
// バッチ3だけはfix-batch3-dots.jsの補正版を使う。
// 元のraw画像(gemini-test-output/)は一切書き換えない。
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const OUT_DIR = path.join(__dirname, "sheets");

function latestImageByLabel() {
  const logPath = path.join(__dirname, "gemini-test-output", "generation_log.jsonl");
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const map = {};
  for (const entry of lines) map[entry.label] = entry.savedImages[0];
  return map;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const latest = latestImageByLabel();

  for (let batchNumber = 1; batchNumber <= 5; batchNumber++) {
    const outPath = path.join(OUT_DIR, `batch${batchNumber}.webp`);

    if (batchNumber === 3) {
      // sheets/batch3.webp は fix-batch3-dots.js が別途生成する(ドット補正版)。
      // ここでは何もしない(先にnode fix-batch3-dots.jsを実行しておくこと)。
      if (!fs.existsSync(outPath)) {
        throw new Error("sheets/batch3.webp が無い。先に node fix-batch3-dots.js を実行すること");
      }
    } else {
      const label = `grid64_batch${batchNumber}`;
      const srcPath = latest[label];
      await sharp(srcPath).webp({ quality: 90 }).toFile(outPath);
    }
    const stat = fs.statSync(outPath);
    console.log(`batch${batchNumber}.webp: ${(stat.size / 1024).toFixed(0)}KB`);
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
