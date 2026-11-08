// TMのお知らせをPDFにする（2026年11月8日 本人の希望）。
// iPhoneのSafariはWordの表の幅を守らず、表が縮んで見えるため、見た目が固定されるPDFで書き出す。
// A4の絵をブラウザの中で描き、その絵を1ページのPDFに入れる。インターネットにも外部の部品にも頼らない。
// 寸法は過去のTM（Wordの見た目）に合わせる。
import { tmPrepare } from './tm.js';

const PAGE_W = 21.0, PAGE_H = 29.7;   // A4（cm）
const DPI = 300;
const PX_PER_CM = DPI / 2.54;
const PT_PER_CM = 72 / 2.54;

const MINCHO = '"Yu Mincho", "游明朝", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "Noto Serif CJK JP", serif';
const GOTHIC = '"HGP創英角ｺﾞｼｯｸUB", "Hiragino Kaku Gothic StdN", "Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
const PURPLE = '#7030A0', YELLOW = '#FFFF00';

const COLS = [0.74, 3.49, 3.0, 1.05, 2.94, 3.0, 2.92];   // 列の幅（cm。見本のまま）
const HEAD = [1.3, 1.35], ROW = 1.3;                      // 行の高さ（cm。見本のまま）
const THICK = 1.5, THIN = 0.75;                           // 線の太さ（pt）
const LEFT = 1.9, TOP = 2.54, TEXT_W = PAGE_W - LEFT * 2;
const BOTTOM = 28.2;                                      // 文字を入れてよい下のはし（cm）
const LINE_STEPS = [1.27, 1.0, 0.8, 0.65];                // 本文の行の間隔（cm）。入りきらないときだけ詰める
const CIRCLED = '①②③④⑤⑥⑦⑧';
const NO_LINE_START = '。、）」』！？';                   // 行の頭に来ないようにする字

function wrap(ctx, text, maxPx) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (cur && ctx.measureText(cur + ch).width > maxPx && !NO_LINE_START.includes(ch)) { lines.push(cur); cur = ch; } else cur += ch;
  }
  lines.push(cur);
  return lines;
}

/** 1ページを描いて、いちばん下の位置（cm）を返す */
function draw(ctx, p, pic, lineH, u, ox) {
  const X = (cm) => ox + cm * u, Y = (cm) => cm * u;
  const setFont = (pt, family = MINCHO, weight = '') => { ctx.font = `${weight} ${pt / PT_PER_CM * u}px ${family}`.trim(); };
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 「SPORT FC」とスポルトン（文字の横に並べる）
  const base = TOP + (pic ? 1.75 : 0.9);
  setFont(24, GOTHIC, '900');
  const parts = [['SPO', PURPLE], ['R', YELLOW], ['T FC', PURPLE]];
  const textW = parts.reduce((a, [s]) => a + ctx.measureText(s).width, 0);
  const picH = 2.0, picW = pic ? picH * pic.width / pic.height : 0, gap = pic ? 0.15 : 0;
  let x = (PAGE_W * u - (textW + (picW + gap) * u)) / 2 + ox;
  for (const [s, color] of parts) { ctx.fillStyle = color; ctx.fillText(s, x, Y(base)); x += ctx.measureText(s).width; }
  if (pic) ctx.drawImage(pic, x + gap * u, Y(base - picH + 0.1), picW * u, picH * u);

  // 上の文
  ctx.fillStyle = '#000';
  setFont(12);
  let y = base + 0.45;
  const { target, date, place, teams, time } = p.lines;
  for (const s of [target, date, place, '●参加チーム', teams, time]) {
    y += lineH;
    wrap(ctx, s, TEXT_W * u).forEach((l, i) => { if (i) y += 0.6; ctx.fillText(l, X(LEFT), Y(y)); });
  }

  // 表
  const tableW = COLS.reduce((a, b) => a + b, 0);
  const x0 = (PAGE_W - tableW) / 2, top = y + 0.5;
  const edges = COLS.reduce((a, c) => [...a, a[a.length - 1] + c], [x0]);
  const rowY = [top, top + HEAD[0], top + HEAD[0] + HEAD[1]];
  p.matches.forEach(() => rowY.push(rowY[rowY.length - 1] + ROW));
  const headBottom = rowY[2], end = rowY[rowY.length - 1];
  const line = (x1, y1, x2, y2, w) => {
    ctx.lineWidth = w / PT_PER_CM * u;
    ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke();
  };
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'square';
  // 横線：見出しの中の線は「審判」の下だけ。試合の行のあいだは細い線
  line(edges[5], rowY[1], edges[7], rowY[1], THIN);
  line(edges[0], headBottom, edges[7], headBottom, THICK);
  rowY.slice(3, -1).forEach((yy) => line(edges[0], yy, edges[7], yy, THIN));
  // 縦線：対戦表の中と前半／後半のあいだは細い線
  [1, 2, 5].forEach((i) => line(edges[i], top, edges[i], end, THICK));
  [3, 4].forEach((i) => line(edges[i], headBottom, edges[i], end, THIN));
  line(edges[6], rowY[1], edges[6], end, THIN);
  // 外わく
  line(edges[0], top, edges[7], top, THICK);
  line(edges[0], end, edges[7], end, THICK);
  line(edges[0], top, edges[0], end, THICK);
  line(edges[7], top, edges[7], end, THICK);

  // 表の字（マスに入らない長い名前だけ小さくする）
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cell = (s, from, to, yTop, yEnd) => {
    if (!s) return;
    const maxW = (edges[to] - edges[from] - 0.14) * u;
    let pt = 12;
    setFont(pt);
    while (pt > 7 && ctx.measureText(s).width > maxW) { pt -= 0.5; setFont(pt); }
    ctx.fillText(s, X((edges[from] + edges[to]) / 2), Y((yTop + yEnd) / 2), maxW);
  };
  cell('タイムテーブル', 1, 2, top, headBottom);
  cell('対戦表', 2, 5, top, headBottom);
  cell('審判', 5, 7, top, rowY[1]);
  cell('前半', 5, 6, rowY[1], headBottom);
  cell('後半', 6, 7, rowY[1], headBottom);
  p.matches.forEach((m, i) => {
    const a = rowY[i + 2], b = rowY[i + 3];
    [CIRCLED[i] || String(m.no), `${m.from} ～ ${m.to}`, m.home, '－', m.away, m.ref1, m.ref2]
      .forEach((s, c) => cell(s, c, c + 1, a, b));
  });

  // 注意書き
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  setFont(12);
  y = end + 0.25;
  for (const n of p.notes) {
    for (const l of wrap(ctx, `※　${n}`, TEXT_W * u)) { y += 0.58; ctx.fillText(l, X(LEFT), Y(y)); }
  }
  y += 0.2;
  for (const l of wrap(ctx, p.closing, TEXT_W * u)) { y += 0.62; ctx.fillText(l, X(LEFT), Y(y)); }
  return y;
}

