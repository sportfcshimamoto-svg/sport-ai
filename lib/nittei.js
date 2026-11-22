// 日程タブの部品：Googleの側（gas/nittei/Code.gs）とのやりとり・件名と色の決まり

/** Googleの側のURL（Apps Scriptを「ウェブアプリ」として公開したときのURL）。決まったらここに入れる */
export const API_URL = 'https://script.google.com/macros/s/AKfycbzyGWRPfbaqNHc5dHqdcTA9QRk6NoVVeXNUlugrQeyA-Ekagq8pCb3C6H3Pe1BQeU8DRQ/exec';   // 2026年11月23日。本物のグラウンド予約のスプレッドシートに付けたApps Script（カップ・TMの学年を抜く・自動で直す版。はじめは「SPORTテスト」カレンダー）。前のURL（…bA/exec・…v9Sa-zL/exec）は古い版

const KEY = 'sport-ai:nittei:v1';
/** 試し用：?napi=... で別のURLを使う（この端末にだけ覚える） */
export function apiUrl() {
  try {
    const q = new URLSearchParams(location.search).get('napi');
    if (q) localStorage.setItem(KEY + ':api', q);
    return localStorage.getItem(KEY + ':api') || API_URL;
  } catch { return API_URL; }
}

export async function api(req) {
  const url = apiUrl();
  if (!url) throw new Error('まだ準備中です（GoogleのURLが入っていません）');
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req), redirect: 'follow' });
  } catch {
    throw new Error('つながりませんでした。電波のよいところで、もう一度ためしてください');
  }
  let out;
  try { out = await res.json(); } catch { throw new Error('Googleの側から返事がありませんでした。少し待ってもう一度ためしてください'); }
  if (!out.ok) { const e = new Error(out.error || 'うまくいきませんでした'); e.badPass = /合言葉がちがいます/.test(out.error || ''); throw e; }
  return out;
}

/** 学年（ボタンの並び順）。色はGoogleカレンダーの色番号 */
export const GRADES = [
  { id: '1', label: '1年', color: '11', css: '#d50000' },   // 赤（トマト）
  { id: '2', label: '2年', color: '6', css: '#f4511e' },    // オレンジ（ミカン）
  { id: '3', label: '3年', color: '10', css: '#0b8043' },   // 緑（バジル）
  { id: '4', label: '4年', color: '7', css: '#039be5' },    // 水色（ピーコック）
  { id: '5', label: '5年', color: '9', css: '#3f51b5' },    // 青（ブルーベリー）
  { id: '6', label: '6年', color: '1', css: '#7986cb' },    // ライラック（ラベンダー）
  { id: 'U15', label: 'U15', color: '3', css: '#8e24aa' },  // 紫（ブドウ）
  { id: 'KIDs', label: 'KIDs', color: '5', css: '#f6bf26' }, // 黄色（バナナ）
];
/** Googleカレンダーの色番号 → 画面の色 */
export const COLOR_CSS = { 1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e', 7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000' };

/** 件名の場所（2026年11月23日 本人：短くしないで、この名前のまま） */
export const PLACES = ['よどいこ島本地区', '水無瀬緑地', '一小グラウンド', '三小グラウンド'];
/** 短い名前 → いつもの名前（スプレッドシートの見出しの名前や、短く書いた件名を直すとき） */
const SHORT_NAMES = { 'よどいこ': 'よどいこ島本地区', '緑地': '水無瀬緑地', '一小': '一小グラウンド', '三小': '三小グラウンド' };
export const normPlace = (p) => { const s = String(p || '').trim(); return SHORT_NAMES[s] || s; };

const order = (g) => GRADES.findIndex((x) => x.id === g);

/** ['1','2','3'] → 「1-3年」、['4','5'] → 「4,5年」、['1','3'] → 「1,3年」、['U15'] → 「U15」 */
export function gradeLabel(grades) {
  const list = [...new Set(grades || [])].filter((g) => order(g) >= 0).sort((a, b) => order(a) - order(b));
  const nums = list.filter((g) => /^\d$/.test(g)).map(Number);
  const others = list.filter((g) => !/^\d$/.test(g));
  let num = '';
  if (nums.length) {
    const run = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    num = (nums.length >= 3 && run ? `${nums[0]}-${nums[nums.length - 1]}` : nums.join(',')) + '年';
  }
  return [num, ...others].filter(Boolean).join('・');
}

