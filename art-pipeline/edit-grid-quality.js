// 既に生成済みのグリッド画像(8x8=64人)をGeminiにもう一度通し、
// 同じ64人・同じレイアウトのまま目の表情とクオリティだけをリテイクする。
// 使い方: node edit-grid-quality.js [batchNumber(1始まり)] [inputImagePath] [promptFile]
//   inputImagePathを省略した場合、gemini-test-output内のそのバッチの
//   最新raw画像を自動で使う。promptFileを省略した場合はedit-grid-prompt.txt。
const fs = require("fs");
const path = require("path");
const { callGemini, saveRaw } = require("/workspace/super2d/scripts/gemini_call.js");

function findLatestRaw(outDir, batchNumber) {
  const files = fs
    .readdirSync(outDir)
    .filter((f) => f.includes(`grid64_batch${batchNumber}_raw_0`))
    .sort(); // ISOタイムスタンプ接頭辞なので文字列ソートで新しい順になる
  if (files.length === 0) throw new Error(`batch${batchNumber}のraw画像が見つからない`);
  return path.join(outDir, files[files.length - 1]);
}

async function main() {
  const batchNumber = Number(process.argv[2] || 1);
  const outDir = path.join(__dirname, "gemini-test-output");
  const inputImage = process.argv[3] || findLatestRaw(outDir, batchNumber);
  const promptFile = process.argv[4] || "edit-grid-prompt.txt";
  const promptText = fs.readFileSync(path.join(__dirname, promptFile), "utf8");
  const label = `editquality_batch${batchNumber}_${path.basename(promptFile, ".txt")}`;

  console.log("input image:", inputImage);

  const response = await callGemini({
    promptText,
    imagePaths: [inputImage],
    model: "gemini-3.1-flash-image",
    imageSize: "2K",
    aspectRatio: "1:1",
  });

  const { responsePath, savedImages, logEntry } = saveRaw({
    response,
    outDir,
    label,
    promptFile,
    imagePaths: [inputImage],
    model: "gemini-3.1-flash-image",
    imageSize: "2K",
    aspectRatio: "1:1",
  });

  console.log("saved response:", responsePath);
  console.log("saved images:", savedImages);
  console.log("usageMetadata:", JSON.stringify(logEntry.usageMetadata));
  console.log("finishReason:", logEntry.finishReason);
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
