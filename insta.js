// SPORT AI事務局：Instagramタブ（2026年11月23日 作り直し）
// ふだんはAI社員（このPCのClaude）が下書きを作る。このタブは、自分で1本作りたいとき用の最小限のボタンだけ。
// 写真はこのブラウザの中だけで使い、どこにも送らない。保存もしない（タブを閉じると消える）。
import { instaDefaults, makeCaption, POINTS, pointOf, guessPoint } from './lib/insta.js';
import './lib/insta-draw.js';   // globalThis.InstaDraw（AI社員の画像づくりと同じデザイン）
import { writeZip } from './lib/zip.js';
import { instaApi, instaApiUrl, savedPass, savePass, fileOf } from './lib/insta-api.js';

const KEY = 'sport-ai:insta:v1';
const MAX_PHOTOS = 10;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const photos = [];   // { url, img } タブを切りかえても消えないよう画面の外で持つ

let mascotPromise;
const loadMascot = () => (mascotPromise = mascotPromise || new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'img/sporton.png'; }));
function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }

/** 画面の入力 → 画像の中身 */
function specOf(S, index) {
  if (index > 0) return { plain: true };
  if (S.type === 'trial') {
    return { layout: 'trial', title: '見学・無料体験 受付中', sub: (S.target || '').trim(), details: [(S.trialDate || '').trim()].filter(Boolean) };
  }
  const quote = (S.voice || '').trim().replace(/^[「『]|[」』]$/g, '');
  return { layout: 'scene', pillar: pointOf(S.point).title, quote, quoteWho: (S.voiceWho || '').trim() };
}

function drawPost(canvas, S, index, mascot) {
  globalThis.InstaDraw.draw(canvas, specOf(S, index), { photo: photos[index]?.img || null, mascot });
}
const blobOf = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('画像を作れませんでした'))), 'image/jpeg', 0.92));
async function exportImages(S) {
  const mascot = await loadMascot();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const out = [];
  for (let i = 0; i < Math.max(1, photos.length); i++) {
    const c = document.createElement('canvas');
    drawPost(c, S, i, mascot);
    out.push({ name: `instagram_${day}_${i + 1}.jpg`, blob: await blobOf(c) });
  }
  return out;
}
async function copy(text, ui, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = Object.assign(document.createElement('textarea'), { value: text }); document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  ui.toast(msg);
}