/** 色は上の学年に合わせる（1-3年 → 3年の緑、4,5年 → 5年の青）。U15・KIDsはそれぞれの色（2026年11月22日 本人） */
export function colorOf(grades) {
  const list = [...(grades || [])].filter((g) => order(g) >= 0).sort((a, b) => order(a) - order(b));
  const nums = list.filter((g) => /^\d$/.test(g));
  const g = nums.length ? nums[nums.length - 1] : list[0];
  return g ? GRADES[order(g)].color : '';
}

/** KIDsとU15は、ほかの学年といっしょにせず、それぞれ1件の予定にする（2026年11月22日 本人） */
export function splitItems(items) {
  return (items || []).flatMap((it) => {
    const gs = it.grades || [];
    const groups = [gs.filter((g) => /^\d$/.test(g)), gs.filter((g) => g === 'U15'), gs.filter((g) => g === 'KIDs')].filter((x) => x.length);
    return groups.map((g) => ({ ...it, grades: g }));
  });
}

/**
 * 日曜日のセットには「KIDs 9:00-10:00」を足す（2026年11月22日 本人）。その時間が枠（なければセットの時間）に入るときだけ
 * スポルトカップが日曜日のときは、日曜日には入れず、前の日の土曜日に入れる（同じ日 本人）
 * cups：スポルトカップの日（'2026-12-06' などの Set。年度はじめに日程タブで入れる）
 */
export const KIDS_SUNDAY = { grades: ['KIDs'], start: '9:00', end: '10:00' };
export function withSundayKids(items, date, slot, cups = new Set()) {
  const d = parseYmd(date);
  if (!d || !items.length || items.some((it) => (it.grades || []).includes('KIDs'))) return items;
  const next = new Date(d); next.setDate(d.getDate() + 1);
  const kidsDay = d.getDay() === 0 ? !cups.has(date) : d.getDay() === 6 && cups.has(ymd(next));
  if (!kidsDay) return items;
  const st = items.map((it) => mins(it.start)).filter((x) => x != null), en = items.map((it) => mins(it.end) ?? mins(it.start)).filter((x) => x != null);
  const range = slot ? { s: mins(slot.start), e: mins(slot.end) } : { s: Math.min(...st), e: Math.max(...en) };
  if (!(range.s <= mins(KIDS_SUNDAY.start) && mins(KIDS_SUNDAY.end) <= range.e)) return items;
  return [{ ...KIDS_SUNDAY, place: slot ? slot.place : items[0].place }, ...items];
}

/**
 * 件名：「1-3年 9:00-10:45 よどいこ島本地区」「4年 TM 8:40-12:00 よどいこ島本地区」
 * 割り振ったTM（tmPlan）は「4年 9:00-12:00 TM予定 水無瀬緑地」（前からのカレンダーの書き方。2026年11月23日 本人）
 */
export function titleOf(it) {
  const time = it.start && it.end ? `${it.start}-${it.end}` : it.start ? `${it.start}〜` : '';
  return [gradeLabel(it.grades) + (it.note ? ' ' + it.note.trim() : ''), time, it.tmPlan ? 'TM予定' : '', normPlace(it.place)].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
}

/** 「1-3年」「4,5年」「1年・U15」「KIDs」→ ['1','2','3'] など。読めなければ null */
function parseGrades(s) {
  const out = [];
  for (const part of String(s).split('・')) {
    let m;
    if (part === 'U15' || part === 'KIDs') out.push(part);
    else if ((m = part.match(/^(\d)-(\d)年$/))) { for (let n = +m[1]; n <= +m[2]; n++) out.push(String(n)); }
    else if ((m = part.match(/^(\d(?:,\d)*)年$/))) out.push(...m[1].split(','));
    else return null;
  }
  return out.length && out.every((g) => order(g) >= 0) ? out : null;
}

