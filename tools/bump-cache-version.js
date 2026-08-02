#!/usr/bin/env node
// 更新を配信するたびにキャッシュを確実に無効化するためのスクリプト。
// index.html/scout-viewer.htmlの<script>/<link>と、js/*.js内の相対import
// (import ... from "./xxx.js")全てに同じ?v=<version>を付け直す。ESモジュールの
// importはURLが変わらない限りブラウザにキャッシュされ続けるため、エントリーの
// scriptタグだけをバージョニングしても、そこからimportされる先のモジュールが
// 古いままキャッシュされて更新が反映されないことがある。全ファイル・全import文に
// 同じバージョン文字列を一括で付け直すことでこれを防ぐ。
//
// 使い方: node tools/bump-cache-version.js
// (pushする前に毎回実行する。versionは実行時刻から自動生成される)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const version = String(Date.now());

function stampImports(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  const before = src;
  // "./xxx.js" / "../xxx.js" の相対import指定子だけを対象にする(外部URLやnode_modules経由は対象外)。
  // 既存の?v=...があれば剥がしてから付け直す(実行を何度重ねても安全)。
  src = src.replace(
    /from\s+"(\.\.?\/[^"]+?\.js)(?:\?v=\d+)?"/g,
    (_match, specifier) => `from "${specifier}?v=${version}"`
  );
  if (src !== before) fs.writeFileSync(filePath, src);
}

function stampHtml(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  const before = src;
  src = src
    .replace(/(src="[^"]+?\.js)(?:\?v=\d+)?"/g, `$1?v=${version}"`)
    .replace(/(href="[^"]+?\.css)(?:\?v=\d+)?"/g, `$1?v=${version}"`)
    .replace(
      /import\s+\{([^}]+)\}\s+from\s+"(\.\.?\/[^"]+?\.js)(?:\?v=\d+)?"/g,
      (_match, names, specifier) => `import {${names}} from "${specifier}?v=${version}"`
    );
  if (src !== before) fs.writeFileSync(filePath, src);
}

const jsDir = path.join(ROOT, "js");
for (const name of fs.readdirSync(jsDir)) {
  if (name.endsWith(".js")) stampImports(path.join(jsDir, name));
}

for (const name of ["index.html", "scout-viewer.html"]) {
  const p = path.join(ROOT, name);
  if (fs.existsSync(p)) stampHtml(p);
}

console.log(`cache version bumped to ${version}`);
