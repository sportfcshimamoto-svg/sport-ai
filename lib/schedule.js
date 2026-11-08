// 学年ごとのひな形と、対戦の組み合わせ・時間の計算。
// 並び順は、これまでの SPORT CUP（2023〜2024年度）で実際に使ってきた順番にそろえている。

/** 学年ごとのひな形（要項を読み込んだときは、要項の内容が優先） */
export const GRADES = [
  { id: 'U7', label: 'U-7', target: '1年生以下', half: 12, brk: 5, format: 'two3', start: '9:50', gap: 10, finalsGap: 20, finalsRef: false },
  { id: 'U8', label: 'U-8', target: '2年生以下', half: 15, brk: 5, format: 'rr', start: '9:40', gap: 5, finalsRef: true },
  { id: 'U9', label: 'U-9', target: '3年生以下', half: 15, brk: 5, format: 'rr', start: '9:45', gap: 10, finalsRef: true },
  { id: 'U10', label: 'U-10', target: '4年生以下', half: 15, brk: 5, format: 'rr', start: '9:40', gap: 5, finalsRef: true },
  { id: 'U11', label: 'U-11', target: '5年生以下', half: 15, brk: 5, format: 'two3', start: '9:50', gap: 10, finalsGap: 20, finalsRef: true },
  { id: 'U12', label: 'U-12', target: '6年生以下', half: 15, brk: 5, format: 'two3', start: '9:50', gap: 10, finalsGap: 20, finalsRef: true },
];
// finalsGap：予選リーグが終わってから順位決定戦までのあき（分）。2026年11月 本人の希望で20分
export const FINALS_GAP = 20;
export const gradeOf = (id) => GRADES.find((g) => g.id === id) || GRADES[5];

export const FORMATS = {
  rr: '全チーム総当たり（1リーグ）',
  two3: '3チーム×2リーグ ＋ 順位決定戦（2コート）',
};

// ---------- 時刻 ----------
export const toMin = (s) => { const m = String(s || '').replace(/[：:]/, ':').match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
export const toHM = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

// ---------- 総当たりの順番 ----------
// 4チーム：見本どおり（①1-3 ②4-2 ③2-1 ④3-4 ⑤2-3 ⑥4-1）
const RR_FIXED = {
  2: [[0, 1], [1, 0], [0, 1]],                       // 2チームは3本（TMと同じ）
  3: [[0, 1], [2, 0], [1, 2]],
  4: [[0, 2], [3, 1], [1, 0], [2, 3], [1, 2], [3, 0]],
};

/** n チームの総当たりの順番（同じチームが続けて試合をしにくい並び） */
export function roundRobin(n) {
  if (RR_FIXED[n]) return RR_FIXED[n].map((p) => p.slice());
  // 5チーム以上：円の方法で「節」を作り、節ごとに並べる
  const ids = [...Array(n).keys()];
  if (n % 2) ids.push(-1);
  const m = ids.length, out = [];
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i], b = ids[m - 1 - i];
      if (a >= 0 && b >= 0) out.push(r % 2 ? [b, a] : [a, b]);
    }
    ids.splice(1, 0, ids.pop());
  }
  return out;
}

/**
 * 試合の一覧を作る
 * t: { format, teams:[名前], leagues:[名前,名前], courts, start, matchMin, gap, finalsGap, finalsRef, exchange }
 *   gap：試合と試合のあいだ（分）／finalsGap：予選リーグのあと、順位決定戦までのあいだ（分。2リーグの形だけ）
 * 返り値: { leagues:[{name, teams}], courts:[{name, matches:[{no, from, to, home, away, ref, note}]}] }
 */
export function buildSchedule(t) {
  const teams = t.teams.filter(Boolean);
  const start = toMin(t.start);
  const step = Number(t.matchMin) + Number(t.gap);
  // 2リーグの形は、4試合目（順位決定戦）からは finalsGap だけあける
  const fg = t.format === 'two3' && t.finalsGap != null && t.finalsGap !== '' ? Number(t.finalsGap) - Number(t.gap) : 0;
  const at = (i) => start + i * step + (i >= 3 ? fg : 0);
  const time = (i) => ({ from: toHM(at(i)), to: toHM(at(i) + Number(t.matchMin)) });
  const m = (i, home, away, ref = '相互') => ({ no: i + 1, ...time(i), home, away, ref });

  if (t.format === 'two3') {
    const [ln1, ln2] = t.leagues;
    const a = teams.slice(0, 3), b = teams.slice(3, 6);
    const s1 = ln1.replace(/リーグ$/, ''), s2 = ln2.replace(/リーグ$/, '');
    const k1 = s1.slice(0, 2), k2 = s2.slice(0, 2);       // 「くす」「やま」
    const ref = (x) => (t.finalsRef ? x : '相互');
    const A = [
      m(0, a[0], a[1]), m(1, b[2], b[1]), m(2, a[2], a[0]),
      m(3, `${s1}2位`, `${s2}2位`, ref(`${k2}1位`)),
      m(4, `${s1}1位`, `${s2}1位`, ref(`${k2}3位`)),
    ];
    const B = [
      m(0, b[1], b[0]), m(1, a[1], a[2]), m(2, b[0], b[2]),
      m(3, `${s1}3位`, `${s2}3位`, ref(`${k1}1位`)),
    ];
    if (t.exchange) A.push({ no: 6, note: t.exchange });
    return {
      leagues: [{ name: ln1, teams: a }, { name: ln2, teams: b }],
      courts: [{ name: 'Aコート', matches: A }, { name: 'Bコート', matches: B }],
    };
  }

  // 総当たり
  const order = roundRobin(teams.length);
  const nCourt = Math.max(1, Math.min(2, Number(t.courts) || 1));
  const courts = [...Array(nCourt)].map((_, i) => ({ name: nCourt > 1 ? `${'AB'[i]}コート` : '', matches: [] }));
  order.forEach(([x, y], i) => {
    const c = courts[i % nCourt];
    c.matches.push(m(c.matches.length, teams[x], teams[y]));
  });
  return { leagues: [{ name: '', teams }], courts };
}

/** 競技時間の書き方「15-5-15」 */
export const timeLabel = (t) => `${t.half}-${t.brk}-${t.half}`;
