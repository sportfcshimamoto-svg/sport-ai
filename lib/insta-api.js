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

/** base64 → File */
export function fileOf(img) {
  const bin = atob(img.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], img.name, { type: 'image/jpeg' });
}
