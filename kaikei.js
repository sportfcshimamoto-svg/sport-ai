// SPORT AI事務局：会計タブ
// コーチが立替を入れて領収書を送る → スプレッドシートとGoogleドライブに入る（Googleの側：gas/kaikei/Code.gs）
// 代表・会計担当は月ごと・コーチごとの返金額を見る。運営役員はチェックする。
// この端末に残すのは、合言葉（「覚えておく」のとき）と選んだ名前だけ。会計のデータは残さない。
import { api, apiUrl, MONTHS, refundMonth, cutoffOf, cutoffText, lastClosedMonth, yen, todayYmd, parseYmd, md, prepareFile, lineText, lineUrl } from './lib/kaikei.js';

const KEY = 'sport-ai:kaikei:v1';
const ROLE = { admin: '代表・会計担当', coach: 'コーチ', officer: '運営役員' };
const OTHER = '__other';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const get = (k) => { try { return localStorage.getItem(KEY + ':' + k) || sessionStorage.getItem(KEY + ':' + k) || ''; } catch { return ''; } };
const put = (k, v, keep = true) => {
  try {
    localStorage.removeItem(KEY + ':' + k); sessionStorage.removeItem(KEY + ':' + k);
    if (v) (keep ? localStorage : sessionStorage).setItem(KEY + ':' + k, v);
  } catch { /* 保存できなくても使える */ }
};
const emptyForm = () => ({ date: todayYmd(), item: '', detail: '', amount: '' });

