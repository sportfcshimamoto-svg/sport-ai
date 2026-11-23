// お誘いのLINEの文づくり（2026年11月22日 本人の希望）。
// 大会（スポルト杯）やTMに、たくさんの相手へ同時に送る文。全員に同じ文を送る（宛名は入れない）。
// 本人の見本は3つ（どれも作れるように、書き方を選べる）：
//  見本1（行ごと）：「お世話になります。」「スポルトカップとTMのお誘いです。」→「①1年生」「急ではございますが…」
//                   「11月3日（火・祝）9:00-11:30」「淀川河川公園島本地区」「5人制」…「⑤4年生スポルト杯」…「参加費5,000円　全6チーム参加」
//  見本2（行ごと・同じ月）：「9月のTMのお誘いです。」→「①1年生」「12日（土）9:00-11:30」「@淀川河川公園島本地区グラウンド」
//                   「※④の2年生と同一会場で2面開催します。」
//  見本3（1行）：「TMとカップ戦のお誘いです。」→「①6月7日（日）9:00-12:00、水無瀬緑地、5年生のTM。」
//  結び：「複数のチームさまにお声かけさせていただいて（い）ますので、先着順にて決定させていただきます。」「ご検討よろしくお願いいたします🙇」

export const GRADE_NAMES = ['年長', '1年生', '2年生', '3年生', '4年生', '5年生', '6年生'];   // 0〜6
/** 会場の書き方（お誘いの文では、短い名前のことが多い） */
export const PLACES = ['淀川河川公園島本地区', '淀川河川公園島本地区グラウンド', '水無瀬緑地', '第三小学校'];
/** TMタブ・大会タブの会場の名前 → お誘いの文の名前 */
export const shortPlace = (s) => {
  const t = String(s || '').trim();
  if (PLACES.includes(t)) return t;
  return /淀川/.test(t) ? PLACES[0] : /水無瀬/.test(t) ? PLACES[2] : /第三小/.test(t) ? PLACES[3] : t;
};
export const CUP_NAME = 'スポルト杯';
export const DEFAULT_GREET = 'お世話になります。';
export const DEFAULT_CLOSE = '複数のチームさまにお声かけさせていただいておりますので、先着順にて決定させていただきます。\n\nご検討よろしくお願いいたします🙇';
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

/** 書き方のはじめの値 */
export const DEFAULT_STYLE = { monthMode: true, at: false, introKind: '' };
/** はじめの行は3つから選ぶ（2026年11月22日 本人の希望）。'' ＝ お誘いの中身に合わせて自動 */
export const INTROS = [
  { id: 'tm', text: 'TMのお誘いです。' },
  { id: 'cup', text: 'スポルトカップのお誘いです。' },
  { id: 'both', text: 'TMとスポルトカップのお誘いです。' },
];
/** お誘いの中身に合う、はじめの行の種類 */
export function autoIntro(items) {
  const cup = items.some((it) => it.kind === 'cup'), tm = items.some((it) => it.kind === 'tm');
  return cup && tm ? 'both' : cup ? 'cup' : 'tm';
}

/** 新しいお誘い1件 */
export function newItem(kind) {
  return {
    id: Math.random().toString(36).slice(2, 9),
    kind,                       // 'tm' | 'cup'
    grade: 1,                   // 0＝年長、1〜6＝学年
    date: '',                   // 2026-11-03
    holiday: false,             // 「火・祝」と書く
    from: '9:00', to: kind === 'cup' ? '14:00' : '12:00',
    place: PLACES[2],
    players: '',                // '' ＝書かない、5〜8
    memo: '',                   // 会場の下の行（例：※④の2年生と同一会場で2面開催します。）
    fee: '5,000円', teams: 6,
  };
}

