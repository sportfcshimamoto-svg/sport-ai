// SPORT AI事務局：日程タブ
// 日にちを選んで「いつものセット」を押す → Googleカレンダー（SPORTの活動予定）に、いつもの件名・終日・学年の色で入る。
// Googleの側：gas/nittei/Code.gs。この端末に残すのは、合言葉（「覚えておく」のとき）だけ。
import { api, apiUrl, GRADES, COLOR_CSS, PLACES, normPlace, parseTitle, titleOf, colorOf, gradeLabel, splitItems, withSundayKids, withU15, shortSlotItems, guessPreset, isShortYodoiko, dayInfo, cupOf, cupTimes, dropBusy, fitsItems, planTM, matchCounts, matchDays, tmSlotsOf, TM_GRADES, coachLineText, lineUrl, ymd, parseYmd, mdw, pad } from './lib/nittei.js';
import { timeField } from './lib/time-input.js';
import { teamField, bindPickers, rememberTeam } from './lib/team-memory.js';

const KEY = 'sport-ai:nittei:v1';
const OTHER = '__other';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const get = (k) => { try { return localStorage.getItem(KEY + ':' + k) || sessionStorage.getItem(KEY + ':' + k) || ''; } catch { return ''; } };
const put = (k, v, keep = true) => {
  try {
    localStorage.removeItem(KEY + ':' + k); sessionStorage.removeItem(KEY + ':' + k);
    if (v) (keep ? localStorage : sessionStorage).setItem(KEY + ':' + k, v);
  } catch { /* 保存できなくても使える */ }
};

/** 次の土曜日（今日が土日なら今日） */
function nextWeekend() {
  const d = new Date();
  if (d.getDay() !== 0 && d.getDay() !== 6) d.setDate(d.getDate() + (6 - d.getDay()));
  return ymd(d);
}
const monthOf = (s) => String(s).slice(0, 7);
const emptyForm = () => ({ place: PLACES[0], other: '', grades: [], start: '9:00', end: '10:45', kind: '', note: '', vs: '' });
/** 種類（2026年11月23日 本人：TMとカップ戦を選べるように） */
const KINDS = [{ id: '', label: '練習' }, { id: 'TM', label: 'TM' }, { id: 'カップ戦', label: 'カップ戦' }];
/**
 * 件名の学年のあとに入れる言葉：種類＋メモ＋対戦相手（同じ日 本人「TMでもカップ戦でも対戦相手を」）
 * →「4年 TM 高槻如是FC 9:00-12:00 …」「4年 カップ戦 高槻如是FC 9:00-15:00 …」。種類なしで相手だけ入れたときは「TM」
 */
const formNote = (f) => [f.kind || (f.vs.trim() && !f.note.trim() ? 'TM' : ''), f.note.trim(), f.vs.trim()].filter(Boolean).join(' ');

