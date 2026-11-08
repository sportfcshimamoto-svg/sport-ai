// 大会1つ分の入力から、書き出すファイルをまとめて作る（画面とテストの両方で使う）
import { buildSchedule, gradeOf, FINALS_GAP } from './schedule.js';
import { page2Xml, leagueDocx, boardDocx, awardDocx, teamLines, RID_SHIELD } from './outputs.js';
import { makeFinalYoukou } from './youkou.js';
import { loadImages } from './images.js';
import { refereeXlsx } from './referee.js';

const toMinute = (s) => { const m = String(s).match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : 0; };
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const weekday = (y, m, d) => WD[new Date(y, m - 1, d).getDay()];

/** 1試合の枠（分）：前半＋休けい＋後半 を5分単位に切り上げ（12-5-12 → 30分。見本と同じ） */
export const slotOf = (half, brk) => Math.ceil((Number(half) * 2 + Number(brk)) / 5) * 5;

/** 要項から読んだ値を、学年のひな形に重ねる */
export function fromYoukou(y) {
  const base = defaultsFor(y.grade || 'U12');
  const t = { ...base };
  for (const k of ['title', 'month', 'day', 'open', 'close', 'place', 'target', 'half', 'brk', 'format', 'leagues']) if (y[k] != null) t[k] = y[k];
  t.courts = t.format === 'two3' ? 2 : 1;
  if (t.format !== base.format) { t.gap = t.format === 'two3' ? 10 : 5; t.finalsGap = t.format === 'two3' ? FINALS_GAP : t.gap; t.start = t.format === 'two3' ? '9:50' : '9:40'; }
  t.matchMin = slotOf(t.half, t.brk);
  Object.assign(t, { exchange: defaultNotes(t).exchange, notesAfter: defaultNotes(t).after });
  t.teams = y.teams?.length ? y.teams.map((s) => s.replace(/（[^）]*）$/, '')) : [];
  t.cities = y.teams?.length ? y.teams.map((s) => (s.match(/（([^）]*)）$/) || [])[1] || '') : [];
  return t;
}

/** 学年を選んだときの、はじめの値 */
export function defaultsFor(gradeId) {
  const g = gradeOf(gradeId);
  return {
    grade: g.id, title: `SPORT CUP　${g.label}`, target: g.target,
    half: g.half, brk: g.brk, matchMin: slotOf(g.half, g.brk), start: g.start, gap: g.gap, finalsGap: g.finalsGap ?? g.gap,
    format: g.format, courts: g.format === 'two3' ? 2 : 1, leagues: ['くすのきリーグ', 'やまぶきリーグ'],
    finalsRef: g.finalsRef, open: '9:00', close: g.format === 'two3' && g.id === 'U7' ? '13:30' : '16:00',
    place: '水無瀬川緑地公園グラウンド',
  };
}

export function defaultNotes(t) {
  if (t.format === 'two3') {
    return {
      exchange: `以降 希望チームにて${t.half}分一本の交流戦　～${t.close}`,
      after: [['※交流戦を希望されるチームさまは、当日本部でお伝えください！', '※交流戦は、Aコートのみで行います。Bコートは当チームの他学年が使用しています。ご了承ください。'], []],
    };
  }
  return { exchange: '', after: [['※最終試合の後、交流戦可能です。ご希望のチームは当日本部まで！']] };
}

/** 入力 t から、表示用・書き出し用の情報をそろえる */
export function prepare(t) {
  const teams = t.teams.map((s) => s.trim()).filter(Boolean);
  const schedule = buildSchedule({ ...t, teams, exchange: t.useExchange === false ? '' : t.exchange });
  const timeText = `${t.half}-${t.brk}-${t.half}`;
  const wd = t.year && t.month && t.day ? weekday(t.year, t.month, t.day) : '';
  const dateText = t.month && t.day ? `${t.month}月${t.day}日（${wd}）` : '';
  const dateDots = t.year && t.month && t.day ? `${t.year}.${t.month}.${t.day}` : '';
  const shortTitle = t.title.replace(/[\s　]+/g, ' ').trim();
  const matches = schedule.courts.flatMap((c) => c.matches.filter((m) => !m.note).map((m) => ({ ...m, court: c.name })));
  return { teams, schedule, timeText, dateText, dateDots, shortTitle, matches };
}

/** まとめて作る → { ファイル名: Uint8Array } */
export async function buildAll(t, youkouBytes) {
  const p = prepare(t);
  const tag = `${p.shortTitle.replace(/^SPORT CUP\s*/, 'SPORTCUP ').replace(/U-/, 'U')} ${p.dateDots}`.trim();
  const out = {};
  const notesAfter = t.notesAfter || defaultNotes(t).after;
  const img = await loadImages();
  if (youkouBytes) {
    const xml = page2Xml({ schedule: p.schedule, timeText: p.timeText, notesAfter, img });
    out[`${tag}.docx`] = await makeFinalYoukou(youkouBytes, xml, {
      date: `${p.dateText}${t.open}-${t.close}`,
      place: t.place,
      time: p.timeText,
      players: t.players ? `${String(t.players).replace(/\d/g, (c) => '０１２３４５６７８９'[c])}人制` : '',
      teamLines: teamLines(p.teams, t.cities || []),
    }, img.shield ? [{ rid: RID_SHIELD, ...img.shield }] : []);
  }
  out['リーグ表.docx'] = await leagueDocx({ schedule: p.schedule, title: p.shortTitle, dateDots: p.dateDots, img });
  out['掲示用.docx'] = await boardDocx({ schedule: p.schedule, timeText: p.timeText, img });
  out['優秀選手賞.docx'] = await awardDocx({ teams: p.teams, img });
  // 2コートのときは時間の順（A①・B①・A②…）に並べる
  const byTime = [...p.matches].sort((a, b) => toMinute(a.from) - toMinute(b.from) || String(a.court).localeCompare(String(b.court)));
  out['審判カード.xlsx'] = await refereeXlsx(byTime);   // チーム名だけ入れる（大会名はひな形の「SPORT杯」）
  return out;
}