/** root: 描く場所, ui: { toast, download } */
export function renderInsta(root, ui) {
  const S = { ...instaDefaults(), ...(load() || {}) };
  if (S.type !== 'trial') S.type = 'point';
  const $ = (s) => root.querySelector(s);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても使える */ } };
  const isPoint = S.type === 'point';
  const canShare = !!(navigator.canShare && navigator.share);

  root.innerHTML = `
  <section class="card" id="ig-drafts"></section>
  <details class="card ig-manual" ${S.manualOpen ? 'open' : ''}><summary>✏️ 自分で1本作る</summary>
  <section>
    <div class="ig-types ig-types-2">
      <button type="button" class="ig-type ${isPoint ? 'on' : ''}" data-type="point">🌱 めざす選手像の場面</button>
      <button type="button" class="ig-type ${!isPoint ? 'on' : ''}" data-type="trial">🙌 見学・体験の案内</button>
    </div>
    <div class="grid ig-inputs">
      ${isPoint ? `
      <div class="wide"><label>どんな場面がありましたか</label><textarea id="ig-scene" placeholder="例：3年生が試合の準備を自分たちでやっていた。コートも自分たちで作った。">${esc(S.scene)}</textarea></div>
      <div><label>言われたこと <small>（あれば）</small></label><input type="text" id="ig-voice" value="${esc(S.voice)}" placeholder="例：自分たちでコートを作って、すごいですね"></div>
      <div><label>言った人 <small>（あれば）</small></label><input type="text" id="ig-voice-who" value="${esc(S.voiceWho)}" placeholder="例：相手チームのコーチ"></div>
      <div class="wide"><label>めざす選手像 <small id="ig-point-note"></small></label><select id="ig-point">${POINTS.map((p) => `<option value="${p.id}" ${p.id === S.point ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></div>`
      : `
      <div><label>対象</label><input type="text" id="ig-target" value="${esc(S.target)}" placeholder="例：年中さん〜小学6年生"></div>
      <div><label>日程</label><input type="text" id="ig-trial" value="${esc(S.trialDate)}" placeholder="例：土日祝の午前中"></div>`}
    </div>
    <label class="drop">📷 写真をえらぶ（${MAX_PHOTOS}枚まで・なくてもOK）<input type="file" id="ig-photo" accept="image/*" multiple></label>
    <div class="ig-thumbs" id="ig-thumbs"></div>
  </section>

  <section>
    <div class="ig-stage"><canvas id="ig-canvas" aria-label="投稿画像の見本"></canvas></div>
    <textarea id="ig-caption" class="ig-caption" aria-label="投稿文"></textarea>
    <div class="btn-row">
      ${canShare ? '<button class="btn btn-main" id="ig-send">📲 インスタへ送る</button>' : ''}
      <button class="btn ${canShare ? 'btn-sub' : 'btn-main'}" id="ig-save">⬇ 画像を保存</button>
      <button class="btn btn-sub" id="ig-copy">📋 文をコピー</button>
    </div>
  </section>
  </details>`;
  renderDrafts($('#ig-drafts'), ui);
  $('.ig-manual').addEventListener('toggle', (e) => { S.manualOpen = e.target.open; save(); });

  const canvas = $('#ig-canvas');
  let mascot = null;
  const draw = () => drawPost(canvas, S, 0, mascot);
  loadMascot().then((m) => { mascot = m; draw(); });

  function update() {
    if (!S.edited) { S.caption = makeCaption(S); $('#ig-caption').value = S.caption; }
    const note = $('#ig-point-note');
    if (note) note.textContent = S.pointAuto && guessPoint(S.scene) ? '（場面から選びました）' : '';
    save(); draw();
  }

  function renderThumbs() {
    $('#ig-thumbs').innerHTML = photos.map((p, i) => `<div class="ig-thumb"><img src="${p.url}" alt="${i + 1}枚目"><span class="ig-no">${i + 1}</span>
      <button type="button" class="ig-x" data-del="${i}" aria-label="${i + 1}枚目を外す">✕</button></div>`).join('');
    draw();
  }

  async function guarded(fn) { try { await fn(); } catch (err) { if (err?.name !== 'AbortError') { console.error(err); ui.toast('できませんでした：' + err.message); } } }
  const bytesOf = async (b) => new Uint8Array(await b.arrayBuffer());

  // ---------- 入力 ----------
  root.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { S.type = b.dataset.type; S.edited = false; save(); renderInsta(root, ui); }));
  const field = (id, name) => $(id)?.addEventListener('input', (e) => { S[name] = e.target.value; S.edited = false; update(); });
  field('#ig-voice', 'voice'); field('#ig-voice-who', 'voiceWho'); field('#ig-target', 'target'); field('#ig-trial', 'trialDate');
  $('#ig-scene')?.addEventListener('input', (e) => {
    S.scene = e.target.value; S.edited = false;
    const g = S.pointAuto && guessPoint(S.scene);
    if (g) { S.point = g; $('#ig-point').value = g; }
    update();
  });
  $('#ig-point')?.addEventListener('change', (e) => { S.point = e.target.value; S.pointAuto = false; S.edited = false; update(); });
  $('#ig-caption').addEventListener('input', (e) => { S.caption = e.target.value; S.edited = true; save(); });

  $('#ig-photo').addEventListener('change', async (e) => {
    for (const f of [...e.target.files]) {
      if (photos.length >= MAX_PHOTOS) { ui.toast(`写真は${MAX_PHOTOS}枚までです`); break; }
      const url = URL.createObjectURL(f);
      try { photos.push({ url, img: await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }) }); }
      catch { URL.revokeObjectURL(url); ui.toast(`${f.name} は読み込めませんでした`); }
    }
    e.target.value = ''; renderThumbs();
  });
  $('#ig-thumbs').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { const [p] = photos.splice(+del.dataset.del, 1); URL.revokeObjectURL(p.url); renderThumbs(); }
  });

  $('#ig-copy').addEventListener('click', () => copy($('#ig-caption').value, ui, '投稿文をコピーしました'));
  $('#ig-send')?.addEventListener('click', () => guarded(async () => {
    const files = (await exportImages(S)).map((it) => new File([it.blob], it.name, { type: 'image/jpeg' }));
    if (!navigator.canShare({ files })) throw new Error('この端末では送れません。「画像を保存」を使ってください');
    await copy($('#ig-caption').value, ui, '投稿文をコピーしました。インスタで貼りつけてください');
    await navigator.share({ files });
  }));
  $('#ig-save').addEventListener('click', () => guarded(async () => {
    const items = await exportImages(S);
    if (items.length === 1) ui.download(items[0].name, await bytesOf(items[0].blob));
    else { const files = {}; for (const it of items) files[it.name] = await bytesOf(it.blob); ui.download(items[0].name.replace(/_1\.jpg$/, '.zip'), await writeZip(files)); }
  }));

  $('#ig-caption').value = S.caption || '';
  update();
  renderThumbs();
}

// ---------- AI社員の下書き（Googleの側 gas/insta/Code.gs） ----------
const loaded = new Map();   // id → { caption, files: File[], urls: string[] }

async function renderDrafts(box, ui) {
  if (!instaApiUrl()) { box.innerHTML = '<p class="hint">📥 AI社員の下書きは、Googleの準備ができたらここに出ます。</p>'; return; }
  if (!savedPass()) {
    box.innerHTML = `<h2>📥 AI社員の下書き</h2>
      <p class="hint">はじめに合言葉を入れてください（この端末に覚えます）。</p>
      <div class="ig-pass"><input type="password" id="ig-pass" placeholder="合言葉" autocomplete="current-password"><button class="btn btn-main" id="ig-pass-go">開く</button></div>`;
    const go = () => { const v = box.querySelector('#ig-pass').value.trim(); if (!v) return; savePass(v); renderDrafts(box, ui); };
    box.querySelector('#ig-pass-go').addEventListener('click', go);
    box.querySelector('#ig-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return;
  }
  box.innerHTML = '<h2>📥 AI社員の下書き</h2><p class="hint">読みこみ中…</p>';
  let drafts;
  try { drafts = (await instaApi({ action: 'list' })).drafts.filter((d) => d.status !== 'done'); }
  catch (err) {
    if (err.badPass) { savePass(''); ui.toast('合言葉がちがいます'); renderDrafts(box, ui); return; }
    box.innerHTML = `<h2>📥 AI社員の下書き</h2><div class="notice err">${esc(err.message)}</div><div class="btn-row"><button class="btn btn-sub" id="ig-reload">↻ もう一度</button></div>`;
    box.querySelector('#ig-reload').addEventListener('click', () => renderDrafts(box, ui));
    return;
  }
  const canShare = !!(navigator.canShare && navigator.share);
  box.innerHTML = `<h2>📥 AI社員の下書き <button type="button" class="ig-refresh" id="ig-reload" aria-label="新しくする">↻</button></h2>
    <div class="ig-upload">
      <label class="drop">📷 写真を送る <small>（LINEのアルバムから保存した写真など。AI社員が使います）</small><input type="file" id="ig-up" accept="image/*" multiple></label>
      <div id="ig-up-panel" hidden>
        <div class="ig-thumbs" id="ig-up-thumbs"></div>
        <label for="ig-up-memo">ひとことメモ <small>（なくてもOK）</small></label>
        <textarea id="ig-up-memo" placeholder="例：3年生。試合の準備を自分たちでやっていた。相手チームのコーチにほめられた。"></textarea>
        <p class="hint">子どもの名前は書かないでください。顔が大きく写った写真は、AI社員が使わないようにしています。</p>
        <div class="btn-row"><button class="btn btn-main" id="ig-up-send">送る</button><button class="btn btn-sub" id="ig-up-cancel">やめる</button></div>
      </div>
    </div>
    ${drafts.length ? '' : '<p class="hint">新しい下書きはまだありません。火・金の朝にAI社員が作ります。</p>'}
    ${drafts.map((d) => `<article class="ig-draft" data-id="${esc(d.id)}">
      <div class="ig-draft-head"><b>${esc(d.title || '下書き')}</b><small>${esc((d.created || '').slice(5, 10).replace('-', '/'))}</small></div>
      <div class="ig-draft-imgs" data-imgs><span class="hint">画像を読みこみ中…</span></div>
      <textarea class="ig-draft-cap" aria-label="投稿文">${esc(d.caption)}</textarea>
      <div class="btn-row">
        <button class="btn btn-main" data-send disabled>${canShare ? '📲 インスタへ送る' : '⬇ 画像を保存'}</button>
        <button class="btn btn-sub" data-copy>📋 文をコピー</button>
        <button class="btn btn-sub" data-done>✓ 投稿した</button>
      </div>
    </article>`).join('')}`;
  box.querySelector('#ig-reload').addEventListener('click', () => { loaded.clear(); renderDrafts(box, ui); });
  setupUpload(box, ui);

  for (const card of box.querySelectorAll('.ig-draft')) {
    const id = card.dataset.id;
    const cap = () => card.querySelector('.ig-draft-cap').value;
    card.querySelector('[data-copy]').addEventListener('click', () => copy(cap(), ui, '投稿文をコピーしました'));
    card.querySelector('[data-done]').addEventListener('click', async () => {
      try { await instaApi({ action: 'done', id }); ui.toast('投稿済みにしました'); loaded.delete(id); renderDrafts(box, ui); }
      catch (err) { ui.toast('できませんでした：' + err.message); }
    });
    card.querySelector('[data-send]').addEventListener('click', async () => {
      const d = loaded.get(id);
      if (!d) return;
      try {
        if (canShare && navigator.canShare({ files: d.files })) {
          await copy(cap(), ui, '投稿文をコピーしました。インスタで貼りつけてください');
          await navigator.share({ files: d.files });
        } else {
          for (const f of d.files) { ui.download(f.name, new Uint8Array(await f.arrayBuffer())); await new Promise((r) => setTimeout(r, 350)); }
          await copy(cap(), ui, '画像を保存して、投稿文をコピーしました');
        }
      } catch (err) { if (err?.name !== 'AbortError') ui.toast('できませんでした：' + err.message); }
    });
    // 画像は先に読んでおく（スマホの「共有」はボタンを押したその場で渡す必要があるため）
    (async () => {
      try {
        let d = loaded.get(id);
        if (!d) {
          const r = await instaApi({ action: 'get', id });
          const files = r.images.map(fileOf);
          d = { files, urls: files.map((f) => URL.createObjectURL(f)) };
          loaded.set(id, d);
        }
        card.querySelector('[data-imgs]').innerHTML = d.urls.map((u, i) => `<img src="${u}" alt="${i + 1}枚目">`).join('');
        card.querySelector('[data-send]').disabled = false;
      } catch (err) { card.querySelector('[data-imgs]').innerHTML = `<span class="notice err">${esc(err.message)}</span>`; }
    })();
  }
}

// ---------- スマホから写真を送る（Googleの「写真入れ」へ。PCのAI社員が取りこむ） ----------
const MAX_SIDE = 1600;
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`${file.name} は読み込めませんでした`)); i.src = url; });
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('写真を小さくできませんでした'))), 'image/jpeg', 0.85));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  } finally { URL.revokeObjectURL(url); }
}

function setupUpload(box, ui) {
  let picked = [];   // { file, url }
  const panel = box.querySelector('#ig-up-panel');
  const show = () => {
    panel.hidden = !picked.length;
    box.querySelector('#ig-up-thumbs').innerHTML = picked.map((p, i) => `<div class="ig-thumb"><img src="${p.url}" alt="${i + 1}枚目"><button type="button" class="ig-x" data-updel="${i}" aria-label="${i + 1}枚目を外す">✕</button></div>`).join('');
  };
  const clear = () => { picked.forEach((p) => URL.revokeObjectURL(p.url)); picked = []; box.querySelector('#ig-up-memo').value = ''; show(); };
  box.querySelector('#ig-up').addEventListener('change', (e) => {
    for (const f of e.target.files) picked.push({ file: f, url: URL.createObjectURL(f) });
    e.target.value = ''; show();
  });
  box.querySelector('#ig-up-thumbs').addEventListener('click', (e) => {
    const d = e.target.closest('[data-updel]');
    if (d) { const [p] = picked.splice(+d.dataset.updel, 1); URL.revokeObjectURL(p.url); show(); }
  });
  box.querySelector('#ig-up-cancel').addEventListener('click', clear);
  const btn = box.querySelector('#ig-up-send');
  btn.addEventListener('click', async () => {
    if (!picked.length) return;
    const memo = box.querySelector('#ig-up-memo').value.trim();
    btn.disabled = true;
    let ok = 0;
    try {
      for (const p of picked) {
        btn.textContent = `送っています… ${ok + 1}/${picked.length}`;
        await instaApi({ action: 'addPhoto', data: await shrink(p.file), memo });
        ok++;
      }
      ui.toast(`${ok}枚送りました。AI社員が下書きに使います`);
      clear();
    } catch (err) {
      ui.toast(`${ok}枚まで送れました。のこりは送れませんでした：${err.message}`);
      picked.splice(0, ok).forEach((p) => URL.revokeObjectURL(p.url)); show();
    } finally { btn.disabled = false; btn.textContent = '送る'; }
  });
}
