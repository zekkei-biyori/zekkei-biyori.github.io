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

console.log("== 現象ごとにカードを分ける ==");
// 7現象×7日をひとつの表にしていたが、49個の数字を凡例と照らし合わせて読む形で、
// 「見に行くか」を決める道具になっていなかった。
ok(!/renderMatrix/.test(html), "ひとつの表にまとめていない");
ok(/function renderPhenomenonCards/.test(html), "現象ごとのカードを描く");
ok(/id="cards"/.test(html), "#cards がある");
// 色や数字を覚えなくても、どの日がいいかが棒の高さで分かる。
ok(/30 \* ev\.score \/ 100/.test(html), "日の良し悪しを棒の高さで示す");
ok(/class="day\$\{isNext\}\$\{isPast\}" data-cell=/.test(html), "日がボタンになっている");
// 20時に「今日の夕焼け 79点」がいちばん高い棒として左端に出ていた。
ok(/\.day\.past \{[^}]*opacity/.test(html), "終わった回は薄くする");
ok(/isPast = ev\.window\[1\] <= now/.test(html), "終わったかどうかを窓の終わりで判定する");

console.log("== 押せるものだけが押せる見た目 ==");
// 情報カードごと押せると、読んでいるつもりの場所で画面が変わる。
ok(/function renderBestNote/.test(html), "いちばんの狙いめは案内のみ");
const noteFn = html.slice(html.indexOf("function renderBestNote"), html.indexOf("function renderBestNote") + 900);
ok(!/onclick/.test(noteFn), "いちばんの狙いめを押しても移動しない");
ok(/\.day \{[^}]*border: 1px solid/.test(html), "日のボタンに枠がある");
ok(/\.day:active/.test(html), "押したときの見た目がある");
// 7日すべて対象外なら開いても同じ文が出るだけの行き止まり。押せる場所を作らない。
const cardsFn = html.slice(html.indexOf("function renderPhenomenonCards"), html.indexOf("/// 選択中の現象の詳細"));
const outBlock = cardsFn.slice(cardsFn.indexOf("if (allOut)"), cardsFn.indexOf("if (allOut)") + 300);
ok(!/data-cell|<button/.test(outBlock), "対象外の現象に行き止まりのボタンを作らない");

console.log("== 詳細にプルダウンを置かない ==");
// 画面を分けたので、別の現象は一覧へ戻って選ぶ。行き先が分かる。
ok(!/phSelect/.test(html), "現象を選ぶ select が無い");
ok(!/renderPhenomenonSelect/.test(html), "プルダウンの描画が残っていない");

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
ok(!/この先7日/.test(html), "戻り先を日数で呼ばない（詳細にも同じ7日間がある）");
ok(/id="backBtn"[^>]*>← 一覧にもどる/.test(html), "戻り先は一覧だと書く");
ok(!/<h2>週間<\/h2>/.test(html), "同じ7日間に別の名前を付けない");
ok(/\$\("records"\)\.hidden = inDetail/.test(html), "詳細を読むときに記録を挟まない");
ok(/listScrollY/.test(html), "一覧へ戻ったとき元の位置に戻す");
// 詳細の中で現象を替えるたびに履歴を積むと、戻るのに何度も押させることになる。
ok(/location\.replace/.test(html), "詳細内の切り替えは履歴を積まない");

console.log("== 詳細の見出し ==");
// 390px では見出しと評価を1行に並べると重なった（実機で確認）。
const headBlock = html.slice(html.indexOf('const head = `<div class="card highlight"'),
                             html.indexOf('const head = `<div class="card highlight"') + 400);
ok(/ph-head/.test(headBlock) && /head-row/.test(headBlock), "名前と評価を別の行に置く");
ok(/\.verdict-box \{[^}]*flex: none/.test(html), "評価の箱が縮まない");

console.log("== 日を指定しないURLは直近の回を指す ==");
ok(/delete selectedDay\[route\.id\]/.test(html),
  "#/sunset を開いたら前に見ていた日を持ち越さない");


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

console.log("== 画面をまたいで現象の並びが揃う ==");
// spots.js の出現順のままだと、一覧のカードと地点シートのチップで順序が違った。
ok(/phenomenaWithSpots[\s\S]{0,160}PHENOMENA\[a\]\.order/.test(html),
  "スポットの絞り込みも同じ並び順");

console.log("== 現象の並びが似たもの同士で隣り合う ==");
const core = fs.readFileSync(new URL("./sorami-core.js", import.meta.url), "utf8");
const orderOf = (key) => {
  const m = core.match(new RegExp(key + ': \\{ name: "[^"]+", icon: "[^"]+", order: (\\d+)'));
  return m ? Number(m[1]) : null;
};
const seq = ["sunrise", "sunset", "starrySky", "rainbow", "seaOfClouds", "rime", "diamondDust"];
const got = seq.map(orderOf);
ok(got.every((v, i) => v === i),
  "朝焼け→夕焼け→星空→虹→雲海→霧氷→ダイヤモンドダスト の順",
  got.join(","));
// 同じ判定（SunsetWx特許）で対になる2つ。離すと見比べられない。
ok(orderOf("sunset") === orderOf("sunrise") + 1, "朝焼けの次が夕焼け");

console.log(`\n${fail === 0 ? "LAYOUT OK" : "FAILED"} — ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail === 0 ? 0 : 1);
