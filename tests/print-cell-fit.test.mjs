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
  // Syarat muat diukur daripada kotak kandungan sebenar (.pc) melalui clientWidth/clientHeight -
  // bukan saiz sel yang ditolak padding/border. .pc ialah inset:0 tanpa sempadan, jadi menolak
  // padding daripada getBoundingClientRect menjadikan sasaran lebih kecil daripada kotak sebenar
  // dan gelung sentiasa jatuh ke lantai (pengecilan berganda). scrollHeight/scrollWidth kekal
  // dipakai kerana .pc bertinggi 100% (inset:0) tidak berubah walau fon dikecilkan.
  assert.match(js, /kotak\.scrollWidth>kotak\.clientWidth\+0\.6/, "content width (scrollWidth) measured against the box's own clientWidth");
  assert.match(js, /kotak\.scrollHeight>kotak\.clientHeight\+0\.6/, "content height (scrollHeight) measured against the box's own clientHeight, not a padding-reduced target");
  assert.match(js, /while\(!muat\(\)&&k>0\.5&&pusingan\+\+<10\)/, "shrinks in steps with a floor");
});

test("the fit pass is idempotent: font baseline is cached, not re-read from an already-shrunk style", () => {
  assert.match(js, /el\.dataset\.fsAsal===undefined/, "original font size must be captured once and reused");
  assert.ok(!/const asal=isi\.map\(el=>parseFloat\(getComputedStyle\(el\)\.fontSize\)/.test(js), "must not re-derive the baseline from the current (possibly shrunk) computed style");
});

test("the fit pass runs for the preview and again just before the PDF capture", () => {
  assert.match(js, /function ulangCetakPratonton\(\)\{ \$?\('#cetakArea'\)\.innerHTML=pratontonCetak\(\); kemasSelCetak_\(/);
  assert.match(js, /after\(\)\{ kemasSelCetak_\(\$\('#cetakArea'\)\); \}/, "the Cetak view tidies itself after render");
  const exportado = js.slice(js.indexOf("async function eksportPdfJadual(){"));
  const capture = exportado.indexOf("window.html2canvas(");
  assert.ok(exportado.indexOf("kemasSelCetak_(") < capture, "fit runs before the canvas is taken");
  assert.ok(exportado.indexOf("document.fonts.ready") < exportado.indexOf("kemasSelCetak_("), "after fonts settle");
});

// window.print() (Cetak) memakai media print (.sheet 100% x 200mm), berbeza unit daripada kotak
// pratonton/eksport (1100x767px). Tanpa kira semula, baris yang sudah diisi tinggi ikut kotak skrin
// tidak sepadan dengan kotak cetak sebenar. beforeprint mesti kira semula sejurus sebelum cetak.
test("printing recomputes row/font geometry against the real print box, matching PDF export", () => {
  assert.match(js, /window\.addEventListener\('beforeprint',\(\)=>\{ kemasSelCetak_\(\$\('#cetakArea'\)\); \}\)/);
});

test("the row budget includes sheet borders and the outer margins of headers, footers and signatures", () => {
  // clientHeight dipakai dahulu (ia mengecualikan border helaian); ukuran rect hanya jadi sandaran
  // apabila clientHeight tiada, supaya bajet tidak menjadi NaN.
  assert.match(js, /const tinggiRujuk=sheet\.clientHeight\|\|/, "clientHeight excludes the sheet border");
  assert.match(js, /const tinggiIsi=tinggiRujuk-/, "content box = reference height minus padding");
  assert.match(js, /const hKepala=tinggiLuar\(kepala\),hKaki=tinggiLuar\(kaki\)/, "header/footer margins count against the page");
  assert.match(js, /const hTandatangan=tinggiLuar\(tandatangan\)/, "signature margin counts against the side summary");
});

// Lajur "Subjek"/"Jumlah" pada jadual ringkasan sisi lebih sempit daripada satu perkataan pada fon
// cetak (15px), jadi overflow-wrap:anywhere + word-break:break-word mematahkannya di tengah huruf.
test("the side summary table header words never break mid-word", () => {
  assert.match(js, /<th style="width:9ch">Subjek<\/th><th>Kelas<\/th><th style="width:9ch">Jumlah<\/th>/);
  assert.match(js, /<th style="width:9ch">Subjek<\/th><th>Guru<\/th><th style="width:9ch">Jumlah<\/th>/);
  assert.match(css, /#builderRoot table\.sum thead th\{white-space:nowrap!important\}/);
});

// Kelas pt-master-cell berada pada div dalaman (`<div class="pc pt-master-cell">`), bukan pada td.
// Selektor lama `table.pt-master td.pt-master-cell` tidak pernah sepadan, jadi pengecilan fon sel
// jadual induk tidak berjalan dan teks yang lebih tinggi daripada baris terpotong senyap.
test("the master cell shrink pass targets the inner .pc, which is where the class really lives", () => {
  const konf = js.slice(js.indexOf("const KEMAS_CETAK_=["), js.indexOf("/* Tetapkan tinggi setiap baris"));
  assert.match(konf, /sel:'table\.pt-master \.pt-master-cell'/, "selektor mesti padan div .pc.pt-master-cell");
  assert.doesNotMatch(konf, /table\.pt-master td\.pt-master-cell/, "td tidak pernah membawa kelas ini");
  assert.match(js, /<div class="pc pt-master-cell">/, "markup sebenar meletakkan kelas pada div dalaman");
  assert.doesNotMatch(js, /<td class="[^"]*pt-master-cell/, "kelas bukan pada td");
});
