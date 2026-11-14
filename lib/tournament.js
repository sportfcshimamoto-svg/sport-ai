// 大会1つ分の入力から、書き出すファイルをまとめて作る（画面とテストの両方で使う）
import { buildSchedule, gradeOf, FINALS_GAP } from './schedule.js';
import { page2Xml, leagueDocx, boardDocx, awardDocx, teamLines, RID_SHIELD } from './outputs.js';
import { makeFinalYoukou, applyPlayers, half } from './youkou.js';
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

// ---------- 要項の文（PDFの要項で使う） ----------
// 要項を読み込まなくても作れるように、いつもの要項（2024年度 U-12・U-8・U-7）の文をひな形として持つ。
// 要項を読み込んだときは、読み込んだ要項の文を使う（日時・場所などは画面の値）。
export const STD_TEXT = {
  大会主旨: ['本大会を通じ、互いのチームの交流、親睦を深め、個人やチームのサッカーのレベル向上をめざすことを目的とする。'],
  競技方法: [
    '①８人制。現行の日本サッカー協会「サッカー競技規則」に準ずる。選手交替は何名でもよい。また、同じ選手の同一試合への再出場も可とする。',
    '②審判は１人審判で行う。タイムスケジュールの左チームが前半、右チームが後半。審判服不要。',
    '③審判の判定には一切抗議できない。',
  ],
  表彰: ['優勝、準優勝、３位、および各チーム１人優秀選手（自チームで選出）', '※各チームの試合終了後、それぞれで表彰します。閉会式はありません。'],
  その他: [
    '①参加選手は全てスポーツ傷害保険に加入のこと。',
    '②大会中の負傷等につきましては、各チームで対応をお願いいたします。',
    '③雨天等中止の判断は、７時３０分に行い、各チームへ連絡致します。',
    '④車の乗り入れは、各チーム３台まででお願いいたします。',
    '⑤各チームで出たゴミは、必ずお持ち帰り頂くようよろしくお願い致します。',
  ],
};
export const STD_FEE = '4,000円';
const POINTS = ['勝ち・・・３点　引き分け・・・１点　負け・・・０点', 'ただし、勝ち点が同じ場合は、得失点差、多得点、直接対決結果、コイントスの順で決定する。'];

/** 「●競技方法」の文（読み込んだ要項、なければひな形。U-7のひな形は「6～８人制（参加チームで相談）」） */
export function methodText(t, doc) {
  const base = doc?.sections?.競技方法?.length ? doc.sections.競技方法
    : STD_TEXT.競技方法.map((s, i) => (i === 0 && t.grade === 'U7' ? s.replace('８人制', '6～８人制（参加チームで相談）') : s));
  return base.map((s) => applyPlayers(s, t.players));
}

/** 「●その他」の文（画面で直せる） */
export const othersText = (t, doc) => (Array.isArray(t.others) ? t.others : doc?.sections?.その他?.length ? doc.sections.その他 : STD_TEXT.その他);

/** 「●順位決定について」の文。読み込んだ要項と形がちがうとき（形式やリーグ名を変えたとき）は作り直す */
function rankText(t, p, doc) {
  const fromDoc = doc?.sections?.順位決定について;
  if (fromDoc?.length && doc.format === t.format && (t.format !== 'two3' || fromDoc[0].includes(`「${t.leagues[0]}」「${t.leagues[1]}」`))
    && (t.format === 'two3' || new RegExp(`^${p.teams.length}\\s*チーム`).test(half(fromDoc[0])))) return fromDoc;
  if (t.format === 'two3') {
    return [`３チームでの予選リーグ（「${t.leagues[0]}」「${t.leagues[1]}」）を行う。各リーグの１位チームで優勝決定戦、２位チームで３位決定戦、３位チームで５位決定戦を行う。`, '【予選リーグ戦】', ...POINTS];
  }
  return [`${p.teams.length}チーム総当たりのリーグ戦を行う。`, ...POINTS];
}

/** 連絡先の行（名前・電話番号は公開しないよう、はじめは空。入れた値はその端末にだけ保存） */
export function contactLine(t) {
  const name = (t.contactName || '').trim(), tel = (t.contactTel || '').trim();
  return `SPORT FC${name ? ` 代表 ${name}` : ''}${tel ? `　　Tel ${tel}` : ''}`;
}

/**
 * PDFの要項の中身
 * → { title, items:[{ label, value } | { text, indent, hang }], contact }
 *    indent：左のあき（cm）、hang：2行目からさらに下げる（cm。①②…の行）
 */
export function youkouContent(t, doc) {
  const p = prepare(t);
  const items = [];
  const head = (label, value = '') => items.push({ label, value });
  const body = (lines, indent = 0.37, hang = 0) => lines.forEach((s) => items.push({ text: s, indent, hang: /^[①-⑳]/.test(s) ? hang : 0 }));
  const sec = (name) => (doc?.sections?.[name]?.length ? doc.sections[name] : STD_TEXT[name]);
  head('大会主旨'); body(sec('大会主旨').map((s) => (/^[\s　]/.test(s) ? s : `　${s}`)), 0.37);
  head('日時', `${p.dateText}${t.open}-${t.close}`);
  head('場所', t.place);
  head('対象', t.target || '');
  head('参加費', t.fee ?? STD_FEE);
  head('順位決定について'); body(rankText(t, p, doc), 0);
  head('参加チーム'); body(teamLines(p.teams, t.cities || []), 1.0);
  head('競技時間', p.timeText);
  head('競技方法'); body(methodText(t, doc), 0.37, 0.37);
  head('表彰'); body(sec('表彰'), 0.37);
  head('その他'); body(othersText(t, doc), 0.37, 0.37);
  return { title: t.title, items, contact: contactLine(t), page: p };
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
