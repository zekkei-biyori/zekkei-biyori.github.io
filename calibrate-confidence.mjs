/*
 * 信頼度の閾値を実測で決める。推測でなく分布から選ぶ。
 *
 * 目標とする分布:
 *   +0日  … 高・中・低が分かれる（当日でも荒れる日はある）
 *   +6日  … ほぼ低（実測スキルが当日の1/4まで落ちるため）
 *   同じ日先でも地点・日によって差が出る（＝アンサンブルを入れた意味）
 *
 * 使い方: node calibrate-confidence.mjs [閾値高] [閾値中]
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("./sorami-core.js");

const SITES = [
  { name:"稚内",lat:45.42,lon:141.68,elevation:3 },{ name:"札幌",lat:43.06,lon:141.35,elevation:26 },
  { name:"釧路",lat:42.98,lon:144.38,elevation:5 },{ name:"青森",lat:40.82,lon:140.75,elevation:3 },
  { name:"秋田",lat:39.72,lon:140.10,elevation:9 },{ name:"仙台",lat:38.27,lon:140.87,elevation:39 },
  { name:"新潟",lat:37.90,lon:139.02,elevation:2 },{ name:"金沢",lat:36.59,lon:136.63,elevation:6 },
  { name:"長野",lat:36.65,lon:138.18,elevation:418 },{ name:"東京",lat:35.68,lon:139.77,elevation:25 },
  { name:"静岡",lat:34.98,lon:138.38,elevation:14 },{ name:"名古屋",lat:35.18,lon:136.91,elevation:51 },
  { name:"大阪",lat:34.69,lon:135.50,elevation:23 },{ name:"鳥取",lat:35.50,lon:134.24,elevation:7 },
  { name:"広島",lat:34.39,lon:132.46,elevation:4 },{ name:"高知",lat:33.56,lon:133.53,elevation:1 },
  { name:"福岡",lat:33.59,lon:130.40,elevation:3 },{ name:"宮崎",lat:31.91,lon:131.42,elevation:9 },
  { name:"鹿児島",lat:31.60,lon:130.56,elevation:4 },{ name:"那覇",lat:26.21,lon:127.68,elevation:28 },
];
const PHENOMENA = ["sunset", "sunrise", "starrySky", "rainbow", "seaOfClouds"];
const DAYS = 7;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
let ensOk = 0, ensFail = 0;
for (const site of SITES) {
  let bundle;
  const t0 = Date.now();
  try { bundle = await S.fetchForecast(site.lat, site.lon, DAYS + 1); }
  catch (e) { console.error(`  ${site.name}: ${e.message}`); await sleep(15000); continue; }
  const fetchMs = Date.now() - t0;
  if (bundle.ensemble) ensOk++; else ensFail++;
  const place = { latitude: site.lat, longitude: site.lon, elevation: site.elevation };
  const t1 = Date.now();
  const today = S.JstCal.startOfDay(Date.now());
  for (let d = 0; d < DAYS; d++) {
    for (const ph of PHENOMENA) {
      const ev = S.evaluate(ph, today + d * 86400000, bundle, place);
      if (!ev || ev.unavailable || !ev.uncertainty) continue;
      rows.push({ site: site.name, d, ph, ...ev.uncertainty, score: ev.score, conf: ev.confidence.label });
    }
  }
  const scoreMs = Date.now() - t1;
  console.error(`  ${site.name}  取得 ${fetchMs}ms  採点 ${scoreMs}ms  ens=${bundle.ensemble ? bundle.ensemble.members.length + "本" : "なし"}`);
  await sleep(2000);
}

console.log(`\nアンサンブル取得: 成功 ${ensOk} / 失敗 ${ensFail}`);
const ensRows = rows.filter((r) => r.basis === "ensemble");
console.log(`標本 ${rows.length}（うちアンサンブル基準 ${ensRows.length}）\n`);

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.round((s.length - 1) * p)]; };
console.log("【IQR の分布（現象別・全日）】");
for (const ph of PHENOMENA) {
  const a = ensRows.filter((r) => r.ph === ph).map((r) => r.ensembleIqr);
  if (!a.length) { console.log(`  ${ph.padEnd(8)} 標本なし`); continue; }
  console.log(`  ${ph.padEnd(8)} p10 ${pct(a,.1).toFixed(0).padStart(3)}  p25 ${pct(a,.25).toFixed(0).padStart(3)}  中央 ${pct(a,.5).toFixed(0).padStart(3)}  p75 ${pct(a,.75).toFixed(0).padStart(3)}  p90 ${pct(a,.9).toFixed(0).padStart(3)}  n=${a.length}`);
}

console.log("\n【日先ごとの予測誤差（点）】");
for (let d = 0; d < DAYS; d++) {
  const a = ensRows.filter((r) => r.d === d).map((r) => r.expectedError);
  if (!a.length) continue;
  console.log(`  +${d}  p25 ${pct(a,.25).toFixed(0).padStart(3)}  中央 ${pct(a,.5).toFixed(0).padStart(3)}  p75 ${pct(a,.75).toFixed(0).padStart(3)}   n=${a.length}`);
}

const hi = Number(process.argv[2] || 10), mid = Number(process.argv[3] || 20);
console.log(`\n【閾値 ${hi} / ${mid} でのランク分布】`);
console.log("日先    高    中    低");
for (let d = 0; d < DAYS; d++) {
  const a = ensRows.filter((r) => r.d === d);
  if (!a.length) continue;
  const h = a.filter((r) => r.expectedError < hi).length;
  const m = a.filter((r) => r.expectedError >= hi && r.expectedError < mid).length;
  const l = a.filter((r) => r.expectedError >= mid).length;
  const p = (x) => `${(100 * x / a.length).toFixed(0)}%`.padStart(5);
  console.log(`  +${d} ${p(h)} ${p(m)} ${p(l)}`);
}
const h = ensRows.filter((r) => r.expectedError < hi).length;
const m = ensRows.filter((r) => r.expectedError >= hi && r.expectedError < mid).length;
console.log(`  全体 ${(100*h/ensRows.length).toFixed(0)}% / ${(100*m/ensRows.length).toFixed(0)}% / ${(100*(ensRows.length-h-m)/ensRows.length).toFixed(0)}%`);

// 従来方式との比較
console.log("\n【従来（8モデル幅）だとどうなっていたか】");
const oldConf = (r) => { const w = r.modelWidth + S.leadTimePenalty(r.d); return w < 30 ? "高" : w < 55 ? "中" : "低"; };
const newConf = (r) => r.expectedError < hi ? "高" : r.total < mid ? "中" : "低";
let same = 0; const move = {};
for (const r of ensRows) {
  const o = oldConf(r), n = newConf(r);
  if (o === n) same++; else move[`${o}→${n}`] = (move[`${o}→${n}`] || 0) + 1;
}
console.log(`  一致 ${(100*same/ensRows.length).toFixed(0)}%`);
console.log("  " + Object.entries(move).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}件`).join("  "));

// 同じ日先の中でどれだけ差がつくか（アンサンブルを入れた意味）
console.log("\n【同じ日先の中でのばらけ方＝アンサンブルを入れた意味】");
for (let d of [0, 3, 6]) {
  const a = ensRows.filter((r) => r.d === d);
  if (!a.length) continue;
  const labels = new Set(a.map(newConf));
  console.log(`  +${d}日: ${[...labels].join("/")}  （従来は日数が同じなら下駄も同じで、幅だけで決まっていた）`);
}
