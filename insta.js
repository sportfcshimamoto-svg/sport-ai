// SPORT AI事務局：Instagramタブ
// 入力 → 投稿文と画像をつくる → 本人がInstagramへ手動で投稿（またはMeta Business Suiteで予約）。
// 写真はこのブラウザの中だけで使い、どこにも送らない。保存もしない（タブを閉じると消える）。
import { TYPES, typeOf, TONES, THEMES, GRADES, MAX_TAGS, MAX_CHARS, instaDefaults, makeCaption, countTags, imageText, reelScript, shareRequest, problems } from './lib/insta.js';
import { writeZip } from './lib/zip.js';

const KEY = 'sport-ai:insta:v1';
const MAX_PHOTOS = 10;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = '"Yu Gothic UI","Yu Gothic","Hiragino Sans","Meiryo",sans-serif';

// タブを切りかえても写真が消えないよう、画面の外で持っておく
const photos = [];   // { url, img, x, y, zoom }
let current = 0;     // 位置を調整している写真

let logoPromise;
function loadLogo() {
  logoPromise = logoPromise || new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = 'img/sporton.png';
  });
  return logoPromise;
}

function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }

// ---------- 画像を描く ----------
const NO_LINE_START = '、。，．・）」』】ー！？ぁぃぅぇぉっゃゅょァィゥェォッャュョ';
function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        const dot = line.lastIndexOf('・');
        if (dot >= line.length * 0.5 && dot < line.length - 1) { out.push(line.slice(0, dot + 1)); line = line.slice(dot + 1) + ch; }   // 「大/山崎」のように地名の途中で切らない
        else if (NO_LINE_START.includes(ch)) { out.push(line.slice(0, -1)); line = line.slice(-1) + ch; }
        else { out.push(line); line = ch; }
      } else line += ch;
    }
    if (line) out.push(line);
  }
  return out;
}
/** 決まった行数に入るまで字を小さくする */
function fit(ctx, text, maxW, size, minSize, maxLines) {
  let fallback = null;
  for (let s = size; s >= minSize; s -= 4) {
    ctx.font = `900 ${s}px ${FONT}`;
    const ls = wrap(ctx, text, maxW);
    if (ls.length > maxLines) continue;
    if (ls.length === 1 || [...ls[ls.length - 1]].length > 2) return { size: s, lines: ls };   // 最後の行が1〜2文字だけにならない大きさ
    fallback = fallback || { size: s, lines: ls };
  }
  if (fallback) return fallback;
  ctx.font = `900 ${minSize}px ${FONT}`;
  return { size: minSize, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
}

function drawPhoto(ctx, W, H, p) {
  const scale = Math.max(W / p.img.width, H / p.img.height) * p.zoom;
  const w = p.img.width * scale, h = p.img.height * scale;
  ctx.drawImage(p.img, (W - w) * (p.x / 100), (H - h) * (p.y / 100), w, h);
}

function drawBrand(ctx, x, y, size) {
  ctx.font = `italic 900 ${size}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  let cx = x;
  for (const [t, c] of [['SPO', '#ffffff'], ['R', '#ffe94a'], ['T FC', '#ffffff']]) { ctx.fillStyle = c; ctx.fillText(t, cx, y); cx += ctx.measureText(t).width; }
  return cx;
}

function drawTextPage(ctx, W, H, text, logo) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#361778'); g.addColorStop(.55, '#5a0fb0'); g.addColorStop(1, '#9a00ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,233,74,.14)'; ctx.lineWidth = 90;
  ctx.beginPath(); ctx.arc(W - 40, 60, 300, 0, Math.PI * 2); ctx.stroke();

  const m = 88;
  drawBrand(ctx, m, 150, 72);
  ctx.font = `bold 34px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText('島本町 少年サッカー', m, 206);

  let y = H * (H > W * 1.5 ? 0.3 : 0.27);
  ctx.textBaseline = 'alphabetic';
  if (text.sub) {
    ctx.fillStyle = '#ffe94a'; ctx.font = `bold 46px ${FONT}`;
    for (const l of wrap(ctx, text.sub, W - m * 2).slice(0, 2)) { y += 58; ctx.fillText(l, m, y); }
    y += 26;
  }
  const t = fit(ctx, text.title, W - m * 2, 112, 60, 4);
  ctx.fillStyle = '#ffffff';
  for (const l of t.lines) { y += t.size * 1.26; ctx.font = `900 ${t.size}px ${FONT}`; ctx.fillText(l, m, y); }
  y += 44;
  ctx.fillStyle = '#ffe94a'; ctx.fillRect(m, y, 120, 8); y += 36;
  const logoH = H > W * 1.5 ? 420 : 300;
  const dMax = W - m * 2;
  ctx.fillStyle = '#ffffff'; ctx.font = `bold 44px ${FONT}`;
  for (const d of text.details) for (const l of wrap(ctx, d, dMax)) { if (y + 60 > H - logoH - 30) break; y += 60; ctx.fillText(l, m, y); }
  if (logo) { const w = logo.width * (logoH / logo.height); ctx.drawImage(logo, W - w - 60, H - logoH - 50, w, logoH); }
}

function drawCoverBand(ctx, W, H, text, logo) {
  const g = ctx.createLinearGradient(0, H * .5, 0, H);
  g.addColorStop(0, 'rgba(54,23,120,0)'); g.addColorStop(.5, 'rgba(54,23,120,.82)'); g.addColorStop(1, 'rgba(54,23,120,.96)');
  ctx.fillStyle = g; ctx.fillRect(0, H * .5, W, H * .5);
  const m = 64, logoH = 220;
  const logoW = logo ? logo.width * (logoH / logo.height) : 0;
  const maxW = W - m * 2 - logoW;
  const t = fit(ctx, text.title, maxW, 92, 52, 3);
  ctx.textBaseline = 'alphabetic';
  let y = H - 118 - (t.lines.length - 1) * t.size * 1.22;
  if (text.sub) {
    ctx.font = `bold 42px ${FONT}`; ctx.fillStyle = '#ffe94a';
    ctx.fillText(wrap(ctx, text.sub, maxW)[0], m, y - t.size - 12);
  }
  ctx.fillStyle = '#ffffff';
  for (const l of t.lines) { ctx.font = `900 ${t.size}px ${FONT}`; ctx.fillText(l, m, y); y += t.size * 1.22; }
  const end = drawBrand(ctx, m, H - 44, 40);
  ctx.font = `bold 26px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText('島本町 少年サッカー', end + 18, H - 46);
  if (logo) ctx.drawImage(logo, W - logoW - 28, H - logoH - 26, logoW, logoH);
}

function drawPost(canvas, S, index, logo) {
  const W = 1080, H = S.type === 'local' ? 1920 : 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const auto = imageText(S);
  const text = { title: (S.imgTitle.trim() || auto.title).replace(/／/g, '\n'), sub: S.imgSub.trim() || auto.sub, details: auto.details };
  const p = photos[index];
  if (!p) { drawTextPage(ctx, W, H, text, logo); return; }
  drawPhoto(ctx, W, H, p);
  if (index === 0 && S.overlay) drawCoverBand(ctx, W, H, text, logo);
}

function fileDate(S) { return (S.date || new Date().toISOString().slice(0, 10)).replace(/-/g, ''); }
const blobOf = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('画像を作れませんでした'))), 'image/jpeg', 0.92));

async function exportImages(S) {
  const logo = await loadLogo();
  const out = [];
  const n = Math.max(1, photos.length);
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas');
    drawPost(c, S, i, logo);
    out.push({ name: `instagram_${fileDate(S)}_${i + 1}.jpg`, blob: await blobOf(c) });
  }
  return out;
}

async function copy(text, ui, msg) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
  ui.toast(msg);
}

/**
 * Instagramタブを描く
 * root: 描く場所, ui: { toast, download }
 */
export function renderInsta(root, ui) {
  const S = { ...instaDefaults(), ...(load() || {}) };
  if (!TYPES.some((t) => t.id === S.type)) { S.type = TYPES[0].id; S.edited = false; S.imgTitle = ''; S.imgSub = ''; }   // 前にあった「大会」「練習試合」の種類が保存されていたとき
  if (S.theme === 'area') { S.theme = 'first'; S.edited = false; }
  if (/からも通え|お子さんも大歓迎です。\n|#上牧|#高槻市|#大山崎町/.test(S.caption || '')) S.edited = false;   // 前の文章が残らないように
  const $ = (s) => root.querySelector(s);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 保存できなくても使える */ } };
  const type = typeOf(S.type);
  const has = (f) => type.fields.includes(f);
  const isReel = S.type === 'local';

  const gradeOpts = (allowEmpty) => `${allowEmpty ? `<option value="" ${!S.grade ? 'selected' : ''}>全学年</option>` : ''}${GRADES.map((g) => `<option ${g === S.grade ? 'selected' : ''}>${g}</option>`).join('')}`;

  root.innerHTML = `
  <section class="card">
    <h2><span class="num">1</span>何を投稿しますか</h2>
    <div class="ig-types">${TYPES.map((t) => `<button type="button" class="ig-type ${t.id === S.type ? 'on' : ''}" data-type="${t.id}">${t.label}</button>`).join('')}</div>
  </section>

  <section class="card">
    <h2><span class="num">2</span>内容を入れる</h2>
    <div class="grid">
      ${has('grade') ? `<div><label>学年</label><select id="ig-grade">${gradeOpts(S.type === 'practice')}</select></div>` : ''}
      ${has('target') ? `<div><label>対象</label><input type="text" id="ig-target" value="${esc(S.target)}" placeholder="例：小学生／年長さん〜小学3年生"></div>` : ''}
      ${has('date') ? `<div><label>日にち</label><input type="date" id="ig-date" value="${esc(S.date)}"></div>` : ''}
      ${has('trialDate') ? `<div><label>日程</label><input type="text" id="ig-trial" value="${esc(S.trialDate)}" placeholder="例：毎週土曜日 9:00〜11:00"></div>` : ''}
      ${has('place') ? `<div class="wide"><label>場所</label><input type="text" id="ig-place" value="${esc(S.place)}"></div>` : ''}
      ${has('activity') ? `<div class="wide"><label>どんな練習でしたか</label><textarea id="ig-activity" placeholder="例：パス練習のあと、3対3のミニゲームをしました。">${esc(S.activity)}</textarea></div>` : ''}
      ${has('theme') ? `<div class="wide"><label>テーマ</label><select id="ig-theme">${THEMES.map((t) => `<option value="${t.id}" ${t.id === S.theme ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>` : ''}
      <div class="wide"><label>伝えたいこと <small>（空でもかまいません）</small></label><textarea id="ig-message" placeholder="例：最後まで声をかけ合って、がんばりました。">${esc(S.message)}</textarea></div>
      <div><label>文章の雰囲気</label><select id="ig-tone">${TONES.map((t) => `<option value="${t.id}" ${t.id === S.tone ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>    </div>
    ${S.type === 'practice' ? '<p class="hint">いつもの練習場所が特定されないよう、練習の投稿には場所を入れない形にしています。</p>' : ''}
  </section>

  <section class="card">
    <h2><span class="num">3</span>投稿文</h2>
    <div id="ig-problems"></div>
    <textarea id="ig-caption" class="ig-caption"></textarea>
    <div class="ig-count" id="ig-count"></div>
    <div class="btn-row">
      <button class="btn btn-main" id="ig-copy">📋 コピーする</button>
      <button class="btn btn-sub" id="ig-again">🔄 別の言い回しにする</button>
    </div>
    <p class="hint" id="ig-edited-note"></p>
    ${isReel ? '<div id="ig-reel"></div>' : ''}
  </section>

  <section class="card">
    <h2><span class="num">4</span>画像</h2>
    <label class="drop">📷 写真をえらぶ（${MAX_PHOTOS}枚まで）<input type="file" id="ig-photo" accept="image/*" multiple></label>
    <p class="hint">写真はこの画面の中だけで使います。どこにも送られず、タブを閉じると消えます。写真がなければ、文字だけの画像ができます。</p>
    <div class="ig-thumbs" id="ig-thumbs"></div>
    <div class="grid">
      <div class="wide"><label>画像の大きい字 <small>（空なら自動。「／」を入れるとそこで改行）</small></label><input type="text" id="ig-img-title" value="${esc(S.imgTitle)}"></div>
      <div class="wide"><label>画像の小さい字 <small>（空なら自動）</small></label><input type="text" id="ig-img-sub" value="${esc(S.imgSub)}"></div>
    </div>
    <div id="ig-overlay-box"></div>
    <div class="ig-stage"><canvas id="ig-canvas" aria-label="投稿画像の見本"></canvas></div>
    <div id="ig-adjust"></div>
    <div class="btn-row" id="ig-save-row"></div>
    <p class="hint">${isReel ? 'リールの表紙（縦長 1080×1920）です。' : '投稿用の縦長（1080×1350）です。'}</p>
  </section>

  <section class="card">
    <h2><span class="num">5</span>投稿の前とあとに</h2>
    <ul class="ig-list">
      <li>写っているお子さん全員の掲載OKを確認しましたか。</li>
      <li>ゼッケン・名札の名前や学校名が読める写真になっていませんか。</li>
      <li>いつもの練習場所に、位置情報を付けていませんか。</li>
    </ul>
    <label>保護者のLINEに送るお願いの文</label>
    <textarea id="ig-share" readonly>${esc(shareRequest())}</textarea>
    <div class="btn-row"><button class="btn btn-sub" id="ig-share-copy">📋 お願いの文をコピー</button></div>
    <p class="hint">予約投稿をしたいときは、無料のMeta Business Suiteに画像と投稿文を入れます。</p>
  </section>`;

  const canvas = $('#ig-canvas');
  let logo = null;
  const draw = () => drawPost(canvas, S, photos.length ? current : 0, logo);
  loadLogo().then((l) => { logo = l; draw(); });

  function updateText() {
    save();
    const box = $('#ig-caption');
    if (!S.edited) { S.caption = makeCaption(S); box.value = S.caption; save(); }
    countUpdate();
    const bad = problems(S);
    $('#ig-problems').innerHTML = bad.length ? `<div class="notice">${bad.map(esc).join('<br>')}</div>` : '';
    $('#ig-edited-note').textContent = S.edited ? '文章を手で直したので、上の入力を変えても文章は変わりません。「別の言い回しにする」を押すと作り直します。' : '';
    const reel = $('#ig-reel');
    if (reel) {
      reel.innerHTML = `<h3 class="ig-h3">リールの台本 <small>（顔がはっきり写らない撮り方にしています）</small></h3>
        <div class="scroll"><table class="sched"><tr><th>順番</th><th>画面に出す字</th><th>撮るもの</th></tr>
        ${reelScript(S).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.text)}</td><td>${esc(r.shot)}</td></tr>`).join('')}</table></div>
        <p class="hint">画面の字は、動画を作るときにInstagramの「テキスト」で入れます。1場面2〜3秒が目安です。</p>`;
    }
    draw();
  }

  function countUpdate() {
    const v = $('#ig-caption').value;
    const tags = countTags(v);
    const over = tags > MAX_TAGS || v.length > MAX_CHARS;
    $('#ig-count').innerHTML = `<span class="${v.length > MAX_CHARS ? 'over' : ''}">${v.length} / ${MAX_CHARS} 文字</span>　<span class="${tags > MAX_TAGS ? 'over' : ''}">ハッシュタグ ${tags} / ${MAX_TAGS} 個</span>${over ? '　<b class="over">多すぎます</b>' : ''}`;
  }

  function renderPhotos() {
    current = Math.min(current, Math.max(0, photos.length - 1));
    $('#ig-thumbs').innerHTML = photos.map((p, i) => `<div class="ig-thumb ${i === current ? 'on' : ''}" data-i="${i}">
      <img src="${p.url}" alt="${i + 1}枚目の写真"><span class="ig-no">${i + 1}</span>
      <button type="button" class="ig-x" data-del="${i}" aria-label="${i + 1}枚目を外す">✕</button>
      ${i > 0 ? `<button type="button" class="ig-left" data-left="${i}" aria-label="${i + 1}枚目を前へ">←</button>` : ''}
    </div>`).join('');
    $('#ig-overlay-box').innerHTML = photos.length
      ? `<label class="check"><input type="checkbox" id="ig-overlay" ${S.overlay ? 'checked' : ''}>1枚目の写真に字とスポルトンを入れる</label>` : '';
    $('#ig-overlay')?.addEventListener('change', (e) => { S.overlay = e.target.checked; save(); draw(); });
    const p = photos[current];
    $('#ig-adjust').innerHTML = p ? `<p class="hint">${current + 1}枚目の写り方（顔や手足が切れないように調整できます）</p>
      <div class="ig-sliders">
        <label>左右<input type="range" min="0" max="100" value="${p.x}" data-pos="x"></label>
        <label>上下<input type="range" min="0" max="100" value="${p.y}" data-pos="y"></label>
        <label>大きさ<input type="range" min="100" max="250" value="${Math.round(p.zoom * 100)}" data-pos="zoom"></label>
      </div>` : '';
    const canShare = !!(navigator.canShare && navigator.share);
    const n = Math.max(1, photos.length);
    $('#ig-save-row').innerHTML = `
      ${canShare ? `<button class="btn btn-main" id="ig-sharefile">📲 Instagramなどへ送る</button>` : ''}
      <button class="btn ${canShare ? 'btn-sub' : 'btn-main'}" id="ig-save">⬇ 画像を保存（${n}枚）</button>
      ${n > 1 ? '<button class="btn btn-sub" id="ig-zip">まとめてZIPで保存</button>' : ''}`;
    $('#ig-save').addEventListener('click', () => guarded(saveAll));
    $('#ig-zip')?.addEventListener('click', () => guarded(saveZip));
    $('#ig-sharefile')?.addEventListener('click', () => guarded(shareFiles));
    draw();
  }

  async function guarded(fn) {
    try { await fn(); } catch (err) { if (err?.name !== 'AbortError') { console.error(err); ui.toast('作れませんでした：' + err.message); } }
  }
  const bytesOf = async (b) => new Uint8Array(await b.arrayBuffer());
  async function saveAll() {
    const items = await exportImages(S);
    for (const it of items) { ui.download(it.name, await bytesOf(it.blob)); await new Promise((r) => setTimeout(r, 350)); }
  }
  async function saveZip() {
    const items = await exportImages(S);
    const files = {};
    for (const it of items) files[it.name] = await bytesOf(it.blob);
    ui.download(`instagram_${fileDate(S)}.zip`, await writeZip(files));
  }
  async function shareFiles() {
    const items = await exportImages(S);
    const files = items.map((it) => new File([it.blob], it.name, { type: 'image/jpeg' }));
    if (!navigator.canShare({ files })) throw new Error('この端末では送れません。「画像を保存」を使ってください');
    await copy($('#ig-caption').value, ui, '投稿文をコピーしました');
    await navigator.share({ files });
  }

  async function addPhotos(list) {
    for (const f of list) {
      if (photos.length >= MAX_PHOTOS) { ui.toast(`写真は${MAX_PHOTOS}枚までです`); break; }
      const url = URL.createObjectURL(f);
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad')); i.src = url; });
        photos.push({ url, img, x: 50, y: 50, zoom: 1 });
      } catch { URL.revokeObjectURL(url); ui.toast(`${f.name} は読み込めませんでした（JPEGやPNGにしてください）`); }
    }
    renderPhotos();
  }

  // ---------- 入力 ----------
  root.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    S.type = b.dataset.type; S.edited = false; S.imgTitle = ''; S.imgSub = '';
    save(); renderInsta(root, ui);
  }));
  const field = (id, name, tr = (x) => x) => $(id)?.addEventListener('input', (e) => { S[name] = tr(e.target.value); updateText(); });
  $('#ig-grade')?.addEventListener('change', (e) => { S.grade = e.target.value; updateText(); });
  field('#ig-target', 'target'); field('#ig-date', 'date'); field('#ig-trial', 'trialDate');
  field('#ig-place', 'place'); field('#ig-activity', 'activity'); field('#ig-message', 'message');
  field('#ig-img-title', 'imgTitle'); field('#ig-img-sub', 'imgSub');
  $('#ig-theme')?.addEventListener('change', (e) => { S.theme = e.target.value; updateText(); });
  $('#ig-tone').addEventListener('change', (e) => { S.tone = e.target.value; updateText(); });
  $('#ig-caption').addEventListener('input', (e) => { S.caption = e.target.value; S.edited = true; save(); countUpdate(); $('#ig-edited-note').textContent = '文章を手で直したので、上の入力を変えても文章は変わりません。「別の言い回しにする」を押すと作り直します。'; });
  $('#ig-copy').addEventListener('click', () => { const v = $('#ig-caption').value; if (v.trim()) copy(v, ui, '投稿文をコピーしました'); });
  $('#ig-again').addEventListener('click', () => { S.v = (S.v || 0) + 1; S.edited = false; updateText(); });
  $('#ig-share-copy').addEventListener('click', () => copy(shareRequest(), ui, 'お願いの文をコピーしました'));

  $('#ig-photo').addEventListener('change', async (e) => { const list = [...e.target.files]; e.target.value = ''; await addPhotos(list); });
  $('#ig-thumbs').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]'), left = e.target.closest('[data-left]'), th = e.target.closest('[data-i]');
    if (del) { const [p] = photos.splice(+del.dataset.del, 1); URL.revokeObjectURL(p.url); renderPhotos(); return; }
    if (left) { const i = +left.dataset.left; [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]]; current = i - 1; renderPhotos(); return; }
    if (th) { current = +th.dataset.i; renderPhotos(); }
  });
  $('#ig-adjust').addEventListener('input', (e) => {
    const k = e.target.dataset.pos; const p = photos[current];
    if (!k || !p) return;
    p[k] = k === 'zoom' ? +e.target.value / 100 : +e.target.value;
    draw();
  });

  $('#ig-caption').value = S.caption || '';
  updateText();
  renderPhotos();
}
