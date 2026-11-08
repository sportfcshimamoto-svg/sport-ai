// 大会要項（Word）を読む・書きかえる。
// SPORT CUP の要項は「●日時」「●場所」…の決まった形なので、AIを使わずに読み取れる。
// 完成版は、読み込んだ要項そのものに「参加チーム」と「2ページ目（リーグ表・タイムスケジュール）」を入れて作る
// （ロゴ・字の形・行間など、要項の見た目はそのまま残る）。
import { readZip, writeZip, textOf } from './zip.js';
import { addMedia } from './docx.js';

/** 全角数字を半角に */
export const half = (s) => String(s ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/：/g, ':').replace(/[－―]/g, '-');   // 「ー」（のばす音）は変えない

/** <w:body> の直下の要素（段落・表）に分ける */
export function splitBody(xml) {
  const open = xml.indexOf('<w:body>') + 8;
  const close = xml.lastIndexOf('</w:body>');
  const inner = xml.slice(open, close);
  const items = [];
  const re = /<(\/?)(w:p|w:tbl|w:sectPr|w:sdt|w:bookmarkStart|w:bookmarkEnd)\b[^>]*?(\/?)>/g;
  let depth = 0, startAt = -1, tag = null, mt;
  while ((mt = re.exec(inner))) {
    const [all, closing, name, selfClose] = mt;
    if (depth === 0) {
      if (closing) continue;
      if (selfClose) { items.push({ tag: name, xml: all }); continue; }
      depth = 1; startAt = mt.index; tag = name;
    } else if (name === tag) {
      if (closing) depth--; else if (!selfClose) depth++;
      if (depth === 0) items.push({ tag, xml: inner.slice(startAt, mt.index + all.length) });
    }
  }
  return { head: xml.slice(0, open), items, tail: xml.slice(close) };
}

