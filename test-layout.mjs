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
ok(/dayMs !== undefined \? dayMs/.test(pickFn), "日を指定したときはその日を使う");
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

console.log("== 見たいものを選ぶプルダウン ==");
ok(/id="picker"/.test(html), "#picker がある");
ok(/id="phSelect"/.test(html), "現象を選ぶ select がある");
ok(html.indexOf('id="picker"') < html.indexOf('id="matrix"'), "プルダウンが表より前にある");
ok(/function renderPicker/.test(html), "renderPicker がある");
// 推薦と選択は別物。選択が推薦から外れたら、推薦へ戻る導線を残す。
ok(/id="backToBest"/.test(html), "いちばんの狙いめへ戻る導線がある");
// block:"start" だと詳細が上端に来てプルダウンも表も視界から消える。
ok(!/scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/.test(html),
  "詳細へ飛ぶときに画面上端へ寄せない（選び直せなくなる）");

console.log("== 同じ内容を二度出さない ==");
const picker = html.slice(html.indexOf("function renderPicker"), html.indexOf("// この先7日"));
ok(!/renderScoreBar/.test(picker), "プルダウンにスコアバーを二重に出していない");
ok(!/renderVerdict/.test(picker), "プルダウンに点数カードを二重に出していない");

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

console.log(`\n${fail === 0 ? "LAYOUT OK" : "FAILED"} — ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail === 0 ? 0 : 1);
