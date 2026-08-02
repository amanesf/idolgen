// バッチ3のグリッドシート全体(2048x2048)に対して、各セル(256x256)右上の
// 意図しない色ドットだけを、ドットとほぼ同サイズの円形パッチで消す。
// 元のraw画像は一切書き換えず、修正版を別ファイルとして書き出す。
// (切り出し(個別320ファイル化)はしない方針に変更したため、
//  グリッドシート単位で直接補正する)
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = path.join(
  __dirname,
  "gemini-test-output",
  "2026-07-25T12-46-26-764Z_editquality_batch3_raw_0.jpg"
);
const OUT = path.join(__dirname, "sheets", "batch3.webp");

const CELL_SIZE = 256;
const GRID = 8;
// v2(リテイク後)画像で複数セル実測した位置・サイズ(中心(226,30)、半径16.5)
// に、はみ出し防止の余白を少し足した値。四角ではなく円形にして髪の輪郭を
// 巻き込みにくくする。
const DOT_CENTER = { x: 226, y: 30 };
const DOT_RADIUS = 21;

async function main() {
  fs.mkdirSync(path.join(__dirname, "sheets"), { recursive: true });

  const patchSize = DOT_RADIUS * 2;
  const patchSvg = `<svg width="${patchSize}" height="${patchSize}">
    <circle cx="${DOT_RADIUS}" cy="${DOT_RADIUS}" r="${DOT_RADIUS}" fill="white"/>
  </svg>`;
  const patchBuffer = await sharp(Buffer.from(patchSvg)).png().toBuffer();

  const composites = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      composites.push({
        input: patchBuffer,
        left: col * CELL_SIZE + (DOT_CENTER.x - DOT_RADIUS),
        top: row * CELL_SIZE + (DOT_CENTER.y - DOT_RADIUS),
      });
    }
  }

  await sharp(SRC).composite(composites).webp({ quality: 90 }).toFile(OUT);
  console.log("saved:", OUT);
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
