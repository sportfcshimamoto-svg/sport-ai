// PDFの要項から文字を取り出す（2026年11月 本人の希望：要項をWordでもPDFでも読み込めるように）。
// 読み取りには pdf.js（Mozillaの無料の部品。app/vendor/pdfjs に同梱）を使う。インターネットには送らない。
// PDFは1行ずつに分かれているので、行の右はしまで字がつまっている行は、次の行とつなげて1つの段落にもどす。

const BASE = new URL('../vendor/pdfjs/', import.meta.url);
let lib = null;

async function pdfjs() {
  if (lib) return lib;
  lib = await import(new URL('pdf.min.mjs', BASE).href);
  lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', BASE).href;
  return lib;
}

// 行の頭にこれが来たら、前の行の続きではなく新しい段落
const NEW_PARA = /^(?:●|[①-⑳]|※|【|・|連絡先|勝ち|ただし|SPORT\s*FC\s*代表|Tel|TEL)/;

/** ページの区切り（要項の2ページ目＝表のページを、項目の文に混ぜないため） */
export const PAGE = '\f';

/** PDF（Uint8Array）→ 行の文字の配列（段落ごと。ページの区切りに PAGE） */
export async function pdfLines(bytes) {
  const { getDocument } = await pdfjs();
  const doc = await getDocument({ data: bytes.slice(), cMapUrl: new URL('cmaps/', BASE).href, cMapPacked: true, isEvalSupported: false }).promise;
  const rows = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    const lines = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5], size = Math.hypot(it.transform[2], it.transform[3]) || 10;
      let ln = lines.find((l) => Math.abs(l.y - y) < size * 0.4);
      if (!ln) { ln = { y, size, parts: [] }; lines.push(ln); }
      ln.parts.push({ x, end: x + it.width, s: it.str, size });
    }
    lines.sort((a, b) => b.y - a.y);   // 上から
    for (const l of lines) {
      l.parts.sort((a, b) => a.x - b.x);
      let s = '', prevEnd = null;
      for (const p of l.parts) {
        if (prevEnd != null && p.x - prevEnd > p.size * 0.3) s += ' ';
        s += p.s;
        prevEnd = p.end;
      }
      rows.push({ s: s.replace(/\s+$/, ''), x: l.parts[0].x, end: l.parts[l.parts.length - 1].end, size: l.size, page: n });
    }
    page.cleanup();
  }
  await doc.destroy();

  // 右はしまで字がつまっている行 → 次の行とつなげる
  const right = Math.max(0, ...rows.map((r) => r.end));
  const out = [];
  let prev = null;
  for (const r of rows) {
    const text = r.s.trim();
    if (!text) continue;
    if (prev && prev.page !== r.page) out.push(PAGE);
    if (prev && prev.page === r.page && prev.end >= right - prev.size * 1.6 && !NEW_PARA.test(text)) {
      out[out.length - 1] += text;
    } else {
      out.push(text);
    }
    prev = r;
  }
  return out;
}
