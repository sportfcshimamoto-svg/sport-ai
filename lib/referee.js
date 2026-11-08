// 審判カード（Excel .xlsx）。
// 2026年11月 本人の指定：いつも使っている「Referee card (2).xls」（2026年度 11.8U8）をそのまま使う。
//  ・ひな形：app/templates/referee-card.xlsx（.xls を見た目そのまま .xlsx に写したもの。ブラウザでは .xls を作れないため）
//  ・A4縦に8枚（横2 × 縦4）。9試合以上は次のページに同じ形を足す
//  ・入れるのはチーム名だけ。大会名は「SPORT杯」（ひな形に入っている）。ほかは空白
import { readZip, writeZip, textOf } from './zip.js';

const PAGE_ROWS = 77;                       // ひな形1ページの行数
const CARD_ROWS = [7, 26, 45, 64];          // 各段の「チーム」の行（Excelの行番号）
const CARD_COLS = [['G', 'Q'], ['AH', 'AR']]; // 左のカード（左チーム・右チーム）、右のカード

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let template = null;
async function loadTemplate() {
  if (template) return template;
  const url = new URL('../templates/referee-card.xlsx', import.meta.url);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    template = new Uint8Array(await readFile(url));
  } else {
    const r = await fetch(url);
    if (!r.ok) throw new Error('審判カードのひな形が読めません');
    template = new Uint8Array(await r.arrayBuffer());
  }
  return template;
}

/** セル番地の行を ずらす（"AH7" → "AH84"） */
const shiftRef = (ref, d) => ref.replace(/(\d+)/g, (n) => String(Number(n) + d));

/** セルの見た目の番号（s）を読む */
const styleOf = (xml, ref) => (xml.match(new RegExp(`<c r="${ref}"[^>]*? s="(\\d+)"`)) || [])[1];

/** 1つのセルに文字を入れる（見た目の番号 s はそのまま。style を渡したときはそれに） */
function setCell(xml, ref, text, style) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  return xml.replace(re, (all, attrs) => {
    const s = style ? ` s="${style}"` : (attrs.match(/ s="\d+"/) || [''])[0];
    return text ? `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>` : `<c r="${ref}"${s}/>`;
  });
}

/**
 * matches: [{ home, away, ... }]（試合の順）
 * 返り値：.xlsx の中身
 */
export async function refereeXlsx(matches) {
  const files = await readZip(await loadTemplate());
  const path = 'xl/worksheets/sheet1.xml';
  let xml = textOf(files[path]);
  const pages = Math.max(1, Math.ceil(matches.length / 8));

  // 2ページ目から：行とセル結合を、行をずらして足す
  if (pages > 1) {
    const sd = xml.match(/<sheetData>([\s\S]*?)<\/sheetData>/)[1];
    const rows = sd.match(/<row [\s\S]*?<\/row>|<row [^>]*\/>/g) || [];
    let more = '';
    const merges = [...xml.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((m) => m[1]);
    let mergeMore = '';
    for (let p = 1; p < pages; p++) {
      const d = p * PAGE_ROWS;
      more += rows.map((r) => r.replace(/<row r="(\d+)"/, (_, n) => `<row r="${Number(n) + d}"`).replace(/<c r="([A-Z]+\d+)"/g, (_, ref) => `<c r="${shiftRef(ref, d)}"`)).join('');
      mergeMore += merges.map((m) => `<mergeCell ref="${shiftRef(m, d)}"/>`).join('');
    }
    xml = xml.replace('</sheetData>', more + '</sheetData>');
    xml = xml.replace('</mergeCells>', mergeMore + '</mergeCells>').replace(/<mergeCells count="\d+"/, `<mergeCells count="${merges.length * pages}"`);
    const brks = [...Array(pages - 1)].map((_, i) => `<brk id="${(i + 1) * PAGE_ROWS}" max="16383" man="1"/>`).join('');
    xml = xml.replace(/(<pageSetup[^>]*\/>)/, `$1<rowBreaks count="${pages - 1}" manualBreakCount="${pages - 1}">${brks}</rowBreaks>`);
    files['xl/workbook.xml'] = textOf(files['xl/workbook.xml']).replace(/\$BD\$\d+/, `$BD$${PAGE_ROWS * pages}`);
  }

  // チーム名の字の大きさ：元のカードは1〜3段目が14pt、4段目だけ8pt（「くすのき2位」などを入れていた）。
  // 段ではなく中身で決める：「○○位」は8pt（2026年11月 本人：1位も2位・3位に合わせる）、チーム名は14pt
  const big = CARD_COLS.flat().map((c) => styleOf(xml, `${c}${CARD_ROWS[0]}`));
  const small = CARD_COLS.flat().map((c) => styleOf(xml, `${c}${CARD_ROWS[3]}`));
  const styleFor = (text, j) => (/位$/.test(String(text).trim()) ? small[j] : big[j]);

  // チーム名を入れる（左上→右上→2段目の左→…の順。見本と同じ）
  matches.forEach((m, i) => {
    const p = Math.floor(i / 8), k = i % 8;
    const row = CARD_ROWS[Math.floor(k / 2)] + p * PAGE_ROWS;
    const [cl, cr] = CARD_COLS[k % 2];
    const j = (k % 2) * 2;
    xml = setCell(xml, `${cl}${row}`, m.home, styleFor(m.home, j));
    xml = setCell(xml, `${cr}${row}`, m.away, styleFor(m.away, j + 1));
  });

  files[path] = xml;
  return writeZip(files);
}