/** 段落の文字（図形の中の文字は除く） */
export function paraText(pxml) {
  const noBox = pxml.replace(/<mc:AlternateContent>[\s\S]*?<\/mc:AlternateContent>/g, '').replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, '');
  return [...noBox.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

/** 段落の文字だけを入れかえる（はじめの文字の飾り・段落の設定はそのまま） */
export function setParaText(pxml, text) {
  const pPr = (pxml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
  const firstRun = pxml.replace(pPr, '').match(/<w:r[ >][\s\S]*?<\/w:r>/);
  const rPr = firstRun ? (firstRun[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0] : '';
  const open = pxml.match(/^<w:p\b[^>]*>/)[0];
  const e = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${e(text)}</w:t></w:r></w:p>`;
}

// 「８人制」「6～８人制」など
const PLAYERS_RE = /[0-9０-９]+(?:\s*[～~〜・,，、]\s*[0-9０-９]+)*\s*人制/;

const label = (t) => (half(t).match(/^●\s*([^\s　]+)/) || [])[1];

/** 要項を読む → 画面に入れる値 */
export async function readYoukou(bytes) {
  const files = await readZip(bytes);
  if (!files['word/document.xml']) throw new Error('Wordのファイル（.docx）ではないようです');
  const { items } = splitBody(textOf(files['word/document.xml']));
  const lines = items.filter((x) => x.tag === 'w:p').map((x) => paraText(x.xml).trim()).filter(Boolean);
  const out = { raw: lines };
  const after = (name) => { const l = lines.find((s) => label(s) === name); return l ? half(l).replace(/^●\s*[^\s　]+[\s　]*/, '').trim() : ''; };

  const title = lines.find((s) => /SPORT\s*CUP|杯|カップ|大会/i.test(s) && !s.startsWith('●')) || lines[0] || '';
  out.title = title.replace(/\s+/g, ' ').trim();
  const g = half(title).match(/U\s*-?\s*(\d{1,2})/i);
  if (g) out.grade = 'U' + Number(g[1]);

  const dt = after('日時');
  const md = dt.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (md) { out.month = Number(md[1]); out.day = Number(md[2]); }
  const tm = dt.match(/(\d{1,2}:\d{2})\s*[-~〜～]\s*(\d{1,2}:+\d{2})/);
  if (tm) { out.open = tm[1]; out.close = tm[2].replace(/:+/, ':'); }
  out.place = after('場所');
  out.target = after('対象');
  out.fee = after('参加費');
  const ct = after('競技時間').match(/(\d+)\s*-\s*(\d+)\s*-\s*(\d+)/);
  if (ct) { out.half = Number(ct[1]); out.brk = Number(ct[2]); }
  const pl = lines.find((s) => PLAYERS_RE.test(s));
  if (pl) out.players = pl.match(PLAYERS_RE)[0];   // 要項の書き方のまま（例：「８人制」「6～８人制」）

  // 順位決定の形
  const iRank = lines.findIndex((s) => label(s) === '順位決定について');
  const rankText = iRank >= 0 ? lines[iRank + 1] || '' : '';
  const lg = [...rankText.matchAll(/「([^」]+)」/g)].map((m) => m[1]);
  if (/予選リーグ/.test(rankText) || lg.length >= 2) {
    out.format = 'two3';
    if (lg.length >= 2) out.leagues = lg.slice(0, 2);
  } else if (/総当たり/.test(rankText)) {
    out.format = 'rr';
  }
  const nt = half(rankText).match(/(\d+)\s*チーム/);
  if (nt) out.teamCount = Number(nt[1]) * (out.format === 'two3' ? 2 : 1);

  // 参加チーム（「他３チーム」のときは、わかるチームだけ）
  const iTeam = lines.findIndex((s) => label(s) === '参加チーム');
  if (iTeam >= 0) {
    const tl = [];
    for (let i = iTeam + 1; i < lines.length && !lines[i].startsWith('●'); i++) tl.push(lines[i]);
    out.teams = tl.join('　').split(/[・、,，]/).map((s) => s.replace(/他\s*[\d０-９]+\s*チーム/, '').trim()).filter(Boolean);
  }
  return out;
}

/**
 * 完成版の要項を作る
 * page2Xml: 2ページ目（リーグ表・タイムスケジュール）の本文XML
 * edits: { date: '9月29日（日）9:00-16:00', teamLines: ['・A（市）　・B（市）　・C（市）', ...] }
 */
export async function makeFinalYoukou(bytes, page2Xml, edits, media = []) {
  const files = await readZip(bytes);
  const xml = textOf(files['word/document.xml']);
  const { head, items, tail } = splitBody(xml);
  const texts = items.map((x) => (x.tag === 'w:p' ? paraText(x.xml).trim() : ''));
  const find = (name) => texts.findIndex((s) => label(s) === name);
  const replaceLabelLine = (name, value) => {
    const i = find(name);
    if (i < 0 || value == null) return;
    const cur = texts[i];
    const m = cur.match(/^(●\s*[^\s　]+[\s　]*)/);
    items[i].xml = setParaText(items[i].xml, (m ? m[1] : `●${name}  `) + value);
  };
  replaceLabelLine('日時', edits.date);
  replaceLabelLine('場所', edits.place);
  replaceLabelLine('競技時間', edits.time);

  // 人数：「●競技方法　①８人制。…」の「８人制」だけを入れかえる（edits.players：'８人制' など。空なら要項のまま）
  if (edits.players) {
    const i = texts.findIndex((t, k) => k > find('競技方法') && find('競技方法') >= 0 && PLAYERS_RE.test(t));
    const j = i >= 0 ? i : texts.findIndex((t) => PLAYERS_RE.test(t));
    if (j >= 0) {
      // 「6～８人制（参加チームで相談）」→ 1つに決めたので「（…相談）」も消す
      texts[j] = texts[j].replace(new RegExp(PLAYERS_RE.source + '(?:[（(][^）)]*相談[^）)]*[）)])?'), edits.players);
      items[j].xml = setParaText(items[j].xml, texts[j]);
    }
  }

  // 参加チームの行を入れかえる
  const iTeam = find('参加チーム');
  if (iTeam >= 0 && edits.teamLines?.length) {
    let j = iTeam + 1;
    while (j < items.length && !(items[j].tag === 'w:p' && texts[j].startsWith('●'))) j++;
    const sample = items.slice(iTeam + 1, j).find((x) => x.tag === 'w:p' && paraText(x.xml).trim()) || items[iTeam];
    const newParas = edits.teamLines.map((l) => ({ tag: 'w:p', xml: setParaText(sample.xml, l) }));
    items.splice(iTeam + 1, j - iTeam - 1, ...newParas);
    texts.splice(iTeam + 1, j - iTeam - 1, ...newParas.map(() => ''));
  }

  // 2ページ目は「連絡先」の前に入れる（なければ最後）
  let iContact = texts.findIndex((s) => /^連絡先/.test(s));
  const sectIdx = items.findIndex((x) => x.tag === 'w:sectPr');
  if (iContact < 0) iContact = sectIdx >= 0 ? sectIdx : items.length;
  items.splice(iContact, 0, { tag: 'raw', xml: page2Xml });

  files['word/document.xml'] = head + items.map((x) => x.xml).join('') + tail;
  addMedia(files, media, textOf);   // 2ページ目のスポルトン（盾）の絵
  return writeZip(files);
}
