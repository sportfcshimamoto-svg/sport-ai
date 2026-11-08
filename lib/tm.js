// TM（トレーニングマッチ）のお知らせ（Word）。
// 見本：デスクトップ\スポルト関係\タイムスケジュール\TM U○【相手】日付.docx（2024〜2025年度、19件とも同じ形）
//  ・A4縦。上に「SPORT FC」（紫、Rだけ黄色）
//  ・●対象／●日時／●会場／●参加チーム／（15-5-15）
//  ・表：番号・タイムテーブル・対戦表（ホーム－アウェイ）・審判（前半／後半）
//  ・1本目は SPORT FC が左、2本目は相手が左…と交互。審判は 前半＝左のチーム、後半＝右のチーム
//  ・下に「※」の注意書きと「以上不明な点がございましたら…」
import { para, table, buildDocx, floatPic } from './docx.js';
import { toMin, toHM } from './schedule.js';
import { weekday } from './tournament.js';
import { RID_SPORTON } from './outputs.js';

export const MINCHO = '游明朝';                 // 見本の本文の字（Wordのはじめの字）
export const TITLE_FONT = 'HGP創英角ｺﾞｼｯｸUB';  // 見本の「SPORT FC」の字
const PURPLE = '7030A0', YELLOW = 'FFFF00';

/** 学年ごとのはじめの値（見本から。U7だけ 10-5-10・9:30開始） */
export const TM_GRADES = [
  { id: 'U7', target: 'U-7', half: 10, brk: 5, start: '9:30', players: 5 },
  { id: 'U8', target: 'U-8', half: 15, brk: 5, start: '9:40', players: '' },
  { id: 'U9', target: 'U-9', half: 15, brk: 5, start: '9:40', players: '' },
  { id: 'U10', target: 'U-10', half: 15, brk: 5, start: '9:40', players: '' },
  { id: 'U11', target: 'U-11', half: 15, brk: 5, start: '9:40', players: '' },
  { id: 'U12', target: 'U-12', half: 15, brk: 5, start: '9:40', players: '' },
];
/** 「○人制」で選べる人数（空＝書かない） */
export const PLAYERS = [5, 6, 7, 8];
const FW = (n) => String(n).replace(/\d/g, (c) => '０１２３４５６７８９'[c]);   // 見本は「５人制」と全角
export const playersText = (n) => (n ? `${FW(n)}人制` : '');

export const tmGradeOf = (id) => TM_GRADES.find((g) => g.id === id) || TM_GRADES[1];

/**
 * 会場（3か所）と、その会場の車の乗り入れの文（過去のTM 19件で、会場ごとにいつも同じ文だった）
 */
export const VENUES = [
  { name: '淀川河川公園島本地区グラウンド', car: '会場への車の乗り入れに、特に制限はありません。併設の無料駐車場をご利用ください。' },
  { name: '水無瀬川緑地公園グラウンド', car: '会場への車の乗り入れは、４台程度でお願いいたします。' },
  { name: '島本町立第三小学校グラウンド', car: '会場への車の乗り入れは、４台程度でお願いいたします。' },
];
export const venueOf = (name) => VENUES.find((v) => v.name === name) || VENUES[0];

/** 学年を選んだときの、はじめの値 */
export function tmDefaults(gradeId) {
  const g = tmGradeOf(gradeId);
  return {
    grade: g.id, target: g.target, half: g.half, brk: g.brk, players: g.players, extra: '',
    us: 'SPORT FC', opponent: '',
    year: null, month: null, day: null,
    open: '', close: '',            // 「9:00～12:00 ごろ」。空なら書かない
    arrive: '9:00',                 // 「※9時00分以降にお越しください。」
    place: VENUES[0].name,
    start: g.start, matchMin: Math.ceil((g.half * 2 + g.brk) / 5) * 5, gap: 10, count: 3,
    car: VENUES[0].car,             // 会場を選ぶと、その会場の文に入れかわる
    rain: '7:30',
    contact: '',   // 公開するので個人名は入れておかない（入力した名前はその端末に保存される）
    extraNotes: '',
  };
}

/** 9:00 → 9時00分 */
const jpTime = (s) => { const m = String(s || '').replace('：', ':').match(/(\d{1,2}):(\d{2})/); return m ? `${Number(m[1])}時${m[2]}分` : String(s || ''); };

/** 1本ずつの時間と対戦 */
export function tmMatches(t) {
  const start = toMin(t.start), slot = Number(t.matchMin), step = slot + Number(t.gap);
  const n = Math.max(1, Math.min(8, Number(t.count) || 3));
  const us = t.us || 'SPORT FC', op = t.opponent || '相手チーム';
  return [...Array(n)].map((_, i) => {
    const [home, away] = i % 2 ? [op, us] : [us, op];
    return { no: i + 1, from: toHM(start + i * step), to: toHM(start + i * step + slot), home, away, ref1: home, ref2: away };
  });
}

