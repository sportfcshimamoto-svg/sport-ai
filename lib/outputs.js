// 大会の書き出し（Word）。見本のファイルと同じ形にそろえる。
//  ・完成版要項の2ページ目（リーグ表＋タイムスケジュール）
//  ・リーグ表.docx（A4横・勝ち点などの欄つき）
//  ・掲示用.docx（A4横・大きな字のタイムスケジュール）
//  ・優秀選手賞.docx（A4縦・1チーム1枚のカード、1ページに8枚）
import { para, table, buildDocx, floatPic, MARU, GOTHIC } from './docx.js';

// マスコット「スポルトン」の絵（img は loadImages() の結果。なければ絵なし）
export const RID_SPORTON = 'rIdSporton1';
export const RID_SHIELD = 'rIdSporton2';
const mediaOf = (img, ...keys) => keys.filter((k) => img?.[k]).map((k) => ({ rid: k === 'shield' ? RID_SHIELD : RID_SPORTON, ...img[k] }));

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circ = (n) => CIRCLED[n - 1] || String(n);

/** 総当たりの表（チーム×チーム。自分どうしのマスに斜め線） */
function crossTable(teams, { width, labelW, stats = false, size = 10.5, rowH = 0.75, headSize }) {
  const statCols = stats ? ['勝ち点', '得失', '総得点', '順位'] : [];
  const statW = stats ? 1.9 : 0;
  const teamW = (width - labelW - statW * statCols.length) / teams.length;
  const cols = [labelW, ...teams.map(() => teamW), ...statCols.map(() => statW)];
  const hs = headSize || size;
  const head = { height: rowH, cells: [{ content: '' }, ...teams.map((t) => ({ content: t, size: hs })), ...statCols.map((s) => ({ content: s, size: Math.min(size, 10) }))] };
  const rows = teams.map((t, i) => ({
    height: rowH,
    cells: [{ content: t, size: hs }, ...teams.map((_, j) => ({ content: '', diag: i === j })), ...statCols.map(() => ({ content: '' }))],
  }));
  return table(cols, [head, ...rows], { border: 12, inner: 4 });
}

/** タイムスケジュールの表 */
function scheduleTable(court, { width, size = 10.5, timeSize, rowH = 0.8, headSize }) {
  // 列：番号・時間・ホーム・－・アウェイ・審判（見本の比率）
  const ratio = [0.8, 4.0, 3.6, 0.8, 3.6, 2.2];
  const sum = ratio.reduce((a, b) => a + b, 0);
  const cols = ratio.map((r) => (r * width) / sum);
  const hs = headSize || size;
  const head = { height: rowH, cells: [{ content: '' }, { content: 'タイムスケジュール', size: hs }, { content: '対戦表', size: hs, span: 3 }, { content: '審判', size: hs }] };
  const rows = court.matches.map((m) => (m.note
    ? { height: rowH, cells: [{ content: circ(m.no), font: GOTHIC, size }, { content: m.note, span: 4, size, bold: true }, { content: '' }] }
    : {
      height: rowH,
      cells: [
        { content: circ(m.no), font: GOTHIC, size },
        { content: `${m.from}～${m.to}`, font: GOTHIC, size: timeSize || size },
        { content: m.home, size }, { content: '－', size }, { content: m.away, size }, { content: m.ref, size },
      ],
    }));
  return table(cols, [head, ...rows], { border: 12, inner: 4 });
}

/** 「Aコート（15-5-15）」などの見出し */
const courtTitle = (court, t, size) => (court.name ? `${court.name}（${t}）` : `（${t}）`);

/**
 * 完成版要項の2ページ目
 * d: { schedule, timeText, notes:{rr:[], two3:[]} , width }
 */
export function page2Xml(d) {
  const W = d.width || 15.0;
  const { schedule: s, timeText } = d;
  // 盾のエンブレムを、2ページ目の右上の余白に（要項は左右3cmの余白）
  const pre = d.img?.shield ? floatPic(d.img.shield, RID_SHIELD, { height: 2.6, x: 18.35, y: 0.9, relX: 'page', relY: 'page' }) : '';
  let x = para('', { pageBreakBefore: true, pre });
  if (s.leagues.length > 1) {
    s.leagues.forEach((lg, i) => {
      x += para(lg.name, { bold: true, size: 10.5, before: i ? 10 : 0, after: 2, keepNext: true });
      x += crossTable(lg.teams, { width: W * 0.92, labelW: W * 0.92 / (lg.teams.length + 1), size: 10.5, rowH: 0.7 });
    });
  } else {
    x += crossTable(s.leagues[0].teams, { width: W, labelW: W / (s.leagues[0].teams.length + 1), size: 10.5, rowH: 0.75 });
  }
  s.courts.forEach((c, i) => {
    x += para('', { after: 0 }) + para(courtTitle(c, timeText), { font: GOTHIC, size: 10.5, before: i ? 12 : 8, after: 2, keepNext: true });
    x += scheduleTable(c, { width: W, size: 10.5, rowH: 0.8 });
    (d.notesAfter?.[i] || []).forEach((n) => { x += para(n, { font: GOTHIC, size: 10.5, before: i ? 0 : 2 }); });
  });
  x += para('', { after: 6 });
  return x;
}

// A4横・余白1.27cm のときの、文字を書ける広さ（cm）
const AREA_W = 29.7 - 2.54, AREA_H = 21.0 - 2.54;

