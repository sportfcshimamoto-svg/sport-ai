// SPORT AI事務局：お誘い（LINE）タブ（2026年11月22日 本人の希望）
// 大会やTMを、たくさんの相手チームに同時にLINEで誘うときの文をつくる。全員に同じ文。
// 入力はこの端末の中にだけ保存する。
import { GRADE_NAMES, PLACES, QUICK_NOTES, DEFAULT_GREET, DEFAULT_CLOSE, DEFAULT_STYLE, INTROS, autoIntro, newItem, sorted, isPast, inviteText, fromCup, fromTM } from './lib/invite.js';
import { timeField } from './lib/time-input.js';

const KEY = 'sport-ai:invite:v1';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

async function copyText(text, ui, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
  ui.toast(msg);
}

/**
 * お誘いタブを描く
 * root: 描く場所, ui: { toast }
 */
export function renderInvite(root, ui) {
  const S = { ...DEFAULT_STYLE, greet: DEFAULT_GREET, close: DEFAULT_CLOSE, items: [], ...(readJSON(KEY) || {}) };
  delete S.intro; delete S.cupWord;   // 前の版の「はじめの行」（自由に書く欄）・大会の呼び方
  if (!S.items.length) S.items = [newItem('tm')];
  const $ = (s) => root.querySelector(s);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても使える */ } };
  const opt = (v, text, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(text)}</option>`;

  function itemCard(it) {
    const list = sorted(S.items), n = list.indexOf(it);
    const placeOther = !PLACES.includes(it.place);
    return `<div class="inv-item${isPast(it) ? ' past' : ''}" data-id="${it.id}">
      <div class="inv-head">
        <span class="inv-no">${'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'[n] || n + 1}</span>
        <span class="inv-kind ${it.kind}">${it.kind === 'cup' ? '🏆 大会' : '⚽ TM'}</span>
        ${isPast(it) ? '<span class="inv-past">終わった日</span>' : ''}
        <button class="btn btn-sub btn-small inv-del" data-del="${it.id}" title="このお誘いを消す">✕</button>
      </div>
      <div class="grid">
        <div><label>学年</label><select data-f="grade">${GRADE_NAMES.map((g, i) => opt(i, g, i === +it.grade)).join('')}</select></div>
        <div><label>日にち</label><input type="date" data-f="date" value="${esc(it.date)}"></div>
        <div><label>&nbsp;</label><label class="check"><input type="checkbox" data-f="holiday" ${it.holiday ? 'checked' : ''}>祝日（「月・祝」と書く）</label></div>
        <div class="wide"><label>時間</label><div class="inline"><input type="text" data-f="from" data-tf="1" value="${esc(it.from)}">〜<input type="text" data-f="to" data-tf="2" value="${esc(it.to)}"></div></div>
        <div><label>会場</label><select data-f="placeSel">${PLACES.map((p) => opt(p, p, p === it.place)).join('')}${opt('__other', 'そのほか（入力する）', placeOther)}</select>
          ${placeOther ? `<input type="text" data-f="place" value="${esc(it.place)}" placeholder="会場の名前" style="margin-top:6px">` : ''}</div>
        <div><label>人数</label><select data-f="players">${opt('', '書かない', !it.players)}${[5, 6, 7, 8].map((p) => opt(p, `${p}人制`, p == it.players)).join('')}</select></div>
        ${it.kind === 'cup' ? `
        <div><label>大会の名前 <small>（学年のあとにつく）</small></label><input type="text" data-f="cupName" value="${esc(it.cupName)}"></div>
        <div><label>参加費 <small>（空なら書かない）</small></label><input type="text" data-f="fee" value="${esc(it.fee)}"></div>
        <div><label>全部で何チーム <small>（空なら書かない）</small></label><input type="number" min="2" max="12" data-f="teams" value="${esc(it.teams)}"></div>` : ''}
        <div class="wide"><label>日にちの上に書くひとこと <small>（なくてよい）</small></label>
          <div class="team-field"><input type="text" data-f="note" value="${esc(it.note)}" placeholder="例：急ではございますが…"><select class="team-pick" data-quick="note"><option value="">▼ 選ぶ</option>${QUICK_NOTES.map((q) => opt(q, q)).join('')}</select></div></div>
        <div class="wide"><label>会場の下に書くこと <small>（なくてよい）</small></label><input type="text" data-f="memo" value="${esc(it.memo)}" placeholder="例：※④の2年生と同一会場で2面開催します。"></div>
      </div>
    </div>`;
  }

  root.innerHTML = `
  <section class="card">
    <h2><span class="num">1</span>お誘いする大会・TM</h2>
    <p class="hint">日にち順に ①②… と並びます。大会タブ・TMタブに入れてある内容を、そのまま足すこともできます。</p>
    <div class="btn-row">
      <button class="btn btn-sub btn-small" id="inv-add-tm">＋ TMを足す</button>
      <button class="btn btn-sub btn-small" id="inv-add-cup">＋ 大会を足す</button>
      <button class="btn btn-sub btn-small" id="inv-from-tm">TMタブの内容を足す</button>
      <button class="btn btn-sub btn-small" id="inv-from-cup">大会タブの内容を足す</button>
    </div>
    <div id="inv-items"></div>
    <div class="btn-row"><button class="btn btn-sub btn-small" id="inv-clear-past">終わった日のお誘いを消す</button><button class="btn btn-sub btn-small" id="inv-clear-all">全部消して1から</button></div>
  </section>

  <section class="card">
    <h2><span class="num">2</span>書き方</h2>
    <div class="grid">
      <div><label>1つのお誘いの書き方</label><select id="inv-style">${opt('lines', '行ごとに分ける', S.style === 'lines')}${opt('oneline', '1行にまとめる', S.style === 'oneline')}</select></div>
      <div class="wide"><label class="check"><input type="checkbox" id="inv-month" ${S.monthMode ? 'checked' : ''}>全部が同じ月なら「9月の〜」にまとめて、日にちは「12日（土）」と日だけ書く</label></div>
      <div class="wide"><label class="check"><input type="checkbox" id="inv-at" ${S.at ? 'checked' : ''}>会場の前に「@」をつける</label></div>
      <div class="wide"><label>はじめのあいさつ <small>（いらなければ空に）</small></label><input type="text" id="inv-greet" value="${esc(S.greet)}"></div>
      <div class="wide"><label>はじめの行 <small>（同じ月にまとめるときは、前に「9月の」がつきます）</small></label><select id="inv-intro"></select></div>
      <div class="wide"><label>結び</label><textarea id="inv-close" rows="4">${esc(S.close)}</textarea>
        <div class="btn-row"><button class="btn btn-sub btn-small" id="inv-reset-text">あいさつ・はじめの行・結びをいつもの文にもどす</button></div></div>
    </div>
  </section>

  <section class="card">
    <h2><span class="num">3</span>できあがり</h2>
    <pre class="inv-out" id="inv-out"></pre>
    <div class="btn-row"><button class="btn btn-main btn-big" id="inv-share">📤 LINEなどで送る</button><button class="btn btn-sub" id="inv-copy">📋 文をコピー</button></div>
    <p class="hint">スマホでは「LINEなどで送る」でLINEを選び、送りたい相手やグループを選んでください（LINEでは、一度に何人かを選んで送れます）。パソコンでは「文をコピー」してLINEに貼りつけてください。</p>
  </section>`;

  function drawItems() {
    $('#inv-items').innerHTML = sorted(S.items).map(itemCard).join('');
    $('#inv-items').querySelectorAll('[data-tf]').forEach((el) => timeField(el, { blank: el.dataset.tf === '2' }));
  }
  function update() {
    save();
    $('#inv-out').textContent = inviteText(S);
    // はじめの行：選んでいなければ、お誘いの中身に合うものを選んでおく
    const sel = $('#inv-intro'), cur = S.introKind || autoIntro(S.items);
    sel.innerHTML = INTROS.map((x) => opt(x.id, x.text, x.id === cur)).join('');
  }
  const itemOf = (el) => S.items.find((x) => x.id === el.closest('[data-id]')?.dataset.id);
  const redraw = () => { drawItems(); update(); };

  // お誘いの入力（並びや欄が変わるものは描き直す）
  $('#inv-items').addEventListener('input', (e) => {
    const it = itemOf(e.target), f = e.target.dataset.f;
    if (!it || !f || f === 'date' || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return;
    it[f] = f === 'teams' ? (e.target.value ? Number(e.target.value) : '') : e.target.value;
    update();
  });
  $('#inv-items').addEventListener('change', (e) => {
    const t = e.target, it = itemOf(t);
    if (!it) return;
    if (t.dataset.quick) { if (t.value) { it[t.dataset.quick] = t.value; redraw(); } return; }
    const f = t.dataset.f;
    if (f === 'date') { it.date = t.value; redraw(); return; }   // 日にち順の番号が変わるので描き直す
    if (f === 'holiday') it.holiday = t.checked;
    else if (f === 'grade') it.grade = Number(t.value);
    else if (f === 'players') it.players = t.value ? Number(t.value) : '';
    else if (f === 'placeSel') { it.place = t.value === '__other' ? '' : t.value; redraw(); return; }
    else return;
    update();
  });
  $('#inv-items').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    S.items = S.items.filter((x) => x.id !== b.dataset.del);
    redraw();
  });

  const add = (it, msg) => { S.items.push(it); redraw(); if (msg) ui.toast(msg); root.querySelector(`[data-id="${it.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  $('#inv-add-tm').onclick = () => add(newItem('tm'));
  $('#inv-add-cup').onclick = () => add(newItem('cup'));
  $('#inv-from-tm').onclick = () => {
    const t = readJSON('sport-ai:tm:v1');
    if (!t) { ui.toast('TMタブに、まだ何も入っていません'); return; }
    add(fromTM(t), 'TMタブの内容を足しました');
  };
  $('#inv-from-cup').onclick = () => {
    const c = readJSON('sport-ai:v1');
    if (!c) { ui.toast('大会タブに、まだ何も入っていません'); return; }
    add(fromCup(c), '大会タブの内容を足しました');
  };
  $('#inv-clear-past').onclick = () => {
    const n = S.items.filter((x) => isPast(x)).length;
    if (!n) { ui.toast('終わった日のお誘いはありません'); return; }
    S.items = S.items.filter((x) => !isPast(x));
    redraw(); ui.toast(`${n}件消しました`);
  };
  $('#inv-clear-all').onclick = () => {
    if (!confirm('お誘いの一覧を全部消して、1件目から入れなおします。よろしいですか？（書き方・あいさつ・結びはそのまま）')) return;
    S.items = [newItem('tm')];
    redraw();
  };

  // 書き方
  const on = (id, fn, ev = 'input') => $(id).addEventListener(ev, (e) => { fn(e.target); update(); });
  on('#inv-style', (el) => { S.style = el.value; }, 'change');
  on('#inv-month', (el) => { S.monthMode = el.checked; }, 'change');
  on('#inv-at', (el) => { S.at = el.checked; }, 'change');
  on('#inv-greet', (el) => { S.greet = el.value; });
  on('#inv-intro', (el) => { S.introKind = el.value; }, 'change');
  on('#inv-close', (el) => { S.close = el.value; });
  $('#inv-reset-text').onclick = () => {
    S.greet = DEFAULT_GREET; S.introKind = ''; S.close = DEFAULT_CLOSE;
    $('#inv-greet').value = S.greet; $('#inv-close').value = S.close;
    update();
  };

  // 送る
  $('#inv-copy').onclick = () => copyText(inviteText(S), ui, '文をコピーしました。LINEに貼りつけて送ってください');
  $('#inv-share').onclick = async () => {
    const text = inviteText(S);
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (err) { if (err?.name === 'AbortError') return; }
    }
    copyText(text, ui, '文をコピーしました。LINEに貼りつけて送ってください');
  };

  redraw();
}
