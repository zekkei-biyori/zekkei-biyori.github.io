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

console.log("== 記録カードはペインのグリッドの外にある ==");
// #records が .panes の中にあると、position:sticky な右ペインの包含ブロックが
// 記録の行まで伸び、スクロール時に週間の行が記録カードの上へ描画された。
const panesStart = html.indexOf('<div class="panes">');
// records カードの開始タグそのものの位置を取る（id= の位置だと開始タグを跨いで数えてしまう）
const recordsStart = html.indexOf('<div class="card" id="records"');
ok(panesStart > 0 && recordsStart > panesStart, "両方が存在する");
const between = html.slice(panesStart, recordsStart);
const opens = (between.match(/<div\b/g) || []).length;
const closes = (between.match(/<\/div>/g) || []).length;
ok(opens === closes, "#records に達する前に .panes が閉じている",
  `div開 ${opens} / 閉 ${closes}`);

console.log("== 右ペインを sticky にしない ==");
ok(!/\.pane-right\s*\{[^}]*position:\s*sticky/.test(html),
  ".pane-right に position: sticky が無い");
ok(!/#records\s*\{[^}]*grid-column/.test(html),
  "#records に grid-column の指定が無い（グリッド外なので不要）");

console.log("== 小さな操作に当たり判定がある ==");
ok(/id="favToggle"[^>]*class="[^"]*\btap\b/.test(html), "☆ に .tap が付いている");
ok(/#favToggle::after/.test(html), "☆ の当たり判定を右側へ寄せる指定がある");
ok(/id="exportBtn"[^>]*\btap\b/.test(html) && /id="importBtn"[^>]*\btap\b/.test(html),
  "書き出し・読み込みに .tap が付いている");

console.log("== 見どころの見出しがランクに追従する ==");
ok(/HIGHLIGHT_HEAD\s*=\s*\{[\s\S]*?poor:/.test(html), "poor 用の見出しが定義されている");
ok(!/>次の見どころ<\/div>/.test(html), "見出しが「次の見どころ」に固定されていない");

console.log("== 見どころのクリックが2ペインでも効く ==");
const clickBlock = html.slice(html.indexOf('$("highlight").onclick'), html.indexOf('$("highlight").onclick') + 500);
ok(/WIDE\.matches/.test(clickBlock),
  "2ペイン時の分岐がある（details が無いモードで無反応だった）");

console.log("== 一覧の並びが「表示しない時刻」で決まらない ==");
ok(/specificTime !== false/.test(html),
  "時刻が決まらないものを時刻順から外している");

console.log(`\n${fail === 0 ? "LAYOUT OK" : "FAILED"} — ${pass} 件成功 / ${fail} 件失敗`);
process.exit(fail === 0 ? 0 : 1);
