/*
 * 実況照合の回帰テスト。
 *
 * ここは「予報が実際と違うのに気づけない」を潰すための仕掛けなので、
 * 鳴らないこと（誤検知）と鳴ること（見逃し）の両方を固定する。
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("./sorami-core.js");

let pass = 0, fail = 0;
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? "  " + detail : ""}`); }
};

const station = (name, elevation) => ({ id: name, name, elevation, latitude: 0, longitude: 0 });
// 予報側。全モデルが同じ値を返す最小の Series 代用。
const home = (gridElevation, values) => ({
  grid: { latitude: 0, longitude: 0, elevation: gridElevation },
  byModel: { stub: { isSupported: (v) => v in values, valueAt: (v) => values[v] ?? null } },
});
const obs = (o) => ({
  station: o.station, distanceKm: o.distanceKm ?? 2, observedAt: 0,
  temperature: o.temperature ?? null, humidity: null,
  precipitation1h: o.precipitation1h ?? null, precipitation10m: null,
  sunshine1h: null, wind: null,
  supplementedFrom: o.supplementedFrom ?? {},
  fieldStation: o.fieldStation ?? { temperature: o.station },
});
const messages = (o, h) => S.Nowcast.compare(o, h).map((d) => d.message);

console.log("== 平地では今までどおり ==");
ok(messages(obs({ station: station("東京", 25), temperature: 26.7 }),
            home(10, { temperature_2m: 26.0 })).length === 0, "1℃差では鳴らない");
ok(/気温が実況 26\.7℃ に対し予報 19\.0℃/.test(
     messages(obs({ station: station("東京", 25), temperature: 26.7 }),
              home(10, { temperature_2m: 19.0 }))[0] ?? ""), "7.7℃差なら鳴る");
ok(messages(obs({ station: station("東京", 25), temperature: 26.7 }),
            home(10, { temperature_2m: 22.0 })).length === 0, "4.7℃差はまだ鳴らない（許容5℃）");

console.log("== 山の上を谷底の観測で否定しない ==");
// 実データ 2026-08-27 14:10。蔵王(予報標高1764m)の最寄りが山形(153m)。
// 減率で補正すると 24.9 - 6.5×1.611 = 14.4℃ で、予報 15.1℃ とほぼ一致する。
// 補正前は 9.8℃差で「ずれています」と出していた。
const zao = obs({ station: station("山形", 153), temperature: 24.9, distanceKm: 15 });
ok(messages(zao, home(1764, { temperature_2m: 15.1 })).length === 0,
  "標高差1611mの実況と一致する予報を否定しない");
ok(S.Nowcast.lapseRateCPerKm === 6.5, "標準大気の減率を使う");

console.log("== 標高差があっても本当に外れていれば鳴る ==");
// 許容幅は 5 + 1.611×3 = 9.8℃。補正後の差がそれを超えたら鳴る。
const wrong = messages(zao, home(1764, { temperature_2m: 2.0 }))[0] ?? "";
ok(wrong.length > 0, "補正しても12.4℃ずれていれば鳴る");
ok(/標高差\+1611m を補正して 14\.4℃/.test(wrong), "何と何を比べたかを書く", wrong);
ok(/山形 標高153m/.test(wrong), "どの観測点かを書く", wrong);
// 補正が当てにならない分だけ許容を広げているか。
ok(messages(zao, home(1764, { temperature_2m: 8.0 })).length === 0,
  "標高差が大きいときは許容幅も広い（6.4℃差では鳴らさない）");

console.log("== 出所の追跡 ==");
// 最寄り地点が気温を持たず別地点から補完した場合、補完元の標高で補正する。
const supplemented = obs({
  station: station("坂浦", 223), temperature: 25.7,
  supplementedFrom: { 気温: "宮津 15km・標高差-831m" },
  fieldStation: { temperature: station("宮津", 2) },
});
const msg = messages(supplemented, home(833, { temperature_2m: 20.3 }));
ok(msg.length === 0, "補完元の標高で補正する（25.7 - 6.5×0.831 = 20.3℃）", JSON.stringify(msg));

console.log("== 標高差があれば直した値を出す ==");
// 注記だけ足しても、見出しには10℃違う数字が残る。直した値そのものを出す。
const est = (t, target, st) =>
  S.Amedas.estimatedTemperature({ fieldStation: { temperature: st }, targetElevation: target, temperature: t });
const note = (t, target, st) =>
  S.Amedas.elevationNote({ fieldStation: { temperature: st }, targetElevation: target, temperature: t });

const zaoEst = est(24.9, 1660, station("山形", 153));
ok(zaoEst !== null && Math.abs(zaoEst.value - 15.1) < 0.05,
  "山形24.9℃・標高差1507m → 約15.1℃", String(zaoEst?.value));
ok(zaoEst.raw === 24.9, "元の観測値も残す");
ok(est(26.7, 10, station("東京", 25)) === null, "標高差が小さければ直さない（そのまま実況）");
ok(est(27.7, 353, station("和田山", 80)) === null, "273m では直さない（閾値300m）");
const lowEst = est(5.0, 100, station("浪合", 1240));
ok(lowEst !== null && Math.abs(lowEst.value - 12.4) < 0.05,
  "観測点のほうが高ければ上げる方向へ直す", String(lowEst?.value));
ok(est(24.9, null, station("山形", 153)) === null, "地点の標高が分からなければ直さない");
ok(est(null, 1660, station("山形", 153)) === null, "気温が欠測なら直さない");

console.log("== 何をどう直したかを書く ==");
const zaoNote = note(24.9, 1660, station("山形", 153)) ?? "";
ok(/山形（標高153m）の 24\.9℃/.test(zaoNote), "元の観測点と値を書く", zaoNote);
ok(/1507m 高いぶんを補正した推定/.test(zaoNote), "推定であることを書く", zaoNote);
ok(/天気・湿度はふもとの値/.test(zaoNote), "直せない値はふもとのままだと書く", zaoNote);
ok(note(26.7, 10, station("東京", 25)) === null, "直していなければ注記も出さない");

console.log("== 降水の照合は据え置き ==");
// 2026-08-22 18:00、練馬で 11.5mm/h の最中に jma_msm が 0.0mm を出していた実例。
const rain = messages(obs({ station: station("練馬", 47), temperature: 24.3, precipitation1h: 11.5 }),
                      home(47, { temperature_2m: 24.0, precipitation: 0.0 }));
ok(rain.some((m) => /実況で 11\.5mm\/h/.test(m)), "予報が降水なしで実況が豪雨なら鳴る", JSON.stringify(rain));
const dry = messages(obs({ station: station("東京", 25), temperature: 26.0, precipitation1h: 0 }),
                     home(25, { temperature_2m: 26.0, precipitation: 2.5 }));
ok(dry.some((m) => /実況では降っていません/.test(m)), "予報が雨で実況が無降水なら鳴る", JSON.stringify(dry));

console.log("== 欠測は鳴らさない ==");
ok(messages(obs({ station: station("東京", 25), temperature: null }),
            home(10, { temperature_2m: 19.0 })).length === 0, "実況の気温が無ければ判定しない");
ok(messages(obs({ station: station("東京", 25), temperature: 26.7 }),
            home(10, {})).length === 0, "予報の気温が無ければ判定しない");

console.log(`\n${fail === 0 ? "NOWCAST OK" : "FAILED"} — ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail === 0 ? 0 : 1);