export function renderKaikei(host, ui) {
  // ほかのタブと同じ場所に描くので、操作の受け口はこのタブの中の箱につける
  host.innerHTML = '<div class="kk"></div>';
  const root = host.firstChild;
  const S = {
    pass: get('pass'), info: null, view: get('view') || 'input',
    who: get('who'), otherName: '', officer: get('officer'),
    entries: null, month: null, open: {},
    form: emptyForm(), files: [], keep: [], editing: null, sent: null, busy: '',
  };
  const $ = (s) => root.querySelector(s);

  async function call(req, busyText) {
    S.busy = busyText || '読みこんでいます…';
    paintBusy();
    try {
      return await api({ ...req, pass: S.pass });
    } catch (err) {
      if (err.badPass) { put('pass', ''); S.pass = ''; S.info = null; ui.toast(err.message); draw(); }
      throw err;
    } finally {
      S.busy = ''; paintBusy();
    }
  }
  function paintBusy() {
    root.querySelectorAll('[data-busy]').forEach((b) => { b.disabled = !!S.busy; });
    const m = $('#kk-busy'); if (m) { m.textContent = S.busy; m.hidden = !S.busy; }
  }
  const fail = (err) => { console.error(err); if (!err.badPass) ui.toast(err.message); };

  // ---------- 入る ----------
  async function login(pass, keep) {
    S.pass = pass;
    try {
      S.info = await call({ action: 'init' }, '確かめています…');
      put('pass', pass, keep);
      if (S.info.role === 'coach') S.view = 'input';
      else if (S.info.role === 'officer') S.view = 'refund';
      else if (!['input', 'refund', 'settings'].includes(S.view)) S.view = 'refund';
      S.entries = null;
      draw();
      loadEntries();
    } catch (err) { S.pass = ''; fail(err); draw(); }
  }
  function logout() {
    put('pass', '');
    Object.assign(S, { pass: '', info: null, entries: null, month: null, open: {}, form: emptyForm(), files: [], keep: [], editing: null, sent: null });
    draw();
  }

  async function loadEntries() {
    const role = S.info?.role;
    if (role === 'coach' && !whoName()) { S.entries = []; draw(); return; }
    try {
      const r = await call({ action: 'entries', who: role === 'coach' ? whoName() : '' });
      S.entries = r.entries;
      draw();
    } catch (err) { fail(err); }
  }

  const whoName = () => (S.who === OTHER ? S.otherName.trim() : S.who);

  // ---------- 描く ----------
  function draw() {
    if (!apiUrl()) {
      root.innerHTML = `<section class="card"><h2><span class="num">¥</span>会計</h2>
        <div class="notice">会計タブは、いま準備中です。もうしばらくお待ちください。</div></section>`;
      return;
    }
    if (!S.info) { drawLogin(); return; }
    const role = S.info.role;
    const views = role === 'admin' ? [['input', '✏ 立替を入れる'], ['refund', '💴 返金の一覧'], ['settings', '⚙ 設定']] : [];
    root.innerHTML = `
      <section class="card kk-who">
        <div><b>${esc(ROLE[role])}</b>として入っています <small>（${esc(S.info.sheetName)}）</small></div>
        <button class="btn btn-sub btn-small" data-act="logout">ぬける</button>
      </section>
      ${views.length ? `<div class="kk-views">${views.map(([v, t]) => `<button class="${S.view === v ? 'active' : ''}" data-view="${v}">${t}</button>`).join('')}</div>` : ''}
      <div id="kk-busy" class="kk-busy" hidden></div>
      ${S.view === 'input' ? inputHtml() + mineHtml() : S.view === 'refund' ? refundHtml() : settingsHtml()}`;
    paintBusy();
  }

  function drawLogin() {
    root.innerHTML = `
      <section class="card">
        <h2><span class="num">¥</span>会計</h2>
        <p>合言葉を入れてください。合言葉は、代表・会計担当／コーチ／運営役員でちがいます。</p>
        <form id="kk-login">
          <label for="kk-pass">合言葉</label>
          <input type="password" id="kk-pass" autocomplete="current-password" required>
          <label class="check"><input type="checkbox" id="kk-keep" checked>この端末で覚えておく（自分だけが使う端末のとき）</label>
          <div class="btn-row"><button class="btn btn-main btn-big" data-busy>入る</button></div>
        </form>
        <div id="kk-busy" class="kk-busy" hidden></div>
        <p class="hint">入力したものは、チームの会計のスプレッドシートに入ります。この端末には残りません。</p>
      </section>`;
    $('#kk-login').addEventListener('submit', (e) => { e.preventDefault(); login($('#kk-pass').value.trim(), $('#kk-keep').checked); });
  }

  // ----- 立替を入れる -----
  function inputHtml() {
    const { coaches, items, settings } = S.info;
    const f = S.form, d = parseYmd(f.date);
    const month = d ? refundMonth(settings, d) : null;
    const nameSel = `<select id="kk-who"><option value="">えらんでください</option>${coaches.map((c) => `<option ${c === S.who ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="${OTHER}" ${S.who === OTHER ? 'selected' : ''}>一覧にない名前を書く</option></select>`;
    const files = [
      ...S.keep.map((id, i) => `<li>📎 前に送った領収書 ${i + 1} <button class="btn btn-sub btn-small" data-act="view" data-file="${esc(id)}">見る</button> <button class="btn btn-sub btn-small" data-act="unkeep" data-i="${i}">✕ 外す</button></li>`),
      ...S.files.map((x, i) => `<li>${x.preview ? `<img src="${x.preview}" alt="">` : x.mime === 'application/pdf' ? '📕' : '📷'} ${esc(x.name)} <small>${Math.round(x.size / 1024)}KB</small> <button class="btn btn-sub btn-small" data-act="unfile" data-i="${i}">✕</button></li>`),
    ];
    const room = 5 - S.keep.length - S.files.length;
    return `
      <section class="card">
        <h2><span class="num">1</span>${S.editing ? '入力を直す' : '立替を入れる'}</h2>
        ${S.sent ? sentHtml() : ''}
        <div class="grid">
          <div><label>名前</label>${nameSel}
            ${S.who === OTHER ? `<input type="text" id="kk-other" value="${esc(S.otherName)}" placeholder="名前を書く" style="margin-top:6px">` : ''}</div>
          <div><label>買った日</label><input type="date" id="kk-date" value="${esc(f.date)}"></div>
          <div><label>項目</label><select id="kk-item"><option value="">えらんでください</option>${items.map((i) => `<option ${i === f.item ? 'selected' : ''}>${esc(i)}</option>`).join('')}</select></div>
          <div><label>金額（円）</label><input type="text" id="kk-amount" inputmode="numeric" value="${esc(f.amount)}" placeholder="3400"></div>
          <div class="wide"><label>明細 <small>（何を買ったか。例：4年 ビブス10枚）</small></label><input type="text" id="kk-detail" value="${esc(f.detail)}" maxlength="200"></div>
          <div class="wide"><label>領収書 <small>（写真かPDF。5枚まで）</small></label>
            ${files.length ? `<ul class="kk-files">${files.join('')}</ul>` : ''}
            ${room > 0 ? `<label class="drop kk-drop">📷 写真をとる／えらぶ・PDFをえらぶ<input type="file" id="kk-file" accept="image/*,application/pdf,.pdf" multiple></label>` : '<p class="hint">5枚まで入っています。</p>'}
          </div>
        </div>
        ${month ? `<p class="hint">→ <b>${month}月分</b>の返金になります（${d.getMonth() + 1}月の締め日：${cutoffText(cutoffOf(settings, d.getMonth() + 1))}）</p>` : ''}
        <div class="btn-row">
          <button class="btn btn-main btn-big" data-act="send" data-busy>${S.editing ? '直して送る' : '送る'}</button>
          ${S.editing ? '<button class="btn btn-sub" data-act="cancel">直すのをやめる</button>' : ''}
        </div>
      </section>`;
  }

  function sentHtml() {
    const e = S.sent;
    return `<div class="kk-sent">
      <b>✔ 送りました</b>　${esc(md(e.date))}　${esc(e.item)}　${yen(e.expense)}（${e.month}月分の返金）
      <div class="btn-row"><a class="btn btn-line" href="${lineUrl(lineText(e))}" target="_blank" rel="noopener">LINEで会計担当に知らせる</a>
      <button class="btn btn-sub btn-small" data-act="unsent">閉じる</button></div>
      <p class="hint">LINEが開いたら、会計担当（またはグループ）を選んで送ってください。</p>
    </div>`;
  }

  function mineHtml() {
    if (S.info.role !== 'coach' && S.info.role !== 'admin') return '';
    if (S.info.role === 'admin') return '';
    const who = whoName();
    let body;
    if (!who) body = '<p class="hint">上で名前を選ぶと、これまでに入れたものが出ます。</p>';
    else if (!S.entries) body = '<p class="hint">読みこんでいます…</p>';
    else if (!S.entries.length) body = '<p class="hint">まだありません。</p>';
    else body = byMonth(S.entries).map(([m, list]) => `
      <h3 class="kk-month">${m}月分 <small>${list.length}件　${yen(sum(list))}</small></h3>
      ${list.map((e) => entryHtml(e, { mine: true })).join('')}`).join('');
    return `<section class="card"><h2><span class="num">2</span>${esc(who || 'あなた')}の入力</h2>${body}
      <p class="hint">会計担当（運営役員）がチェックするまでは、自分で直したり消したりできます。</p></section>`;
  }

  const sum = (list) => list.reduce((a, e) => a + e.expense, 0);
  /** 月ごと（新しい月から） */
  function byMonth(list) {
    const g = new Map();
    list.forEach((e) => { const m = e.month || 0; if (!g.has(m)) g.set(m, []); g.get(m).push(e); });
    return [...g.entries()].sort((a, b) => MONTHS.indexOf(b[0]) - MONTHS.indexOf(a[0]))
      .map(([m, l]) => [m, l.sort((x, y) => (y.date > x.date ? 1 : -1))]);
  }

  function entryHtml(e, { mine = false, check = false } = {}) {
    const files = e.files.map((id, i) => `<button class="btn btn-sub btn-small" data-act="view" data-file="${esc(id)}">📎${e.files.length > 1 ? i + 1 : '領収書'}</button>`).join(' ');
    const status = e.checker ? `<span class="kk-chip ok">チェック済み（${esc(e.checker)}）</span>` : '<span class="kk-chip">まだチェックしていない</span>';
    const ops = [];
    if (mine && !e.checker && e.id) ops.push(`<button class="btn btn-sub btn-small" data-act="edit" data-id="${esc(e.id)}">直す</button>`, `<button class="btn btn-sub btn-small" data-act="del" data-id="${esc(e.id)}" data-busy>消す</button>`);
    if (check && e.id) ops.push(e.checker ? `<button class="btn btn-sub btn-small" data-act="uncheck" data-id="${esc(e.id)}" data-busy>チェックを外す</button>` : `<button class="btn btn-main btn-small" data-act="check" data-id="${esc(e.id)}" data-busy>✔ チェック</button>`);
    if (S.info.role === 'admin' && e.id) ops.push(`<button class="btn btn-sub btn-small" data-act="edit" data-id="${esc(e.id)}">直す</button>`);
    return `<div class="kk-entry">
      <div class="kk-line"><span class="kk-date">${esc(md(e.date))}</span><span class="kk-item">${esc(e.item)}</span><b class="kk-amt">${yen(e.expense)}</b></div>
      <div class="kk-detail">${esc(e.detail)}${e.id ? '' : ' <small>（スプレッドシートで入力）</small>'}</div>
      <div class="kk-line kk-ops">${status} ${files} ${ops.join(' ')}</div>
    </div>`;
  }

  // ----- 返金の一覧 -----
  function refundHtml() {
    const { settings, officers, role } = { ...S.info, role: S.info.role };
    if (!S.entries) return '<section class="card"><p class="hint">読みこんでいます…</p></section>';
    const closed = lastClosedMonth(settings);
    if (S.month == null) S.month = closed;
    const counts = Object.fromEntries(MONTHS.map((m) => [m, S.entries.filter((e) => e.month === m).length]));
    const list = S.entries.filter((e) => e.month === S.month);
    const people = new Map();
    list.forEach((e) => { if (!people.has(e.who)) people.set(e.who, []); people.get(e.who).push(e); });
    const rows = [...people.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));
    const unchecked = list.filter((e) => !e.checker).length;
    const isOpenMonth = MONTHS.indexOf(S.month) > MONTHS.indexOf(closed);
    const canCheck = role === 'officer' || role === 'admin';
    return `
      <section class="card">
        <h2><span class="num">1</span>返金の一覧</h2>
        <div class="grid">
          <div><label>月</label><select id="kk-month">${MONTHS.map((m) => `<option value="${m}" ${m === S.month ? 'selected' : ''}>${m}月分${counts[m] ? `（${counts[m]}件）` : ''}</option>`).join('')}</select></div>
          ${canCheck ? `<div><label>チェックする人</label><select id="kk-officer"><option value="">えらんでください</option>${officers.map((o) => `<option ${o === S.officer ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>` : ''}
        </div>
        ${isOpenMonth ? `<div class="notice">${S.month}月分は、まだ締めていません（締め日：${cutoffText(cutoffOf(settings, S.month))}）。これから増えることがあります。</div>` : ''}
        ${rows.length ? `
        <table class="kk-sum">
          <tr><th>名前</th><th>件数</th><th>返金額</th></tr>
          ${rows.map(([who, l]) => `<tr data-act="toggle" data-who="${esc(who)}" class="${S.open[who] ? 'open' : ''}"><td>${S.open[who] ? '▾' : '▸'} ${esc(who)}${l.some((e) => !e.checker) ? ' <span class="kk-chip">未チェック</span>' : ''}</td><td>${l.length}</td><td><b>${yen(sum(l))}</b></td></tr>
            ${S.open[who] ? `<tr class="kk-sub"><td colspan="3">${l.map((e) => entryHtml(e, { check: canCheck })).join('')}</td></tr>` : ''}`).join('')}
          <tr class="kk-total"><td>合計</td><td>${list.length}</td><td><b>${yen(sum(list))}</b></td></tr>
        </table>
        ${unchecked ? `<p class="hint">まだチェックしていないものが ${unchecked}件 あります。</p>` : '<p class="hint">ぜんぶチェック済みです。</p>'}`
        : `<p class="hint">${S.month}月分の立替はありません。</p>`}
        <p class="hint">名前をおすと、明細と領収書が出ます。スプレッドシートで直接入れた立替も入っています（チェックはスプレッドシートで）。</p>
        <div class="btn-row"><button class="btn btn-sub btn-small" data-act="reload" data-busy>↻ 新しくする</button></div>
      </section>`;
  }

  // ----- 設定 -----
  function settingsHtml() {
    const s = S.info.settings;
    const opt = (v, blank) => `${blank ? `<option value="" ${!v ? 'selected' : ''}>${blank}</option>` : ''}${Array.from({ length: 31 }, (_, i) => i + 1).map((n) => `<option value="${n}" ${n === Number(v) ? 'selected' : ''}>${cutoffText(n)}</option>`).join('')}`;
    return `
      <section class="card">
        <h2><span class="num">1</span>締め日</h2>
        <div class="grid"><div><label>毎月の締め日</label><select id="kk-cut">${opt(s.cutoff)}</select></div></div>
        <p class="hint">締め日までに買ったものが、その月の返金になります。締め日より後に買ったものは次の月に回ります（3月は年度末なので、3月のまま）。</p>
        <details ${Object.keys(s.months || {}).length ? 'open' : ''}><summary>この月だけ締め日を変える</summary>
          <div class="grid kk-months">${MONTHS.map((m) => `<div><label>${m}月</label><select data-cutm="${m}">${opt(s.months?.[m], 'いつもどおり')}</select></div>`).join('')}</div>
        </details>
        <div class="btn-row"><button class="btn btn-main" data-act="saveCut" data-busy>締め日を保存</button></div>
        <p class="hint">締め日を変えると、その月にアプリで入れた立替の「月」も計算し直します。</p>
      </section>
      <section class="card">
        <h2><span class="num">2</span>コーチの一覧</h2>
        <ul class="kk-coaches">${S.info.coaches.map((c, i) => `<li>${esc(c)} <button class="btn btn-sub btn-small" data-act="rmCoach" data-i="${i}">✕ 消す</button></li>`).join('')}</ul>
        <div class="inline kk-add"><input type="text" id="kk-newcoach" placeholder="足す名前"><button class="btn btn-sub btn-small" data-act="addCoach">＋ 足す</button></div>
        <div class="btn-row"><button class="btn btn-main" data-act="saveCoaches" data-busy>一覧を保存</button></div>
        <p class="hint">スプレッドシートの「分類」の「請求者」の列が書きかわります。やめた人を消しても、これまでの入力は消えません。</p>
      </section>
      <section class="card">
        <h2><span class="num">3</span>合言葉を変える</h2>
        <div class="grid">
          <div><label>① 代表・会計担当</label><input type="text" id="kk-p1" autocomplete="off"></div>
          <div><label>② コーチ</label><input type="text" id="kk-p2" autocomplete="off"></div>
          <div><label>③ 運営役員</label><input type="text" id="kk-p3" autocomplete="off"></div>
        </div>
        <p class="hint">3つとも入れてください（6文字以上・3つとも別のもの）。変えたら、新しい合言葉をそれぞれの人に伝えてください。</p>
        <div class="btn-row"><button class="btn btn-main" data-act="savePass" data-busy>合言葉を変える</button></div>
      </section>`;
  }

  // ---------- 領収書を見る ----------
  async function viewReceipt(id) {
    try {
      const r = await call({ action: 'receipt', fileId: id }, '領収書を読みこんでいます…');
      const bytes = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      const box = document.createElement('div');
      box.className = 'kk-modal';
      box.innerHTML = `<div class="kk-modal-in">
        <div class="kk-line"><b>${esc(r.name)}</b><button class="btn btn-sub btn-small" data-close>✕ 閉じる</button></div>
        ${/^image\//.test(r.mime) ? `<img src="${url}" alt="領収書">` : `<p><a class="btn btn-main" href="${url}" target="_blank" rel="noopener">PDFを開く</a></p><iframe src="${url}" title="領収書"></iframe>`}
      </div>`;
      const close = () => { box.remove(); URL.revokeObjectURL(url); };
      box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-close]')) close(); });
      document.body.appendChild(box);
    } catch (err) { fail(err); }
  }

  // ---------- 送る ----------
  async function send() {
    const who = whoName();
    const f = S.form;
    const bad = [];
    if (!who) bad.push('名前');
    if (!parseYmd(f.date)) bad.push('買った日');
    if (!f.item) bad.push('項目');
    if (!(Number(String(f.amount).replace(/[,，円¥￥\s]/g, '')) > 0)) bad.push('金額');
    if (!f.detail.trim()) bad.push('明細');
    if (bad.length) { ui.toast(bad.join('・') + 'を入れてください'); return; }
    if (!S.keep.length && !S.files.length && !confirm('領収書がついていません。このまま送りますか？')) return;
    const entry = { ...f, who };
    try {
      const r = S.editing
        ? await call({ action: 'update', id: S.editing, entry, keep: S.keep, files: S.files.map(strip) }, '送っています…')
        : await call({ action: 'add', entry, files: S.files.map(strip) }, '送っています…');
      S.sent = r.entry;
      S.form = { ...emptyForm(), date: f.date };
      S.files = []; S.keep = []; S.editing = null;
      ui.toast('送りました');
      draw();
      loadEntries();
    } catch (err) { fail(err); }
  }
  const strip = (x) => ({ name: x.name, mime: x.mime, b64: x.b64 });

  async function addFiles(list) {
    const room = 5 - S.keep.length - S.files.length;
    const pick = [...list].slice(0, room);
    if (list.length > room) ui.toast('領収書は5枚までです');
    for (const file of pick) {
      try { S.files.push(await prepareFile(file)); } catch (err) { ui.toast(err.message); }
    }
    draw();
  }

  function startEdit(id) {
    const e = S.entries.find((x) => x.id === id); if (!e) return;
    S.editing = id; S.sent = null;
    S.form = { date: e.date, item: e.item, detail: e.detail, amount: String(e.expense) };
    S.keep = [...e.files]; S.files = [];
    if (S.info.role === 'admin') {
      S.view = 'input';
      if (S.info.coaches.includes(e.who)) S.who = e.who; else { S.who = OTHER; S.otherName = e.who; }
    }
    draw();
    root.scrollIntoView({ behavior: 'smooth' });
  }

  // ---------- 操作 ----------
  root.onclick = async (ev) => {
    const v = ev.target.closest('[data-view]');
    if (v) { S.view = v.dataset.view; put('view', S.view); S.editing = null; draw(); return; }
    const b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'logout') logout();
    else if (act === 'view') viewReceipt(b.dataset.file);
    else if (act === 'unfile') { S.files.splice(+b.dataset.i, 1); draw(); }
    else if (act === 'unkeep') { S.keep.splice(+b.dataset.i, 1); draw(); }
    else if (act === 'send') send();
    else if (act === 'unsent') { S.sent = null; draw(); }
    else if (act === 'cancel') { S.editing = null; S.form = emptyForm(); S.files = []; S.keep = []; draw(); }
    else if (act === 'edit') startEdit(id);
    else if (act === 'del') {
      if (!confirm('この入力を消しますか？（領収書もいっしょに消えます）')) return;
      try { await call({ action: 'delete', id }, '消しています…'); ui.toast('消しました'); loadEntries(); } catch (err) { fail(err); }
    } else if (act === 'toggle') { S.open[b.dataset.who] = !S.open[b.dataset.who]; draw(); }
    else if (act === 'check' || act === 'uncheck') {
      const name = act === 'check' ? S.officer : '';
      if (act === 'check' && !name) { ui.toast('「チェックする人」を選んでください'); $('#kk-officer')?.focus(); return; }
      try {
        const r = await call({ action: 'check', id, name }, '保存しています…');
        S.entries = S.entries.map((e) => (e.id === id ? r.entry : e));
        draw();
      } catch (err) { fail(err); }
    } else if (act === 'reload') loadEntries();
    else if (act === 'saveCut') {
      const months = {};
      root.querySelectorAll('[data-cutm]').forEach((s) => { if (s.value) months[s.dataset.cutm] = +s.value; });
      try {
        const r = await call({ action: 'saveSettings', cutoff: +$('#kk-cut').value, months }, '保存しています…');
        S.info.settings = r.settings;
        ui.toast('締め日を保存しました' + (r.moved ? `（${r.moved}件の月を計算し直しました）` : ''));
        draw(); loadEntries();
      } catch (err) { fail(err); }
    } else if (act === 'rmCoach') { S.info.coaches.splice(+b.dataset.i, 1); draw(); ui.toast('「一覧を保存」を押すと決まります'); }
    else if (act === 'addCoach') {
      const n = $('#kk-newcoach').value.trim();
      if (n && !S.info.coaches.includes(n)) S.info.coaches.push(n);
      draw(); $('#kk-newcoach')?.focus();
    } else if (act === 'saveCoaches') {
      try { const r = await call({ action: 'saveCoaches', coaches: S.info.coaches }, '保存しています…'); S.info.coaches = r.coaches; ui.toast('コーチの一覧を保存しました'); draw(); } catch (err) { fail(err); }
    } else if (act === 'savePass') {
      const p = ['#kk-p1', '#kk-p2', '#kk-p3'].map((s) => $(s).value.trim());
      if (p.some((x) => x.length < 6)) { ui.toast('3つとも6文字以上で入れてください'); return; }
      if (new Set(p).size < 3) { ui.toast('3つとも別の合言葉にしてください'); return; }
      if (!confirm('合言葉を変えます。前の合言葉は使えなくなります。よいですか？')) return;
      try {
        await call({ action: 'savePass', admin: p[0], coach: p[1], officer: p[2] }, '保存しています…');
        const keep = !!localStorage.getItem(KEY + ':pass');
        S.pass = p[0]; put('pass', p[0], keep);
        ui.toast('合言葉を変えました'); draw();
      } catch (err) { fail(err); }
    }
  };

  root.onchange = (ev) => {
    const t = ev.target;
    if (t.id === 'kk-who') { S.who = t.value; if (t.value !== OTHER) put('who', t.value); S.entries = null; S.sent = null; draw(); loadEntries(); }
    else if (t.id === 'kk-item') S.form.item = t.value;
    else if (t.id === 'kk-date') { S.form.date = t.value; draw(); }
    else if (t.id === 'kk-file') addFiles(t.files);
    else if (t.id === 'kk-month') { S.month = +t.value; S.open = {}; draw(); }
    else if (t.id === 'kk-officer') { S.officer = t.value; put('officer', t.value); }
    else if (t.id === 'kk-other') { S.otherName = t.value; loadEntries(); }
  };
  root.oninput = (ev) => {
    const t = ev.target;
    if (t.id === 'kk-amount') S.form.amount = t.value;
    else if (t.id === 'kk-detail') S.form.detail = t.value;
    else if (t.id === 'kk-other') S.otherName = t.value;
  };

  draw();
  if (S.pass && apiUrl()) login(S.pass, !!(() => { try { return localStorage.getItem(KEY + ':pass'); } catch { return ''; } })());
}
