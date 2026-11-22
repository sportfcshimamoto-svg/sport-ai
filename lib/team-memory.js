// 一度入れたチーム名を覚えて、次から ▼ で選べるようにする（2026年11月22日 本人の希望）。
// 大会タブ・TMタブで同じ候補を使う。市町もいっしょに覚える（大会タブで選ぶと市町も入る）。
// この端末の中にだけ保存する（インターネットには送らない）。

const KEY = 'sport-ai:teams:v1';
const HIDE = 'sport-ai:teams:hidden';   // はじめからの候補のうち、✕で消したもの

// はじめから入れておく候補（2026年11月22日 本人の希望）。
// 過去のTMのお知らせと大会の要項（2023〜2025年。デスクトップ\スポルト関係\タイムスケジュール）の「参加チーム」から。
// 3つめの数は、過去のファイルに出てきた回数（よく使う順に並べるのに使う）。2022年だけのチームは入れていない。市町は要項に書いてあったもの、またはチーム名に市町が入っているもの（向日市SSS・高槻郡家FC・FCフレクティブ交野）。わからないものは空
const SEED = [
  ['高槻如是FC', '高槻市', 22], ['竹の内SC', '高槻市', 9], ['FC ONCE', '枚方市', 8], ['上牧FC', '高槻市', 10], ['エスペランサFC', '吹田市', 10],
  ['FC玉島', '茨木市', 9], ['高槻清水FC', '高槻市', 7], ['西大冠FC', '高槻市', 7], ['KSC', '枚方市', 5], ['加茂FC', '木津川市', 5],
  ['沢池FC', '茨木市', 5], ['樟葉SSC', '枚方市', 6], ['芥川Jr.ドリームス', '高槻市', 6], ['山手台FC', '', 5], ['高槻郡家FC', '高槻市', 5],
  ['京都FC下鳥羽', '京都市', 6], ['宇山SC', '枚方市', 4], ['安満SC', '', 4], ['枚方FC', '枚方市', 7], ['伏見JSC', '京都市', 3],
  ['向日市SSS', '向日市', 3], ['羽束師JFC', '京都市', 3], ['高槻桜台FC', '高槻市', 5], ['アクバスSC', '守口市', 3], ['FCフレクティブ交野', '交野市', 3],
  ['玉川FC', '', 3], ['CHINfinito', '茨木市', 6], ['クラブアトレティコ城東', '姫路市', 3], ['松原SS', '', 2], ['深草SC', '', 4],
  ['FC Ambition', '高槻市', 2], ['太田JFC', '茨木市', 2], ['塚原サンクラブ', '高槻市', 2], ['NEXUS FC', '吹田市', 1], ['アミーサ', '大阪市', 1],
  ['リオクロス', '枚方市', 1], ['太子橋FC', '大阪市', 1], ['門真北風SC', '門真市', 1],
].map(([name, city, past]) => ({ name, city, past }));

const MAX = 80;
export const LIST_ID = 'team-list';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const read = (k) => { try { const a = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
/** この端末で入れたチーム [{ name, city, uses, last }]（uses：使った日の数、last：最後に使った日） */
const learned = () => read(KEY).filter((t) => t && t.name);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * 候補 [{ name, city }]：よく使う順（2026年11月22日 本人の希望）。
 * 回数 ＝ 過去のファイルに出てきた回数 ＋ このアプリで使った日の数。同じ回数なら、最近使ったほうが上
 */
export function teams() {
  const mine = learned(), hidden = read(HIDE);
  const all = [
    ...mine.map((m) => ({ ...m, past: SEED.find((t) => t.name === m.name)?.past || 0 })),
    ...SEED.filter((t) => !hidden.includes(t.name) && !mine.some((m) => m.name === t.name)),
  ];
  const score = (t) => (t.past || 0) + (t.uses || 0);
  return all
    .map((t, i) => ({ t, i }))
    .sort((a, b) => score(b.t) - score(a.t) || String(b.t.last || '').localeCompare(String(a.t.last || '')) || a.i - b.i)
    .map(({ t }) => ({ name: t.name, city: t.city || '' }));
}
function put(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* 保存できなくても使える */ } }

/**
 * チームを覚える。city を渡さないときは、前に覚えた市町をそのまま残す。
 * use: true は「その欄に入れた・選んだ」とき（よく使う順に数える）。同じ日に何度入れても1回
 */
export function rememberTeam(name, city, { use = false } = {}) {
  const n = clean(name);
  if (n.length < 2) return;   // 1文字だけは打ちかけとみなす
  const mine = learned();
  const old = mine.find((t) => t.name === n);
  const c = city === undefined ? (old?.city || cityOf(n)) : clean(city);
  const d = today(), counted = use && old?.last !== d;
  const row = { name: n, city: c, uses: (old?.uses || 0) + (counted ? 1 : 0), last: counted ? d : (old?.last || '') };
  put([row, ...mine.filter((t) => t.name !== n)]);
  try { localStorage.setItem(HIDE, JSON.stringify(read(HIDE).filter((x) => x !== n))); } catch { /* なし */ }   // 消したあとにまた入れたら、もどす
}
export function forgetTeam(name) {
  put(learned().filter((t) => t.name !== name));
  if (SEED.some((t) => t.name === name)) { try { localStorage.setItem(HIDE, JSON.stringify([...new Set([...read(HIDE), name])])); } catch { /* なし */ } }
}
/** 覚えている市町（なければ ''） */
export const cityOf = (name) => teams().find((t) => t.name === clean(name))?.city || '';

/** <datalist>（入力欄に list="team-list" をつけると ▼ で選べる） */
export function teamDatalist(exclude = []) {
  return `<datalist id="${LIST_ID}">${teams().filter((t) => !exclude.includes(t.name)).map((t) => `<option value="${esc(t.name)}">${t.city ? esc(t.city) : ''}</option>`).join('')}</datalist>`;
}
/** datalist を新しくする（覚えたあと、描き直さずに候補へ足す） */
export function refreshDatalist(root, exclude = []) {
  const d = root.querySelector('#' + LIST_ID);
  if (d) d.outerHTML = teamDatalist(exclude);
}

/** 「覚えたチームを整理」の欄（打ちまちがいを候補から消す） */
export function teamManager() {
  const list = teams();
  return `<details class="team-mgr"><summary>候補のチームを整理（${list.length}チーム）</summary>`
    + (list.length
      ? `<p class="hint">はじめから、これまでのTM・大会の要項に出てきたチームが入っています。打ちまちがいなど、候補に出さなくてよいチームは ✕ で消せます（できあがりの書類には関係ありません）。</p><div class="chips">${list.map((t) => `<span class="chip">${esc(t.name)}${t.city ? `<small>（${esc(t.city)}）</small>` : ''}<button type="button" data-forget="${esc(t.name)}" title="候補から消す" aria-label="${esc(t.name)}を候補から消す">✕</button></span>`).join('')}</div>`
      : '<p class="hint">まだありません。チーム名を入れると、次から ▼ で選べるようになります。</p>')
    + '</details>';
}
/** 整理の欄の ✕ を動くようにする。onChange は消したあとに呼ぶ */
export function bindTeamManager(box, onChange) {
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-forget]');
    if (!b) return;
    forgetTeam(b.dataset.forget);
    onChange();
  });
}
