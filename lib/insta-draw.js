// SPORT AI事務局：Instagramの画像を描く（デザイン 2026年11月 作り直し）
// 本人「濃い紫でださい」→ 写真が主役。生成り色の地＋墨色の字、紫と黄色は小さく効かせるだけ。
// ふつうのスクリプトとしても、モジュールとしても読める（AI社員が使う render.html と、Instagramタブの両方で使う）。
// globalThis.InstaDraw.draw(canvas, spec, images) で描く。
//   spec: { layout: 'scene' | 'trial', pillar, quote, quoteWho, title, sub, details[], photoIndex }
//   images: { photo: HTMLImageElement|null, mascot: HTMLImageElement|null }
(function (g) {
  const SANS = '"Noto Sans JP","Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","Yu Gothic","Meiryo",sans-serif';
  const SERIF = '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho","BIZ UDMincho",serif';
  const C = {
    paper: '#f5f1ea',   // 生成り
    ink: '#1c1726',     // 墨
    soft: '#6d6577',    // うすい墨
    line: '#d9d1c4',
    accent: '#6b2fd6',  // 紫（小さく使う）
    yellow: '#ffd84d',  // 黄色（マーカー）
  };
  const W = 1080, H = 1350, M = 84;

  const NO_LINE_START = '、。，．・）」』】ー！？ぁぃぅぇぉっゃゅょァィゥェォッャュョ';
  const BREAK_AFTER = '、。」』）！？・ はがをに';
  function wrap(ctx, text, maxW) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const ch of para) {
        if (ctx.measureText(line + ch).width > maxW && line) {
          // ことばの途中で切らない：句読点や助詞のあと（行の後ろ半分）で切る
          const arr = [...line];
          let cut = -1;
          for (let i = arr.length - 1; i >= Math.ceil(arr.length * 0.45); i--) {
            if (BREAK_AFTER.includes(arr[i]) && !NO_LINE_START.includes(arr[i + 1] || '')) { cut = i + 1; break; }
          }
          if (cut > 0 && cut < arr.length) { out.push(arr.slice(0, cut).join('')); line = arr.slice(cut).join('') + ch; }
          else if (NO_LINE_START.includes(ch)) { out.push(line.slice(0, -1)); line = line.slice(-1) + ch; }
          else { out.push(line); line = ch; }
        } else line += ch;
      }
      if (line) out.push(line);
    }
    return out;
  }
  /** 決まった行数に入るまで字を小さくする（最後の行が1〜2文字にならないように） */
  function fit(ctx, text, maxW, size, minSize, maxLines, weight, family) {
    let fallback = null;
    for (let s = size; s >= minSize; s -= 2) {
      ctx.font = `${weight} ${s}px ${family}`;
      const ls = wrap(ctx, text, maxW);
      if (ls.length > maxLines) continue;
      if (ls.length === 1 || [...ls[ls.length - 1]].length > 2) return { size: s, lines: ls };
      fallback = fallback || { size: s, lines: ls };
    }
    if (fallback) return fallback;
    ctx.font = `${weight} ${minSize}px ${family}`;
    return { size: minSize, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
  }

  function cover(ctx, img, x, y, w, h, fx = 50, fy = 50) {
    const s = Math.max(w / img.width, h / img.height);
    const iw = img.width * s, ih = img.height * s;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(img, x + (w - iw) * (fx / 100), y + (h - ih) * (fy / 100), iw, ih);
    ctx.restore();
  }

  /** 左上のロゴ文字 */
  function wordmark(ctx, x, y, color) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.font = `800 30px ${SANS}`;
    spaced(ctx, 'SPORT FC', x, y, 6);
    ctx.font = `500 18px ${SANS}`;
    ctx.globalAlpha = 0.75;
    spaced(ctx, 'SHIMAMOTO  JUNIOR FOOTBALL', x, y + 30, 3);
    ctx.globalAlpha = 1;
  }
  function spaced(ctx, t, x, y, sp) {
    let cx = x;
    for (const ch of t) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
    return cx;
  }

  /** 小さなラベル（例：めざす選手像） */
  function label(ctx, text, x, y, color) {
    ctx.font = `700 26px ${SANS}`;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 9, 36, 3);
    const end = spaced(ctx, text, x + 50, y, 3);
    return end;
  }

  /** 黄色のマーカーを引いた見出し */
  function marker(ctx, lines, x, y, size, lh) {
    ctx.font = `900 ${size}px ${SANS}`;
    for (const l of lines) {
      const w = ctx.measureText(l).width;
      ctx.fillStyle = C.yellow;
      ctx.fillRect(x - 6, y - size * 0.36, w + 12, size * 0.42);
      ctx.fillStyle = C.ink;
      ctx.fillText(l, x, y);
      y += lh;
    }
    return y;
  }

  function mascot(ctx, img, h, x, y) {
    if (!img) return;
    const w = img.width * (h / img.height);
    ctx.drawImage(img, x - w, y - h, w, h);
  }

  // ---------- めざす選手像の場面 ----------
  function drawScene(ctx, spec, im) {
    const quote = (spec.quote || '').trim();
    const pillar = spec.pillar || '';
    if (im.photo) {
      // 写真が主役。下に生成りの帯
      const panelH = quote ? 470 : 330;
      cover(ctx, im.photo, 0, 0, W, H - panelH, spec.fx, spec.fy);
      ctx.fillStyle = C.paper; ctx.fillRect(0, H - panelH, W, panelH);
      // 写真の上のロゴ（読めるように少し影）
      const gr = ctx.createLinearGradient(0, 0, 0, 220);
      gr.addColorStop(0, 'rgba(0,0,0,.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 220);
      wordmark(ctx, M, 96, '#ffffff');
      let y = H - panelH + 92;
      if (quote) {
        const t = fit(ctx, `「${quote}」`, W - M * 2, 54, 36, 3, 700, SERIF);
        ctx.fillStyle = C.ink;
        for (const l of t.lines) { ctx.font = `700 ${t.size}px ${SERIF}`; ctx.fillText(l, M, y); y += t.size * 1.45; }
        if (spec.quoteWho) { ctx.font = `500 26px ${SANS}`; ctx.fillStyle = C.soft; ctx.fillText(`― ${spec.quoteWho}`, M, y + 2); }
        y = H - 120;
      }
      label(ctx, 'めざす選手像', M, y, C.accent);
      const p = fit(ctx, pillar, W - M * 2, 50, 34, 1, 800, SANS);
      ctx.fillStyle = C.ink; ctx.font = `800 ${p.size}px ${SANS}`;
      ctx.fillText(p.lines[0] || '', M, y + 66);
      return;
    }
    // 写真なし：言葉が主役
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    wordmark(ctx, M, 120, C.ink);
    if (quote) {
      ctx.fillStyle = C.accent; ctx.globalAlpha = 0.12;
      ctx.font = `900 520px ${SERIF}`; ctx.fillText('“', M - 30, 720);
      ctx.globalAlpha = 1;
      const t = fit(ctx, quote, W - M * 2, 92, 54, 5, 700, SERIF);
      let y = 420;
      ctx.fillStyle = C.ink;
      for (const l of t.lines) { ctx.font = `700 ${t.size}px ${SERIF}`; ctx.fillText(l, M, y); y += t.size * 1.5; }
      if (spec.quoteWho) { ctx.font = `500 32px ${SANS}`; ctx.fillStyle = C.soft; ctx.fillText(`― ${spec.quoteWho}`, M, y + 16); }
    } else {
      ctx.font = `700 30px ${SANS}`; ctx.fillStyle = C.soft;
      ctx.fillText('SPORT FCがめざす選手像', M, 470);
      const t = fit(ctx, pillar, W - M * 2, 104, 64, 4, 900, SANS);
      marker(ctx, t.lines, M, 470 + t.size * 1.5, t.size, t.size * 1.45);
    }
    ctx.fillStyle = C.line; ctx.fillRect(M, H - 250, W - M * 2, 2);
    if (quote) {
      label(ctx, 'めざす選手像', M, H - 180, C.accent);
      const p = fit(ctx, pillar, W - M * 2 - 220, 44, 30, 2, 800, SANS);
      ctx.fillStyle = C.ink;
      p.lines.forEach((l, i) => { ctx.font = `800 ${p.size}px ${SANS}`; ctx.fillText(l, M, H - 118 + i * p.size * 1.3); });
    } else {
      ctx.font = `500 28px ${SANS}`; ctx.fillStyle = C.soft;
      ctx.fillText('島本町の少年サッカーチーム', M, H - 160);
    }
    mascot(ctx, im.mascot, 210, W - M + 20, H - 40);
  }

  // ---------- 見学・体験の案内 ----------
  function drawTrial(ctx, spec, im) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    const title = spec.title || '見学・無料体験 受付中';
    const details = (spec.details || []).filter(Boolean);
    let y;
    if (im.photo) {
      const ph = 760;
      cover(ctx, im.photo, 0, 0, W, ph, spec.fx, spec.fy);
      const gr = ctx.createLinearGradient(0, 0, 0, 220);
      gr.addColorStop(0, 'rgba(0,0,0,.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, 220);
      wordmark(ctx, M, 96, '#ffffff');
      y = ph + 110;
      const t = fit(ctx, title, W - M * 2, 80, 52, 2, 900, SANS);
      y = marker(ctx, t.lines, M, y, t.size, t.size * 1.35);
    } else {
      wordmark(ctx, M, 120, C.ink);
      y = 400;
      label(ctx, 'FREE TRIAL', M, y - 60, C.accent);
      const t = fit(ctx, title, W - M * 2, 120, 70, 3, 900, SANS);
      y = marker(ctx, t.lines, M, y + t.size * 0.6, t.size, t.size * 1.4);
    }
    if (spec.sub) { ctx.font = `700 40px ${SANS}`; ctx.fillStyle = C.accent; ctx.fillText(spec.sub, M, y + 20); y += 80; }
    ctx.font = `500 34px ${SANS}`; ctx.fillStyle = C.ink;
    for (const d of details) for (const l of wrap(ctx, d, W - M * 2 - 240)) { if (y > H - 200) break; ctx.fillText(l, M, y + 10); y += 52; }
    ctx.fillStyle = C.line; ctx.fillRect(M, H - 170, W - M * 2, 2);
    ctx.font = `700 30px ${SANS}`; ctx.fillStyle = C.ink;
    ctx.fillText('お申し込みは、プロフィールのリンクから', M, H - 100);
    mascot(ctx, im.mascot, im.photo ? 190 : 260, W - M + 20, H - 190);
  }

  // 2枚目からの写真：そのまま、右下に小さくロゴ
  function drawPlain(ctx, spec, im) {
    if (!im.photo) { ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H); return; }
    cover(ctx, im.photo, 0, 0, W, H, spec.fx, spec.fy);
  }

  function draw(canvas, spec, im = {}) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    if (spec.plain) drawPlain(ctx, spec, im);
    else if (spec.layout === 'trial') drawTrial(ctx, spec, im);
    else drawScene(ctx, spec, im);
  }

  g.InstaDraw = { draw, W, H, COLORS: C };
})(typeof window !== 'undefined' ? window : globalThis);
