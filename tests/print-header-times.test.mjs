import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

// "07:20 - 07:30" dalam satu baris tidak muat lajur waktu 62px, jadi ia melimpah dan bertindan
// dengan lajur sebelah. Masa mesti dua baris: "07:20 -" di atas, "07:30" di bawah.
test("header times render as two lines so neighbouring columns cannot collide", () => {
  const js = read("builder.js");
  assert.match(js, /function tmJulat_\(mula,tamat\)\{/);
  assert.match(js, /<span class="tm"><span class="tm-a">\$\{esc\(mula\)\} -<\/span><span class="tm-b">\$\{esc\(tamat\)\}<\/span><\/span>/);
  assert.ok(!/\.mula\} - \$\{/.test(js.replace(/tm-a">\$\{esc\(mula\)\} -<\/span>/g, "")), "a header still prints the range on one line");
  const css = read("builder.css");
  assert.match(css, /#builderRoot #cetakArea table\.pt th \.tm \.tm-a,#builderRoot #cetakArea table\.pt th \.tm \.tm-b\{[^}]*display:block/);
});

// Helaian tidak boleh dikecilkan mengikut lebar tetingkap: pada tetingkap 860-1124px peraturan asas
// .sheet{max-width:100%} mengecilkannya dan imej PDF tidak lagi memenuhi kertas.
test("the print sheet keeps its fixed width at every window size", () => {
  const css = read("builder.css");
  assert.match(css, /#builderRoot #cetakArea \.sheet\{[^}]*width:1100px[^}]*max-width:none/);
});