/** 画面と書き出しで使う文をそろえる */
export function tmPrepare(t) {
  const wd = t.year && t.month && t.day ? weekday(t.year, t.month, t.day) : '';
  const date = t.month && t.day ? `${t.month}月${t.day}日（${wd}${t.holiday ? '・祝' : ''}）` : '';
  const hours = t.open && t.close ? `${t.open}～${t.close} ごろ` : t.open ? `${t.open}～` : '';
  const arrive = t.arrive ? `※${jpTime(t.arrive)}以降にお越しください。` : '';
  const timeText = [`${t.half}-${t.brk}-${t.half}`, playersText(t.players), t.extra].filter(Boolean).join('　');
  const notes = [
    '審判は上記の通りお願いいたします。一人審判でお願いいたします。',
    '試合終了後のベンチ挨拶は、時間短縮のため割愛致します。',
    t.car,
    t.rain ? `雨天中止の判断は、当日${jpTime(t.rain)}に判断します。` : '',
    ...String(t.extraNotes || '').split('\n'),
  ].map((s) => String(s || '').trim()).filter(Boolean);
  const dots = t.year && t.month && t.day ? `${t.year}.${t.month}.${t.day}` : '';
  const fileName = `TM ${t.grade}【${(t.opponent || '相手').trim()}】${dots}.docx`.replace(/[\\/:*?"<>|]/g, '');
  return {
    lines: {
      target: `●対象　${t.target}`,
      date: `●日時　${date}${hours}　${arrive}`.replace(/　+$/, ''),
      place: `●会場　${t.place}`,
      teams: `　＊${t.opponent || '相手チーム'}　　＊${t.us || 'SPORT FC'}`,
      time: `（${timeText}）`,
    },
    matches: tmMatches(t), notes,
    closing: `以上不明な点がございましたら、${t.us || 'SPORT FC'} ${t.contact || ''}までご連絡ください。`.replace(/ までご/, 'までご'),
    fileName,
  };
}

const CIRCLED = '①②③④⑤⑥⑦⑧';

/** TM.docx を作る（img は loadImages() の結果。なければ絵なし） */
export async function tmDocx(t, img) {
  const p = tmPrepare(t);
  const F = { font: MINCHO, size: 12 };
  let x = para([
    { text: 'SPO', color: PURPLE }, { text: 'R', color: YELLOW }, { text: 'T FC', color: PURPLE },
  ], { font: TITLE_FONT, size: 24, bold: true, align: 'center', after: 10 });
  const gap = { ...F };   // 見本は 段落のあきなし（Wordの行の目盛りで1行ずつあく）
  x += para(p.lines.target, gap);
  x += para(p.lines.date, gap);
  x += para(p.lines.place, gap);
  x += para('●参加チーム', gap);
  x += para(p.lines.teams, gap);
  // スポルトン：表のすぐ上の行を基準にして、表にかからないところで止める。
  // 1行の高さはWordのパソコン版（約36pt）とスマホのアプリなど（約20pt）でちがうので、行が詰まっても重ならない大きさにする
  const picH = 2.8, picBottom = 0.45;
  const pic = img?.sporton ? floatPic(img.sporton, RID_SPORTON, { height: picH, x: 15.2, y: picBottom - picH, relX: 'margin', relY: 'paragraph' }) : '';
  x += para(p.lines.time, { ...F, pre: pic });

  // 表（列の幅は見本のまま。単位 cm）
  const cols = [0.74, 3.49, 3.0, 1.05, 2.94, 3.0, 2.92];
  const B = 12, b = 6;
  const c = (content, borders, extra = {}) => ({ content, borders, ...F, ...extra });
  const head1 = { height: 0.99, cells: [
    c('', { top: B, bottom: B, right: B, left: B }, { vmerge: 'restart' }),
    c('タイムテーブル', { top: B, left: B, right: B }, { vmerge: 'restart' }),
    c('対戦表', { top: B, left: B, bottom: B, right: B }, { span: 3, vmerge: 'restart' }),
    c('審判', { top: B, left: B, bottom: b, right: B }, { span: 2 }),
  ] };
  const head2 = { height: 1.15, cells: [
    c('', { bottom: B, right: B, left: B }, { vmerge: 'continue' }),
    c('', { left: B, bottom: B, right: B }, { vmerge: 'continue' }),
    c('', { left: B, bottom: B, right: B }, { span: 3, vmerge: 'continue' }),
    c('前半', { top: b, left: B, bottom: B, right: b }),
    c('後半', { top: b, left: b, bottom: B, right: B }),
  ] };
  const rows = p.matches.map((m, i) => {
    const last = i === p.matches.length - 1 ? B : b;
    return { height: 1.13, cells: [
      c(CIRCLED[i] || String(m.no), { top: B, left: B, bottom: last, right: B }),
      c(`${m.from} ～ ${m.to}`, { left: B, bottom: last, right: B }),
      c(m.home, { left: B, bottom: last, right: b }),
      c('－', { left: b, bottom: last, right: b }),
      c(m.away, { left: b, bottom: last, right: B }),
      c(m.ref1, { left: B, bottom: last, right: b }),
      c(m.ref2, { left: b, bottom: last, right: B }),
    ] };
  });
  x += table(cols, [head1, head2, ...rows], { border: B, inner: b });

  x += para('', { font: MINCHO, size: 6 });
  p.notes.forEach((n) => { x += para(`※　${n}`, { ...F, lineExact: 16 }); });
  x += para(p.closing, { ...F, before: 6 });

  const media = img?.sporton ? [{ rid: RID_SPORTON, ...img.sporton }] : [];
  // 余白：見本と同じ 上下2.54cm・左右1.9cm
  return buildDocx(x, { landscape: false, margins: [2.54, 1.9, 2.54, 1.9], media });
}
