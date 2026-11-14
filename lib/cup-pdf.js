// 大会（SPORT CUP）の書き出しをPDFにする（2026年11月 本人の希望。スマホでも見た目がくずれないように）。
// 寸法・字の大きさは、これまでのWordの書き出し（outputs.js）と同じにしてある。
//  ・完成版の要項（1ページ目：要項、2ページ目：リーグ表・タイムスケジュール・連絡先）
//  ・リーグ表（A4横）・掲示用（A4横）・優秀選手賞（A4縦、8枚ずつ）・審判カード（A4縦、8枚ずつ）
import { Page, drawTable, bitmapOf, pageJpeg, jpegsToPdf, MARU, MSGOTHIC } from './pdf-page.js';
import { youkouContent, prepare } from './tournament.js';
import { loadImages } from './images.js';

const A4 = [21.0, 29.7];
const A4L = [29.7, 21.0];
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circ = (n) => CIRCLED[n - 1] || String(n);
const toMinute = (s) => { const m = String(s).match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : 0; };

// ---------- 表 ----------
/** 総当たりの表（チーム×チーム。自分どうしのマスに斜め線） */
function crossRows(teams, { width, labelW, stats = false, pt = 10.5, headPt, rowH }) {
  const statCols = stats ? ['勝ち点', '得失', '総得点', '順位'] : [];
  const statW = stats ? 1.9 : 0;
  const teamW = (width - labelW - statW * statCols.length) / teams.length;
  const cols = [labelW, ...teams.map(() => teamW), ...statCols.map(() => statW)];
  const hp = headPt || pt;
  const rows = [
    { h: rowH, cells: [{ s: '' }, ...teams.map((t) => ({ s: t, pt: hp })), ...statCols.map((s) => ({ s, pt: Math.min(pt, 10) }))] },
    ...teams.map((t, i) => ({ h: rowH, cells: [{ s: t, pt: hp }, ...teams.map((_, j) => ({ s: '', diag: i === j })), ...statCols.map(() => ({ s: '' }))] })),
  ];
  return { cols, rows };
}

/** タイムスケジュールの表（列：番号・時間・ホーム・－・アウェイ・審判。見本の比率） */
function scheduleRows(court, { width, pt = 10.5, headPt, rowH }) {
  const ratio = [0.8, 4.0, 3.6, 0.8, 3.6, 2.2];
  const sum = ratio.reduce((a, b) => a + b, 0);
  const cols = ratio.map((r) => (r * width) / sum);
  const hp = headPt || pt;
  const rows = [{ h: rowH, cells: [{ s: '' }, { s: 'タイムスケジュール', pt: hp }, { s: '対戦表', pt: hp, span: 3 }, { s: '審判', pt: hp }] }];
  for (const m of court.matches) {
    rows.push(m.note
      ? { h: rowH, cells: [{ s: circ(m.no), family: MSGOTHIC }, { s: m.note, span: 4, weight: 'bold' }, { s: '' }] }
      : { h: rowH, cells: [{ s: circ(m.no), family: MSGOTHIC }, { s: `${m.from}～${m.to}`, family: MSGOTHIC }, { s: m.home }, { s: '－' }, { s: m.away }, { s: m.ref }] });
  }
  return { cols, rows };
}

const courtTitle = (court, t) => (court.name ? `${court.name}（${t}）` : `（${t}）`);

/**
 * 上から順に積む（入りきらなければ次のページ）
 * blocks：[{ h, draw(pg, y) }]、newPage()：新しいページ（{ pg, top, bottom }）
 */
function flow(blocks, newPage) {
  const pages = [];
  let cur = newPage(0); pages.push(cur.pg);
  let y = cur.top;
  // stick：前の見出しといっしょに動く表（見出しだけがページの下に残らないように）
  blocks.forEach((b, i) => {
    const need = b.h + (blocks[i + 1]?.stick ? blocks[i + 1].h : 0);
    if (!b.stick && y + need > cur.bottom && y > cur.top + 0.01) { cur = newPage(pages.length); pages.push(cur.pg); y = cur.top; }
    b.draw(cur.pg, y);
    y += b.h;
  });
  return { pages, y };
}

