// SPORT AI事務局：Instagramの投稿文・ハッシュタグ・画像の文字をつくる
// AIは使わない。決まった形に入力を当てはめるだけ。画面（canvas）にさわらないので node でも試せる。
// SPORT FCは結果を重視するチームではないので、大会や試合の結果を出す投稿は作らない（2026年11月 本人）。

export const WHO = '島本町の少年サッカーチーム SPORT FC';
export const MAX_TAGS = 5;
export const MAX_CHARS = 2200;

export const GRADES = ['U7', 'U8', 'U9', 'U10', 'U11', 'U12'];

export const TYPES = [
  { id: 'point', label: '🌱 めざす選手像の場面', fields: ['grade', 'date', 'scene', 'voice', 'point', 'message'] },
  { id: 'practice', label: '🏃 練習の様子', fields: ['grade', 'date', 'activity', 'message'] },
  { id: 'trial', label: '🙌 見学・体験の募集', fields: ['target', 'trialDate', 'place', 'message'] },
  { id: 'local', label: '🎬 地域の保護者向けリール', fields: ['theme', 'message'] },
];
export const typeOf = (id) => TYPES.find((t) => t.id === id) || TYPES[0];

export const TONES = [
  { id: 'genki', label: '元気・わくわく' },
  { id: 'yasashi', label: 'やさしい・あたたかい' },
  { id: 'teinei', label: 'ていねい・きちんと' },
];

export const THEMES = [
  { id: 'first', label: '小学1年生からサッカーを始めるなら' },
  { id: 'day', label: 'はじめての体験練習、こんな1日です' },
];

const TYPE_TAG = { point: '#小学生サッカー', practice: '#サッカー練習', trial: '#サッカー体験', local: '#小学生サッカー' };

const CLOSE = {
  genki: {
    report: ['次の活動も全力で楽しもう！💪', '次もみんなで盛り上がろう！🌟'],
    invite: ['まずは気軽に遊びに来てね！⚽', 'はじめての子も大歓迎！一緒にボールをけろう！⚽'],
  },
  yasashi: {
    report: ['これからも、一歩ずつ楽しく続けていきます🌱', 'いつも応援ありがとうございます🍀'],
    invite: ['はじめてのお子さんも、安心してお越しください🍀', 'お子さんのペースで大丈夫です🌱'],
  },
  teinei: {
    report: ['引き続き、応援のほどよろしくお願いいたします。', 'ご覧いただき、ありがとうございました。'],
    invite: ['お気軽にお問い合わせください。', 'ご興味のある方は、お気軽にご連絡ください。'],
  },
};

export function instaDefaults() {
  return {
    type: 'practice', tone: 'genki', grade: 'U8', date: '', place: '', activity: '', message: '', target: '小学生', trialDate: '', theme: 'first',
    point: 'muchu', pointAuto: true, scene: '', voiceWho: '', voice: '', v: 0, caption: '', edited: false, imgTitle: '', imgSub: '', overlay: true,
  };
}

const pick = (arr, v) => arr[((v % arr.length) + arr.length) % arr.length];
const clean = (s) => String(s ?? '').replace(/　/g, ' ').trim();

/** 「2026-11-08」→「11月8日（日）」 */
export function dateText(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${+m[2]}月${+m[3]}日（${'日月火水木金土'[d.getDay()]}）`;
}

/** ハッシュタグは必ず5個まで */
export function makeTags(S) {
  const tags = ['#島本町', '#少年サッカー'];
  const push = (t) => { if (t && !tags.includes(t) && tags.length < MAX_TAGS) tags.push(t); };
  push(TYPE_TAG[S.type]);
  if ((S.type === 'practice' || S.type === 'point') && S.grade) push(`#${S.grade}`);
  push('#SPORTFC');
  return tags.slice(0, MAX_TAGS);
}

