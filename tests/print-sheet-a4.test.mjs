import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const cssText = () => read("builder.css");
const builderText = () => read("builder.js");

// html2canvas melukis teks secara mendatar dan hanya memakai transform, jadi writing-mode +
// rotate(180deg) keluar terbalik dalam PDF (draf: PENGURUSAN dan REHAT). Label cetak mesti
// menggunakan span berputar biasa.
test("the printed sheet never relies on writing-mode for vertical labels", () => {
  const css = cssText();
  const printCells = [...css.matchAll(/#builderRoot table\.pt[^{]*td\.vert[^{]*\{[^}]*\}/g)].map((m) => m[0]).join("\n");
  assert.ok(!/writing-mode/.test(printCells), "print vertical cell still uses writing-mode");
  assert.match(css, /td\.vert \.vtext\{[^}]*rotate\(-90deg\)/);
  assert.match(css, /td\.pt-master-pre \.vtext\{[^}]*rotate\(-90deg\)/);
  const js = builderText();
  assert.match(js, /<td class="vert[^"]*"[^>]*><span class="vtext">/);
  assert.ok(!/<td class="vert[^"]*"[^>]*>(?!<span class="vtext">)/.test(js), "a vertical cell is still bare text");
});

// Helaian cetak mesti sebesar kertas A4 landskap yang dicetak (287 x 200 mm pada 1100px lebar),
// jika tidak eksport menghasilkan jalur di tengah dengan jalur putih di atas dan bawah.
test("the print sheet is shaped like the A4 page it is printed on", () => {
  const css = cssText();
  assert.match(css, /#builderRoot #cetakArea \.sheet\{min-height:767px/);
  assert.match(css, /#builderRoot #cetakArea \.sh-body\{flex:1/);
  assert.match(css, /#builderRoot #cetakArea table\.pt[^{]*\{[^}]*height:100%/);
  // 1100px lebar dipetakan kepada 287 mm oleh eksport, jadi 767px = 200 mm.
  const mm = 767 * (287 / 1100);
  assert.ok(Math.abs(mm - 200) < 1.5, `expected about 200 mm, got ${mm.toFixed(1)} mm`);
});

// Peraturan A4 mesti berada dalam skop asas: jika ia jatuh ke dalam @media (lebar mudah alih) ia
// hanya terpakai pada telefon dan eksport di desktop kembali menjadi jalur nipis.
test("the A4 sheet rules apply at every width, not only in a mobile media query", () => {
  const css = cssText();
  const at = css.indexOf("#builderRoot #cetakArea .sheet{min-height:767px");
  assert.ok(at > 0);
  const before = css.slice(0, at);
  assert.equal(before.split("{").length - before.split("}").length, 0, "the A4 rules are nested inside another block");
});