/**
 * 件名を読んで、学年・メモ・時間・場所にもどす（予定を直すとき）。いつもの形でなければ null
 * 「4年 TM 8:40-12:00 よどいこ島本地区」→ { grades:['4'], note:'TM', start:'8:40', end:'12:00', place:'よどいこ島本地区' }
 */
export function parseTitle(title) {
  const w = String(title || '').trim().split(/\s+/);
  const grades = parseGrades(w[0] || '');
  if (!grades) return null;
  const ti = w.findIndex((x, i) => i > 0 && /^\d{1,2}:\d{2}(-\d{1,2}:\d{2}|〜)$/.test(x));
  if (ti < 0) return null;
  const [start, end = ''] = w[ti].replace('〜', '').split('-');
  return { grades, note: w.slice(1, ti).join(' '), start, end, place: normPlace(w.slice(ti + 1).join(' ')) };
}

const mins = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
const hm = (n) => `${Math.floor(n / 60)}:${pad(n % 60)}`;

// ---------- その日にもう入っている予定で、練習を変える（2026年11月23日 本人） ----------
/** 全角の数字・記号を半角に */
const half = (s) => String(s || '').replace(/[０-９Ａ-Ｚａ-ｚ：－，．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
/** 「1-3」「4,5」「1.3」「4・6」→ ['1','2','3'] など */
function gradeNums(s) {
  const out = [];
  for (const part of s.split(/[,.・、]/)) {
    const r = part.match(/^(\d)\s*[-~〜]\s*(\d)$/);
    if (r) { for (let n = +r[1]; n <= +r[2]; n++) out.push(String(n)); }
    else if (/^\d$/.test(part.trim())) out.push(part.trim());
  }
  return out;
}
const CUP_RE = /(SPORT|スポルト)\s*(杯|カップ)/i;
/** スポルト杯の予定か。そうなら { grades, start, end }（時間が書いていなければ空） */
export function cupOf(title) {
  const t = half(title);
  if (!CUP_RE.test(t)) return null;
  const grades = [...t.matchAll(/(\d(?:\s*[-,.・~〜]\s*\d)*)\s*年/g)].flatMap((m) => gradeNums(m[1]));
  const tm = t.match(/(\d{1,2}):(\d{2})\s*[-~〜]\s*(\d{1,2}):(\d{2})/);
  return { grades, start: tm ? `${+tm[1]}:${tm[2]}` : '', end: tm ? `${+tm[3]}:${tm[4]}` : '' };
}
/** 練習の予定（「1-3年 9:00-10:45 よどいこ島本地区」のように、学年・時間・いつもの場所だけ）か */
const isPractice = (title) => { const p = parseTitle(title); return !!p && !p.note && PLACES.includes(p.place); };
/** 件名の頭の学年：「3年　TM…」→ ['3']、「U-15 …」→ ['U15']、「KIDS …」→ ['KIDs'] */
function leadGrades(title) {
  const t = half(title).trim();
  if (/^U-?15/i.test(t)) return ['U15'];
  if (/^KIDs/i.test(t)) return ['KIDs'];
  const m = t.match(/^(\d(?:\s*[-,.・、~〜]\s*\d)*)\s*年/);
  return m ? gradeNums(m[1]) : [];
}

/**
 * その日にもう入っている予定（件名の一覧）から：
 * - busy：練習を入れない学年（スポルト杯の学年、カップ戦・TMなど練習でない予定の学年）
 * - cup：その日のスポルト杯の時間（{ start, end }。なければ null）
 * cups：アプリの「スポルトカップ」で入れたその日の分（[{ grade, time:'9:00-15:00' }]）
 */
export function dayInfo(titles, cups = []) {
  const busy = new Set();
  let cup = null;
  const takeCup = (c) => { if (c.end && (!cup || mins(c.end) > mins(cup.end))) cup = { start: c.start, end: c.end }; else if (!cup) cup = { start: '', end: '' }; };
  for (const c of cups) {
    if (c.grade) busy.add(String(c.grade));
    const [start = '', end = ''] = String(c.time || '').split('-');
    takeCup({ start, end });
  }
  for (const title of titles || []) {
    const c = cupOf(title);
    if (c) { c.grades.forEach((g) => busy.add(g)); takeCup(c); continue; }
    if (isPractice(title)) continue;
    leadGrades(title).forEach((g) => busy.add(g));
  }
  return { busy, cup };
}

/**
 * スポルト杯の日の練習の時間（同じ日 本人）
 * - 9:00-17:00 のとき：全学年 13:30 から（いつもの長さのまま。1-3年 13:30-15:15、4,5年 13:30-15:45）
 * - 9:00-15:00 のとき：全学年 13:00-14:30（KIDsは 13:00-14:00）
 * 時間がわからないときは変えない
 */
export function cupTimes(items, cup) {
  if (!cup || !cup.end) return items;
  const late = mins(cup.end) > 15 * 60;
  return items.map((it) => {
    const s = mins(it.start), e = mins(it.end), kids = (it.grades || []).includes('KIDs');
    if (late) { const len = s != null && e != null ? e - s : 105; return { ...it, start: '13:30', end: hm(13 * 60 + 30 + len) }; }
    return { ...it, start: '13:00', end: kids ? '14:00' : '14:30' };
  });
}

/** 練習から busy の学年を抜く。学年がなくなった予定は入れない（2年がカップなら「1-3年」→「1,3年」） */
export function dropBusy(items, busy) {
  if (!busy || !busy.size) return items;
  return items.map((it) => ({ ...it, grades: (it.grades || []).filter((g) => !busy.has(g)) })).filter((it) => it.grades.length);
}

// ---------- TMの割り振り（2026年11月23日 本人） ----------
// 1か月で、どの学年も試合の回数が同じくらいになるように、取れた枠にTMを割り振る。同じ回数なら上の学年を先に。
// KIDs・U15 には入れない。スポルト杯の日には入れない。
/** TMを割り振る学年 */
export const TM_GRADES = ['1', '2', '3', '4', '5'];
/**
 * その枠のTMの時間。①水無瀬緑地 9:00-15:00 → 9:00-12:00 と 11:00-14:30 の2つ（9:00は下の学年）②よどいこ島本地区 9:00-13:00 → 9:00-12:00
 */
export function tmSlotsOf(slot) {
  const p = normPlace(slot?.place), t = `${slot?.start}-${slot?.end}`;
  if (p === '水無瀬緑地' && t === '9:00-15:00') return [{ start: '9:00', end: '12:00' }, { start: '11:00', end: '14:30' }];
  if (p === 'よどいこ島本地区' && t === '9:00-13:00') return [{ start: '9:00', end: '12:00' }];
  return [];
}
/** 試合の予定か（TM・カップ戦・大会・スポルト杯など） */
export const isMatchTitle = (t) => /TM|カップ|杯|大会|試合|交流|リーグ|公式戦/i.test(half(t)) && !isPractice(t);
/** 件名から、その試合の学年（スポルト杯は件名の中の学年、ほかは頭の学年） */
export const matchGrades = (t) => { const c = cupOf(t); return c ? c.grades : leadGrades(t); };
/**
 * その月の学年ごとの試合の回数。events：[{ date, end?, title }]（入れるカレンダー＋本物のカレンダー）。同じ日・同じ学年は1回
 */
export function matchCounts(events, month) {
  const days = matchDays(events);
  return Object.fromEntries(TM_GRADES.map((g) => [g, days[g].filter((d) => d.startsWith(month)).length]));
}
/**
 * 学年ごとの試合の日の一覧 { '4': ['2026-12-06', …] }（月をこえても全部）
 * onlyTM：TMだけ（「2週つづけない」はTMどうしだけで見る。大会・スポルト杯・カップ戦の前の週にTMがつづくのはよい。2026年11月23日 本人）
 */
export function matchDays(events, onlyTM = false) {
  const out = Object.fromEntries(TM_GRADES.map((g) => [g, new Set()]));
  for (const e of events || []) {
    if (!isMatchTitle(e.title) || (onlyTM && (!/TM/i.test(half(e.title)) || cupOf(e.title)))) continue;
    for (let d = parseYmd(e.date); d && ymd(d) <= (e.end || e.date); d.setDate(d.getDate() + 1)) {
      matchGrades(e.title).forEach((g) => { if (out[g]) out[g].add(ymd(d)); });
    }
  }
  return Object.fromEntries(TM_GRADES.map((g) => [g, [...out[g]].sort()]));
}
/** 前後10日のうちに、その学年のTMがもうあるか（2週つづけてTMにならないように。2026年11月23日 本人「まんべんなく」） */
const NEAR_DAYS = 10;
const nearMatch = (dates, date) => { const t = parseYmd(date).getTime(); return dates.some((d) => d !== date && Math.abs(parseYmd(d).getTime() - t) < NEAR_DAYS * 864e5); };
/**
 * 月の取れた枠に、TMを割り振る。返す：Map(slotKey → [{ i, grade, start, end }])
 * - opt.titlesOn(date)：その日にもう入っている件名。opt.isCup(date)：スポルト杯の日か
 * - opt.counts：その月の試合の回数（matchCounts）。opt.picks：手で変えた学年 { 'slotKey|i': '4' }（'' は入れない）
 * - その時間のTMがもうカレンダーにある枠はとばす（もう割り振ってある）
 * - 1年生は、日曜日にはなるべく入れない（日曜に入ると、KIDsを土曜日に移す）→ 日曜は1年の回数を+1として選ぶ
 * - 2週つづけて同じ学年にならないように：前後10日にTMがある学年は、回数を+0.6として選ぶ
 *   （回数がそろうのが先。回数が同じくらいなら、TMの間があいている学年を先に。大会・スポルト杯の前の週はかまわない）
 * - opt.days：学年ごとのTMの日（matchDays(events, true)）
 */
export function planTM(slots, opt) {
  const counts = { ...opt.counts }, plan = new Map();
  const days = Object.fromEntries(TM_GRADES.map((g) => [g, [...((opt.days || {})[g] || [])]]));
  const list = [...(slots || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const s of list) {
    const subs = tmSlotsOf(s);
    if (!subs.length || opt.isCup(s.date)) continue;
    const titles = opt.titlesOn(s.date);
    const busy = dayInfo(titles).busy;
    const sunday = parseYmd(s.date)?.getDay() === 0;
    const key = opt.keyOf(s);
    const todo = subs.map((sub, i) => ({ ...sub, i })).filter((sub) => !titles.some((t) => /TM/i.test(half(t)) && half(t).includes(`${sub.start}-${sub.end}`)));
    const used = new Set();
    const out = [];
    // 手で選んだ学年が先
    for (const sub of todo) {
      const k = `${key}|${sub.i}`;
      if (opt.picks && k in opt.picks) { sub.fixed = true; if (opt.picks[k]) { out.push({ ...sub, grade: opt.picks[k] }); used.add(opt.picks[k]); } }
    }
    const auto = [];
    for (const sub of todo.filter((x) => !x.fixed)) {
      const cand = TM_GRADES.filter((g) => !busy.has(g) && !used.has(g));
      if (!cand.length) break;
      const score = (g) => counts[g] + (sunday && g === '1' ? 1 : 0) + (nearMatch(days[g], s.date) ? 0.6 : 0);
      const g = cand.reduce((best, x) => (score(x) < score(best) || (score(x) === score(best) && +x > +best) ? x : best));
      used.add(g); counts[g]++; days[g].push(s.date);
      auto.push({ ...sub, grade: g });
    }
    // 自動で2つ選んだときは、9:00の枠（先の枠）を下の学年に
    const autoGrades = auto.map((x) => x.grade).sort((a, b) => +a - +b);
    auto.forEach((x, j) => { x.grade = autoGrades[j]; });
    out.forEach((x) => { if (x.grade in counts) { counts[x.grade]++; days[x.grade].push(s.date); } });
    const all = [...out, ...auto].sort((a, b) => a.i - b.i);
    if (all.length) plan.set(key, all);
  }
  return plan;
}

// ---------- コーチ担当に知らせるLINEの文（2026年11月23日 本人） ----------
// その月のTM（TM予定も）・カップ戦・大会・スポルト杯を出して、対戦相手をあたる日を知らせる。書き方は本人がいつも送っている形：
// ①11月8日（日）
// スポルト杯2年
//
// ②11月15日（日）緑地
// 3年9:00-
// 4年12:00-
const SHORT_OF = { 'よどいこ島本地区': 'よどいこ', '水無瀬緑地': '緑地', '一小グラウンド': '一小', '三小グラウンド': '三小' };
const PLACE_WORDS = [...PLACES, ...Object.keys(SHORT_NAMES)].sort((a, b) => b.length - a.length);
const MARKS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
/**
 * 試合の件名を読む。need：対戦相手をあたる日か（TM予定・相手の書いていないTM・スポルト杯）
 * 「4年 TM 高槻如是FC 9:00-12:00 よどいこ島本地区」→ { kind:'tm', grades:['4'], start:'9:00', place:'よどいこ島本地区', vs:'高槻如是FC', need:false }
 */
export function matchInfo(title) {
  const t = half(title).replace(/\s+/g, ' ').trim();
  const tm = t.match(/(\d{1,2}):(\d{2})/);
  const start = tm ? `${+tm[1]}:${tm[2]}` : '';
  const pw = PLACE_WORDS.find((p) => t.includes(p));
  const place = pw ? normPlace(pw) : '';
  const cup = cupOf(title);
  if (cup) return { kind: 'cup', grades: cup.grades, start: cup.start, place, vs: '', need: true };
  const isTM = /TM/i.test(t), plan = /TM予定/.test(t);
  let rest = t.replace(/^(U-?15|KIDs|\d(?:\s*[-,.・、~〜]\s*\d)*\s*年)/i, ' ')
    .replace(/\d{1,2}:\d{2}(\s*[-~〜]\s*(\d{1,2}:\d{2})?)?/g, ' ')
    .replace(/TM予定|TM|午前|午後|AM|PM/gi, ' ');
  PLACE_WORDS.forEach((p) => { rest = rest.split(p).join(' '); });
  rest = rest.replace(/\s+/g, ' ').trim();
  return { kind: isTM ? 'tm' : 'other', grades: leadGrades(title), start, place, vs: plan ? '' : rest, need: isTM && (plan || !rest) };
}
/**
 * コーチ担当に送る文。events：[{ date, end?, title }]（入れるカレンダー＋本物のカレンダー）。month：'2026-12'。from：この日より前は出さない
 */
export function coachLineText(events, month, from = '') {
  const [, mo] = month.split('-').map(Number);
  const seen = new Set(), list = [];
  for (const e of events || []) {
    const last = e.end || e.date;
    if (!isMatchTitle(e.title) || e.date.slice(0, 7) > month || last.slice(0, 7) < month || last < from) continue;
    const k = e.date + '|' + e.title;
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ ...e, ...matchInfo(e.title) });
  }
  const byTime = (a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (mins(a.start) ?? 9999) - (mins(b.start) ?? 9999) || order(a.grades[0]) - order(b.grades[0]));
  list.sort(byTime);
  const jday = (s) => { const d = parseYmd(s); return `${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`; };
  const gl = (gs) => gradeLabel(gs) || '学年？';
  // 対戦相手をあたる日（日ごと）
  const need = list.filter((x) => x.need);
  const dates = [...new Set(need.map((x) => x.date))];
  const blocks = dates.map((date, i) => {
    const day = need.filter((x) => x.date === date);
    const places = [...new Set(day.map((x) => x.place).filter(Boolean))];
    const one = places.length === 1;
    const lines = day.map((x) => (x.kind === 'cup' ? `スポルト杯${gl(x.grades)}` : `${gl(x.grades)}${x.start ? x.start + '-' : ''}`) + (!one && x.place ? ' ' + (SHORT_OF[x.place] || x.place) : ''));
    return `${MARKS[i] || `(${i + 1})`}${jday(date)}${one ? SHORT_OF[places[0]] || places[0] : ''}\n${lines.join('\n')}`;
  });
  const done = list.filter((x) => !x.need).map((x) => `・${mdw(x.date)}${x.end && x.end !== x.date ? '〜' + mdw(x.end) : ''} ${x.title.replace(/\s+/g, ' ').trim()}`);
  return [
    `【${mo}月】これからあたる日程`,
    blocks.length ? blocks.join('\n\n') : 'ありません',
    ...(done.length ? [`【${mo}月】決まっている試合（TM・カップ戦・大会）`, done.join('\n')] : []),
    'すみませんがよろしくお願いいたします🙇',
  ].join('\n\n');
}
export const lineUrl = (text) => 'https://line.me/R/share?text=' + encodeURIComponent(text);

/** 予定が、取れた枠の時間の中に入っているか */
export function fitsItems(slot, items) {
  if (!items.length) return false;
  const s = mins(slot.start), e = mins(slot.end);
  return items.every((it) => { const a = mins(it.start), b = mins(it.end) ?? a; return a != null && a >= s && b <= e; });
}

/** セットの時間が、取れた枠の時間の中に入っているか */
export function fitsSlot(slot, p) {
  if (!p) return false;
  if (isShortYodoiko(slot)) return true;   // 2時間枠は、時間をそろえて入れる（shortSlotItems）
  const s = mins(slot.start), e = mins(slot.end);
  return p.items.every((it) => { const a = mins(it.start), b = mins(it.end) ?? a; return a != null && a >= s && b <= e; });
}

/**
 * 取れた枠（{ place, start, end }）に合う「いつものセット」の番号。なければ -1
 * 同じ場所で、セットの時間が枠の中に入るもの。いくつも入るときは、遅く始まるほう（緑地 9-18 → 午後）
 */
/**
 * よどいこの2時間枠（11:00-13:00 など）は、セットの学年を全部、枠の始まりから1時間半で入れる（2026年11月22日 本人）
 * 例：よどいこ 11:00-13:00 →「1-3年 11:00-12:30」「4,5年 11:00-12:30」
 */
export const SHORT_PLACE = 'よどいこ島本地区';
export const isShortYodoiko = (slot) => !!slot && normPlace(slot.place) === SHORT_PLACE && mins(slot.end) - mins(slot.start) === 120;
export function shortSlotItems(items, slot) {
  if (!isShortYodoiko(slot)) return items;
  const s = mins(slot.start), hm = (n) => `${Math.floor(n / 60)}:${pad(n % 60)}`;
  return items.map((it) => ({ ...it, start: hm(s), end: hm(s + 90) }));
}

export function guessPreset(slot, presets) {
  const s = mins(slot.start), e = mins(slot.end);
  if (isShortYodoiko(slot)) {
    // 2時間枠：午前（12時より前に始まる）なら午前のセット、そうでなければ午後のセット
    const am = s < 12 * 60;
    const i = (presets || []).findIndex((p) => {
      const items = p.items.map((it) => ({ ...it, place: normPlace(it.place || p.place) }));
      if (!items.length || items.some((it) => it.place !== normPlace(slot.place))) return false;
      return (Math.min(...items.map((it) => mins(it.start) ?? 0)) < 12 * 60) === am;
    });
    if (i >= 0) return i;
  }
  let best = -1, bestStart = -1, firstSame = -1;
  (presets || []).forEach((p, i) => {
    const items = p.items.map((it) => ({ ...it, place: normPlace(it.place || p.place) }));
    if (!items.length || items.some((it) => it.place !== normPlace(slot.place))) return;
    if (firstSame < 0) firstSame = i;
    const st = items.map((it) => mins(it.start)), en = items.map((it) => mins(it.end) ?? mins(it.start));
    if (st.some((x) => x == null || x < s) || en.some((x) => x == null || x > e)) return;
    const first = Math.min(...st);
    if (first > bestStart) { best = i; bestStart = first; }
  });
  return best >= 0 ? best : firstSame;
}

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
/** '2026-11-22' → 「11/22（日）」 */
export const mdw = (s) => { const d = parseYmd(s); return d ? `${d.getMonth() + 1}/${d.getDate()}（${DOW[d.getDay()]}）` : s; };