// ---------- 完成版の要項 ----------
async function youkouPages(t, doc, img) {
  const c = youkouContent(t, doc);
  const logo = await bitmapOf(img.logo), shield = await bitmapOf(img.shield);
  const L = 3.0, W = 15.0, BOTTOM = 28.2;

  // 1ページ目：入りきらないときは行の間を詰める → それでもだめなら字を小さく
  const page1 = (pitch, pt) => {
    const pg = new Page(...A4);
    if (logo) { const h = 2.05, w = (h * logo.width) / logo.height; pg.image(logo, (A4[0] - w) / 2, 1.1, w, h); }
    pg.font(20); pg.text(c.title, A4[0] / 2, 5.0, { align: 'center', maxW: W });
    pg.font(pt);
    let y = 6.15 - pitch;
    for (const it of c.items) {
      if (it.label) {
        y += pitch;
        pg.text(`●${it.label}${it.value ? `　${it.value}` : ''}`, L, y, { maxW: W });
      } else {
        pg.wrap(it.text, W - it.indent).forEach((ln, i) => {
          y += pitch;
          const x = L + it.indent + (i ? it.hang : 0);
          pg.text(i && it.hang ? ln.trimStart() : ln, x, y);
        });
      }
    }
    return { pg, bottom: y };
  };
  let p1;
  for (const [pitch, pt] of [[0.635, 10.5], [0.58, 10.5], [0.53, 10], [0.5, 9.5], [0.47, 9]]) {
    p1 = page1(pitch, pt);
    if (p1.bottom <= BOTTOM) break;
  }

  // 2ページ目：リーグ表・タイムスケジュール・連絡先
  const { schedule: s, timeText } = c.page;
  const notesAfter = t.notesAfter || [];
  const make = (k) => {
    const blocks = [];
    if (s.leagues.length > 1) {
      s.leagues.forEach((lg, i) => {
        const w = W * 0.92;
        const tb = crossRows(lg.teams, { width: w, labelW: w / (lg.teams.length + 1), rowH: 0.7 * k });
        blocks.push({ h: (i ? 0.45 : 0) + 0.55, draw: (pg, y) => { pg.font(10.5, MARU, 'bold'); pg.text(lg.name, L, y + (i ? 0.45 : 0) + 0.42); } });
        blocks.push({ h: tb.rows.length * 0.7 * k, stick: true, draw: (pg, y) => drawTable(pg, L, y, tb.cols, tb.rows, { outer: 1.5, inner: 0.5 }) });
      });
    } else {
      const tb = crossRows(s.leagues[0].teams, { width: W, labelW: W / (s.leagues[0].teams.length + 1), rowH: 0.75 * k });
      blocks.push({ h: tb.rows.length * 0.75 * k, draw: (pg, y) => drawTable(pg, L, y, tb.cols, tb.rows) });
    }
    s.courts.forEach((ct, i) => {
      const tb = scheduleRows(ct, { width: W, rowH: 0.8 * k });
      blocks.push({ h: (i ? 1.2 : 0.9) + 0.5, draw: (pg, y) => { pg.font(10.5, MSGOTHIC); pg.text(courtTitle(ct, timeText), L, y + (i ? 1.2 : 0.9) + 0.35); } });
      blocks.push({ h: tb.rows.length * 0.8 * k, stick: true, draw: (pg, y) => drawTable(pg, L, y, tb.cols, tb.rows) });
      const notes = notesAfter[i] || [];
      if (notes.length) {
        const probe = new Page(1, 1).font(10.5, MSGOTHIC);
        const lines = notes.flatMap((n) => probe.wrap(n, W));
        blocks.push({ h: 0.15 + lines.length * 0.6, draw: (pg, y) => { pg.font(10.5, MSGOTHIC); lines.forEach((l, j) => pg.text(l, L, y + 0.15 + 0.45 + j * 0.6)); } });
      }
    });
    blocks.push({ h: 1.9, draw: (pg, y) => { pg.font(10.5); pg.text('連絡先', L, y + 1.2); pg.font(10.5, MSGOTHIC); pg.text(c.contact, L, y + 1.85, { maxW: W }); } });
    return blocks;
  };
  const newPage = (n) => {
    const pg = new Page(...A4);
    if (n === 0 && shield) { const h = 2.6, w = (h * shield.width) / shield.height; pg.image(shield, Math.min(18.35, A4[0] - 0.3 - w), 0.9, w, h); }
    return { pg, top: 1.6, bottom: BOTTOM };
  };
  // 1ページに入らないときは表の行を低くする（0.7倍まで）
  let blocks = make(1);
  const total = blocks.reduce((a, b) => a + b.h, 0);
  if (total > BOTTOM - 1.6) {
    const fixed = make(0).reduce((a, b) => a + b.h, 0);
    const k = Math.max(0.7, (BOTTOM - 1.6 - fixed) / (total - fixed));
    blocks = make(k);
  }
  return [p1.pg, ...flow(blocks, newPage).pages];
}

