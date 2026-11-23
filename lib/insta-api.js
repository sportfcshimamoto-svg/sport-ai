// Instagramタブの部品：AI社員の下書きの置き場所（Googleの側 gas/insta/Code.gs）とのやりとり

/** Googleの側のURL（Apps Scriptを「ウェブアプリ」として公開したときのURL）。決まったらここに入れる */
export const INSTA_API_URL = 'https://script.google.com/macros/s/AKfycbw_QaT7DgV0sMyDs1-pPQy_e2yEmGkcIjs1-KFI2Q2H3LdFDtTWj0J0ZUApALc-lGhb/exec';   // 2026年11月23日 本人が作ったApps Script「SPORTインスタ下書き」

const KEY = 'sport-ai:insta-api:v1';
/** 試し用：?iapi=... で別のURLを使う（この端末にだけ覚える） */
export function instaApiUrl() {
  try {
    const q = new URLSearchParams(location.search).get('iapi');
    if (q) localStorage.setItem(KEY + ':api', q);
    return localStorage.getItem(KEY + ':api') || INSTA_API_URL;
  } catch { return INSTA_API_URL; }
}

export function savedPass() { try { return localStorage.getItem(KEY + ':pass') || ''; } catch { return ''; } }
export function savePass(p) { try { if (p) localStorage.setItem(KEY + ':pass', p); else localStorage.removeItem(KEY + ':pass'); } catch { /* 保存できなくても使える */ } }

export async function instaApi(req) {
  const url = instaApiUrl();
  if (!url) throw new Error('まだ準備中です（GoogleのURLが入っていません）');
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...req, pass: savedPass() }), redirect: 'follow' });
  } catch {
    throw new Error('つながりませんでした。電波のよいところで、もう一度ためしてください');
  }
  let out;
  try { out = await res.json(); } catch { throw new Error('Googleの側から返事がありませんでした。少し待ってもう一度ためしてください'); }
  if (!out.ok) { const e = new Error(out.error || 'うまくいきませんでした'); e.badPass = /合言葉がちがいます/.test(out.error || ''); throw e; }
  return out;
}

const bytesOf = (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

/** base64 → File */
export function fileOf(img) {
  return new File([bytesOf(img.data)], img.name, { type: 'image/jpeg' });
}

// ---------- 動画（大きいので5MBずつ分けて送る・読む） ----------
export const VIDEO_PART = 5 * 1024 * 1024;
export const VIDEO_MAX = 200 * 1024 * 1024;
export const isVideo = (f) => /^video\//.test(f.type || '') || /\.(mov|mp4|m4v|3gp|webm)$/i.test(f.name || '');

const b64Of = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => rej(new Error('動画を読みこめませんでした'));
  r.readAsDataURL(blob);
});
const pad = (n, w = 2) => String(n).padStart(w, '0');
function newVideoId() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${Math.floor(Math.random() * 1000)}`;
}

/** 動画を1本送る。onPart(送れた数, 全部の数) */
export async function sendVideo(file, memo, onPart) {
  if (file.size > VIDEO_MAX) throw new Error(`${file.name} は大きすぎます（200MBまで）。30〜60秒くらいに切ってから送ってください`);
  const id = newVideoId();
  const total = Math.max(1, Math.ceil(file.size / VIDEO_PART));
  const mime = file.type || (/\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4');
  for (let n = 0; n < total; n++) {
    onPart?.(n, total);
    const data = await b64Of(file.slice(n * VIDEO_PART, (n + 1) * VIDEO_PART));
    await instaApi({ action: 'addVideoPart', id, n, total, data, name: file.name || 'video.mp4', mime, size: file.size, memo });
  }
  onPart?.(total, total);
  return id;
}

/** 下書きの動画を読んで File にする。v = { vid, name, mime, total } */
export async function loadVideo(v, onPart) {
  const parts = [];
  for (let n = 0; n < v.total; n++) {
    onPart?.(n, v.total);
    parts.push(bytesOf((await instaApi({ action: 'getVideoPart', id: v.vid, n })).data));
  }
  return new File(parts, v.name || 'video.mp4', { type: v.mime || 'video/mp4' });
}
