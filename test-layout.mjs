/*
 * レイアウトの回帰テスト。
 * 一度踏んだ構造上のバグを、CSS を触るたびに再発させないため。
 */
import fs from "node:fs";
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

let pass = 0, fail = 0;
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? "  " + detail : ""}`); }
};

// コメント内の文言を拾わないよう、判定前に /* */ を落とす。
const code = html.replace(/\/\*[\s\S]*?\*\//g, "");

console.log("== sticky を使わない ==");
// 右ペインを sticky にしていたとき、包含ブロックが記録カードの行まで伸び、
// スクロールすると週間の行が記録カードの上に描画された（551点中361点が被覆）。
ok(!/position:\s*sticky/.test(code), "レイアウトに position: sticky が無い");

console.log("== 週の一覧（マトリクス）が主役 ==");
ok(/id="matrix"/.test(html), "#matrix がある");
ok(/function renderMatrix/.test(html), "renderMatrix がある");
ok(html.indexOf('id="matrix"') < html.indexOf('id="detailPane"'),
  "マトリクスが詳細より前にある");
ok(/data-cell=/.test(html), "セルが押せる（data-cell）");
ok(/mx-legend/.test(html), "色の凡例がある");
// 対象外の行（雲海・霧氷・ダイヤモンドダスト）には押せるセルが1つも無い。
// 名前が押せないと、それらの詳細（週間・理由）へ到達する手段がまったく無くなる。
ok(/<button class="lbl\$\{on\}" data-pick=/.test(html), "現象名が押せる");
ok(/<button class="na" data-pick=/.test(html), "対象外の行も押せる");
// 日を指定しない経路（名前・プルダウン）は pick() が直近の回へ合わせる。
const pickFn = html.slice(html.indexOf("function pick(id, now, dayMs)"),
                          html.indexOf("function pick(id, now, dayMs)") + 400);
ok(/upcoming\(weeks\[id\], now\)/.test(pickFn), "日を指定しなければ直近の回に合わせる");
ok(/dayMs !== undefined && dayMs !== null \? dayMs/.test(pickFn), "日を指定したときはその日を使う");
// セル幅は 375px 端末で 27px しかなく、評価の言葉を入れると3行に折り返して読めなかった。
ok(!/class="r" style="color:\$\{color\}">\$\{esc\(S\.phrasing/.test(html),
  "セルに評価の言葉を入れていない（折り返して読めなくなる）");

console.log("== 点数より評価を大きく出す ==");
// 実測誤差は ±9.5 点。以前は数字 38.4px に対し「±8点」が 11px と 3.5 倍の差があった。
const verdict = html.match(/\.highlight \.verdict \{[^}]*font-size:\s*([\d.]+)rem/);
const big = html.match(/\.highlight \.big \{[^}]*font-size:\s*([\d.]+)rem/);
ok(verdict && big, "verdict と big の指定がある");
ok(verdict && big && Number(verdict[1]) > Number(big[1]),
  "評価の言葉が点数より大きい", verdict && big ? `${verdict[1]}rem vs ${big[1]}rem` : "");
ok(/function renderVerdict/.test(html) && /±\$\{err\}/.test(html),
  "点数に誤差が並記されている");
ok(/class="band"/.test(html), "バーに動きうる幅の帯がある");

console.log("== 一覧と詳細は別画面 ==");
// 同じページにスクロールで並べていたが、表と詳細が混ざって読みにくかった。
ok(/id="listView"/.test(html) && /id="detailView"/.test(html), "2つの画面がある");
ok(/function routeFromHash/.test(html), "URLのハッシュで場所を持つ（戻るが効く）");
ok(/addEventListener\("hashchange"/.test(html), "hashchange を見ている");
ok(/id="backBtn"/.test(html), "詳細に戻るボタンがある");
ok(/\$\("records"\)\.hidden = inDetail/.test(html), "詳細を読むときに記録を挟まない");
ok(/listScrollY/.test(html), "一覧へ戻ったとき元の位置に戻す");
// 詳細の中で現象を替えるたびに履歴を積むと、戻るのに何度も押させることになる。
ok(/location\.replace/.test(html), "詳細内の切り替えは履歴を積まない");

console.log("== 詳細の見出しがそのまま現象の選択 ==");
ok(/id="phSelect"/.test(html), "現象を選ぶ select がある");
ok(/function renderPhenomenonSelect/.test(html), "renderPhenomenonSelect がある");
ok(/id="backToBest"/.test(html), "いちばんの狙いめへ戻る導線がある");
// 390px では select 約220px ＋「よく染まる」約130px が1行に収まらず重なった。
const headBlock = html.slice(html.indexOf('const head = `<div class="card highlight"'),
                             html.indexOf('const head = `<div class="card highlight"') + 400);