// ---------- リーグ表（A4横・余白1.27cm） ----------
const M = 1.27, AREA_W = A4L[0] - M * 2, AREA_H = A4L[1] - M * 2;

async function leaguePages(p, img) {
  const s = p.schedule;
  const two = s.leagues.length > 1;
  const W = AREA_W - 0.06;
  const sporton = await bitmapOf(img.sporton);
  const rowH = (lg) => (two ? 1.56 : (lg.teams.length > 4 ? 1.7 : 2.2));
  const blocks = [];
  s.leagues.forEach((lg, i) => {
    const tb = crossRows(lg.teams, { width: W, labelW: 3.6, stats: true, pt: 12, headPt: 14, rowH: rowH(lg) });
    if (lg.name) blocks.push({ h: (i ? 0.6 : 0.1) + 0.6, draw: (pg, y) => { pg.font(12, MARU, 'bold'); pg.text(lg.name, M + 0.1, y + (i ? 0.6 : 0.1) + 0.45); } });
    else blocks.push({ h: 0.3, draw: () => {} });
    blocks.push({ h: tb.rows.length * rowH(lg), stick: true, draw: (pg, y) => drawTable(pg, M, y, tb.cols, tb.rows, { outer: 1.5, inner: 0.5 }) });
  });
  const newPage = () => {
    const pg = new Page(...A4L);
    pg.font(14); pg.text(`${p.shortTitle}　${p.dateDots}`, M + 0.1, M + 0.75);
    if (sporton) { const h = 2.0, w = (h * sporton.width) / sporton.height; pg.image(sporton, M + AREA_W - w, M - 0.1, w, h); }
    return { pg, top: M + 1.0, bottom: M + AREA_H };
  };
  return flow(blocks, newPage).pages;
}

