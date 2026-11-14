// SPORT AI事務局：大会（SPORT CUP）の書き出し
// AIもインターネットも使わない。要項の読み取り・計算・ファイル作りは、すべてこのブラウザの中で行う。
import { GRADES, FORMATS, FINALS_GAP } from './lib/schedule.js';
import { readYoukou, PLAYERS_RE } from './lib/youkou.js';
import { defaultsFor, defaultNotes, fromYoukou, prepare, slotOf, methodText, othersText, STD_FEE } from './lib/tournament.js';
import { buildCupPdfs, PDF_FILES, fileTag } from './lib/cup-pdf.js';
import { writeZip } from './lib/zip.js';

const KEY = 'sport-ai:v1';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- 状態 ----------
let S = load() || newState('U12');
if (S.finalsGap == null) S.finalsGap = S.format === 'two3' ? FINALS_GAP : S.gap;   // 前に保存した内容には無い
if (S.fee == null) S.fee = STD_FEE;
// 読み込んだ要項から取った文（{ name, kind, sections, format }）。ファイルそのものは保存しない
let doc = loadDoc();

function newState(grade) {
  const d = defaultsFor(grade);
  const now = new Date();
  return { ...d, year: now.getFullYear(), month: null, day: null, teams: ['', '', '', '', '', ''].slice(0, d.format === 'two3' ? 6 : 4), cities: [], fee: STD_FEE, contactName: '', contactTel: '', others: null, ...notesOf(d) };
}
function notesOf(t) { const n = defaultNotes(t); return { exchange: n.exchange, notesAfter: n.after, useExchange: true }; }
function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    if (doc) localStorage.setItem(KEY + ':doc', JSON.stringify(doc)); else localStorage.removeItem(KEY + ':doc');
  } catch { /* 保存できなくても使える */ }
}
function loadDoc() {
  try { return JSON.parse(localStorage.getItem(KEY + ':doc') || 'null'); } catch { return null; }
}
/** 前の版はWordのファイルそのものを保存していた → 文だけ取り出して入れかえる */
async function migrateOldYoukou() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + ':youkou') || 'null');
    if (!v) return;
    localStorage.removeItem(KEY + ':youkou');
    if (doc) return;
    const y = await readYoukou(Uint8Array.from(atob(v.b64), (c) => c.charCodeAt(0)));
    doc = docOf(y, v.name);
    save();
    if ($('#f-youkou-docx')) render();
  } catch { /* なし */ }
}
const docOf = (y, name) => ({ name, kind: y.kind, sections: y.sections || {}, format: y.format || null });
/** 「要項のまま」の人数（読み込んだ要項、なければひな形） */
const basePlayers = () => (methodText({ ...S, players: '' }, doc)[0]?.match(PLAYERS_RE) || [''])[0];

