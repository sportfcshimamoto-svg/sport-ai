// SPORT AI事務局：大会（SPORT CUP）の書き出し
// AIもインターネットも使わない。要項の読み取り・計算・ファイル作りは、すべてこのブラウザの中で行う。
import { GRADES, FORMATS, FINALS_GAP } from './lib/schedule.js';
import { readYoukou } from './lib/youkou.js';
import { defaultsFor, defaultNotes, fromYoukou, prepare, buildAll, slotOf } from './lib/tournament.js';
import { writeZip } from './lib/zip.js';

const KEY = 'sport-ai:v1';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- 状態 ----------
let S = load() || newState('U12');
if (S.finalsGap == null) S.finalsGap = S.format === 'two3' ? FINALS_GAP : S.gap;   // 前に保存した内容には無い
let youkou = null;            // 読み込んだ要項（Uint8Array）
let youkouName = '';
let youkouPlayers = '';       // 要項に書いてあった人数（例：「８人制」「6～８人制」）

function newState(grade) {
  const d = defaultsFor(grade);
  const now = new Date();
  return { ...d, year: now.getFullYear(), month: null, day: null, teams: ['', '', '', '', '', ''].slice(0, d.format === 'two3' ? 6 : 4), cities: [], ...notesOf(d) };
}
function notesOf(t) { const n = defaultNotes(t); return { exchange: n.exchange, notesAfter: n.after, useExchange: true }; }
function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
    if (youkou) localStorage.setItem(KEY + ':youkou', JSON.stringify({ name: youkouName, b64: b64(youkou) }));
  } catch { /* 保存できなくても使える */ }
}
function loadYoukouFromStore() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + ':youkou') || 'null');
    if (v) { youkou = unb64(v.b64); youkouName = v.name; readYoukou(youkou).then((y) => { youkouPlayers = y.players || ''; const o = document.querySelector('#f-players option[value=""]'); if (o && youkouPlayers) o.textContent = `要項のまま（${youkouPlayers}）`; }).catch(() => {}); }
  } catch { /* なし */ }
}
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ---------- 画面 ----------
function render() {
  $('#app').innerHTML = `
  <section class="card">
    <h2><span class="num">1</span>大会要項（Word）を読み込む</h2>
    <label class="drop ${youkou ? 'has' : ''}">
      ${youkou ? `📄 ${esc(youkouName)}<br><small>別の要項にするときは、ここをタップ</small>` : '📄 ここをタップして、要項のWordファイル（.docx）をえらぶ'}
      <input type="file" id="f-youkou" accept=".docx">
    </label>
    <p class="hint">いつも作っている「SPORTCUP ○○要項.docx」をそのまま選んでください。日時・場所・学年・競技時間・リーグの形を読み取って、下に入れます。<br>
    要項がなくても、下で学年をえらべば リーグ表・掲示用・優秀選手賞・審判カード は作れます（完成版の要項だけは作れません）。</p>
    ${youkou ? '<div class="btn-row"><button class="btn btn-sub btn-small" id="btn-unload">要項を外す</button></div>' : ''}
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
      <div><label>競技時間 <small>（前半-休けい-後半）</small></label><div class="inline"><input type="number" id="f-half" min="5" max="40" value="${S.half}">-<input type="number" id="f-brk" min="0" max="15" value="${S.brk}">-<span id="half2">${S.half}</span></div></div>
      <div><label>人数 <small>（要項の「競技方法」）</small></label><select id="f-players"><option value="" ${!S.players ? 'selected' : ''}>要項のまま${youkouPlayers ? `（${esc(youkouPlayers)}）` : ''}</option>${[5, 6, 7, 8].map((n) => `<option value="${n}" ${n == S.players ? 'selected' : ''}>${'５６７８'[n - 5]}人制</option>`).join('')}</select></div>
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
    <td><input type="text" data-team="${i}" value="${esc(t)}" placeholder="チーム名"></td>
    <td class="city"><input type="text" data-city="${i}" value="${esc(S.cities[i] || '')}" placeholder="市町（例：高槻市）"></td>
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

const FILES = [
  { name: (tag) => `${tag}.docx`, key: 'youkou', ic: '📄', title: '完成版の要項（2ページ目にリーグ表・タイムスケジュール）', sub: '読み込んだ要項に、参加チームと2ページ目を入れたもの' },
  { name: () => 'リーグ表.docx', ic: '📊', title: 'リーグ表', sub: 'A4横・勝ち点／得失／総得点／順位の欄つき' },
  { name: () => '掲示用.docx', ic: '📋', title: '掲示用（タイムスケジュール）', sub: 'A4横・大きな字' },
  { name: () => '優秀選手賞.docx', ic: '🏅', title: '優秀選手賞カード', sub: '1チーム1枚・A4に8枚' },
  { name: () => '審判カード.xlsx', ic: '🟨', title: '審判カード（Excel）', sub: 'いつもの Referee card の形・チーム名入り・A4に8枚' },
];

function renderFiles(ready) {
  if (!ready) { $('#files').innerHTML = '<p class="hint">上の「できあがりの確認」に表が出たら、ここから書き出せます。</p>'; return; }
  const p = prepare(S);
  const tag = `${p.shortTitle.replace(/^SPORT CUP\s*/, 'SPORTCUP ').replace(/U-/, 'U')} ${p.dateDots}`.trim();
  $('#files').innerHTML = `<div class="files">${FILES.map((f, i) => {
    const off = f.key === 'youkou' && !youkou;
    return `<div class="file"><span class="ic">${f.ic}</span><span class="nm"><b>${esc(f.title)}</b><small>${off ? '要項を読み込むと作れます' : esc(f.name(tag)) + '　' + esc(f.sub)}</small></span>
      <button class="btn btn-sub btn-small" data-dl="${i}" ${off ? 'disabled' : ''}>ダウンロード</button></div>`;
  }).join('')}</div>
  <div class="btn-row"><button class="btn btn-main btn-big" id="btn-all">⬇ まとめてダウンロード（ZIP）</button></div>
  <p class="hint">ダウンロードしたファイルは、WordやExcelで開いて、そのまま直せます。</p>`;
  $('#files').onclick = async (e) => {
    const b = e.target.closest('[data-dl]');
    if (b) {
      const files = await safeBuild(); if (!files) return;
      const name = FILES[Number(b.dataset.dl)].name(tag);
      download(name, files[name]);
    }
    if (e.target.id === 'btn-all') {
      const files = await safeBuild(); if (!files) return;
      download(`${tag}.zip`, await writeZip(files));
    }
  };
}

async function safeBuild() {
  try { return await buildAll(S, youkou); } catch (err) { console.error(err); toast('作れませんでした：' + err.message); return null; }
}

function download(name, bytes) {
  const types = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip', jpg: 'image/jpeg' };
  const url = URL.createObjectURL(new Blob([bytes], { type: types[name.split('.').pop()] }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`${name} をダウンロードしました`);
}

// ---------- 入力 ----------
function bind() {
  $('#f-youkou').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const y = await readYoukou(bytes);
      youkou = bytes; youkouName = f.name; youkouPlayers = y.players || '';
      const keepTeams = S.teams.some((t) => t.trim());
      const t = fromYoukou(y);
      const n = t.format === 'two3' ? 6 : (y.teamCount || 4);
      S = { ...S, ...t, year: S.year || new Date().getFullYear(), useExchange: true,
        teams: keepTeams ? S.teams : padTo(t.teams, n), cities: keepTeams ? S.cities : t.cities, players: '' };
      if (y.month) S.year = guessYear(y.month);
      render();
      const got = [y.grade && `学年 ${y.grade}`, y.month && `日にち ${y.month}月${y.day}日`, y.place && '場所', y.half && `競技時間 ${y.half}-${y.brk}-${y.half}`, y.format && FORMATS[y.format].split('（')[0]].filter(Boolean);
      $('#youkou-msg').innerHTML = `<div class="notice"><span class="ok">読み取りました：</span>${esc(got.join('・'))}<br>
        日にちは要項の中身から入れています。<b>まちがっていないか確かめてください</b>（前の大会の要項を使い回したとき、日付が古いままのことがあります）。</div>`;
    } catch (err) {
      $('#youkou-msg').innerHTML = `<div class="notice err">読み取れませんでした：${esc(err.message)}</div>`;
    }
  };
  $('#btn-unload')?.addEventListener('click', () => { youkou = null; youkouName = ''; youkouPlayers = ''; try { localStorage.removeItem(KEY + ':youkou'); } catch { /* なし */ } render(); });

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
  if (name === 'tm') {
    const { renderTM } = await import('./tm.js');
    renderTM($('#app'), { toast, download });
  } else if (name === 'insta') {
    const { renderInsta } = await import('./insta.js');
    renderInsta($('#app'), { toast, download });
  } else {
    render();
  }
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b && !b.disabled) showTab(b.dataset.tab); });

loadYoukouFromStore();
let firstTab = 'cup';
try { firstTab = localStorage.getItem(KEY + ':tab') || 'cup'; } catch { /* なし */ }
showTab(['tm', 'insta'].includes(firstTab) ? firstTab : 'cup');