// ---------- 掲示用（A4横・大きな字） ----------
async function boardPages(p, img) {
  const s = p.schedule;
  const W = 26.75, x0 = M + (AREA_W - W) / 2;
  const many = s.courts.length > 1;
  const sporton = await bitmapOf(img.sporton);
  const titleH = (i) => (i ? 1.6 : 1.0);
  const rows = s.courts.reduce((a, c) => a + c.matches.length + 1, 0);
  const fixed = s.courts.reduce((a, _, i) => a + titleH(i), 0);
  // 試合が多くて1ページに入らないときは、行を低くする（0.75cmまで）
  const rowH = Math.max(0.75, Math.min(many ? 1.03 : 1.6, (AREA_H - fixed) / rows));
  // 字はWordの見本と同じ 18pt（見出し16pt）。行を低くしたときだけ小さくする
  const pt = Math.min(18, rowH * 17.5), headPt = Math.min(16, rowH * 15.5);
  // それでも1ページに入らない長い表は、ページごとに分ける（見出しは「（つづき）」）
  const per = Math.max(1, Math.floor((AREA_H - titleH(1)) / rowH) - 1);
  const parts = s.courts.flatMap((c) => {
    const out = [];
    for (let k = 0; k < c.matches.length; k += per) out.push({ ...c, name: k ? `${c.name}（つづき）` : c.name, matches: c.matches.slice(k, k + per) });
    return out;
  });
  const blocks = [];
  parts.forEach((c, i) => {
    const tb = scheduleRows(c, { width: W, pt, headPt, rowH });
    blocks.push({ h: titleH(i), draw: (pg, y) => { pg.font(16, MSGOTHIC); pg.text(courtTitle(c, p.timeText), x0 + 0.1, y + titleH(i) - 0.35); } });
    blocks.push({ h: tb.rows.length * rowH, stick: true, draw: (pg, y) => drawTable(pg, x0, y, tb.cols, tb.rows, { pt, minPt: 8 }) });
  });
  const { pages, y } = flow(blocks, () => ({ pg: new Page(...A4L), top: M, bottom: M + AREA_H }));
  // スポルトン：最後のページの、表の下の右すみ（あきが1.5cmより少ないときは入れない）
  const h = Math.min(6.6, M + AREA_H - y - 0.3);
  if (sporton && h >= 1.5) { const w = (h * sporton.width) / sporton.height; pages[pages.length - 1].image(sporton, M + AREA_W - w, M + AREA_H - h, w, h); }
  return pages;
}

// ---------- 優秀選手賞（A4縦・1チーム1枚、2列×4段） ----------
async function awardPages(p, img) {
  const teams = p.teams.filter(Boolean);
  const sporton = await bitmapOf(img.sporton);
  const cardW = 8.9, gapW = 0.66, cardH = 6.3, gapH = 0.6;
  const x0 = (A4[0] - cardW * 2 - gapW) / 2, y0 = 1.3;
  const pages = [];
  teams.forEach((team, i) => {
    if (i % 8 === 0) pages.push(new Page(...A4));
    const pg = pages[pages.length - 1];
    const k = i % 8, x = x0 + (k % 2) * (cardW + gapW), y = y0 + Math.floor(k / 2) * (cardH + gapH);
    pg.rect(x, y, cardW, cardH, 1.5);
    // スポルトンは「優秀選手賞」の右（チーム名にも「選手名」の下線にもかからない）
    if (sporton) { const h = 1.5, w = (h * sporton.width) / sporton.height; pg.image(sporton, x + cardW - 0.4 - w, y + 1.35, w, h); }
    pg.font(14); pg.text(team, x + cardW - 0.3, y + 1.05, { align: 'right', maxW: cardW - 0.6 });
    pg.text('優秀選手賞', x + 0.3, y + 1.75);
    pg.font(8); pg.text('フリガナ', x + 0.5, y + 2.3);
    pg.font(14); pg.text('選手名', x + 0.5, y + 2.9);
    pg.line(x + 0.3, y + 3.05, x + cardW - 0.3, y + 3.05, 0.5);
    const bw = cardW - 1.1;
    pg.rect(x + (cardW - bw) / 2, y + 3.25, bw, 2.7, 1.0);
    pg.text('選考理由', x + (cardW - bw) / 2 + 0.15, y + 3.85);
  });
  return pages;
}

// ---------- 審判カード（いつもの Referee card の白紙8枚の絵に、チーム名を書く） ----------
// 絵（img/referee-page.png）の中のチーム名の黄色いマス（cm）
const REF_X = [[4.14, 6.11], [7.02, 8.99]];          // 左のカードの左チーム・右チーム
const REF_DX = 7.874;                                 // 右のカードまでのずれ
const REF_Y = [2.684, 8.966, 15.248, 21.52], REF_H = 0.644;

