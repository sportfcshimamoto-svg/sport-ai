// PDFを作るための部品（大会タブ・TMタブで使う）。
// 1ページずつA4の絵（300dpi）をcanvasに描き、その絵をPDFのページにする。インターネットにも外部の部品にも頼らない。
// 長さはすべて cm で指定する（左上が 0,0）。

export const DPI = 300;
export const PT_PER_CM = 72 / 2.54;
const PX_PER_CM = DPI / 2.54;

// 字の形：パソコン（Windows）の見本の字 → iPhone・Mac → Android の順にさがす
export const MARU = '"HG丸ｺﾞｼｯｸM-PRO", "HGMaruGothicMPRO", "Hiragino Maru Gothic ProN", "Hiragino Maru Gothic Pro", "Yu Gothic", "YuGothic", "Noto Sans CJK JP", sans-serif';
export const MSGOTHIC = '"MS Gothic", "ＭＳ ゴシック", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP", monospace';
export const MINCHO = '"Yu Mincho", "游明朝", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "Noto Serif CJK JP", serif';

const NO_LINE_START = '。、）」』！？・ー';   // 行の頭に来ないようにする字

/** 1ページ分の絵 */
export class Page {
  constructor(wCm, hCm) {
    this.w = wCm; this.h = hCm;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(wCm * PX_PER_CM);
    this.canvas.height = Math.round(hCm * PX_PER_CM);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#000';
    this.ctx.strokeStyle = '#000';
    this.ctx.lineCap = 'square';
  }

  px(cm) { return cm * PX_PER_CM; }

  font(pt, family = MARU, weight = '') {
    this.ctx.font = `${weight} ${(pt / PT_PER_CM) * PX_PER_CM}px ${family}`.trim();
    this.pt = pt;
    return this;
  }

  /** 字の幅（cm） */
  width(s) { return this.ctx.measureText(String(s)).width / PX_PER_CM; }

  /** 字を書く。align: left/center/right、base: alphabetic（字の下）/middle */
  text(s, x, y, { align = 'left', base = 'alphabetic', color = '#000', maxW } = {}) {
    const c = this.ctx;
    c.fillStyle = color; c.textAlign = align; c.textBaseline = base;
    if (maxW) c.fillText(String(s), this.px(x), this.px(y), this.px(maxW));
    else c.fillText(String(s), this.px(x), this.px(y));
  }

  /** 枠の中の真ん中に字を書く。入らないときは字を小さくする（minPt まで） */
  fit(s, x1, y1, x2, y2, { pt = 10.5, family = MARU, minPt = 6, align = 'center', pad = 0.1, weight = '' } = {}) {
    if (s == null || s === '') return;
    const maxW = x2 - x1 - pad * 2;
    let p = pt;
    this.font(p, family, weight);
    while (p > minPt && this.width(s) > maxW) { p -= 0.5; this.font(p, family, weight); }
    const x = align === 'left' ? x1 + pad : align === 'right' ? x2 - pad : (x1 + x2) / 2;
    this.text(s, x, (y1 + y2) / 2 + 0.02, { align, base: 'middle', maxW });
  }

  /** 線（太さは pt） */
  line(x1, y1, x2, y2, wPt = 0.5) {
    const c = this.ctx;
    c.lineWidth = (wPt / PT_PER_CM) * PX_PER_CM;
    c.beginPath(); c.moveTo(this.px(x1), this.px(y1)); c.lineTo(this.px(x2), this.px(y2)); c.stroke();
  }

  rect(x, y, w, h, wPt = 0.5) {
    this.line(x, y, x + w, y, wPt); this.line(x, y + h, x + w, y + h, wPt);
    this.line(x, y, x, y + h, wPt); this.line(x + w, y, x + w, y + h, wPt);
  }

  image(bmp, x, y, w, h) { if (bmp) this.ctx.drawImage(bmp, this.px(x), this.px(y), this.px(w), this.px(h)); }

  /** 文を幅に合わせて折り返す → 行の配列 */
  wrap(text, maxW) {
    const lines = [];
    let cur = '';
    for (const ch of String(text)) {
      if (cur && this.width(cur + ch) > maxW && !NO_LINE_START.includes(ch)) { lines.push(cur); cur = ch; } else cur += ch;
    }
    lines.push(cur);
    return lines;
  }
}

/**
 * 表を描く
 * cols：列の幅（cm）の配列。rows：[{ h, cells:[{ s, span, pt, family, weight, align, diag }] }]
 * outer・inner：外わく・内側の線の太さ（pt）。headLine：見出しの下の線の太さ（なければ inner）
 */
export function drawTable(pg, x0, y0, cols, rows, { outer = 1.5, inner = 0.5, pt = 10.5, family = MARU, minPt = 6, headLine } = {}) {
  const edges = cols.reduce((a, c) => [...a, a[a.length - 1] + c], [x0]);
  const right = edges[edges.length - 1];
  let y = y0;
  rows.forEach((r, ri) => {
    let ci = 0;
    for (const cell of r.cells) {
      const span = cell.span || 1;
      const x1 = edges[ci], x2 = edges[ci + span];
      if (cell.diag) pg.line(x1, y, x2, y + r.h, 0.5);
      pg.fit(cell.s, x1, y, x2, y + r.h, { pt: cell.pt || pt, family: cell.family || family, minPt: cell.minPt || minPt, align: cell.align, weight: cell.weight });
      if (ci > 0) pg.line(x1, y, x1, y + r.h, cell.leftLine ?? inner);
      ci += span;
    }
    if (ri > 0) pg.line(x0, y, right, y, ri === 1 && headLine ? headLine : inner);
    y += r.h;
  });
  pg.rect(x0, y0, right - x0, y - y0, outer);
  return y;
}

/** PNGなどの絵（bytes）→ canvas に描ける形。読めなければ null */
export async function bitmapOf(img) {
  try { return img ? await createImageBitmap(new Blob([img.bytes], { type: 'image/png' })) : null; } catch { return null; }
}

/** ページの絵 → JPEG */
export async function pageJpeg(pg) {
  const blob = await new Promise((res) => pg.canvas.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) throw new Error('画像を作れませんでした');
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), px: pg.canvas.width, py: pg.canvas.height, w: pg.w, h: pg.h };
}

/** JPEGのページ（[{ jpeg, px, py, w, h }]。w・h は cm）→ PDF（Uint8Array） */
export function jpegsToPdf(pages) {
  const enc = new TextEncoder();
  const chunks = [], offsets = [];
  let pos = 0;
  const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
  const obj = (n, body) => { offsets[n] = pos; add(`${n} 0 obj\n${body}\nendobj\n`); };
  const stream = (n, dict, data) => {
    offsets[n] = pos;
    add(`${n} 0 obj\n<< ${dict} /Length ${data.length} >>\nstream\n`);
    add(data);
    add('\nendstream\nendobj\n');
  };
  // 1：カタログ、2：ページの一覧、そのあと1ページにつき3つ（ページ・絵・描き方）
  const pageId = (i) => 3 + i * 3;
  add('%PDF-1.4\n');
  add(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const n = pageId(i);
    const W = (p.w * PT_PER_CM).toFixed(2), H = (p.h * PT_PER_CM).toFixed(2);
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`);
    stream(n + 1, `/Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, p.jpeg);
    stream(n + 2, '', enc.encode(`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`));
  });
  const size = 3 + pages.length * 3;
  const xref = pos;
  add(`xref\n0 ${size}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  add(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(pos);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