export function countTags(text) { return (String(text).match(/[#＃][^\s#＃]+/g) || []).length; }

function themeOf(S) {
  if (S.theme === 'day') return { title: 'はじめての体験練習、こんな1日です', body: '「うちの子についていけるかな？」という方へ。はじめての体験練習の流れを紹介します。' };
  return { title: '島本町で小学1年生からサッカーを始めるなら', body: 'はじめてボールをける子も大丈夫。島本町で小学1年生からサッカーを始めたいご家庭へ、チームの雰囲気を紹介します。' };
}

/** リールの台本：画面に出す字と、撮るもの。顔がはっきり写らない撮り方をはじめから提案する */
export function reelScript(S) {
  const last = { text: '見学・無料体験 受付中', shot: 'チームのロゴかボールのアップ（プロフィールへ案内）' };
  if (S.theme === 'day') {
    return [
      { text: 'はじめての体験練習、こんな1日です', shot: 'グラウンドに向かう後ろ姿' },
      { text: 'まずはボールにさわるところから', shot: '足元とボールのアップ' },
      { text: 'コーチと一緒に、ミニゲーム', shot: 'ミニゲームを遠くから' },
      last,
    ];
  }
  return [
    { text: '島本町で小学1年生からサッカーを始めるなら', shot: 'グラウンドの全景' },
    { text: 'はじめてでも大丈夫', shot: '足元とボールのアップ' },
    { text: 'ボールにさわるところから、少しずつ', shot: '練習を遠くから・後ろ姿' },
    last,
  ];
}

/** 投稿文（検索される言葉を最初の行に置く） */
export function makeCaption(S) {
  const tone = S.tone in CLOSE ? S.tone : 'genki';
  const v = S.v || 0;
  const g = S.grade || '';
  const date = dateText(S.date);
  const icon = (x) => (tone === 'teinei' ? '' : `${x} `);
  const msg = clean(S.message);
  const blocks = [];
  let kind = 'report';

  if (S.type === 'point') {
    kind = 'invite';
    blocks.push(pointCaption(S).head);
    blocks.push('見学・無料体験は、プロフィールのリンクからどうぞ。');
  } else if (S.type === 'practice') {
    blocks.push(`【${g ? `${g} ` : ''}サッカー練習の様子】\n${WHO}の${date ? `${date}の` : ''}練習の様子です。`);
    if (clean(S.activity)) blocks.push(clean(S.activity));
  } else if (S.type === 'trial') {
    kind = 'invite';
    const target = clean(S.target) || '小学生';
    blocks.push(`【島本町 サッカー 見学・無料体験 受付中】\n${WHO}では、${target}の見学・無料体験を受け付けています。`);
    const info = [clean(S.trialDate) && `${icon('📅')}日程：${clean(S.trialDate)}`, clean(S.place) && `${icon('📍')}場所：${clean(S.place)}`].filter(Boolean);
    if (info.length) blocks.push(info.join('\n'));
    blocks.push('お申し込みは、プロフィールのリンクからどうぞ。');
  } else {
    kind = 'invite';
    const th = themeOf(S);
    blocks.push(`【${th.title}】\n${WHO}です。${th.body}`);
    blocks.push('見学・無料体験は、プロフィールのリンクからどうぞ。');
  }

  if (msg) blocks.push(msg);
  blocks.push(pick(CLOSE[tone][kind], v));
  blocks.push(makeTags(S).join(' '));
  return blocks.join('\n\n');
}

/** 画像に入れる字（空のときに使う、はじめの字） */
export function imageText(S) {
  const t = S.type;
  let title, sub = '';
  const details = [];
  if (t === 'point') {
    const voice = voiceText(S);
    if (voice && [...voice].length <= 36) { title = `「${voice}」`; sub = pointOf(S.point).title; }
    else { title = pointOf(S.point).title; sub = 'SPORT FCがめざす選手像'; }
  } else if (t === 'practice') {
    title = `${S.grade ? `${S.grade} ` : ''}練習の様子`; sub = dateText(S.date);
  } else if (t === 'trial') {
    title = '見学・無料体験 受付中'; sub = clean(S.target) || '小学生';
    if (clean(S.trialDate)) details.push(clean(S.trialDate));
    if (clean(S.place)) details.push(clean(S.place));
  } else {
    title = themeOf(S).title; sub = '見学・無料体験 受付中';
  }
  return { title, sub, details };
}

/** 保護者のLINEに送る、シェアのお願いの文 */
export function shareRequest() {
  return 'Instagramに新しい投稿をしました。\nよろしければ、ストーリーズでシェアしていただけるとうれしいです。\n（お子さんが写っている写真で気になるものがあれば、すぐに取り下げますのでお知らせください）\nhttps://www.instagram.com/sport_fc_since2015/';
}

/** 足りない入力のお知らせ */
export function problems(S) {
  const out = [];
  if (S.type === 'point' && !clean(S.scene)) out.push('「どんな場面がありましたか」を入れてください。1〜2行のメモで大丈夫です。');
  if (S.type === 'practice' && !clean(S.activity) && !clean(S.message)) out.push('「どんな練習だったか」を入れてください。文章が短くなります。');
  return out;
}

// ---------- めざす選手像（2026年11月23日、本人の希望） ----------
// 投稿の中心は「めざす選手像」。それに加えて見学・体験の案内。ふだんはAI社員が下書きを作る（インスタ/AI社員のルール.md）。
// ほかのチームの名前は出さない。中身はホームページ（2026年10月現在）に書いてあることだけ。

export const PILLARS = {
  all: 'SPORT FCがめざす選手像',
  muchu: 'サッカーに夢中になれる選手',
  handan: '自分で判断し、行動できる選手',
  sonchou: '仲間を尊重し、自分を大切にできる選手',
};

/** めざす選手像（3種類）。投稿は「その日に見つけた場面」からつくる（本人 2026年11月23日：
 *  決まった取り組みの話は、いつも投稿できる場面があるわけではない。その都度の場面を選手像につなげたい）
 *  hints：場面さがしのヒント（ふだんの練習・試合でよくある小さな場面）
 *  words：場面のメモから選手像を選ぶための言葉 */
export const POINTS = [
  { id: 'muchu', title: PILLARS.muchu,
    hints: ['休憩中もボールをけっている', '終わっても「もう1回！」', 'できなかった技に何度も挑戦', '家で練習してきたことを見せてくれた', '寒い日・暑い日でも楽しそう'],
    words: ['夢中', 'もう1回', 'もう一回', '何度も', 'なんども', '休憩', '楽しそう', '笑顔', '挑戦', 'チャレンジ', '自主練', '家で', '終わっても', 'できるように'] },
  { id: 'handan', title: PILLARS.handan,
    hints: ['準備や片付けを自分たちでやった', 'コートやゴールを自分たちで用意した', '作戦を子どもたちで話し合った', '言われる前に動いた', '自分でたてた目標に取り組んでいた'],
    words: ['自分たちで', '自分達で', '自分で', '準備', '片付け', '片づけ', 'コート', 'ゴール', 'コーン', '話し合', '作戦', '考えて', '言われる前', '目標', '判断', 'リーダー'] },
  { id: 'sonchou', title: PILLARS.sonchou,
    hints: ['ミスした仲間に「ドンマイ」', '転んだ子に手を貸した', '相手チームや審判にあいさつ・お礼', '年下の子に教えてあげた', 'キャプテンの日にがんばって声を出した'],
    words: ['仲間', 'ドンマイ', '声をかけ', '声かけ', '手を貸', '助け', 'あいさつ', '挨拶', 'ありがとう', 'お礼', '教えて', '年下', '下の学年', 'キャプテン', '励まし', 'はげま', '応援'] },
];
export const pointOf = (id) => POINTS.find((p) => p.id === id) || POINTS[0];

/** 場面のメモから、いちばん近い選手像を選ぶ（言葉が見つからなければ null） */
export function guessPoint(scene) {
  const t = String(scene || '');
  let best = null, n = 0;
  for (const p of POINTS) {
    const c = p.words.filter((w) => t.includes(w)).length;
    if (c > n) { best = p.id; n = c; }
  }
  return best;
}

const endDot = (x) => (/[。！？!?」）)]$/.test(x) ? x : `${x}。`);
const voiceText = (S) => clean(S.voice).replace(/^[「『]|[」』]$/g, '');

export function pointCaption(S) {
  const p = pointOf(S.point);
  const date = dateText(S.date);
  const who = [date, S.grade].filter(Boolean).join('、');
  const scene = clean(S.scene).split('\n').map((l) => l.trim()).filter(Boolean).map(endDot).join('\n');
  const voice = voiceText(S);
  const parts = [`【${PILLARS.all}｜${p.title}】\n${WHO}です。`];
  const body = [who && `${who}の一場面です。`, scene].filter(Boolean).join('\n');
  if (body) parts.push(body);
  if (voice) parts.push(`${clean(S.voiceWho) || 'まわりの方'}から「${voice}」と声をかけていただきました。`);
  parts.push(`SPORT FCがめざす選手像のひとつは「${p.title}」。\nこうした場面を、これからも大切にしていきます。`);
  return { head: parts.join('\n\n'), kind: 'invite' };
}