async function refereePages(p, img) {
  const bg = await bitmapOf(img.referee);
  // 2コートのときは時間の順（A①・B①・A②…）
  const list = [...p.matches].sort((a, b) => toMinute(a.from) - toMinute(b.from) || String(a.court).localeCompare(String(b.court)));
  const pages = [];
  const n = Math.max(1, Math.ceil(list.length / 8)) * 8;
  for (let i = 0; i < n; i++) {
    if (i % 8 === 0) { const pg = new Page(...A4); if (bg) pg.image(bg, 0, 0, A4[0], A4[1]); pages.push(pg); }
    const m = list[i];
    if (!m) continue;
    const pg = pages[pages.length - 1];
    const k = i % 8, dx = (k % 2) * REF_DX, y = REF_Y[Math.floor(k / 2)];
    [m.home, m.away].forEach((name, j) => {
      const [x1, x2] = REF_X[j];
      // チーム名は14pt、「○○位」は8pt（Excelの見本。印刷の大きさ60%なので、紙の上では0.6倍）
      const pt = /位$/.test(name) ? 8 * 0.6 : 14 * 0.6;
      pg.fit(name, x1 + dx, y, x2 + dx, y + REF_H, { pt, minPt: 4, pad: 0.05 });
    });
  }
  return pages;
}

// ---------- まとめ ----------
export const PDF_FILES = [
  { key: 'youkou', ic: '📄', title: '完成版の要項（2ページ目にリーグ表・タイムスケジュール）', sub: 'A4縦・2ページ' },
  { key: 'league', name: 'リーグ表.pdf', ic: '📊', title: 'リーグ表', sub: 'A4横・勝ち点／得失／総得点／順位の欄つき' },
  { key: 'board', name: '掲示用.pdf', ic: '📋', title: '掲示用（タイムスケジュール）', sub: 'A4横・大きな字' },
  { key: 'award', name: '優秀選手賞.pdf', ic: '🏅', title: '優秀選手賞カード', sub: '1チーム1枚・A4に8枚' },
  { key: 'referee', name: '審判カード.pdf', ic: '🟨', title: '審判カード', sub: 'いつもの Referee card の形・チーム名入り・A4に8枚' },
];

/** ファイル名につける「SPORTCUP U12 2024.9.29」 */
export const fileTag = (p) => `${p.shortTitle.replace(/^SPORT CUP\s*/, 'SPORTCUP ').replace(/U-/, 'U')} ${p.dateDots}`.trim();

/**
 * PDFを作る
 * keys：作るもの（PDF_FILES の key）。together：true なら全部を1つのPDFに
 * → { ファイル名: Uint8Array }
 */
export async function buildCupPdfs(t, doc, keys = PDF_FILES.map((f) => f.key), { together = false } = {}) {
  const p = prepare(t);
  const img = await loadImages(['sporton', 'shield', 'logo', 'referee']);
  const tag = fileTag(p);
  const out = {}, all = [];
  for (const key of keys) {
    const pages = key === 'youkou' ? await youkouPages(t, doc, img)
      : key === 'league' ? await leaguePages(p, img)
        : key === 'board' ? await boardPages(p, img)
          : key === 'award' ? await awardPages(p, img)
            : await refereePages(p, img);
    const jpegs = [];
    for (const pg of pages) { jpegs.push(await pageJpeg(pg)); pg.canvas.width = pg.canvas.height = 0; }   // スマホのメモリのため、すぐ消す
    if (together) all.push(...jpegs);
    else out[key === 'youkou' ? `${tag}.pdf` : PDF_FILES.find((f) => f.key === key).name] = jpegsToPdf(jpegs);
  }
  if (together) out[`${tag} まとめ.pdf`] = jpegsToPdf(all);
  return out;
}
