// 時間の入力欄：プルダウンで選ぶ（2026年11月22日 本人の希望）。
// 「時」と「分（5分ごと）」の2つのプルダウン。前は「930 → 9:30」と打つ欄だった。
// もとの <input> は見えない欄として残し、選んだ値（9:30 の形）を入れて input の知らせを出す。
// → それぞれのタブの「input のとき」の書き方は、そのまま使える。

/** 入れた字を「9:30」の形にする。読めないときは、入れたまま（前後の空白だけ取る）を返す */
export function normTime(v) {
  const s = String(v ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：.．時]/g, ':').replace(/分$/, '').replace(/\s/g, '');
  if (!s) return '';
  let h, m;
  let x = s.match(/^(\d{1,2}):(\d{2})$/);
  if (x) { h = +x[1]; m = +x[2]; }
  else if ((x = s.match(/^(\d{1,2}):?$/))) { h = +x[1]; m = 0; }
  else if ((x = s.match(/^(\d{1,2})(\d{2})$/))) { h = +x[1]; m = +x[2]; }
  else return String(v ?? '').trim();
  if (h > 24 || m > 59) return String(v ?? '').trim();
  return `${h}:${String(m).padStart(2, '0')}`;
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 5);        // 5時〜21時
const MINS = Array.from({ length: 12 }, (_, i) => i * 5);         // 00, 05, … 55
const opt = (v, text, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${text}</option>`;

/**
 * 時間の欄をプルダウンにする
 * blank: true なら「書かない」（空）も選べる
 */
export function timeField(el, { blank = false } = {}) {
  if (!el || el.dataset.tsel) return;
  el.dataset.tsel = '1';
  const m0 = normTime(el.value).match(/^(\d+):(\d+)$/);
  const h = m0 ? +m0[1] : null, m = m0 ? +m0[2] : 0;
  const hours = h != null && !HOURS.includes(h) ? [...HOURS, h].sort((a, b) => a - b) : HOURS;
  const mins = MINS.includes(m) ? MINS : [...MINS, m].sort((a, b) => a - b);   // 9:42 のような前の値も残す

  const wrap = document.createElement('span');
  wrap.className = 'tsel';
  const label = el.closest('.grid > div')?.querySelector('label')?.textContent.replace(/（.*$/, '').trim() || '時間';
  wrap.innerHTML = `<select class="tsel-h" aria-label="${label}（時）">${blank ? opt('', '－', h == null) : ''}${hours.map((x) => opt(x, x, x === h)).join('')}</select>`
    + `<span class="tsel-c">:</span>`
    + `<select class="tsel-m" aria-label="${label}（分）">${mins.map((x) => opt(x, String(x).padStart(2, '0'), x === m)).join('')}</select>`;
  const [hs, ms] = wrap.querySelectorAll('select');
  if (!blank && h == null) hs.value = String(HOURS.includes(9) ? 9 : HOURS[0]);
  const sync = () => {
    ms.disabled = !hs.value;
    const v = hs.value ? `${hs.value}:${String(ms.value).padStart(2, '0')}` : '';
    if (v !== el.value) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  hs.addEventListener('change', sync);
  ms.addEventListener('change', sync);
  el.type = 'hidden';
  el.after(wrap);
  ms.disabled = !hs.value;
  if (!blank && h == null) sync();   // 空のままだった必須の欄は 9:00 にしておく
}
