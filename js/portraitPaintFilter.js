// ポートレート画像に「厚塗り(ソシャゲ塗り)」寄りの質感を後がけで与える
// ランタイム・Canvasフィルター。元のスプライトシート画像ファイルは
// 一切書き換えず、描画時にcanvas上で以下の3段階の合成を行うだけ。
//
// 1. ソフトブレンド: ぼかしたコピーをsoft-lightで薄く重ね、セル塗りの
//    硬い陰影境界線をなじませる(=厚塗りの「グラデーションで繋がった
//    陰影」に近づける)。
// 2. ブルーム: 明るい部分(ハイライト・白目・肌の照り返し等)だけを
//    しきい値で抽出してぼかし、screenで重ねて艶っぽい発光感を足す。
// 3. 彩度・コントラストの微調整で全体の密度感を底上げする。
//
// white(#fff)背景に対してsoft-light/screenは常にwhiteのままになる
// 性質を利用しているため、背景ににじみやグレーがかった色が乗らない。
(function (global) {
  "use strict";

  function cloneCanvas(source) {
    const c = document.createElement("canvas");
    c.width = source.width;
    c.height = source.height;
    c.getContext("2d").drawImage(source, 0, 0);
    return c;
  }

  function blurredCopy(source, blurPx) {
    const c = document.createElement("canvas");
    c.width = source.width;
    c.height = source.height;
    const ctx = c.getContext("2d");
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(source, 0, 0);
    ctx.filter = "none";
    return c;
  }

  // 明度がthreshold(0〜1)を超えるピクセルだけを残し、他は透明にする。
  function extractBrightAreas(source, threshold) {
    const c = document.createElement("canvas");
    c.width = source.width;
    c.height = source.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(source, 0, 0);
    const imageData = ctx.getImageData(0, 0, c.width, c.height);
    const data = imageData.data;
    const cut = threshold * 255;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < cut) data[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
    return c;
  }

  // sourceCanvas(すでに切り出し・色変換済みのportraitキャンバス等)に
  // 厚塗り風フィルターをかけた新しいcanvasを返す。sourceCanvas自体は
  // 変更しない。
  // options: { softenBlurPx, softenOpacity, bloomThreshold, bloomBlurPx,
  //            bloomOpacity, saturate, contrast }
  function applyPaintFilter(sourceCanvas, options) {
    const opts = {
      softenBlurPx: 2,
      softenOpacity: 0.09,
      softenBlendMode: "overlay",
      bloomThreshold: 0.88,
      bloomBlurPx: 3,
      bloomOpacity: 0.18,
      saturate: 1.06,
      contrast: 1.05,
      ...options,
    };

    const out = cloneCanvas(sourceCanvas);
    const ctx = out.getContext("2d");

    // 1. ソフトブレンドで陰影境界をなじませる。soft-lightは暗部まで
    // 明るくして全体が色褪せて見えたため、暗部は保ちつつ中間〜明部の
    // コントラストを持ち上げるoverlayに変更。
    const softBlur = blurredCopy(sourceCanvas, opts.softenBlurPx);
    ctx.globalAlpha = opts.softenOpacity;
    ctx.globalCompositeOperation = opts.softenBlendMode;
    ctx.drawImage(softBlur, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // 2. ブルームでハイライトに艶を足す
    const bright = extractBrightAreas(out, opts.bloomThreshold);
    const bloom = blurredCopy(bright, opts.bloomBlurPx);
    ctx.globalAlpha = opts.bloomOpacity;
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(bloom, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // 3. 彩度・コントラストの微調整
    const final = document.createElement("canvas");
    final.width = out.width;
    final.height = out.height;
    const fctx = final.getContext("2d");
    fctx.filter = `saturate(${opts.saturate}) contrast(${opts.contrast})`;
    fctx.drawImage(out, 0, 0);
    fctx.filter = "none";

    return final;
  }

  global.PortraitPaintFilter = { applyPaintFilter };
})(window);
