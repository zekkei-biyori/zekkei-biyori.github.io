/*
 * アンサンブル信頼度の回帰テスト。
 * 境界値と、取れなかったときに機能を落として動き続けることを確かめる。
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("./sorami-core.js");

let pass = 0, fail = 0;
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? "  " + detail : ""}`); }
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

console.log("== 予測誤差への変換 ==");
ok(near(S.IQR_TO_EXPECTED_ERROR, 0.7979 / 1.349, 1e-3),
  "IQR→平均絶対誤差の係数が √(2/π)/1.349 に一致",
  `実際 ${S.IQR_TO_EXPECTED_ERROR}`);
// 実測の裏取り: 当日IQR中央値15 → 8.9点、実測MAE 9.5点（610標本）
const implied = 15 * S.IQR_TO_EXPECTED_ERROR;
ok(implied > 8 && implied < 10, "当日のIQR 15 が実測MAE 9.5点と同じ桁を指す", `${implied.toFixed(1)}点`);

console.log("== 信頼度の境界 ==");
ok(S.confidenceOfEnsemble(9.99).key === "high",  "9.99点 → 高");
ok(S.confidenceOfEnsemble(10).key === "medium",  "10点   → 中");
ok(S.confidenceOfEnsemble(19.99).key === "medium", "19.99点 → 中");
ok(S.confidenceOfEnsemble(20).key === "low",     "20点   → 低");
ok(S.confidenceOfEnsemble(0).key === "high",     "0点    → 高");

console.log("== ばらつきの計算 ==");
// 既知の分布を持つ偽メンバーを作り、IQR とヒストグラムを検算する。
const times = Array.from({ length: 48 }, (_, i) => Date.UTC(2026, 0, 1) + i * 3600000);
const fakeScorer = (values) => ({
  id: "test", source: "",
  window: () => [times[0], times[47]],
  score: (w, input) => ({ score: input.home.__v, base: 50, factors: [], unavailable: null }),
});
const members = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 55].map((v) => {
  const s = new S.Series(times, { cloud_cover: times.map(() => 1) });
  s.__v = v; return s;
});
const bundle = { ensemble: { members, elevation: 0 }, air: null };
const place = { latitude: 35, longitude: 139, elevation: 0 };
const sp = S.ensembleSpread(fakeScorer(), [times[0], times[47]], bundle, place, 0);
ok(sp !== null, "全メンバーが採点できればばらつきが返る");
ok(sp.members === 11, "メンバー数を数えている", `${sp && sp.members}`);
ok(sp.median === 55, "中央値", `${sp && sp.median}`);
ok(sp.histogram.reduce((a, b) => a + b, 0) === 11, "ヒストグラムの合計がメンバー数と一致");
ok(sp.scores.length === 11 && sp.scores[0] === 10, "生値を昇順で返す");

console.log("== 半数以上が採点できないときは使わない ==");
const badScorer = {
  id: "test", source: "", window: () => [times[0], times[47]],
  score: (w, input) => (input.home.__v > 70
    ? { score: input.home.__v, base: 50, factors: [], unavailable: null }
    : { unavailable: { reason: "missingData" }, score: 0, base: 0, factors: [] }),
};
// 11本中、採点できるのは 80/90/100 の3本だけ = 半数未満
const sp2 = S.ensembleSpread(badScorer, [times[0], times[47]], bundle, place, 0);
ok(sp2 === null, "採点できたのが半数未満なら null（推定として信用しない）");
// 境界の反対側: 6本（半数以上）なら返ること
const halfScorer = { ...badScorer,
  score: (w, input) => (input.home.__v >= 50
    ? { score: input.home.__v, base: 50, factors: [], unavailable: null }
    : { unavailable: { reason: "missingData" }, score: 0, base: 0, factors: [] }) };
const sp3 = S.ensembleSpread(halfScorer, [times[0], times[47]], bundle, place, 0);
ok(sp3 !== null && sp3.members === 7, "半数以上なら返る", `${sp3 && sp3.members}本`);

console.log("== アンサンブルが無いときは従来方式へ落ちる ==");
const noEns = S.ensembleSpread(fakeScorer(), [times[0], times[47]], { ensemble: null, air: null }, place, 0);
ok(noEns === null, "ensemble が null なら null を返す");
// 従来方式が生きていること
ok(S.confidenceOf(29).key === "high" && S.confidenceOf(30).key === "medium"
   && S.confidenceOf(55).key === "low", "8モデル幅の閾値 30/55 は従来どおり");
ok(S.leadTimePenalty(0) === 0 && S.leadTimePenalty(6) === 26 && S.leadTimePenalty(99) === 28,
  "従来のリードタイム下駄は据え置き（範囲外は末尾で頭打ち）");

console.log("== アンサンブルは点数そのものを動かさない ==");
ok(!String(S.SCORERS.sunset.score).includes("ensemble"),
  "採点器はアンサンブルを参照していない（点数は8モデル中央値のまま）");

console.log(`\n${fail === 0 ? "ENSEMBLE OK" : "FAILED"} — ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail === 0 ? 0 : 1);
