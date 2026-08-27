/*
 * 配色のコントラスト検査。
 * 文字として使う色は、カード地に対して 4.5:1 以上（WCAG AA の本文基準）。
 * 以前はライトモードで 良好 2.60・平凡 2.42・補助文 2.21 と、
 * 大きな文字の基準 3.0 すら下回っていた。目で見て気づけなかったので機械で測る。
 */
import fs from "node:fs";
const css = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

const hex = (h) => { h = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// :root と dark ブロックからそれぞれ変数を拾う
const block = (re) => { const m = css.match(re); return m ? m[1] : ""; };
const rootVars = block(/:root \{([\s\S]*?)\}/);
const darkVars = block(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?:root \{([\s\S]*?)\}/);
const parse = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
const light = parse(rootVars);
const dark = { ...light, ...parse(darkVars) };

let fail = 0;
const TEXT_COLORS = ["secondary", "tertiary", "accent", "spectacular", "good", "fair", "poor", "red"];
for (const [theme, vars, card] of [["ライト", light, "#ffffff"], ["ダーク", dark, "#1c1c1e"]]) {
  console.log(`\n== ${theme}（カード地 ${card}）==`);
  for (const name of TEXT_COLORS) {
    if (!vars[name]) { console.log(`  ?    --${name} が定義されていない`); fail++; continue; }
    const r = ratio(hex(vars[name]), hex(card));
    const okay = r >= 4.5;
    if (!okay) fail++;
    console.log(`  ${okay ? "ok  " : "FAIL"} --${name.padEnd(12)} ${vars[name]}  ${r.toFixed(2)}`);
  }
}
console.log(`\n${fail === 0 ? "CONTRAST OK" : "FAILED — " + fail + " 件"}`);
process.exit(fail === 0 ? 0 : 1);