/** A4のお知らせの絵（canvas）を作る。長いときは行を詰め、それでも入らなければ全体を少し縮める */
export async function tmCanvas(t, img) {
  const p = tmPrepare(t);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_W * PX_PER_CM);
  canvas.height = Math.round(PAGE_H * PX_PER_CM);
  const ctx = canvas.getContext('2d');
  let pic = null;
  try { if (img?.sporton) pic = await createImageBitmap(new Blob([img.sporton.bytes], { type: 'image/png' })); } catch { /* 絵なしで作る */ }

  let bottom = 0;
  for (const lineH of LINE_STEPS) {
    bottom = draw(ctx, p, pic, lineH, PX_PER_CM, 0);
    if (bottom <= BOTTOM) return canvas;
  }
  const k = BOTTOM / bottom;
  draw(ctx, p, pic, LINE_STEPS[LINE_STEPS.length - 1], PX_PER_CM * k, PAGE_W * PX_PER_CM * (1 - k) / 2);
  return canvas;
}

/** JPEGの絵を、A4・1ページのPDFにする */
export function jpegToPdf(jpeg, pxW, pxH) {
  const W = (PAGE_W * PT_PER_CM).toFixed(2), H = (PAGE_H * PT_PER_CM).toFixed(2);
  const enc = new TextEncoder();
  const chunks = [], offsets = [];
  let pos = 0;
  const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
  const stream = (n, dict, data) => {
    offsets[n] = pos;
    add(`${n} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`);
    add(data);
    add('\nendstream\nendobj\n');
  };
  const obj = (n, body) => { offsets[n] = pos; add(`${n} 0 obj\n${body}\nendobj\n`); };

  add('%PDF-1.4\n');
  add(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  stream(4, `/Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpeg);
  stream(5, '', enc.encode(`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`));

  const xref = pos;
  add(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(pos);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** TMのお知らせのPDF（Uint8Array）を作る */
export async function tmPdf(t, img) {
  const canvas = await tmCanvas(t, img);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) throw new Error('画像を作れませんでした');
  return jpegToPdf(new Uint8Array(await blob.arrayBuffer()), canvas.width, canvas.height);
}