// ---------- 画面 ----------
function render() {
  $('#app').innerHTML = `
  <section class="card">
    <h2><span class="num">1</span>要項を読み込む</h2>
    ${doc ? `<div class="drop has">📄 ${esc(doc.name)}<br><small>この要項の文で作ります。別の要項にするときは、下のボタンから選び直してください</small></div>` : ''}
    <div class="pick2">
      <label class="drop">📝 Wordをえらぶ<br><small>要項の .docx</small><input type="file" id="f-youkou-docx" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label>
      <label class="drop">📕 PDFをえらぶ<br><small>要項の .pdf</small><input type="file" id="f-youkou-pdf" accept=".pdf,application/pdf"></label>
    </div>
    <p class="hint"><b>要項がなくても大丈夫です。</b>いつもの「SPORTCUP ○○要項」（WordでもPDFでも）を選ぶと、日時・場所・学年・競技時間・リーグの形を読み取って、下に入れます。<br>
    要項がないときは、下にチーム名と市町などを入れるだけで、完成版の要項まで全部作れます（いつもの要項の文を使います）。</p>
    ${doc ? '<div class="btn-row"><button class="btn btn-sub btn-small" id="btn-unload">読み込んだ要項を外す（いつもの文にもどす）</button></div>' : ''}
    <div id="youkou-msg"></div>
  </section>

  <section class="card">
    <h2><span class="num">2</span>大会の内容</h2>
    <div class="grid">
      <div><label>学年</label><select id="f-grade">${GRADES.map((g) => `<option value="${g.id}" ${g.id === S.grade ? 'selected' : ''}>${g.label}（${g.target}）</option>`).join('')}</select></div>
      <div><label>大会名</label><input type="text" id="f-title" value="${esc(S.title)}"></div>
      <div><label>日にち</label><input type="date" id="f-date" value="${S.month ? `${S.year}-${String(S.month).padStart(2, '0')}-${String(S.day).padStart(2, '0')}` : ''}"></div>
      <div><label>時間 <small>（要項の「日時」）</small></label><div class="inline"><input type="text" id="f-open" value="${esc(S.open)}">〜<input type="text" id="f-close" value="${esc(S.close)}"></div></div>
      <div class="wide"><label>場所</label><input type="text" id="f-place" value="${esc(S.place)}"></div>
      <div><label>対象</label><input type="text" id="f-target" value="${esc(S.target)}"></div>
      <div><label>参加費</label><input type="text" id="f-fee" value="${esc(S.fee)}"></div>
      <div><label>競技時間 <small>（前半-休けい-後半）</small></label><div class="inline"><input type="number" id="f-half" min="5" max="40" value="${S.half}">-<input type="number" id="f-brk" min="0" max="15" value="${S.brk}">-<span id="half2">${S.half}</span></div></div>
      <div><label>人数 <small>（要項の「競技方法」）</small></label><select id="f-players"><option value="" ${!S.players ? 'selected' : ''}>${doc ? '要項' : 'いつも'}のまま${basePlayers() ? `（${esc(basePlayers())}）` : ''}</option>${[5, 6, 7, 8].map((n) => `<option value="${n}" ${n == S.players ? 'selected' : ''}>${'５６７８'[n - 5]}人制</option>`).join('')}</select></div>
      <div><label>形式</label><select id="f-format">${Object.entries(FORMATS).map(([k, v]) => `<option value="${k}" ${k === S.format ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${S.format === 'two3'
        ? `<div><label>リーグの名前</label><div class="inline"><input type="text" id="f-lg1" value="${esc(S.leagues[0])}" style="width:50%">・<input type="text" id="f-lg2" value="${esc(S.leagues[1])}" style="width:50%"></div></div>`
        : `<div><label>コートの数</label><select id="f-courts"><option value="1" ${S.courts == 1 ? 'selected' : ''}>1コート</option><option value="2" ${S.courts == 2 ? 'selected' : ''}>2コート（A・B）</option></select></div>`}
      <div><label>1試合目の開始</label><input type="text" id="f-start" value="${esc(S.start)}"></div>
      <div><label>1試合の枠（分）</label><input type="number" id="f-match" min="10" max="90" value="${S.matchMin}"></div>
      <div><label>試合と試合のあいだ（分）</label><input type="number" id="f-gap" min="0" max="30" value="${S.gap}"></div>
      ${S.format === 'two3' ? `<div><label>予選リーグのあと、順位決定戦までのあいだ（分）</label><input type="number" id="f-fgap" min="0" max="90" value="${S.finalsGap}"></div>` : ''}
      ${S.format === 'two3' ? `
      <div class="wide"><label class="check"><input type="checkbox" id="f-ref" ${S.finalsRef ? 'checked' : ''}>順位決定戦の審判を、ほかのチームにお願いする（見本：「やま1位」「やま3位」「くす1位」）</label></div>
      <div class="wide"><label class="check"><input type="checkbox" id="f-ex" ${S.useExchange !== false ? 'checked' : ''}>Aコートの最後に交流戦の行を入れる</label><input type="text" id="f-exchange" value="${esc(S.exchange)}"></div>` : ''}
      <div class="wide"><label>タイムスケジュールの下に書くこと <small>（1行に1つ。Aコートの下）</small></label><textarea id="f-notes">${esc((S.notesAfter?.[0] || []).join('\n'))}</textarea></div>
      <div class="wide"><label>要項の「●その他」 <small>（1行に1つ。雨天の判断の時間・車の台数など）</small></label><textarea id="f-others" rows="5">${esc(othersText(S, doc).join('\n'))}</textarea></div>
      <div><label>連絡先の名前 <small>（例：山田 太郎）</small></label><input type="text" id="f-cname" value="${esc(S.contactName || '')}" placeholder="空なら「SPORT FC」だけ"></div>
      <div><label>連絡先の電話番号</label><input type="tel" id="f-ctel" value="${esc(S.contactTel || '')}" placeholder="090-0000-0000"></div>
      <p class="hint wide">連絡先は要項の2ページ目の下に「SPORT FC 代表 ○○　Tel …」と入ります。入れた名前と番号は、この端末の中にだけ保存されます。</p>
    </div>
  </section>

  <section class="card">
    <h2><span class="num">3</span>参加チーム</h2>
    <p class="hint">${S.format === 'two3' ? `上の3チームが「${esc(S.leagues[0])}」、下の3チームが「${esc(S.leagues[1])}」になります。` : '並び順で対戦の順番が決まります（これまでのSPORT CUPと同じ順番）。'}市町は要項の「参加チーム」に（ ）で入ります。空でもかまいません。</p>
    <table class="teams" id="teams"></table>
    <div class="btn-row"><button class="btn btn-sub btn-small" id="btn-addteam">＋ チームを足す</button></div>
  </section>

  <section class="card preview">
    <h2><span class="num">4</span>できあがりの確認</h2>
    <div id="preview"></div>
  </section>

  <section class="card">
    <h2><span class="num">5</span>書き出す</h2>
    <div id="files"></div>
  </section>`;
  renderTeams();
  update();
  bind();
}

function renderTeams() {
  const n = S.teams.length;
  $('#teams').innerHTML = S.teams.map((t, i) => `<tr>
    <td class="no">${i + 1}</td>
    ${S.format === 'two3' ? `<td class="lg">${i < 3 ? esc(S.leagues[0]) : i < 6 ? esc(S.leagues[1]) : '（使いません）'}</td>` : ''}
    <td class="tn"><input type="text" data-team="${i}" value="${esc(t)}" placeholder="チーム名"></td>
    <td class="city"><input type="text" data-city="${i}" value="${esc(S.cities[i] || '')}" placeholder="例：高槻市" aria-label="市町"></td>
    <td class="ops">
      <button class="btn btn-sub btn-small" data-up="${i}" ${i === 0 ? 'disabled' : ''} title="上へ">↑</button>
      <button class="btn btn-sub btn-small" data-down="${i}" ${i === n - 1 ? 'disabled' : ''} title="下へ">↓</button>
      <button class="btn btn-sub btn-small" data-del="${i}" title="消す">✕</button>
    </td></tr>`).join('');
}

/** 入力が変わったら、確認と書き出しの欄だけ描き直す */
function update() {
  save();
  const problems = check();
  const ready = !problems.length;
  let html = problems.length ? `<div class="notice">${problems.map(esc).join('<br>')}</div>` : '';
  if (ready) {
    const p = prepare(S);
    if (p.schedule.leagues.length > 1 || p.teams.length <= 8) {
      p.schedule.leagues.forEach((lg) => {
        html += `${lg.name ? `<h3>${esc(lg.name)}</h3>` : '<h3>リーグ表</h3>'}<div class="scroll"><table class="sched"><tr><th></th>${lg.teams.map((t) => `<th>${esc(t)}</th>`).join('')}</tr>`
          + lg.teams.map((t, i) => `<tr><th>${esc(t)}</th>${lg.teams.map((_, j) => `<td class="${i === j ? 'diag' : ''}"></td>`).join('')}</tr>`).join('') + '</table></div>';
      });
    }
    p.schedule.courts.forEach((c, ci) => {
      html += `<h3>${esc(c.name ? `${c.name}（${p.timeText}）` : `（${p.timeText}）`)}</h3><div class="scroll"><table class="sched"><tr><th></th><th>タイムスケジュール</th><th colspan="3">対戦表</th><th>審判</th></tr>`
        + c.matches.map((m) => (m.note ? `<tr><td>${'①②③④⑤⑥⑦⑧⑨⑩'[m.no - 1]}</td><td colspan="4" class="note">${esc(m.note)}</td><td></td></tr>`
          : `<tr><td>${'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮'[m.no - 1] || m.no}</td><td class="t">${m.from}～${m.to}</td><td>${esc(m.home)}</td><td>－</td><td>${esc(m.away)}</td><td>${esc(m.ref)}</td></tr>`)).join('')
        + '</table></div>' + (S.notesAfter?.[ci] || []).map((n) => `<p class="hint">${esc(n)}</p>`).join('');
    });
    const last = Math.max(...p.matches.map((m) => toMin(m.to)));
    if (S.close && last > toMin(S.close)) html += `<div class="notice">最後の試合の終わり（${toHM(last)}）が、要項の終わりの時間（${esc(S.close)}）より後になっています。</div>`;
  }
  $('#preview').innerHTML = html || '<p class="hint">チームを入れると、ここに表が出ます。</p>';
  renderFiles(ready);
}
const toMin = (s) => { const m = String(s).match(/(\d+):(\d+)/); return m ? +m[1] * 60 + +m[2] : 0; };
const toHM = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

function check() {
  const out = [];
  const teams = S.teams.map((s) => s.trim()).filter(Boolean);
  if (!S.month) out.push('「日にち」を入れてください。');
  if (S.format === 'two3' && teams.length !== 6) out.push(`この形式は6チームです（いまは${teams.length}チーム）。`);
  if (S.format === 'rr' && (teams.length < 2 || teams.length > 8)) out.push(`総当たりは2〜8チームで作れます（いまは${teams.length}チーム）。`);
  const dup = teams.filter((t, i) => teams.indexOf(t) !== i);
  if (dup.length) out.push(`同じチーム名があります：${[...new Set(dup)].join('、')}（①②などをつけて分けてください）`);
  if (!/^\d{1,2}:\d{2}$/.test(S.start)) out.push('「1試合目の開始」は 9:50 のように入れてください。');
  return out;
}

function renderFiles(ready) {
  if (!ready) { $('#files').innerHTML = '<p class="hint">上の「できあがりの確認」に表が出たら、ここから書き出せます。</p>'; return; }
  const tag = fileTag(prepare(S));
  $('#files').innerHTML = `<div class="files">${PDF_FILES.map((f) => `<div class="file"><span class="ic">${f.ic}</span><span class="nm"><b>${esc(f.title)}</b><small>${esc(f.name || `${tag}.pdf`)}　${esc(f.sub)}</small></span>
      <button class="btn btn-sub btn-small" data-dl="${f.key}">ダウンロード</button></div>`).join('')}</div>
  <div class="btn-row">
    <button class="btn btn-main btn-big" id="btn-all">⬇ 全部を1つのPDFにする</button>
    <button class="btn btn-sub" id="btn-zip">5つのPDFをまとめてダウンロード（ZIP）</button>
  </div>
  <p class="hint">すべてPDFです。スマホでもパソコンでも、同じ見た目で開けて、そのまま印刷できます。<br>
  PDFは文字を直せないので、直したいときは上の入力を直して、もう一度ダウンロードしてください。</p>`;
  $('#files').onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const keys = b.dataset.dl ? [b.dataset.dl] : undefined;
    if (!keys && !['btn-all', 'btn-zip'].includes(b.id)) return;
    const files = await safeBuild(b, keys, { together: b.id === 'btn-all' }); if (!files) return;
    if (b.id === 'btn-zip') download(`${tag}.zip`, await writeZip(files));
    else { const [name, bytes] = Object.entries(files)[0]; download(name, bytes); }
  };
}

/** PDFを作る（数秒かかるので、ボタンに「作っています」と出す） */
async function safeBuild(btn, keys, opt) {
  const label = btn.textContent;
  document.querySelectorAll('#files button').forEach((x) => { x.disabled = true; });
  btn.textContent = '作っています…';
  try { return await buildCupPdfs(S, doc, keys, opt); } catch (err) { console.error(err); toast('作れませんでした：' + err.message); return null; } finally {
    btn.textContent = label;
    document.querySelectorAll('#files button').forEach((x) => { x.disabled = false; });
  }
}

function download(name, bytes) {
  const types = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip', jpg: 'image/jpeg', pdf: 'application/pdf' };
  const url = URL.createObjectURL(new Blob([bytes], { type: types[name.split('.').pop()] }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`${name} をダウンロードしました`);
}

// ---------- 入力 ----------
function bind() {
  const pick = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    $('#youkou-msg').innerHTML = '<div class="notice">読み取っています…</div>';
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const y = await readYoukou(bytes);
      doc = docOf(y, f.name);
      const keepTeams = S.teams.some((t) => t.trim());
      const t = fromYoukou(y);
      const n = t.format === 'two3' ? 6 : (y.teamCount || 4);
      S = { ...S, ...t, year: S.year || new Date().getFullYear(), useExchange: true,
        teams: keepTeams ? S.teams : padTo(t.teams, n), cities: keepTeams ? S.cities : t.cities, players: '', others: null,
        fee: y.fee || S.fee || STD_FEE };
      // 連絡先は、まだ入れていないときだけ要項から入れる
      if (y.contact && !S.contactName && !S.contactTel) { S.contactName = y.contact.name; S.contactTel = y.contact.tel; }
      if (y.month) S.year = guessYear(y.month);
      render();
      const got = [y.grade && `学年 ${y.grade}`, y.month && `日にち ${y.month}月${y.day}日`, y.place && '場所', y.half && `競技時間 ${y.half}-${y.brk}-${y.half}`, y.format && FORMATS[y.format].split('（')[0]].filter(Boolean);
      $('#youkou-msg').innerHTML = `<div class="notice"><span class="ok">${y.kind === 'pdf' ? 'PDF' : 'Word'}の要項を読み取りました：</span>${esc(got.join('・')) || '（日時などは読み取れませんでした。下に入れてください）'}<br>
        日にちは要項の中身から入れています。<b>まちがっていないか確かめてください</b>（前の大会の要項を使い回したとき、日付が古いままのことがあります）。</div>`;
    } catch (err) {
      $('#youkou-msg').innerHTML = `<div class="notice err">読み取れませんでした：${esc(err.message)}</div>`;
    }
    e.target.value = '';
  };
  $('#f-youkou-docx').onchange = pick;
  $('#f-youkou-pdf').onchange = pick;
  $('#btn-unload')?.addEventListener('click', () => { doc = null; S.others = null; save(); render(); });

  $('#f-grade').onchange = (e) => {
    const d = defaultsFor(e.target.value);
    const teams = S.teams;
    S = { ...S, ...d, ...notesOf(d), teams: padTo(teams.filter((x) => x.trim()), d.format === 'two3' ? 6 : Math.max(4, teams.filter((x) => x.trim()).length)), cities: S.cities, place: S.place || d.place };
    render();
  };
  $('#f-format').onchange = (e) => {
    S.format = e.target.value;
    S.courts = S.format === 'two3' ? 2 : 1;
    S.gap = S.format === 'two3' ? 10 : 5;
    S.finalsGap = S.format === 'two3' ? FINALS_GAP : S.gap;
    S.start = S.format === 'two3' ? '9:50' : '9:40';
    Object.assign(S, notesOf(S));
    if (S.format === 'two3') S.teams = padTo(S.teams, 6);
    render();
  };
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('input', (e) => { fn(e.target); update(); }); };
  on('#f-title', (el) => { S.title = el.value; });
  on('#f-date', (el) => { const m = el.value.match(/(\d+)-(\d+)-(\d+)/); if (m) { S.year = +m[1]; S.month = +m[2]; S.day = +m[3]; } else { S.month = null; } });
  on('#f-open', (el) => { S.open = el.value.trim(); });
  on('#f-close', (el) => { S.close = el.value.trim(); if (S.format === 'two3') { S.exchange = S.exchange.replace(/～[\d:]+$/, `～${S.close}`); const x = $('#f-exchange'); if (x) x.value = S.exchange; } });
  on('#f-place', (el) => { S.place = el.value; });
  on('#f-target', (el) => { S.target = el.value; });
  on('#f-fee', (el) => { S.fee = el.value; });
  on('#f-others', (el) => { S.others = el.value.split('\n').map((s) => s.trim()).filter(Boolean); });
  on('#f-cname', (el) => { S.contactName = el.value; });
  on('#f-ctel', (el) => { S.contactTel = el.value; });
  on('#f-half', (el) => { S.half = +el.value || 0; $('#half2').textContent = S.half; S.matchMin = slotOf(S.half, S.brk); $('#f-match').value = S.matchMin; });
  on('#f-brk', (el) => { S.brk = +el.value || 0; S.matchMin = slotOf(S.half, S.brk); $('#f-match').value = S.matchMin; });
  on('#f-courts', (el) => { S.courts = +el.value; });
  on('#f-lg1', (el) => { S.leagues = [el.value, S.leagues[1]]; renderTeams(); });
  on('#f-lg2', (el) => { S.leagues = [S.leagues[0], el.value]; renderTeams(); });
  on('#f-start', (el) => { S.start = el.value.trim().replace('：', ':'); });
  on('#f-match', (el) => { S.matchMin = +el.value || 0; });
  on('#f-gap', (el) => { S.gap = +el.value || 0; });
  on('#f-fgap', (el) => { S.finalsGap = +el.value || 0; });
  on('#f-exchange', (el) => { S.exchange = el.value; });
  on('#f-notes', (el) => { S.notesAfter = [el.value.split('\n').map((s) => s.trim()).filter(Boolean), []]; });
  $('#f-players').addEventListener('change', (e) => { S.players = e.target.value ? Number(e.target.value) : ''; update(); });
  $('#f-ref')?.addEventListener('change', (e) => { S.finalsRef = e.target.checked; update(); });
  $('#f-ex')?.addEventListener('change', (e) => { S.useExchange = e.target.checked; update(); });

  $('#teams').addEventListener('input', (e) => {
    const t = e.target.dataset.team, c = e.target.dataset.city;
    if (t != null) S.teams[+t] = e.target.value;
    if (c != null) S.cities[+c] = e.target.value;
    update();
  });
  $('#teams').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const swap = (i, j) => { [S.teams[i], S.teams[j]] = [S.teams[j], S.teams[i]]; [S.cities[i], S.cities[j]] = [S.cities[j], S.cities[i]]; };
    if (b.dataset.up) swap(+b.dataset.up, +b.dataset.up - 1);
    if (b.dataset.down) swap(+b.dataset.down, +b.dataset.down + 1);
    if (b.dataset.del) { S.teams.splice(+b.dataset.del, 1); S.cities.splice(+b.dataset.del, 1); }
    renderTeams(); update();
  });
  $('#btn-addteam').onclick = () => { S.teams.push(''); renderTeams(); update(); $(`[data-team="${S.teams.length - 1}"]`).focus(); };
}

const padTo = (arr, n) => { const a = arr.slice(0, Math.max(n, arr.length)); while (a.length < n) a.push(''); return a; };
/** 月だけわかるとき：今日から見て次に来るその月の年 */
function guessYear(month) {
  const now = new Date();
  return month < now.getMonth() + 1 - 1 ? now.getFullYear() + 1 : now.getFullYear();
}

let tt;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2500); }

// ---------- タブ ----------
async function showTab(name) {
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  try { localStorage.setItem(KEY + ':tab', name); } catch { /* なし */ }
  try {
    if (name === 'tm') {
      const { renderTM } = await import('./tm.js');
      renderTM($('#app'), { toast, download });
    } else if (name === 'insta') {
      const { renderInsta } = await import('./insta.js');
      renderInsta($('#app'), { toast, download });
    } else {
      render();
    }
    try { sessionStorage.removeItem(KEY + ':retry'); } catch { /* なし */ }
  } catch (err) {
    tabFailed(name, err);
  }
}

/**
 * タブの画面を作れなかったとき。アプリを公開し直した直後は、スマホに残った古いファイルと新しいファイルが
 * 混ざって読み込めないことがある。自動で1回だけ読み直し、それでもだめなら白紙にせず案内を出す。
 */
function tabFailed(name, err) {
  console.error(err);
  let retried = true;   // 記録できない環境では、読み直しをくり返さないよう自動では読み直さない
  try {
    retried = sessionStorage.getItem(KEY + ':retry') === name;
    if (!retried) sessionStorage.setItem(KEY + ':retry', name);
  } catch { /* なし */ }
  if (!retried) { location.reload(); return; }
  $('#app').innerHTML = `<section class="card">
    <h2>この画面を開けませんでした</h2>
    <p>アプリを新しくした直後は、スマホに古いファイルが残っていて開けないことがあります。入力した内容は消えていません。</p>
    <p>少し待ってから「もう一度読み込む」を押してください。直らないときは、ブラウザのこのタブを閉じて開き直してください。</p>
    <div class="btn-row"><button class="btn btn-main btn-big" id="btn-retry">もう一度読み込む</button></div>
    <p class="hint">${esc(err?.message || err)}</p>
  </section>`;
  $('#btn-retry').addEventListener('click', () => location.reload());
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b && !b.disabled) showTab(b.dataset.tab); });

migrateOldYoukou();
let firstTab = 'cup';
try { firstTab = localStorage.getItem(KEY + ':tab') || 'cup'; } catch { /* なし */ }
showTab(['tm', 'insta'].includes(firstTab) ? firstTab : 'cup');
