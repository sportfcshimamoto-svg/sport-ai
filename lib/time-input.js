// 時間の入力欄：「：」を打たなくてよいようにする。
// 930 → 9:30、1130 → 11:30、9 → 9:00。全角の数字や「：」「.」「時」も 9:30 の形にそろえる。

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

/** 時間の欄にする：スマホでは数字のキーボードを出し、欄から出たら 9:30 の形に書き直す */
export function timeField(el) {
  if (!el) return;
  el.setAttribute('inputmode', 'numeric');
  el.setAttribute('autocomplete', 'off');
  el.addEventListener('blur', () => {
    const n = normTime(el.value);
    if (n !== el.value) { el.value = n; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}
