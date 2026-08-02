// 既存のポートレートシート(assets/portraits/sheetN.webp)をGeminiに通し、
// 同じ64人・同じレイアウトのまま2K高解像度に描き直す。
// 使い方: node upscale-sheet.js <sheetNumber(1始まり)>
const fs = require("fs");
const path = require("path");
const { callGemini, saveRaw } = require("/workspace/super2d/scripts/gemini_call.js");

async function main() {
  const sheetNumber = Number(process.argv[2] || 1);
  const inputImage = path.join(__dirname, "..", "assets", "portraits", `sheet${sheetNumber}.webp`);
  const promptText = fs.readFileSync(path.join(__dirname, "upscale-prompt.txt"), "utf8");
  const outDir = path.join(__dirname, "gemini-test-output");
  const label = `upscale_sheet${sheetNumber}`;

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
    promptFile: "upscale-prompt.txt",
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
