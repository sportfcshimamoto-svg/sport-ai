// Wordファイル（.docx）を一から組み立てるための小さな部品。
// 見本（リーグ表・掲示用・優秀選手賞）と同じ フォント・余白・用紙の向き にそろえる。
import { writeZip } from './zip.js';

export const MARU = 'HG丸ｺﾞｼｯｸM-PRO';   // 見本の本文の字
export const GOTHIC = 'ＭＳ ゴシック';     // 見本の時間の列の字

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 文字の飾り（rPr） */
export function rPr({ font = MARU, size = 10.5, bold = false, underline = false, color } = {}) {
  const hs = Math.round(size * 2);
  return `<w:rPr><w:rFonts w:ascii="${font}" w:eastAsia="${font}" w:hAnsi="${font}" w:hint="eastAsia"/>`
    + (bold ? '<w:b/><w:bCs/>' : '') + (color ? `<w:color w:val="${color}"/>` : '') + (underline ? '<w:u w:val="single"/>' : '')
    + `<w:sz w:val="${hs}"/><w:szCs w:val="${hs}"/></w:rPr>`;
}

/** 1つの文字のかたまり（改行 \n は改行として入れる） */
export function run(text, opt = {}) {
  const parts = String(text ?? '').split('\n');
  return `<w:r>${rPr(opt)}` + parts.map((t, i) => (i ? '<w:br/>' : '') + `<w:t xml:space="preserve">${esc(t)}</w:t>`).join('') + '</w:r>';
}

/**
 * 段落
 * @param content 文字列 か [{text, ...文字の飾り}] の配列
 * opt: align('left'|'center'|'right'), before/after（pt）, indent（字）, pageBreakBefore, keepNext, ...文字の飾り
 */