export function renderNittei(host, ui) {
  host.innerHTML = '<div class="nt"></div>';
  const root = host.firstChild;
  const S = {
    pass: get('pass'), info: null, date: nextWeekend(), draft: [], form: emptyForm(),
    month: monthOf(nextWeekend()), events: null, editSets: false, busy: '',
    slots: null, slotNote: '', slotPick: {}, slotOn: {}, tmPick: {}, edit: null,
    line: null,   // コーチ担当に送る文を手で直したとき { month, text }
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
    const m = $('#nt-busy'); if (m) { m.textContent = S.busy; m.hidden = !S.busy; }
  }
  const fail = (err) => { console.error(err); if (!err.badPass) ui.toast(err.message); };

  // ---------- 入る ----------
  async function login(pass, keep) {
    S.pass = pass;
    try {
      S.info = await call({ action: 'init' }, '確かめています…');
      put('pass', pass, keep);
      draw();
      loadMonth();
    } catch (err) { S.pass = ''; fail(err); draw(); }
  }
  function logout() {
    put('pass', '');
    Object.assign(S, { pass: '', info: null, events: null, draft: [] });
    draw();
  }
  async function loadMonth() {
    const month = S.month;
    S.events = null; S.slots = null; drawList();
    let events = [];
    let live = [];
    try { const r = await call({ action: 'list', month }); events = r.events; live = r.live || []; } catch (err) { fail(err); }
    if (S.month !== month) return;   // 待っているあいだに月を変えたときは、古い返事を使わない
    S.events = events; S.live = live;
    drawList();
    if (S.info) loadSlots();
  }

  // ---------- 予定を足す ----------
  const placeOf = () => (S.form.place === OTHER ? S.form.other.trim() : S.form.place);
  function addItems(items, date = S.date) {
    splitItems(items).forEach((it) => {
      const title = titleOf(it);
      if (!title) return;
      if (S.draft.some((d) => d.date === date && d.title === title)) return;   // 同じものは1つだけ
      S.draft.push({ date, title, color: colorOf(it.grades), src: it });
    });
    S.draft.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  const presetItems = (p) => p.items.map((it) => ({ ...it, place: normPlace(it.place || p.place) }));
  /** その日にそのセットで入る予定（日曜は KIDs 9:00-10:00 も。KIDs・U15 は1件ずつ） */
  /** その日にもう入っている予定の件名（入れるカレンダー＋テストのあいだは本物のカレンダーも） */
  // 何日もつづく予定（「5年大会」12/5〜12/6 など）は、毎日に数える（2026年11月23日）。end はGoogleの側が返す最後の日
  const covers = (e, date) => e.date <= date && date <= (e.end || e.date);
  const allEvents = () => [...(S.events || []), ...(S.live || [])];
  const titlesOn = (date) => allEvents().filter((e) => covers(e, date)).map((e) => e.title);
  /** その予定が入っている日の一覧 */
  const daysOfEv = (e) => { const out = []; for (let d = parseYmd(e.date); d && ymd(d) <= (e.end || e.date) && out.length < 31; d.setDate(d.getDate() + 1)) out.push(ymd(d)); return out; };
  const cupsOn = (date) => (S.info?.cups || []).filter((c) => c.date === date);
  /** その日の練習を変えること：抜く学年（スポルト杯・カップ戦・TMなど）とスポルト杯の時間（2026年11月23日 本人） */
  const dayOf = (date) => dayInfo(titlesOn(date), cupsOn(date));
  /**
   * その日にそのセットで入る予定。日曜は KIDs 9:00-10:00 も。スポルト杯の日は時間を変える。
   * スポルト杯・TMなどがもう入っている学年は抜く。KIDs・U15 は1件ずつ
   */
  function itemsFor(p, date, slot) {
    const day = dayOf(date);
    // 割り振ったTM（2026年11月23日 本人）。その学年は練習から抜く
    const tm = slot ? (tmPlan().get(slotKey(slot)) || []) : [];
    const busy = new Set([...day.busy, ...tm.map((x) => x.grade)]);
    // U15 は 4,5年と同じ時間（一小は入れない）。KIDs は日曜に、ほかの学年のはじめの1時間（2026年11月23日 本人）
    let items = withSundayKids(withU15(shortSlotItems(presetItems(p), slot)), date, slot, kidsMoveDays());
    if (day.cup) items = cupTimes(items, day.cup);
    const tmItems = tm.map((x) => ({ grades: [x.grade], start: x.start, end: x.end, place: normPlace(slot.place), tmPlan: true }));
    return splitItems([...dropBusy(items, busy), ...tmItems]);
  }
  /**
   * TMの割り振り（その月の取れた枠ぜんぶ）。1か月で試合の回数がそろうように、同じなら上の学年。
   * 手でプルダウンを変えたところ（S.tmPick）はそのまま
   */
  function tmPlan() {
    if (!S.slots || !S.info) return new Map();
    const evs = allEvents();
    return planTM(S.slots, {
      titlesOn, keyOf: slotKey, picks: S.tmPick,
      isCup: (d) => cupDays().has(d),
      counts: matchCounts(evs, S.month),
      days: matchDays(evs, true),
    });
  }
  /** KIDsを日曜から前の土曜に移す日：スポルト杯の日曜、1年生がTM・大会などの日曜（土曜も1年の試合なら移さない）、ピンクの枠がない日曜（2026年11月23日 本人） */
  function kidsMoveDays() {
    const out = cupDays();
    if (S.slots) {
      const has = new Set(S.slots.map((s) => s.date));
      const [y, m] = S.month.split('-').map(Number);
      for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0 && !has.has(ymd(d))) out.add(ymd(d));
      }
    }
    // 1年生がTM・大会など（カレンダーにあるものと、TMの割り振り）の日曜は、KIDsを前の土曜に。
    // ただし、その土曜にも1年生の試合があれば日曜のまま。土曜にピンクの枠がないときも日曜のまま（2026年11月23日 本人）
    const ones = new Set(matchDays(allEvents())['1']);
    for (const [k, list] of tmPlan()) if (list.some((x) => x.grade === '1')) ones.add(k.split('|')[0]);
    const satSlots = S.slots ? new Set(S.slots.map((s) => s.date)) : null;
    for (const date of ones) {
      const d = parseYmd(date);
      if (!d || d.getDay() !== 0) continue;
      const sat = new Date(d); sat.setDate(d.getDate() - 1);
      if (!ones.has(ymd(sat)) && (!satSlots || satSlots.has(ymd(sat)))) out.add(date);
    }
    return out;
  }
  /** スポルトカップの日（アプリの「スポルトカップ」で入れた日と、カレンダーに「SPORT杯」がある日） */
  const cupDays = () => new Set([...(S.info?.cups || []).map((c) => c.date), ...allEvents().filter((e) => cupOf(e.title)).flatMap(daysOfEv)]);
  /** その枠に、セットの予定が時間どおりに入るか */
  function fitsFor(s, p) {
    if (!p) return false;
    const items = itemsFor(p, s.date, s);
    if (!items.length) return false;
    if (isShortYodoiko(s) && !dayOf(s.date).cup) return true;   // 2時間枠は、時間をそろえて入れる（shortSlotItems）
    return fitsItems(s, items);
  }

  // ----- スプレッドシートで取れた枠 -----
  const slotKey = (s) => `${s.date}|${s.place}|${s.start}|${s.end}`;
  const pickOf = (s) => { const k = slotKey(s); return k in S.slotPick ? S.slotPick[k] : guessPreset(s, S.info.presets); };
  /** その枠のセットの予定が、もう全部カレンダーにあるか */
  function slotDone(s) {
    const p = S.info.presets[pickOf(s)];
    if (!p || !S.events) return false;
    const have = new Set(S.events.filter((e) => e.date === s.date).map((e) => e.title));
    const items = itemsFor(p, s.date, s);
    return items.length > 0 && items.every((it) => have.has(titleOf(it)));
  }
  const slotOn = (s) => { const k = slotKey(s); return k in S.slotOn ? S.slotOn[k] : !slotDone(s) && fitsFor(s, S.info.presets[pickOf(s)]); };   // 時間が合わないセットは、はじめはチェックしない
  async function loadSlots() {
    const month = S.month;
    S.slots = null; S.slotNote = ''; drawSlots();
    let slots = [], note = '';
    try {
      const r = await call({ action: 'slots', month }, 'スプレッドシートを読んでいます…');
      slots = r.slots; note = r.note || '';
    } catch (err) { note = err.message; if (!err.badPass) console.error(err); }
    if (S.month !== month) return;
    S.slots = slots; S.slotNote = note;
    drawSlots();
  }
  async function sendSlots() {
    const list = (S.slots || []).filter((s) => slotOn(s) && S.info.presets[pickOf(s)] && itemsFor(S.info.presets[pickOf(s)], s.date, s).length);
    if (!list.length) { ui.toast('チェックした枠がありません'); return; }
    if (!confirm(`チェックした ${list.length} 日分を、カレンダーに入れます。よろしいですか？`)) return;
    list.forEach((s) => addItems(itemsFor(S.info.presets[pickOf(s)], s.date, s), s.date));
    await send();   // 外したチェックは覚えたまま（TMの日などをまちがえて入れないため）
  }

  // ----- スポルトカップの日 -----
  async function saveCups(list, msg) {
    try {
      const r = await call({ action: 'saveCups', cups: list }, '保存しています…');
      S.info.cups = r.cups;
      if (msg) ui.toast(msg);
      draw();
    } catch (err) { fail(err); }
  }
  /** カレンダーに入れるスポルトカップの件名：「SPORT杯 4年 9:00-15:00」 */
  const cupTitle = (c) => ['SPORT杯', c.grade ? gradeLabel([c.grade]) : '', c.time].filter(Boolean).join(' ');
  async function addCup() {
    const d = $('#nt-cup-date').value, grade = $('#nt-cup-grade').value, time = $('#nt-cup-time').value;
    if (!parseYmd(d)) { ui.toast('日にちをえらんでください'); return; }
    if (!grade) { ui.toast('学年をえらんでください'); return; }
    const c = { date: d, grade, time, memo: '' };
    // カレンダーにも「SPORT杯 4年 9:00-15:00」を入れる（同じ件名がもうあれば入れない）
    try {
      await call({ action: 'add', items: [{ date: d, title: cupTitle(c), color: colorOf([grade]) }] }, 'カレンダーに入れています…');
    } catch (err) { fail(err); return; }
    const rest = (S.info.cups || []).filter((x) => !(x.date === d && x.grade === grade));
    await saveCups([...rest, c], `${mdw(d)}「${cupTitle(c)}」を入れました`);
    if (monthOf(d) === S.month) loadMonth();
  }
  async function delCup(date, grade) {
    const c = (S.info.cups || []).find((x) => x.date === date && (x.grade || '') === (grade || ''));
    if (!c || !confirm(`${mdw(date)}「${cupTitle(c)}」を外しますか？（アプリで入れたカレンダーの予定も消します）`)) return;
    try {
      // その月の予定から、アプリで入れた同じ件名のものを消す
      const ev = (await call({ action: 'list', month: monthOf(date) }, '消しています…')).events.find((e) => e.date === date && e.mine && e.title === cupTitle(c));
      if (ev) await call({ action: 'delete', id: ev.id }, '消しています…');
    } catch (err) { fail(err); return; }
    await saveCups((S.info.cups || []).filter((x) => x !== c), '外しました');
    if (monthOf(date) === S.month) loadMonth();
  }

  function usePreset(i) {
    const p = S.info.presets[i];
    if (!p) return;
    addItems(itemsFor(p, S.date));
    ui.toast(`${mdw(S.date)} に「${p.name}」を足しました`);
    draw();
  }
  function addOne() {
    const f = S.form;
    if (!f.grades.length) { ui.toast('学年をえらんでください'); return; }
    if (f.place === OTHER && !f.other.trim()) { ui.toast('場所を書いてください'); return; }
    addItems([{ grades: f.grades, start: f.start, end: f.end, note: formNote(f), place: placeOf() }]);
    S.form = { ...emptyForm(), place: f.place, other: f.other, start: f.start, end: f.end };
    draw();
  }
  async function send() {
    if (!S.draft.length) return;
    try {
      const r = await call({ action: 'add', items: S.draft.map(({ date, title, color }) => ({ date, title, color })) }, 'カレンダーに入れています…');
      const msg = `${r.added.length}件 入れました` + (r.skipped.length ? `（${r.skipped.length}件は、もう入っていたので飛ばしました）` : '');
      ui.toast(msg);
      S.month = monthOf(S.draft[0].date);
      S.draft = [];
      draw();
      loadMonth();
    } catch (err) { fail(err); }
  }
  async function savePreset() {
    if (!S.draft.length) return;
    const name = (prompt('セットの名前（例：よどいこ 午前）') || '').trim();
    if (!name) return;
    const first = S.draft.filter((d) => d.date === S.draft[0].date);
    const preset = { name, place: first[0].src.place, items: first.map((d) => ({ grades: d.src.grades, start: d.src.start, end: d.src.end, note: d.src.note || '', place: d.src.place })) };
    try {
      const r = await call({ action: 'savePresets', presets: [...S.info.presets, preset] }, 'セットを保存しています…');
      S.info.presets = r.presets;
      ui.toast(`「${name}」をいつものセットにしました`);
      draw();
    } catch (err) { fail(err); }
  }
  async function deletePreset(i) {
    const p = S.info.presets[i];
    if (!p || !confirm(`いつものセット「${p.name}」を消しますか？`)) return;
    try {
      const r = await call({ action: 'savePresets', presets: S.info.presets.filter((_, j) => j !== i) }, 'セットを消しています…');
      S.info.presets = r.presets;
      draw();
    } catch (err) { fail(err); }
  }
  // ----- 予定を直す（手で入れた予定も。2026年11月23日 本人） -----
  function startEdit(id) {
    const ev = (S.events || []).find((e) => e.id === id);
    if (!ev) return;
    const p = parseTitle(ev.title);
    S.edit = p
      ? { id, date: ev.date, form: true, grades: p.grades, start: p.start, end: p.end, note: p.note, place: PLACES.includes(p.place) ? p.place : OTHER, other: PLACES.includes(p.place) ? '' : p.place }
      : { id, date: ev.date, form: false, title: ev.title };
    drawList();
  }
  /** 直したあとの件名と色。まちがいがあれば { err } */
  function editResult() {
    const f = S.edit;
    if (!f.form) return f.title.trim() ? { title: f.title.trim(), color: '' } : { err: '件名を書いてください' };
    if (!f.grades.length) return { err: '学年をえらんでください' };
    const items = splitItems([{ grades: f.grades, start: f.start, end: f.end, note: f.note, place: f.place === OTHER ? f.other : f.place }]);
    if (items.length > 1) return { err: 'KIDs・U15は、ほかの学年とは別の予定にしてください' };
    return { title: titleOf(items[0]), color: colorOf(items[0].grades) };
  }
  async function saveEdit() {
    const f = S.edit, ev = (S.events || []).find((e) => e.id === f?.id);
    if (!ev) return;
    if (!parseYmd(f.date)) { ui.toast('日にちをえらんでください'); return; }
    const r = editResult();
    if (r.err) { ui.toast(r.err); return; }
    try {
      const out = await call({ action: 'update', id: f.id, date: f.date, title: r.title, color: r.color }, '直しています…');
      S.events = S.events.filter((e) => e.id !== f.id);
      if (monthOf(out.event.date) === S.month) S.events.push(out.event);
      S.edit = null;
      ui.toast(`${mdw(out.event.date)}「${out.event.title}」に直しました`);
      drawList();
    } catch (err) { fail(err); }
  }
  function editHtml() {
    const f = S.edit;
    const r = editResult();
    const body = f.form ? `
      <label>学年</label>
      <div class="nt-grades">${GRADES.map((g) => `<button class="nt-g ${f.grades.includes(g.id) ? 'on' : ''}" style="--c:${g.css}" data-act="egrade" data-g="${g.id}">${g.label}</button>`).join('')}</div>
      <div class="grid">
        <div><label>はじまり</label><input id="nt-e-start" value="${esc(f.start)}"></div>
        <div><label>おわり</label><input id="nt-e-end" value="${esc(f.end)}"></div>
        <div><label>場所</label><select id="nt-e-place">${PLACES.map((p) => `<option ${p === f.place ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="${OTHER}" ${f.place === OTHER ? 'selected' : ''}>そのほか（書く）</option></select>
          ${f.place === OTHER ? `<input type="text" id="nt-e-other" value="${esc(f.other)}" placeholder="例：二小" style="margin-top:6px">` : ''}</div>
        <div><label>メモ <small>（なくてよい）</small></label><input type="text" id="nt-e-note" value="${esc(f.note)}" placeholder="例：TM／カップ戦" maxlength="30"></div>
      </div>` : `<label>件名</label><input type="text" id="nt-e-title" value="${esc(f.title)}" maxlength="200">`;
    return `<div class="nt-edit">
      <label>日にち</label><input type="date" id="nt-e-date" value="${esc(f.date)}">
      ${body}
      <p class="hint" id="nt-e-preview">${r.err ? esc(r.err) : `→ <b>${esc(r.title)}</b>`}</p>
      <div class="btn-row"><button class="btn btn-main" data-act="saveEdit" data-busy>この内容に直す</button><button class="btn btn-sub btn-small" data-act="cancelEdit">やめる</button></div>
    </div>`;
  }
  function paintEditPreview() {
    const p = $('#nt-e-preview');
    if (!p) return;
    const r = editResult();
    p.innerHTML = r.err ? esc(r.err) : `→ <b>${esc(r.title)}</b>`;
  }

  async function deleteEvent(id) {
    const ev = (S.events || []).find((e) => e.id === id);
    if (!ev || !confirm(`${mdw(ev.date)}「${ev.title}」をカレンダーから消しますか？`)) return;
    try {
      await call({ action: 'delete', id }, '消しています…');
      S.events = S.events.filter((e) => e.id !== id);
      ui.toast('消しました');
      drawList();
    } catch (err) { fail(err); }
  }

  // ---------- 描く ----------
  function draw() {
    if (!apiUrl()) {
      root.innerHTML = `<section class="card"><h2><span class="num">📅</span>日程</h2>
        <div class="notice">日程タブは、いま準備中です。もうしばらくお待ちください。</div></section>`;
      return;
    }
    if (!S.info) { drawLogin(); return; }
    root.innerHTML = `
      <section class="card kk-who">
        <div>「<b>${esc(S.info.calendar)}</b>」カレンダーに入れます</div>
        <button class="btn btn-sub btn-small" data-act="logout">ぬける</button>
      </section>
      <div id="nt-busy" class="kk-busy" hidden></div>
      <section class="card nt-slots-card"><h2><span class="num">1</span>スプレッドシートで取れた枠 <small class="nt-sub">「時間」がピンクの枠。チェックして押すだけ</small></h2><div id="nt-slots"></div></section>
      ${dateHtml()}${presetHtml()}${oneHtml()}${draftHtml()}
      <section class="card"><h2><span class="num">5</span>カレンダーに入っている予定</h2><div id="nt-list"></div></section>
      <section class="card"><h2><span class="num">6</span>コーチ担当にLINEで知らせる <small class="nt-sub">この月のTM・カップ戦・大会と、これからあたる日程。送る前に書き足せます</small></h2><div id="nt-line"></div></section>
      ${cupHtml()}`;
    timeField($('#nt-start'), { blank: true });
    timeField($('#nt-end'), { blank: true });
    paintBusy();
    drawList();
  }

  function drawLogin() {
    root.innerHTML = `
      <section class="card">
        <h2><span class="num">📅</span>日程</h2>
        <p>合言葉を入れてください。</p>
        <form id="nt-login">
          <label for="nt-pass">合言葉</label>
          <input type="password" id="nt-pass" autocomplete="current-password" required>
          <label class="check"><input type="checkbox" id="nt-keep" checked>この端末で覚えておく（自分だけが使う端末のとき）</label>
          <div class="btn-row"><button class="btn btn-main btn-big" data-busy>入る</button></div>
        </form>
        <div id="nt-busy" class="kk-busy" hidden></div>
        <p class="hint">入れた予定は、チームのGoogleカレンダーに入ります。</p>
      </section>`;
    $('#nt-login').addEventListener('submit', (e) => { e.preventDefault(); login($('#nt-pass').value.trim(), $('#nt-keep').checked); });
  }

  function cupHtml() {
    const today = ymd(new Date());
    const list = S.info.cups || [];
    return `<section class="card">
      <h2><span class="num">⚙</span>スポルトカップ <small class="nt-sub">年度はじめに1回。カレンダーに「SPORT杯 ○年 時間」が入ります。日曜がカップの日は、KIDsを前の土曜日に入れます</small></h2>
      ${list.length ? list.map((c) => `<div class="nt-ev ${c.date < today ? 'nt-past' : ''}"><i style="background:${COLOR_CSS[colorOf([c.grade])] || '#999'}"></i><span><b>${esc(mdw(c.date))}</b> <small>${esc(c.date.slice(0, 4))}年</small> ${esc(cupTitle(c))}${c.memo ? ` <small>${esc(c.memo)}</small>` : ''}</span><button class="btn btn-sub btn-small" data-act="delCup" data-date="${esc(c.date)}" data-grade="${esc(c.grade || '')}" data-busy>✕</button></div>`).join('')
        : '<p class="hint">まだ入っていません。</p>'}
      <div class="grid nt-cup-add">
        <div><label>日にち</label><input type="date" id="nt-cup-date"></div>
        <div><label>学年</label><select id="nt-cup-grade"><option value="">えらんでください</option>${GRADES.filter((g) => /^\d$/.test(g.id)).map((g) => `<option value="${g.id}">${g.label}</option>`).join('')}</select></div>
        <div><label>時間</label><select id="nt-cup-time"><option>9:00-17:00</option><option>9:00-15:00</option></select></div>
      </div>
      <div class="btn-row"><button class="btn btn-sub" data-act="addCup" data-busy>＋ スポルトカップを入れる</button></div>
    </section>`;
  }

  function dateHtml() {
    return `<section class="card">
      <h2><span class="num">2</span>日にち <small class="nt-sub">ここから下は、手で足すとき（ピンクでない日・TMなど）</small></h2>
      <div class="nt-date"><input type="date" id="nt-date" value="${esc(S.date)}"><b>${esc(mdw(S.date))}</b></div>
    </section>`;
  }

  function presetHtml() {
    const sets = S.info.presets;
    return `<section class="card">
      <h2><span class="num">3</span>いつものセット <small class="nt-sub">押すと、下の「入れる予定」に足されます</small></h2>
      ${sets.length ? `<div class="nt-sets">${sets.map((p, i) => `
        <div class="nt-set">
          <button class="nt-set-btn" data-act="preset" data-i="${i}">
            <b>${esc(p.name)}</b>
            ${p.items.map((it) => `<small><i style="background:${COLOR_CSS[colorOf(it.grades)] || '#999'}"></i>${esc(titleOf({ ...it, place: '' }))}</small>`).join('')}
          </button>
          ${S.editSets ? `<button class="btn btn-sub btn-small nt-set-del" data-act="delPreset" data-i="${i}" data-busy>✕ 消す</button>` : ''}
        </div>`).join('')}</div>` : '<p class="hint">セットがありません。下で予定を作って「いつものセットにする」を押すと増やせます。</p>'}
      ${sets.length ? `<div class="btn-row"><button class="btn btn-sub btn-small" data-act="editSets">${S.editSets ? 'セットを直すのをやめる' : 'セットを消す'}</button></div>` : ''}
    </section>`;
  }

  function oneHtml() {
    const f = S.form;
    const preview = f.grades.length ? splitItems([{ ...f, note: formNote(f), place: placeOf() }]).map(titleOf).join(' ／ ') : '';
    return `<section class="card">
      <h2><span class="num">4</span>1つずつ足す <small class="nt-sub">TM・カップ戦など、いつもとちがう日</small></h2>
      <label>学年 <small>（いくつでも）</small></label>
      <div class="nt-grades">${GRADES.map((g) => `<button class="nt-g ${f.grades.includes(g.id) ? 'on' : ''}" style="--c:${g.css}" data-act="grade" data-g="${g.id}">${g.label}</button>`).join('')}</div>
      <label>種類</label>
      <div class="nt-kinds">${KINDS.map((k) => `<button class="nt-kind ${f.kind === k.id ? 'on' : ''}" data-act="kind" data-k="${esc(k.id)}">${esc(k.label)}</button>`).join('')}</div>
      ${f.kind ? `<label>対戦相手 <small>（▼ 選ぶ にないときは、欄に書いてください）</small></label>${teamField('id="nt-vs" maxlength="40"', f.vs, '例：高槻如是FC')}` : ''}
      <div class="grid">
        <div><label>はじまり</label><input id="nt-start" value="${esc(f.start)}"></div>
        <div><label>おわり</label><input id="nt-end" value="${esc(f.end)}"></div>
        <div><label>場所</label><select id="nt-place">${PLACES.map((p) => `<option ${p === f.place ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="${OTHER}" ${f.place === OTHER ? 'selected' : ''}>そのほか（書く）</option></select>
          ${f.place === OTHER ? `<input type="text" id="nt-other" value="${esc(f.other)}" placeholder="例：下鳥羽" style="margin-top:6px">` : ''}</div>
        <div><label>メモ <small>（なくてよい）</small></label><input type="text" id="nt-note" value="${esc(f.note)}" placeholder="例：午後／○○カップ" maxlength="30"></div>
      </div>
      <p class="hint" id="nt-preview">${preview ? `→ <b>${esc(preview)}</b>` : '学年をえらぶと、件名がここに出ます'}</p>
      <div class="btn-row"><button class="btn btn-sub" data-act="addOne">＋ 入れる予定に足す</button></div>
    </section>`;
  }

  function draftHtml() {
    if (!S.draft.length) return '';
    let last = '';
    const rows = S.draft.map((d, i) => {
      const head = d.date !== last ? `<div class="nt-day">${esc(mdw(d.date))}</div>` : '';
      last = d.date;
      return `${head}<div class="nt-ev"><i style="background:${COLOR_CSS[d.color] || '#999'}"></i><span>${esc(d.title)}</span><button class="btn btn-sub btn-small" data-act="undraft" data-i="${i}">✕</button></div>`;
    }).join('');
    return `<section class="card nt-draft">
      <h2><span class="num">✓</span>入れる予定（${S.draft.length}件）</h2>
      ${rows}
      <div class="btn-row">
        <button class="btn btn-main btn-big" data-act="send" data-busy>カレンダーに入れる</button>
        <button class="btn btn-sub btn-small" data-act="savePreset" data-busy>この内容をいつものセットにする</button>
        <button class="btn btn-sub btn-small" data-act="clearDraft">ぜんぶやめる</button>
      </div>
    </section>`;
  }

  function drawSlots() {
    const box = $('#nt-slots');
    if (!box) return;
    const [y, m] = S.month.split('-').map(Number);
    const nav = `<div class="nt-month"><button class="btn btn-sub btn-small" data-act="month" data-d="-1">◀</button><b>${y}年${m}月</b><button class="btn btn-sub btn-small" data-act="month" data-d="1">▶</button></div>`;
    if (!S.slots) { box.innerHTML = nav + '<p class="hint">スプレッドシートを読んでいます…（少し時間がかかります）</p>'; return; }
    if (!S.slots.length) { box.innerHTML = nav + `<p class="hint">${esc(S.slotNote || 'この月は、ピンクの枠がありません。')}</p>`; return; }
    const sets = S.info.presets;
    const plan = tmPlan();
    const rows = S.slots.map((s) => {
      const k = esc(slotKey(s)), pick = pickOf(s), p = sets[pick], done = slotDone(s), day = dayOf(s.date);
      const its = p ? itemsFor(p, s.date, s) : [];
      const why = [day.cup ? `スポルト杯${day.cup.end ? ` ${day.cup.start}-${day.cup.end}` : ''}の日${day.cup.end ? (/^1[6-9]|^2/.test(day.cup.end) ? '：練習は13:30から' : '：練習は13:00-14:30') : ''}` : '',
        day.busy.size ? `${gradeLabel([...day.busy])}はスポルト杯・カップ戦・TMなどがあるので抜きます` : ''].filter(Boolean).join('。');
      const lines = p ? its.map((it) => `<small><i style="background:${COLOR_CSS[colorOf(it.grades)] || '#999'}"></i>${esc(titleOf({ ...it, place: normPlace(it.place) === normPlace(s.place) ? '' : it.place }))}</small>`).join('') : '';
      // TMの割り振り（学年はプルダウンで変えられる）
      const subs = day.cup ? [] : tmSlotsOf(s), tm = plan.get(slotKey(s)) || [];
      const tmRows = subs.map((sub, i) => {
        const pk = `${slotKey(s)}|${i}`, got = tm.find((x) => x.i === i);
        const inCal = titlesOn(s.date).some((t) => /TM/i.test(t) && t.replace(/[：]/g, ':').includes(`${sub.start}-${sub.end}`));
        const none = !inCal && !got && !(pk in S.tmPick);
        return `<label class="nt-tm">TM ${esc(sub.start)}-${esc(sub.end)}
          ${inCal ? '<em>カレンダーに入っています</em>' : none ? '<em>（入れられる学年がありません）</em>' : `<select data-tmpick="${esc(pk)}">${TM_GRADES.map((g) => `<option value="${g}" ${got && got.grade === g ? 'selected' : ''}>${g}年</option>`).join('')}<option value="" ${got ? '' : 'selected'}>（入れない）</option></select>`}</label>`;
      }).join('');
      return `<div class="nt-slot ${done ? 'done' : ''}">
        <input type="checkbox" data-slot="${k}" ${slotOn(s) && its.length ? 'checked' : ''} ${p && its.length ? '' : 'disabled'} aria-label="${esc(mdw(s.date))} を入れる">
        <div class="nt-slot-main">
          <div class="nt-slot-head"><b>${esc(mdw(s.date))}</b> ${esc(normPlace(s.place) || s.ground || 'その他')} <span>${esc(s.start)}-${esc(s.end)}</span>${done ? ' <em>カレンダーに入っています</em>' : ''}</div>
          <select data-slotpick="${k}" aria-label="使うセット">${sets.map((x, i) => `<option value="${i}" ${i === pick ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="-1" ${pick < 0 ? 'selected' : ''}>（入れない）</option></select>
          <div class="nt-slot-lines">${lines}</div>
          ${tmRows ? `<div class="nt-tms">${tmRows}</div>` : ''}
          ${why ? `<p class="hint nt-why">${esc(why)}</p>` : ''}
          ${p && !its.length ? '<p class="hint">この日は、入れる練習がありません</p>' : p && !fitsFor(s, p) ? '<p class="nt-warn">⚠ セットの時間が、取れた時間からはみ出しています。セットを変えるか、チェックを外して手で足してください</p>' : ''}
        </div>
      </div>`;
    }).join('');
    const n = S.slots.filter((s) => slotOn(s) && sets[pickOf(s)] && itemsFor(sets[pickOf(s)], s.date, s).length).length;
    // この月の試合の回数（カレンダー＋この割り振り）
    const cnt = matchCounts(allEvents(), S.month);
    for (const list of plan.values()) list.forEach((x) => { if (x.grade in cnt) cnt[x.grade]++; });
    const sum = `<p class="nt-count">この月の試合（TM・カップ戦・大会・スポルト杯。割り振りもふくむ）：${TM_GRADES.map((g) => `<b>${g}年</b> ${cnt[g]}回`).join('　')}</p>`;
    box.innerHTML = nav + sum + rows + `<div class="btn-row"><button class="btn btn-main btn-big" data-act="sendSlots" data-busy ${n ? '' : 'disabled'}>チェックした ${n} 日分をカレンダーに入れる</button></div>
      <p class="hint">セットがちがう日は、プルダウンで変えられます。TMなど、いつもとちがう日はチェックを外して、下で手で足してください。</p>`;
    paintBusy();
  }

  // ----- コーチ担当に知らせる（2026年11月23日 本人）-----
  /** 今日から先の、この月の試合。手で直した文があれば、それを使う */
  const lineText = () => (S.line && S.line.month === S.month ? S.line.text : coachLineText(allEvents(), S.month, ymd(new Date())));
  function drawLine() {
    const box = $('#nt-line');
    if (!box) return;
    const [, m] = S.month.split('-').map(Number);
    if (!S.events) { box.innerHTML = '<p class="hint">読みこんでいます…</p>'; return; }
    const text = lineText();
    box.innerHTML = `<p class="hint">${m}月の分です（今日より前の日は出しません）。月は上の ◀ ▶ で変えられます。</p>
      <textarea id="nt-line-text" rows="14">${esc(text)}</textarea>
      <div class="btn-row">
        <a class="btn btn-line" id="nt-line-send" href="${esc(lineUrl(text))}" target="_blank" rel="noopener">LINEでコーチ担当に送る</a>
        <button class="btn btn-sub" data-act="lineCopy">文をコピー</button>
        ${S.line && S.line.month === S.month ? '<button class="btn btn-sub btn-small" data-act="lineReset">文を作りなおす</button>' : ''}
      </div>
      <p class="hint">「これからあたる日程」は、TM予定・相手の書いていないTM・スポルト杯の日です。LINEで送り先のグループを選んでください。パソコンでは「文をコピー」してLINEに貼りつけてください。</p>`;
  }
  async function copyLine() {
    const text = lineText();
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = Object.assign(document.createElement('textarea'), { value: text });
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    ui.toast('文をコピーしました。LINEに貼りつけて送ってください');
  }

  function drawList() {
    drawSlots();
    drawLine();
    const box = $('#nt-list');
    if (!box) return;
    const [y, m] = S.month.split('-').map(Number);
    const nav = `<div class="nt-month"><button class="btn btn-sub btn-small" data-act="month" data-d="-1">◀</button><b>${y}年${m}月</b><button class="btn btn-sub btn-small" data-act="month" data-d="1">▶</button></div>`;
    if (!S.events) { box.innerHTML = nav + '<p class="hint">読みこんでいます…</p>'; return; }
    if (!S.events.length) { box.innerHTML = nav + '<p class="hint">この月は、まだ予定がありません。</p>'; return; }
    let last = '';
    const sorted = [...S.events].sort((a, b) => (a.date + a.title < b.date + b.title ? -1 : 1));   // 同じ日は件名の順（1-3年 → 4,5年）
    box.innerHTML = nav + sorted.map((e) => {
      const head = e.date !== last ? `<div class="nt-day">${esc(mdw(e.date))}</div>` : '';
      last = e.date;
      const editing = S.edit && S.edit.id === e.id;
      return `${head}<div class="nt-ev"><i style="background:${COLOR_CSS[e.color] || '#bbb'}"></i><span>${e.time ? `<small>${esc(e.time)}</small> ` : ''}${esc(e.title)}</span>
        ${e.repeat || editing ? '' : `<button class="btn btn-sub btn-small" data-act="editEvent" data-id="${esc(e.id)}" data-busy>直す</button>`}
        ${e.mine && !editing ? `<button class="btn btn-sub btn-small" data-act="delEvent" data-id="${esc(e.id)}" data-busy>消す</button>` : ''}</div>${editing ? editHtml() : ''}`;
    }).join('');
    if (S.edit && $('#nt-e-start')) { timeField($('#nt-e-start'), { blank: true }); timeField($('#nt-e-end'), { blank: true }); }
    paintBusy();
  }

  // ---------- 操作 ----------
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act, i = Number(b.dataset.i);
    if (a === 'logout') logout();
    else if (a === 'preset') usePreset(i);
    else if (a === 'delPreset') deletePreset(i);
    else if (a === 'editSets') { S.editSets = !S.editSets; draw(); }
    else if (a === 'kind') { S.form.kind = b.dataset.k; if (!S.form.kind) S.form.vs = ''; draw(); }
    else if (a === 'grade') {
      const g = b.dataset.g, list = S.form.grades;
      S.form.grades = list.includes(g) ? list.filter((x) => x !== g) : [...list, g];
      b.classList.toggle('on');
      paintPreview();
    }
    else if (a === 'addOne') addOne();
    else if (a === 'undraft') { S.draft.splice(i, 1); draw(); }
    else if (a === 'clearDraft') { S.draft = []; draw(); }
    else if (a === 'send') send();
    else if (a === 'sendSlots') sendSlots();
    else if (a === 'addCup') addCup();
    else if (a === 'delCup') delCup(b.dataset.date, b.dataset.grade);
    else if (a === 'savePreset') savePreset();
    else if (a === 'delEvent') deleteEvent(b.dataset.id);
    else if (a === 'editEvent') startEdit(b.dataset.id);
    else if (a === 'cancelEdit') { S.edit = null; drawList(); }
    else if (a === 'saveEdit') saveEdit();
    else if (a === 'lineCopy') copyLine();
    else if (a === 'lineReset') { S.line = null; drawLine(); }
    else if (a === 'egrade') {
      const g = b.dataset.g, list = S.edit.grades;
      S.edit.grades = list.includes(g) ? list.filter((x) => x !== g) : [...list, g];
      b.classList.toggle('on');
      paintEditPreview();
    }
    else if (a === 'month') {
      const [y, m] = S.month.split('-').map(Number);
      const d = new Date(y, m - 1 + Number(b.dataset.d), 1);
      S.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      S.edit = null;
      loadMonth();
    }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (S.edit && t.id.startsWith('nt-e-')) {
      const k = { 'nt-e-start': 'start', 'nt-e-end': 'end', 'nt-e-note': 'note', 'nt-e-other': 'other', 'nt-e-title': 'title', 'nt-e-date': 'date' }[t.id];
      if (k) { S.edit[k] = t.value; paintEditPreview(); }
      return;
    }
    if (t.id === 'nt-line-text') {
      const first = !(S.line && S.line.month === S.month);
      S.line = { month: S.month, text: t.value };
      const a = $('#nt-line-send'); if (a) a.href = lineUrl(t.value);
      if (first) { const row = t.nextElementSibling; if (row && !row.querySelector('[data-act="lineReset"]')) row.insertAdjacentHTML('beforeend', '<button class="btn btn-sub btn-small" data-act="lineReset">文を作りなおす</button>'); }
      return;
    }
    if (t.id === 'nt-start') S.form.start = t.value;
    else if (t.id === 'nt-end') S.form.end = t.value;
    else if (t.id === 'nt-note') S.form.note = t.value;
    else if (t.id === 'nt-vs') S.form.vs = t.value;
    else if (t.id === 'nt-other') S.form.other = t.value;
    else return;
    paintPreview();
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'nt-e-place') { S.edit.place = t.value; drawList(); return; }
    if (t.id === 'nt-e-date') { S.edit.date = t.value; return; }
    if (t.dataset.slot) { S.slotOn[t.dataset.slot] = t.checked; drawSlots(); return; }
    if (t.dataset.tmpick) { S.tmPick[t.dataset.tmpick] = t.value; drawSlots(); return; }
    if (t.dataset.slotpick) { S.slotPick[t.dataset.slotpick] = Number(t.value); delete S.slotOn[t.dataset.slotpick]; drawSlots(); return; }
    if (t.id === 'nt-date' && parseYmd(t.value)) {
      S.date = t.value;
      $('.nt-date b').textContent = mdw(S.date);
      if (monthOf(S.date) !== S.month) { S.month = monthOf(S.date); loadMonth(); }
    } else if (t.id === 'nt-place') { S.form.place = t.value; draw(); }
    else if (t.id === 'nt-vs') rememberTeam(t.value, undefined, { use: true });
  });
  function paintPreview() {
    const p = $('#nt-preview');
    if (!p) return;
    const f = S.form;
    p.innerHTML = f.grades.length ? `→ <b>${esc(splitItems([{ ...f, note: formNote(f), place: placeOf() }]).map(titleOf).join(' ／ '))}</b>` : '学年をえらぶと、件名がここに出ます';
  }

  bindPickers(root);
  draw();
  let kept = false;
  try { kept = !!localStorage.getItem(KEY + ':pass'); } catch { /* なし */ }
  if (S.pass && apiUrl()) login(S.pass, kept);
}