ok(/head-row/.test(headBlock) && headBlock.indexOf("renderPhenomenonSelect") < headBlock.indexOf("head-row"),
  "プルダウンと評価を同じ行に並べない（重なる）");
ok(/\.verdict-box \{[^}]*flex: none/.test(html), "評価の箱が縮まない");

console.log("== 日を指定しないURLは直近の回を指す ==");
ok(/delete selectedDay\[route\.id\]/.test(html),
  "#/sunset を開いたら前に見ていた日を持ち越さない");
// 同じ夕焼けでも2日先を見ているなら、推薦しているのは今日のほう。
ok(/best\.id === id && best\.u\.dayMs === dayMs/.test(html),
  "「次の見どころ」は現象と日の両方が一致したときだけ");

console.log("== 記録は0件のとき畳む ==");
ok(/id="recEmpty"/.test(html) && /id="recBody"/.test(html), "空表示と本体が分かれている");
ok(/\$\("recBody"\)\.hidden = empty/.test(html), "0件なら本体を隠す");

console.log("== 小さな操作に当たり判定がある ==");
ok(/id="favToggle"[^>]*class="[^"]*\btap\b/.test(html), "☆ に .tap が付いている");
ok(/#favToggle::after/.test(html), "☆ の当たり判定を右側へ寄せる指定がある");

console.log("== 見どころの見出しがランクに追従する ==");
ok(/HIGHLIGHT_HEAD\s*=\s*\{[\s\S]*?poor:/.test(html), "poor 用の見出しが定義されている");

console.log("== 行の並びが日をまたいでも動かない ==");
// 「直近に起きる順」だと、7日ぶんを一度に見る表では意味が無いうえ、
// 日をまたぐたびに行が入れ替わって目で追えなくなる。
const sortBlock = html.slice(html.indexOf("const order = Object.keys(weeks).sort"),
                             html.indexOf("const order = Object.keys(weeks).sort") + 600);
ok(!/\.peak/.test(sortBlock), "並びが発生時刻に依存していない");
ok(/PHENOMENA\[a\]\.order - S\.PHENOMENA\[b\]\.order/.test(sortBlock), "固定順を使っている");
ok(/unavailable/.test(sortBlock), "対象外は最後へ回す");

console.log("== 長い名前が3行に割れない ==");
ok(/word-break: keep-all/.test(html), "表の行ラベルは空白でだけ折り返す");
ok(/meta\.short \|\| meta\.name/.test(html), "長い名前は短縮名を使う");

console.log("== 現象の並びが一日の流れに沿う ==");
const core = fs.readFileSync(new URL("./sorami-core.js", import.meta.url), "utf8");
const orderOf = (key) => {
  const m = core.match(new RegExp(key + ': \\{ name: "[^"]+", icon: "[^"]+", order: (\\d+)'));
  return m ? Number(m[1]) : null;
};
const seq = ["sunrise", "seaOfClouds", "rime", "diamondDust", "rainbow", "sunset", "starrySky"];
const got = seq.map(orderOf);
ok(got.every((v, i) => v === i),
  "朝焼け→雲海→霧氷→ダイヤモンドダスト→虹→夕焼け→星空 の順",
  got.join(","));
ok(orderOf("sunrise") < orderOf("sunset"), "朝焼けが夕焼けより先");
ok(/short: "\u30c0\u30a4\u30e4\u30e2\u30f3\u30c9 \u30c0\u30b9\u30c8"/.test(core),
  "ダイヤモンドダストの短縮名がある");

console.log(`\n${fail === 0 ? "LAYOUT OK" : "FAILED"} — ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail === 0 ? 0 : 1);
