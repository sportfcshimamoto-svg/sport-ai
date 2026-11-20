// 会計タブの部品：Googleの側（Apps Script）とのやりとり・返金の月の計算・領収書の写真を小さくする

/** Googleの側のURL（Apps Scriptを「ウェブアプリ」として公開したときのURL）。決まったらここに入れる */
export const API_URL = 'https://script.google.com/macros/s/AKfycbzqxsqNkoMkgF6IO4ZkSjSrVyVcVGmUi3jvnwSDBH4stclEf6qRsxS4uCxmD4DjH-W3/exec';   // 2026年11月15日につないだ。11月20日から本物のスプレッドシートにつながっている（URLは同じ）

const KEY = 'sport-ai:kaikei:v1';
/** 試し用：?api=... で別のURLを使う（この端末にだけ覚える） */
export function apiUrl() {
  try {
    const q = new URLSearchParams(location.search).get('api');
    if (q) localStorage.setItem(KEY + ':api', q);
    return localStorage.getItem(KEY + ':api') || API_URL;
  } catch { return API_URL; }
}

export async function api(req) {
  const url = apiUrl();
  if (!url) throw new Error('まだ準備中です（GoogleのURLが入っていません）');
  let res;
  try {
    // text/plain で送る（Googleの側が受け取れる形。確認の問い合わせが起きない）
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req), redirect: 'follow' });
  } catch {
    throw new Error('つながりませんでした。電波のよいところで、もう一度ためしてください');
  }
  let out;
  try { out = await res.json(); } catch { throw new Error('Googleの側から返事がありませんでした。少し待ってもう一度ためしてください'); }
  if (!out.ok) { const e = new Error(out.error || 'うまくいきませんでした'); e.badPass = /合言葉がちがいます/.test(out.error || ''); throw e; }
  return out;
}

/** 年度の月の並び */
export const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

/** 買った日（Date）から返金の月（Googleの側と同じ決まり。3月は年度末なので3月のまま） */
export function refundMonth(settings, date) {
  const m = date.getMonth() + 1, d = date.getDate();
  const cut = cutoffOf(settings, m);
  if (d <= cut || m === 3) return m;
  return m % 12 + 1;
}
export const cutoffOf = (settings, m) => Number(settings?.months?.[m]) || Number(settings?.cutoff) || 31;
export const cutoffText = (n) => (n >= 31 ? '月末' : `${n}日`);

/** 今いちばん新しい「締めた月」（今日が締め日をすぎていれば今月、まだなら先月） */
export function lastClosedMonth(settings, today = new Date()) {
  const m = today.getMonth() + 1;
  const last = new Date(today.getFullYear(), m, 0).getDate();
  const cut = Math.min(cutoffOf(settings, m), last);
  return today.getDate() > cut ? m : (m + 10) % 12 + 1;
}

export const yen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');
export const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const parseYmd = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
export const md = (s) => { const d = parseYmd(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : s; };

const blobToB64 = (b) => new Promise((ok, ng) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => ng(new Error('ファイルを読めませんでした')); r.readAsDataURL(b); });

/**
 * 領収書のファイルを送れる形に。写真は長い辺1600pxのJPEGに小さくする（字が読める大きさ）。PDFはそのまま
 * 返す：{ name, mime, b64, size }
 */
export async function prepareFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > 10 * 1024 * 1024) throw new Error(`「${file.name}」は大きすぎます（PDFは10MBまで）`);
    return { name: file.name, mime: 'application/pdf', b64: await blobToB64(file), size: file.size };
  }
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|heic|heif|webp|gif)$/i.test(file.name)) throw new Error(`「${file.name}」は写真でもPDFでもありません`);
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.82));
    if (!blob) throw new Error('小さくできませんでした');
    return { name: file.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', b64: await blobToB64(blob), size: blob.size, preview: URL.createObjectURL(blob) };
  } catch {
    // ブラウザが読めない写真（HEICなど）はそのまま送る
    const mime = file.type || 'image/jpeg';
    if (file.size > 10 * 1024 * 1024) throw new Error(`「${file.name}」は大きすぎます（10MBまで）`);
    return { name: file.name, mime, b64: await blobToB64(file), size: file.size };
  }
}

/** LINEで会計担当に知らせる文 */
export function lineText(e) {
  return `【会計】${e.who}　${md(e.date)}　${e.item}（${e.detail}）　${yen(e.expense ?? e.amount)}　を会計タブに入力しました。${e.month}月分の返金です。`;
}
export const lineUrl = (text) => 'https://line.me/R/share?text=' + encodeURIComponent(text);
