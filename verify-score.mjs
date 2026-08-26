/*
 * 「スコアそのもの」の誤差を測る。信頼度の閾値を推測で決めないための土台。
 *
 * これまで測ってきたのは雲量や降水といった【気象要素】の誤差だった。
 * だが利用者が見るのはスコアであり、要素の MAE 13.09 がスコアで何点のずれに
 * なるのかは分かっていなかった。信頼度の「高」が何を約束しているのかも決まらない。
 *
 * 方法:
 *   正解 = ERA5 再解析から採点したスコア
 *   予報 = historical-forecast-api（発表済み予報）から採点した 8 モデル中央値
 *   時刻 = 各日の日の入り
 *
 * 限界:
 *   - ERA5 に気圧面湿度・視程が無いので、両側とも雲量と降水だけで採点する。
 *     アプリの実スコアより単純だが、両側が同条件なので誤差の大きさは測れる。
 *   - 太陽方位オフセットも使わない（同上）。
 *   - アーカイブ予報は概ね当日〜翌日。数日先のスコア誤差は測れていない。
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("./sorami-core.js");

const SITES = [
  { name:"札幌",lat:43.06,lon:141.35 },{ name:"仙台",lat:38.27,lon:140.87 },
  { name:"東京",lat:35.68,lon:139.77 },{ name:"新潟",lat:37.90,lon:139.02 },
  { name:"名古屋",lat:35.18,lon:136.91 },{ name:"大阪",lat:34.69,lon:135.50 },
  { name:"広島",lat:34.39,lon:132.46 },{ name:"高知",lat:33.56,lon:133.53 },
  { name:"福岡",lat:33.59,lon:130.40 },{ name:"那覇",lat:26.21,lon:127.68 },
];
const VARS = ["cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "precipitation"];
const DAYS = Number(process.argv[2] || 60);
const end = new Date(Date.now() - 3 * 86400000);
const start = new Date(end.getTime() - DAYS * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const r = await fetch(url); const b = await r.json();
  if (!r.ok || b.error) throw new Error(b.reason || `HTTP ${r.status}`);
  return b;
}
const seriesOf = (raw, suffix) => {
  const times = raw.hourly.time.map((t) => t * 1000);
  const cols = {};
  for (const v of VARS) {
    // 単独モデル指定だとキーにサフィックスが付かない。両方の形を見る。
    const c = raw.hourly[`${v}${suffix}`] ?? raw.hourly[v];
    if (c && c.some((x) => x !== null)) cols[v] = c;
  }
  return Object.keys(cols).length ? new S.Series(times, cols) : null;
};
const scoreOf = (series, site, dayMs, elevation) => {
  const sc = S.SCORERS.sunset;
  const input = { home: series, offsets: {}, lat: site.lat, lon: site.lon,
    terrain: null, elevation, lightPollution: null, air: null };
  const w = sc.window(dayMs, input);
  if (!w) return null;
  const r = sc.score(w, input);
  return r.unavailable ? null : r.score;
};

const errs = [], truths = [], preds = [];
for (const site of SITES) {
  const q = (host, path, models) => `https://${host}/v1/${path}?latitude=${site.lat}&longitude=${site.lon}`
    + `&hourly=${VARS.join(",")}&start_date=${iso(start)}&end_date=${iso(end)}`
    + `&timezone=auto&timeformat=unixtime${models ? `&models=${models}` : ""}`;
  let era, fc;
  try {
    era = await get(q("archive-api.open-meteo.com", "archive", "")); await sleep(1200);
    fc  = await get(q("historical-forecast-api.open-meteo.com", "forecast", S.MODELS.join(","))); await sleep(1200);
  } catch (e) { console.error(`  ${site.name}: ${e.message}`); await sleep(15000); continue; }

  const truth = seriesOf(era, "");
  const models = S.MODELS.map((m) => seriesOf(fc, `_${m}`)).filter(Boolean);
  if (!truth || !models.length) { console.error(`  ${site.name}: 系列が組めず`); continue; }

  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = S.JstCal.startOfDay(t);
    const a = scoreOf(truth, site, day, era.elevation);
    const each = models.map((m) => scoreOf(m, site, day, fc.elevation)).filter((x) => x !== null);
    if (a === null || !each.length) continue;
    const p = S.Curve.median(each);
    errs.push(Math.abs(p - a)); truths.push(a); preds.push(p); n++;
  }
  console.error(`  ${site.name}: ${n}日  モデル${models.length}本`);
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.round((s.length - 1) * p)]; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\n夕焼けスコアの誤差（当日〜翌日の予報 vs ERA5 再解析）  n=${errs.length}`);
console.log(`  平均絶対誤差 (MAE)  ${mean(errs).toFixed(1)} 点`);
console.log(`  中央値              ${pct(errs,.5).toFixed(1)} 点`);
console.log(`  p75                 ${pct(errs,.75).toFixed(1)} 点`);
console.log(`  p90                 ${pct(errs,.9).toFixed(1)} 点`);
const bias = mean(preds.map((p, i) => p - truths[i]));
console.log(`  偏り                ${bias >= 0 ? "+" : ""}${bias.toFixed(1)} 点`);

console.log(`\nランクが変わるほどの誤差が出た割合`);
for (const th of [10, 15, 20, 25]) {
  const c = errs.filter((e) => e >= th).length;
  console.log(`  ${String(th).padStart(2)}点以上ずれた  ${(100 * c / errs.length).toFixed(0)}%`);
}
console.log(`\nこの誤差はランク幅（絶景85/良好65/平凡40）と比べて読む。`);
console.log(`ランクの境目は 20〜25 点間隔なので、20 点以上のずれはランクが変わる。`);
