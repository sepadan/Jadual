import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../builder.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../builder.js", import.meta.url), "utf8");

/* Sel cetak pernah diwarisi white-space:nowrap di dalam kotak overflow:hidden, jadi nama panjang
   seperti "6 BIJAK" terpotong menjadi "6 BI" dalam pratonton dan PDF. Teks mesti boleh berbalut. */
test("printed timetable cells are allowed to wrap instead of being clipped", () => {
  const rule = css.slice(css.indexOf("#builderRoot #cetakArea table.pt .pc,#builderRoot #cetakArea table.pt td.day"));
  assert.match(rule.slice(0, 400), /white-space:normal/);
  assert.match(rule.slice(0, 400), /overflow-wrap:anywhere/);
  assert.match(css, /#builderRoot #cetakArea table\.pt \.pc \.pcls[^{]*\{[^}]*line-height:1\.08/);
});

/* Auto-layout memberi lajur mengikut kandungan: nama panjang menjadikan grid tidak sekata dan
   html2canvas mengukur berbeza daripada pelayar. Lajur tetap = grid rata dan hasil sama. */
test("printed grid uses fixed column widths so every period column is even", () => {
  assert.match(css, /#builderRoot #cetakArea table\.pt,#builderRoot #cetakArea table\.pt-master,#builderRoot #cetakArea table\.sum\{table-layout:fixed\}/);
});

/* szTeks() meneka saiz ikut panjang teks sahaja dan tidak tahu lebar lajur, jadi sel yang paling
   panjang masih melimpah. kemasSelCetak_ mengukur kotak sebenar dan mengecilkan tulisan. */
test("a fit pass measures each printed cell and shrinks type that does not fit", () => {
  assert.match(js, /function kemasSelCetak_\(/);
  assert.match(js, /const KEMAS_CETAK_=\[/);
  assert.match(js, /getPropertyValue\(konf\.row\)/, "row height comes from the sheet's CSS variable");
  assert.match(js, /while\(!muat\(\)&&k>0\.5&&pusingan\+\+<10\)/, "shrinks in steps with a floor");
});

test("the fit pass runs for the preview and again just before the PDF capture", () => {
  assert.match(js, /function ulangCetakPratonton\(\)\{ \$?\('#cetakArea'\)\.innerHTML=pratontonCetak\(\); kemasSelCetak_\(/);
  assert.match(js, /after\(\)\{ kemasSelCetak_\(\$\('#cetakArea'\)\); \}/, "the Cetak view tidies itself after render");
  const exportado = js.slice(js.indexOf("async function eksportPdfJadual(){"));
  const capture = exportado.indexOf("window.html2canvas(");
  assert.ok(exportado.indexOf("kemasSelCetak_(") < capture, "fit runs before the canvas is taken");
  assert.ok(exportado.indexOf("document.fonts.ready") < exportado.indexOf("kemasSelCetak_("), "after fonts settle");
});