/**
 * 表のサイズは見本のまま（小さくしない）。スポルトンは、表の下の右すみの あいている所に入る大きさにする。
 * used：上から使っている高さ（cm、だいたい）。あきが少ないときは絵を入れない。
 */
function cornerPic(img, used, maxH) {
  if (!img) return '';
  const h = Math.min(maxH, AREA_H - used - 0.4);
  if (h < 1.5) return '';   // あきがほとんどないときは絵なし（表は小さくしない）
  const w = h * img.w / img.h;
  return floatPic(img, RID_SPORTON, { height: h, x: AREA_W - w, y: AREA_H - h });
}
// 高さの見積もり（WordでPDFにして測った値）。表の行は指定より約3%高くなる
const ROW_K = 1.03;

/** リーグ表.docx */
export async function leagueDocx(d) {
  const { schedule: s, title, dateDots } = d;
  const two = s.leagues.length > 1;
  // 表は用紙いっぱい（27.1cm）。2026年11月 本人：「表は小さくしない。イラストを小さく」
  const W = AREA_W - 0.06;
  const rowH = (lg) => (two ? 1.56 : (lg.teams.length > 4 ? 1.7 : 2.2));
  // スポルトン：大会名の行の右（表の上のあき 約2.2cm に入る大きさ）。表にはかからない
  const pre = d.img?.sporton
    ? floatPic(d.img.sporton, RID_SPORTON, { height: 2.0, x: AREA_W - (2.0 * d.img.sporton.w) / d.img.sporton.h, y: -0.1 })
    : '';
  let x = para(`${title}　${dateDots}`, { size: 14, after: 4, pre });
  s.leagues.forEach((lg, i) => {
    if (lg.name) x += para(lg.name, { bold: true, size: 12, before: i ? 18 : 2, after: 2, keepNext: true });
    else x += para('', { after: 4 });
    x += crossTable(lg.teams, { width: W, labelW: 3.6, stats: true, size: 12, headSize: 14, rowH: rowH(lg) });
  });
  return buildDocx(x, { landscape: true, media: mediaOf(d.img, 'sporton') });
}

/** 掲示用.docx */
export async function boardDocx(d) {
  const { schedule: s, timeText } = d;
  const W = 26.75;   // 見本と同じ幅（用紙いっぱい）
  const many = s.courts.length > 1;
  const rowH = many ? 1.03 : 1.6;
  // 1.5：はじめのコート名の行、2.1：2つ目のコート名の行（上のあき込み）
  const used = s.courts.reduce((a, c, i) => a + (i ? 2.1 : 1.5) + (c.matches.length + 1) * rowH * ROW_K, 0);
  let x = '';
  s.courts.forEach((c, i) => {
    const pre = i === 0 ? cornerPic(d.img?.sporton, used, 6.6) : '';
    x += para(courtTitle(c, timeText), { font: GOTHIC, size: 16, before: i ? 16 : 0, after: 4, keepNext: true, pre });
    x += scheduleTable(c, { width: W, size: 18, headSize: 16, rowH });
  });
  if (d.boardNote) x += para(d.boardNote, { size: 14, before: 8 });
  return buildDocx(x, { landscape: true, media: mediaOf(d.img, 'sporton') });
}

/** 優秀選手賞.docx（1チーム1枚。2列×4段） */
export async function awardDocx(d) {
  const teams = d.teams.filter(Boolean);
  const cardW = 8.9, gapW = 0.66, cardH = 6.3;
  const card = (team) => {
    if (!team) return { content: '', borders: 'none' };
    const reason = table([cardW - 1.1], [{ height: 2.7, cells: [{ content: para('選考理由', { size: 14, before: 2 }), valign: 'top' }] }], { border: 8, inner: 4, align: 'center' });
    // スポルトンは「優秀選手賞」の右に（カードの中の幅は 8.3cm）
    const pre = d.img?.sporton ? floatPic(d.img.sporton, RID_SPORTON, { height: 1.5, x: 7.05, y: 0.1, relX: 'column', relY: 'paragraph' }) : '';
    const inner = para(team, { size: 14, align: 'right', before: 6 })
      + para('優秀選手賞', { size: 14, before: 2, pre })
      + para('フリガナ', { size: 8, before: 6, indent: 0.5 })
      + para('選手名', { size: 14, bottomLine: true, indent: 0.5, after: 4 })
      + reason + para('', { size: 4 });
    return { content: inner, valign: 'top', pad: 0.3, borders: { top: 12, left: 12, bottom: 12, right: 12 } };
  };
  const rows = [];
  for (let i = 0; i < teams.length; i += 2) {
    rows.push({ height: cardH, exact: true, cells: [card(teams[i]), { content: '', borders: 'none' }, card(teams[i + 1])] });
    if (i + 2 < teams.length) rows.push({ height: 0.6, exact: true, cells: [{ content: '', borders: 'none' }, { content: '', borders: 'none' }, { content: '', borders: 'none' }] });
  }
  const x = table([cardW, gapW, cardW], rows, { border: 0, inner: 0, align: 'center' });
  return buildDocx(x + para(''), { landscape: false, media: mediaOf(d.img, 'sporton') });
}

/** 参加チームの行（1行に3チームまで） */
export function teamLines(teams, cities) {
  const list = teams.map((t, i) => (cities[i] ? `${t}（${cities[i]}）` : t)).filter(Boolean);
  const out = [];
  for (let i = 0; i < list.length; i += 3) out.push(list.slice(i, i + 3).map((s) => `・${s}`).join('　'));
  return out;
}
