// SPORT AI事務局：TM（トレーニングマッチ）タブ
// 入力 → 画面で確認 → 「TM U○【相手】日付.pdf」を書き出す。すべてこのブラウザの中で行う。
import { TM_GRADES, VENUES, venueOf, PLAYERS, playersText, tmDefaults, tmGradeOf, tmPrepare } from './lib/tm.js';
import { tmPdf } from './lib/tm-pdf.js';
import { loadImages } from './lib/images.js';

const KEY = 'sport-ai:tm:v1';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CIRCLED = '①②③④⑤⑥⑦⑧';

function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }

/**
 * TMタブを描く
 * root: 描く場所, ui: { toast, download }
 */
export function renderTM(root, ui) {
  let S = { ...tmDefaults('U8'), ...(load() || {}) };
  if (S.players === undefined || /人制/.test(S.extra || '')) {   // 前は「５人制」を自由に書く欄だった
    const m = String(S.extra || '').match(/([5-8５-８])人制/);
    S.players = m ? Number(String(m[1]).replace(/[５-８]/, (c) => '５６７８'.indexOf(c) + 5)) : (S.players || '');
    S.extra = String(S.extra || '').replace(/[5-8５-８]人制/, '').trim();
  }
  if (!VENUES.some((v) => v.name === S.place)) { S.place = VENUES[0].name; S.car = VENUES[0].car; }   // 前に自由に入れた会場は、3か所のどれかに
  const $ = (s) => root.querySelector(s);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても使える */ } };
  const dateVal = () => (S.month ? `${S.year}-${String(S.month).padStart(2, '0')}-${String(S.day).padStart(2, '0')}` : '');

  root.innerHTML = `
  <section class="card">
    <h2><span class="num">1</span>相手と日にち</h2>
    <div class="grid">
      <div><label>学年</label><select id="tm-grade">${TM_GRADES.map((g) => `<option value="${g.id}" ${g.id === S.grade ? 'selected' : ''}>${g.target}</option>`).join('')}</select></div>
      <div><label>対象 <small>（お知らせに書く字）</small></label><input type="text" id="tm-target" value="${esc(S.target)}"></div>
      <div><label>相手チーム</label><input type="text" id="tm-opp" value="${esc(S.opponent)}" placeholder="例：松原SS"></div>
      <div><label>こちらのチーム名</label><input type="text" id="tm-us" value="${esc(S.us)}"></div>
      <div><label>日にち</label><input type="date" id="tm-date" value="${dateVal()}"></div>
      <div><label>&nbsp;</label><label class="check"><input type="checkbox" id="tm-holiday" ${S.holiday ? 'checked' : ''}>祝日（「月・祝」と書く）</label></div>
      <div><label>時間 <small>（書かないときは空のまま）</small></label><div class="inline"><input type="text" id="tm-open" value="${esc(S.open)}" placeholder="11:00">〜<input type="text" id="tm-close" value="${esc(S.close)}" placeholder="14:30"></div></div>
      <div><label>何時以降にお越しください</label><input type="text" id="tm-arrive" value="${esc(S.arrive)}" placeholder="9:00"></div>
      <div class="wide"><label>会場</label><select id="tm-place">${VENUES.map((v) => `<option ${v.name === S.place ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
    </div>
  </section>

  <section class="card">
    <h2><span class="num">2</span>試合</h2>
    <div class="grid">
      <div><label>競技時間 <small>（前半-休けい-後半）</small></label><div class="inline"><input type="number" id="tm-half" min="5" max="40" value="${S.half}">-<input type="number" id="tm-brk" min="0" max="15" value="${S.brk}">-<span id="tm-half2">${S.half}</span></div></div>
      <div><label>人数</label><select id="tm-players"><option value="" ${!S.players ? 'selected' : ''}>書かない</option>${PLAYERS.map((n) => `<option value="${n}" ${n == S.players ? 'selected' : ''}>${playersText(n)}</option>`).join('')}</select></div>
      <div class="wide"><label>競技時間のあとに、ほかに書くこと <small>（例：※1分間のクーリングブレイクを確保）</small></label><input type="text" id="tm-extra" value="${esc(S.extra)}"></div>
      <div><label>1本目の開始</label><input type="text" id="tm-start" value="${esc(S.start)}"></div>
      <div><label>1本の枠（分）</label><input type="number" id="tm-match" min="10" max="90" value="${S.matchMin}"></div>
      <div><label>1本と1本のあいだ（分）</label><input type="number" id="tm-gap" min="0" max="60" value="${S.gap}"></div>
      <div><label>本数</label><select id="tm-count">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n == S.count ? 'selected' : ''}>${n}本</option>`).join('')}</select></div>
    </div>
    <p class="hint">1本目は${esc(S.us || 'SPORT FC')}が左、2本目は相手が左…と交互になります。審判は 前半＝左のチーム、後半＝右のチーム（これまでのTMと同じ）。</p>
  </section>

  <section class="card">
    <h2><span class="num">3</span>注意書き</h2>
    <div class="grid">
      <div class="wide"><label>車の乗り入れ</label><input type="text" id="tm-car" value="${esc(S.car)}">
        <p class="hint">「会場」を選ぶと、その会場のいつもの文に入れかわります（その日だけちがうときは、ここで書きかえてください）。</p></div>
      <div><label>雨天中止を決める時間 <small>（当日）</small></label><input type="text" id="tm-rain" value="${esc(S.rain)}" placeholder="7:30"></div>
      <div><label>連絡先（名前） <small>（空なら「SPORT FCまで」）</small></label><input type="text" id="tm-contact" value="${esc(S.contact)}"></div>
      <div class="wide"><label>ほかに書くこと <small>（1行に1つ。「※」がつきます）</small></label><textarea id="tm-notes">${esc(S.extraNotes)}</textarea></div>
    </div>
  </section>

  <section class="card preview">
    <h2><span class="num">4</span>できあがりの確認</h2>
    <div id="tm-preview"></div>
  </section>

  <section class="card">
    <h2><span class="num">5</span>書き出す</h2>
    <div id="tm-files"></div>
  </section>`;

  function problems() {
    const out = [];
    if (!S.opponent.trim()) out.push('「相手チーム」を入れてください。');
    if (!S.month) out.push('「日にち」を入れてください。');
    if (!/^\d{1,2}:\d{2}$/.test(S.start)) out.push('「1本目の開始」は 9:40 のように入れてください。');
    return out;
  }

  function update() {
    save();
    const p = tmPrepare(S);
    const bad = problems();
    $('#tm-preview').innerHTML = (bad.length ? `<div class="notice">${bad.map(esc).join('<br>')}</div>` : '')
      + `<div class="tm-doc">
        <p class="tm-title">SPO<span>R</span>T FC</p>
        ${[p.lines.target, p.lines.date, p.lines.place, '●参加チーム', p.lines.teams, p.lines.time].map((l) => `<p>${esc(l)}</p>`).join('')}
        <div class="scroll"><table class="sched">
          <tr><th rowspan="2"></th><th rowspan="2">タイムテーブル</th><th rowspan="2" colspan="3">対戦表</th><th colspan="2">審判</th></tr>
          <tr><th>前半</th><th>後半</th></tr>
          ${p.matches.map((m, i) => `<tr><td>${CIRCLED[i]}</td><td class="t">${m.from} ～ ${m.to}</td><td>${esc(m.home)}</td><td>－</td><td>${esc(m.away)}</td><td>${esc(m.ref1)}</td><td>${esc(m.ref2)}</td></tr>`).join('')}
        </table></div>
        ${p.notes.map((n) => `<p class="tm-note">※　${esc(n)}</p>`).join('')}
        <p>${esc(p.closing)}</p>
      </div>`;
    const pdfName = p.fileName.replace(/\.docx$/, '.pdf');
    $('#tm-files').innerHTML = bad.length
      ? '<p class="hint">上の「できあがりの確認」の黄色い知らせがなくなったら、ここから書き出せます。</p>'
      : `<div class="files"><div class="file"><span class="ic">📄</span><span class="nm"><b>TMのお知らせ（PDF）</b><small>${esc(pdfName)}　A4縦・これまでのTMと同じ形</small></span></div></div>
        <div class="btn-row"><button class="btn btn-main btn-big" id="tm-dl">⬇ ダウンロード</button></div>
        <p class="hint">PDFはスマホでも見た目がくずれません。直したいときは、上の入力を変えて作り直してください。</p>`;
    $('#tm-dl')?.addEventListener('click', async () => {
      try { ui.download(pdfName, await tmPdf(S, await loadImages())); } catch (err) { console.error(err); ui.toast('作れませんでした：' + err.message); }
    });
  }

  const on = (id, fn) => $(id).addEventListener('input', (e) => { fn(e.target); update(); });
  $('#tm-grade').addEventListener('change', (e) => {
    const g = tmGradeOf(e.target.value), d = tmDefaults(g.id);
    Object.assign(S, { grade: g.id, target: d.target, half: d.half, brk: d.brk, players: d.players, start: d.start, matchMin: d.matchMin });
    save();
    renderTM(root, ui);   // 保存した値（ひな形入り）で描き直す
  });
  on('#tm-target', (el) => { S.target = el.value; });
  on('#tm-opp', (el) => { S.opponent = el.value; });
  on('#tm-us', (el) => { S.us = el.value; });
  on('#tm-date', (el) => { const m = el.value.match(/(\d+)-(\d+)-(\d+)/); if (m) { S.year = +m[1]; S.month = +m[2]; S.day = +m[3]; } else { S.month = null; } });
  $('#tm-holiday').addEventListener('change', (e) => { S.holiday = e.target.checked; update(); });
  on('#tm-open', (el) => { S.open = el.value.trim().replace('：', ':'); });
  on('#tm-close', (el) => { S.close = el.value.trim().replace('：', ':'); });
  on('#tm-arrive', (el) => { S.arrive = el.value.trim().replace('：', ':'); });
  $('#tm-place').addEventListener('change', (e) => {
    const v = venueOf(e.target.value);
    S.place = v.name; S.car = v.car; $('#tm-car').value = v.car;
    update();
  });
  const slot = () => { S.matchMin = Math.ceil((S.half * 2 + S.brk) / 5) * 5; $('#tm-match').value = S.matchMin; };
  on('#tm-half', (el) => { S.half = +el.value || 0; $('#tm-half2').textContent = S.half; slot(); });
  on('#tm-brk', (el) => { S.brk = +el.value || 0; slot(); });
  on('#tm-extra', (el) => { S.extra = el.value.trim(); });
  $('#tm-players').addEventListener('change', (e) => { S.players = e.target.value ? Number(e.target.value) : ''; update(); });
  on('#tm-start', (el) => { S.start = el.value.trim().replace('：', ':'); });
  on('#tm-match', (el) => { S.matchMin = +el.value || 0; });
  on('#tm-gap', (el) => { S.gap = +el.value || 0; });
  $('#tm-count').addEventListener('change', (e) => { S.count = +e.target.value; update(); });
  on('#tm-car', (el) => { S.car = el.value; });
  on('#tm-rain', (el) => { S.rain = el.value.trim().replace('：', ':'); });
  on('#tm-contact', (el) => { S.contact = el.value.trim(); });
  on('#tm-notes', (el) => { S.extraNotes = el.value; });
  update();
}