const ymd = (it) => String(it.date || '').match(/^(\d+)-(\d+)-(\d+)$/);
/** 「11月3日（火・祝）」。monthOff なら「3日（火・祝）」。日にちがなければ空 */
export function dateText(it, monthOff = false) {
  const m = ymd(it);
  if (!m) return '';
  const wd = '日月火水木金土'[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
  return `${monthOff ? '' : `${+m[2]}月`}${+m[3]}日（${wd}${it.holiday ? '・祝' : ''}）`;
}
/** 日にちが今日より前か（終わったお誘い） */
export function isPast(it, today = new Date()) {
  const m = ymd(it);
  if (!m) return false;
  return new Date(+m[1], +m[2] - 1, +m[3]) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}
/** 日にち順（日にちのないものは最後。同じなら入れた順） */
export const sorted = (items) => items.map((it, i) => ({ it, i }))
  .sort((a, b) => (a.it.date || '9999').localeCompare(b.it.date || '9999') || a.i - b.i)
  .map(({ it }) => it);
/** 全部が同じ月なら、その月（数）。ちがえば null */
export function oneMonth(items) {
  const ms = items.map((it) => ymd(it)?.[2]);
  if (!ms.length || ms.some((m) => !m)) return null;
  return ms.every((m) => m === ms[0]) ? +ms[0] : null;
}

const timeText = (it) => (it.from ? `${it.from}${it.to ? `-${it.to}` : ''}` : '');
const cupExtra = (it) => (it.kind === 'cup'
  ? [it.fee ? `参加費${String(it.fee).trim()}` : '', it.teams ? `全${it.teams}チーム参加` : ''].filter(Boolean)
  : []);

/** 1件ぶんの文 */
export function itemText(it, n, o, monthOff) {
  const no = CIRCLED[n] || `(${n + 1})`;
  const grade = GRADE_NAMES[it.grade] ?? '';
  const place = String(it.place || '').trim();
  const date = dateText(it, monthOff) || (it.from ? '日にち未定　' : '日にち未定');
  const memo = String(it.memo || '').trim();
  const players = it.players ? `${it.players}人制` : '';
  // いつも行ごとに書く（「1行にまとめる」書き方と、日にちの上の「急ではございますが…」は、本人の希望でやめた 2026年11月22日）
  return [
    `${no}${grade}${it.kind === 'cup' ? CUP_NAME : ''}`,   // 大会の名前はいつも「スポルト杯」（本人 2026年11月22日）
    `${date}${timeText(it)}`,
    place && `${o.at ? '@' : ''}${place}`,
    players,
    cupExtra(it).join('　'),
    memo,
  ].filter(Boolean).join('\n');
}

/** 2行目（選んだもの。同じ月なら「9月のTMのお誘いです。」） */
export function introText(items, o) {
  const kind = INTROS.some((x) => x.id === o.introKind) ? o.introKind : autoIntro(items);
  const m = o.monthMode ? oneMonth(items) : null;
  return `${m ? `${m}月の` : ''}${INTROS.find((x) => x.id === kind).text}`;
}

/** LINEで送る文。S = { items, greet, introKind（'' なら自動）, close, monthMode, at } */
export function inviteText(S) {
  const o = { ...DEFAULT_STYLE, ...S };
  const items = sorted(S.items || []);
  const monthOff = !!(o.monthMode && oneMonth(items));
  const head = [String(S.greet ?? DEFAULT_GREET).trim(), introText(items, o)].filter(Boolean).join('\n');
  return [
    head,
    ...items.map((it, n) => itemText(it, n, o, monthOff)),
    String(S.close ?? DEFAULT_CLOSE).trim(),
  ].filter(Boolean).join('\n\n');
}

const gradeFromU = (id) => { const g = Number(String(id || '').replace(/\D/g, '')); return g >= 6 && g <= 12 ? g - 6 : 1; };
const dateFrom = (x) => (x.month && x.day ? `${x.year || new Date().getFullYear()}-${String(x.month).padStart(2, '0')}-${String(x.day).padStart(2, '0')}` : '');

/** 大会タブの入力 → お誘い1件（大会タブの保存 'sport-ai:v1' から） */
export function fromCup(c) {
  const it = newItem('cup');
  it.grade = gradeFromU(c.grade);
  it.date = dateFrom(c);
  if (c.open) it.from = c.open;
  if (c.close) it.to = c.close;
  if (c.place) it.place = shortPlace(c.place);
  if (c.fee) it.fee = String(c.fee).trim();
  if (Array.isArray(c.teams) && c.teams.length) it.teams = c.teams.length;
  return it;
}
/** 日程タブの場所の名前 → お誘いの文の名前 */
const SCHEDULE_PLACES = { 'よどいこ島本地区': PLACES[0], '水無瀬緑地': PLACES[2], '三小グラウンド': PLACES[3], '一小グラウンド': '第一小学校' };
/**
 * 日程タブの「これからあたる日程」1つ → お誘い1件（2026年11月23日 本人の希望）
 * x = { kind: 'tm'|'cup', grade: '1'〜'6'|'KIDs', date, start, end, place }
 */
export function fromSchedule(x) {
  const it = newItem(x.kind === 'cup' ? 'cup' : 'tm');
  it.grade = x.grade === 'KIDs' ? 0 : Number(x.grade) || 1;
  it.date = x.date || '';
  if (x.start) { it.from = x.start; it.to = x.end || ''; }
  if (x.place) it.place = SCHEDULE_PLACES[x.place] || x.place;
  it.fromSchedule = true;
  return it;
}
/** TMタブの入力 → お誘い1件（TMタブの保存 'sport-ai:tm:v1' から） */
export function fromTM(t) {
  const it = newItem('tm');
  it.grade = gradeFromU(t.grade);
  it.date = dateFrom(t);
  it.holiday = !!t.holiday;
  it.from = t.open || t.start || it.from;
  it.to = t.close || '';
  if (t.place) it.place = shortPlace(t.place);
  if (t.players) it.players = Number(t.players) || '';
  return it;
}
