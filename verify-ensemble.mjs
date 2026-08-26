/*
 * ECMWF 51メンバーアンサンブルの「ばらつき」が、8モデルの見解の割れより
 * 予報の不確かさを正しく表しているかを測る。
 *
 * 背景:
 *   信頼度はモデル間のばらつきから出しているが、実測すると
 *   ばらつきは日数とともにほとんど広がらなかった（54.8 / 77.9 / 67.4）。
 *   そのため日数ぶんの下駄（0/6/12/16/20/23/26/28）を手当てで足している。
 *   この下駄は「相関の落ち方に合わせた見立て」であって実測値ではない。
 *
 * 仮説:
 *   ECMWF の51メンバーは初期値を摂動させた本物の不確実性推定なので、
 *   スコアのばらつきがリードタイムとともに単調に広がるはず。
 *   そうであれば、手当ての下駄を実測量へ置き換えられる。
 *
 * 限界（結論を読むときに必ず併せて見ること）:
 *   - アンサンブルAPIに過去アーカイブが無いため（start_date も previous_dayN も
 *     全 null を返すことを実測確認済み）、ERA5 との突き合わせができない。
 *     測れるのは「ばらつきの構造」であって「当たり具合」ではない。
 *   - 太陽方位側のオフセット地点は使わず自地点のみで採点する。
 *     8モデル側も同条件にしてあるので比較としては公平。
 *   - visibility はアンサンブルでは全 null（実測確認済み）。scorer 側が
 *     isSupported で扱うため、両者ともこの要素は寄与しない。
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("./sorami-core.js");

const SITES = [
  { name: "稚内", lat: 45.42, lon: 141.68 }, { name: "札幌", lat: 43.06, lon: 141.35 },
  { name: "釧路", lat: 42.98, lon: 144.38 }, { name: "青森", lat: 40.82, lon: 140.75 },
  { name: "秋田", lat: 39.72, lon: 140.10 }, { name: "仙台", lat: 38.27, lon: 140.87 },
  { name: "新潟", lat: 37.90, lon: 139.02 }, { name: "金沢", lat: 36.59, lon: 136.63 },
  { name: "長野", lat: 36.65, lon: 138.18 }, { name: "東京", lat: 35.68, lon: 139.77 },
  { name: "静岡", lat: 34.98, lon: 138.38 }, { name: "名古屋", lat: 35.18, lon: 136.91 },
  { name: "大阪", lat: 34.69, lon: 135.50 }, { name: "鳥取", lat: 35.50, lon: 134.24 },
  { name: "広島", lat: 34.39, lon: 132.46 }, { name: "高知", lat: 33.56, lon: 133.53 },
  { name: "福岡", lat: 33.59, lon: 130.40 }, { name: "宮崎", lat: 31.91, lon: 131.42 },
  { name: "鹿児島", lat: 31.60, lon: 130.56 }, { name: "那覇", lat: 26.21, lon: 127.68 },
];

// アンサンブルが返す変数だけに絞る。visibility は全 null なので外す。
// 夕焼けの採点が実際に読む変数だけ。転送量とAPIコストを抑える。
const ENS_VARS = ["cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "precipitation",
  "relative_humidity_925hPa", "relative_humidity_850hPa", "relative_humidity_700hPa",
  "relative_humidity_500hPa", "relative_humidity_300hPa", "relative_humidity_200hPa"];
const DAYS = 7;
const MEMBERS = ["", ...Array.from({ length: 50 }, (_, i) => `_member${String(i + 1).padStart(2, "0")}`)];

async function fetchJSON(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.reason || `HTTP ${res.status}`);
  return body;
}

async function fetchEnsemble(site) {
  const p = new URLSearchParams({
    latitude: site.lat.toFixed(4), longitude: site.lon.toFixed(4),
    hourly: ENS_VARS.join(","), models: "ecmwf_ifs025",
    timezone: "auto", timeformat: "unixtime", forecast_days: String(DAYS),
  });
  const raw = await fetchJSON(`https://ensemble-api.open-meteo.com/v1/ensemble?${p}`);
  const times = raw.hourly.time.map((t) => t * 1000);
  const out = [];
  for (const suffix of MEMBERS) {
    const columns = {};
    for (const v of ENS_VARS) {
      const c = raw.hourly[`${v}${suffix}`];
      if (c && c.some((x) => x !== null)) columns[v] = c;
    }
    if (Object.keys(columns).length) out.push(new S.Series(times, columns));
  }
  return { series: out, elevation: raw.elevation };
}

async function fetchModels(site) {
  const p = new URLSearchParams({
    latitude: site.lat.toFixed(4), longitude: site.lon.toFixed(4),
    hourly: ENS_VARS.join(","), models: S.MODELS.join(","),
    timezone: "auto", timeformat: "unixtime", forecast_days: String(DAYS),
  });
  const raw = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${p}`);
  const times = raw.hourly.time.map((t) => t * 1000);
  const out = [];
  for (const m of S.MODELS) {
    const columns = {};
    for (const v of ENS_VARS) {
      const c = raw.hourly[`${v}_${m}`];
      if (c && c.some((x) => x !== null)) columns[v] = c;
    }
    if (Object.keys(columns).length) out.push(new S.Series(times, columns));
  }
  return { series: out, elevation: raw.elevation };
}

// 1地点1日ぶんのスコア分布を出す。
function scoresFor(seriesList, elevation, site, dayMs) {
  const scorer = S.SCORERS.sunset;
  const input = (s) => ({ home: s, offsets: {}, lat: site.lat, lon: site.lon,
    terrain: null, elevation, lightPollution: null, air: null });
  const window = scorer.window(dayMs, input(seriesList[0]));
  if (!window) return null;
  const out = [];
  for (const s of seriesList) {
    const r = scorer.score(window, input(s));
    if (!r.unavailable) out.push(r.score);
  }
  return out.length ? out : null;
}

const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.round((s.length - 1) * p)];
  const mean = s.reduce((x, y) => x + y, 0) / s.length;
  const sd = Math.sqrt(s.reduce((acc, v) => acc + (v - mean) ** 2, 0) / s.length);
  return { width: s[s.length - 1] - s[0], iqr: q(0.75) - q(0.25), sd, median: q(0.5) };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const today = S.JstCal.startOfDay(Date.now());
const ens = Array.from({ length: DAYS }, () => []);
const mod = Array.from({ length: DAYS }, () => []);
const pairs = [];   // 同じ(地点,日)での両者の比較

for (const site of SITES) {
  let e, m;
  try {
    e = await fetchEnsemble(site);
    await sleep(1500);
    m = await fetchModels(site);
    await sleep(1500);
  } catch (err) {
    console.error(`  ${site.name}: ${err.message}`);
    await sleep(20000);   // レート制限なら待って次へ
    continue;
  }
  console.error(`  ${site.name}: アンサンブル ${e.series.length}本 / モデル ${m.series.length}本`);
  for (let d = 0; d < DAYS; d++) {
    const dayMs = today + d * 86400000;
    const se = scoresFor(e.series, e.elevation, site, dayMs);
    const sm = scoresFor(m.series, m.elevation, site, dayMs);
    if (se) ens[d].push(stats(se));
    if (sm) mod[d].push(stats(sm));
    if (se && sm) pairs.push({ d, e: stats(se), m: stats(sm) });
  }
}

const avg = (rows, key) => rows.length
  ? (rows.reduce((a, r) => a + r[key], 0) / rows.length) : null;

console.log("\n夕焼けスコアのばらつき（10地点平均・自地点のみで採点）\n");
console.log("        ECMWF 51メンバー          8モデル");
console.log("日先   幅     IQR    標準偏差   幅     IQR    標準偏差");
const f = (x) => x === null ? "  —  " : x.toFixed(1).padStart(5);
for (let d = 0; d < DAYS; d++) {
  console.log(`  +${d}  ${f(avg(ens[d],"width"))} ${f(avg(ens[d],"iqr"))} ${f(avg(ens[d],"sd"))}    ` +
              `${f(avg(mod[d],"width"))} ${f(avg(mod[d],"iqr"))} ${f(avg(mod[d],"sd"))}   (n=${ens[d].length})`);
}

// 単調性: 日数とばらつきの相関
const corr = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, dx=0, dy=0;
  for (let i=0;i<n;i++){ const a=xs[i]-mx, b=ys[i]-my; num+=a*b; dx+=a*a; dy+=b*b; }
  return num / Math.sqrt(dx*dy);
};
const days = [], ew = [], mw = [], esd = [], msd = [];
for (let d = 0; d < DAYS; d++) {
  if (!ens[d].length || !mod[d].length) continue;
  days.push(d); ew.push(avg(ens[d],"width")); mw.push(avg(mod[d],"width"));
  esd.push(avg(ens[d],"sd")); msd.push(avg(mod[d],"sd"));
}
console.log("\n日数との相関（1に近いほど「先の日ほどばらつく」）");
console.log(`  ECMWF 51メンバー  幅 ${corr(days,ew).toFixed(3)}   標準偏差 ${corr(days,esd).toFixed(3)}`);
console.log(`  8モデル           幅 ${corr(days,mw).toFixed(3)}   標準偏差 ${corr(days,msd).toFixed(3)}`);

// --- 中央値そのものの差。ここが小さいならスコアは変わらない ---
const dm = pairs.map((p) => p.e.median - p.m.median);
const absMean = dm.reduce((a, b) => a + Math.abs(b), 0) / dm.length;
const bias = dm.reduce((a, b) => a + b, 0) / dm.length;
console.log("\n中央値スコアの差（51メンバー − 8モデル）");
console.log(`  平均絶対差 ${absMean.toFixed(1)}点   偏り ${bias >= 0 ? "+" : ""}${bias.toFixed(1)}点   n=${dm.length}`);
const big = dm.filter((x) => Math.abs(x) >= 10).length;
console.log(`  10点以上ずれた割合 ${(100 * big / dm.length).toFixed(0)}%   ランクが変わり得る差`);

// --- 両者の不確かさ推定は同じ日を「不確か」と言うか ---
console.log("\n不確かさ推定の一致（標準偏差どうしの相関）");
console.log(`  ${corr(pairs.map((p) => p.e.sd), pairs.map((p) => p.m.sd)).toFixed(3)}`);
console.log("  1に近い＝同じ日を不確かと判断。低い＝どちらかが誤っているが、");
console.log("  アンサンブルの過去アーカイブが無いため、どちらが正しいかは判定できない。");