export function para(content, opt = {}) {
  const { align, before = 0, after = 0, indent = 0, pageBreakBefore = false, keepNext = false, line } = opt;
  const runs = Array.isArray(content) ? content.map((c) => run(c.text, { ...opt, ...c })).join('') : (content === '' ? '' : run(content, opt));
  return '<w:p><w:pPr>'
    + (keepNext ? '<w:keepNext/>' : '') + (pageBreakBefore ? '<w:pageBreakBefore/>' : '')
    + (opt.bottomLine ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>' : '')
    + `<w:spacing w:before="${Math.round(before * 20)}" w:after="${Math.round(after * 20)}"${line ? ` w:line="${Math.round(line * 240)}" w:lineRule="auto"` : ''}${opt.lineExact ? ` w:line="${Math.round(opt.lineExact * 20)}" w:lineRule="exact"` : ''}/>`
    + (indent ? `<w:ind w:left="${Math.round(indent * (opt.size || 10.5) * 20)}"/>` : '')
    + (align ? `<w:jc w:val="${align}"/>` : '')
    + rPr(opt) + '</w:pPr>' + (opt.pre || '') + runs + (opt.post || '') + '</w:p>';
}

const EMU = 360000; // 1cm
let picId = 9000;

/**
 * 浮かせて置く絵（文字や表の上に重ねる。まわりの配置は動かさない）
 * img: loadImages() の1つ, rid: 関係ID
 * opt: height（cm）, x / y（cm）, relX('margin'|'page'|'column'), relY('margin'|'page'|'paragraph')
 * 戻り値は段落の中に入れる <w:r>（para の opt.pre に渡す）
 */
export function floatPic(img, rid, opt) {
  const { height, x = 0, y = 0, relX = 'margin', relY = 'margin' } = opt;
  const cy = Math.round(height * EMU), cx = Math.round(height * EMU * img.w / img.h);
  const id = ++picId, name = `スポルトン${id}`;
  return '<w:r><w:drawing>'
    + '<wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
    + '<wp:simplePos x="0" y="0"/>'
    + `<wp:positionH relativeFrom="${relX}"><wp:posOffset>${Math.round(x * EMU)}</wp:posOffset></wp:positionH>`
    + `<wp:positionV relativeFrom="${relY}"><wp:posOffset>${Math.round(y * EMU)}</wp:posOffset></wp:positionV>`
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>`
    + `<wp:docPr id="${id}" name="${name}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
}

/**
 * 文字と同じ行に並べる絵（行の中の1文字のように動くので、どのアプリで開いても文字の横からずれない）
 * 戻り値は段落の中に入れる <w:r>（para の opt.pre / opt.post に渡す）
 */
export function inlinePic(img, rid, { height }) {
  const cy = Math.round(height * EMU), cx = Math.round(height * EMU * img.w / img.h);
  const id = ++picId, name = `スポルトン${id}`;
  return '<w:r><w:drawing>'
    + '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">'
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
    + `<wp:docPr id="${id}" name="${name}"/>`
    + '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

/** 絵のファイルを、もとからある .docx の部品（files）に足す */
export function addMedia(files, media, textOf, relsPath = 'word/_rels/document.xml.rels') {
  if (!media?.length) return;
  let rels = typeof files[relsPath] === 'string' ? files[relsPath] : textOf(files[relsPath]);
  let ct = typeof files['[Content_Types].xml'] === 'string' ? files['[Content_Types].xml'] : textOf(files['[Content_Types].xml']);
  for (const m of media) {
    files[`word/media/${m.file}`] = m.bytes;
    if (!rels.includes(`Id="${m.rid}"`)) rels = rels.replace('</Relationships>', `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.file}"/></Relationships>`);
  }
  if (!/Extension="png"/i.test(ct)) ct = ct.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default ');
  files[relsPath] = rels;
  files['[Content_Types].xml'] = ct;
}

const BORDER = (w) => `w:val="single" w:sz="${w}" w:space="0" w:color="000000"`;

/**
 * 表
 * cols: 列の幅（cm）の配列
 * rows: [{ height(cm), cells: [{ content(段落XMLの文字列 or 文字), span, vmerge('restart'|'continue'), diag, borders, valign, ...文字の飾り }] }]
 * opt: border（線の太さ 1/8pt 単位。外枠）, inner（内側の線）, align（表の位置）
 */
export function table(cols, rows, opt = {}) {
  const outer = opt.border ?? 12;
  const inner = opt.inner ?? 4;
  const tw = (cm) => Math.round(cm * 567);
  const grid = cols.map((c) => `<w:gridCol w:w="${tw(c)}"/>`).join('');
  const total = tw(cols.reduce((a, b) => a + b, 0));
  const body = rows.map((r) => {
    let ci = 0;
    const cells = r.cells.map((c) => {
      const span = c.span || 1;
      const w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0);
      ci += span;
      const b = c.borders;
      const bxml = b === 'none'
        ? '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>'
        : (c.diag || b ? '<w:tcBorders>'
          + (b ? Object.entries(b).map(([k, v]) => (v ? `<w:${k} ${BORDER(v)}/>` : `<w:${k} w:val="nil"/>`)).join('') : '')
          + (c.diag ? `<w:tl2br ${BORDER(4)}/>` : '') + '</w:tcBorders>' : '');
      let content = c.content ?? '';
      if (typeof content !== 'string' || !content.startsWith('<w:')) content = para(content, { align: 'center', ...c });
      if (!content.endsWith('</w:p>')) content += '<w:p/>'; // マスの最後は段落でなければならない（表の後ろなど）
      return `<w:tc><w:tcPr><w:tcW w:w="${tw(w)}" w:type="dxa"/>`
        + (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '')
        + (c.vmerge ? `<w:vMerge${c.vmerge === 'restart' ? ' w:val="restart"' : ''}/>` : '')
        + bxml
        + (c.pad ? `<w:tcMar><w:top w:w="${tw(c.pad / 2)}" w:type="dxa"/><w:left w:w="${tw(c.pad)}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${tw(c.pad)}" w:type="dxa"/></w:tcMar>` : '')
        + `<w:vAlign w:val="${c.valign || 'center'}"/></w:tcPr>${content}</w:tc>`;
    }).join('');
    const h = r.height ? `<w:trPr><w:trHeight w:val="${tw(r.height)}"${r.exact ? ' w:hRule="exact"' : ''}/>${r.cantSplit === false ? '' : '<w:cantSplit/>'}</w:trPr>` : '<w:trPr><w:cantSplit/></w:trPr>';
    return `<w:tr>${h}${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${opt.align ? `<w:jc w:val="${opt.align}"/>` : ''}`
    + (outer || inner ? `<w:tblBorders><w:top ${BORDER(outer)}/><w:left ${BORDER(outer)}/><w:bottom ${BORDER(outer)}/><w:right ${BORDER(outer)}/><w:insideH ${BORDER(inner)}/><w:insideV ${BORDER(inner)}/></w:tblBorders>` : '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>')
    + `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/**
 * 本文のXMLから .docx を作る
 * opt: landscape（横向き）, margin（cm。上下左右）
 */
export async function buildDocx(bodyXml, opt = {}) {
  const { landscape = false, margin = 1.27 } = opt;
  const W = landscape ? 16838 : 11906, H = landscape ? 11906 : 16838;
  // margins：[上, 右, 下, 左]（cm）。なければ margin を4辺に
  const [mt, mr, mb, ml] = (opt.margins || [margin, margin, margin, margin]).map((c) => Math.round(c * 567));
  const sect = `<w:sectPr><w:pgSz w:w="${W}" w:h="${H}"${landscape ? ' w:orient="landscape"' : ''}/>`
    + `<w:pgMar w:top="${mt}" w:right="${mr}" w:bottom="${mb}" w:left="${ml}" w:header="567" w:footer="567" w:gutter="0"/><w:docGrid w:type="lines" w:linePitch="360"/></w:sectPr>`;
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${MARU}" w:eastAsia="${MARU}" w:hAnsi="${MARU}" w:cs="Times New Roman"/><w:kern w:val="2"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="a"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="a1"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${bodyXml}${sect}</w:body></w:document>`,
  };
  addMedia(files, opt.media, (s) => s);
  return writeZip(files);
}
