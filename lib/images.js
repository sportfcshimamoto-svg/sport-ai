// マスコット「スポルトン」の絵を読み込む（ブラウザでも、確認用の node でも動く）。
// 読み込めなかったときは {} を返す → 絵なしで今までどおり書き出す。
const FILES = {
  sporton: 'sporton.png',          // ボールをけるスポルトン（SPORT_FC01color）
  shield: 'sporton-shield.png',    // 盾のエンブレム（SPORT_FC02color）
  logo: 'youkou-logo.png',         // 要項の上のロゴ（要項のWordから。PDFの要項で使う）
  referee: 'referee-page.png',     // 審判カード8枚の白紙（Referee card をA4に並べた絵。PDFの審判カードで使う）
};
const BASIC = ['sporton', 'shield'];

const cache = {};

/** PNGの幅・高さ（ピクセル） */
function pngSize(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** → { sporton: { bytes, w, h, file }, shield: {...} }。keys で読む絵をえらぶ（はじめはスポルトン2つだけ） */
export async function loadImages(keys = BASIC) {
  const out = {};
  for (const key of keys) {
    const file = FILES[key];
    if (cache[key]) { out[key] = cache[key]; continue; }
    try {
      const url = new URL(`../img/${file}`, import.meta.url);
      let bytes;
      if (url.protocol === 'file:') {
        const { readFile } = await import('node:fs/promises');
        bytes = new Uint8Array(await readFile(url));
      } else {
        const r = await fetch(url);
        if (!r.ok) throw new Error(r.status);
        bytes = new Uint8Array(await r.arrayBuffer());
      }
      out[key] = cache[key] = { bytes, file, ...pngSize(bytes) };
    } catch { /* 絵なしで続ける */ }
  }
  return out;
}
