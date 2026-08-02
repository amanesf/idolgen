// super2d の gemini_call.js (実運用実績あり) をテキストのみ・入力画像なしの
// 呼び出しで使うための単発検証ランナー。APIキーは環境変数から読むのみで
// このファイルにもログにも書き込まない。
// 使い方: node run-grid-test.js [batchNumber(1始まり)]
const fs = require("fs");
const path = require("path");
const { callGemini, saveRaw } = require("/workspace/super2d/scripts/gemini_call.js");

async function main() {
  const batchNumber = Number(process.argv[2] || 1);
  const promptFile = `grid-prompt-batch${batchNumber}.txt`;
  const promptText = fs.readFileSync(path.join(__dirname, promptFile), "utf8");
  const outDir = path.join(__dirname, "gemini-test-output");
  const label = `grid64_batch${batchNumber}`;

  const response = await callGemini({
    promptText,
    imagePaths: [],
    model: "gemini-3.1-flash-image",
    imageSize: "2K",
    aspectRatio: "1:1",
  });

  const { responsePath, savedImages, logEntry } = saveRaw({
    response,
    outDir,
    label,
    promptFile,
    imagePaths: [],
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
