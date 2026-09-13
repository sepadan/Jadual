import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Ringkasan sisi yang banyak baris tidak boleh dipendekkan melalui `height` (pada `table`, height
// ialah MINIMUM). mampatRingkasanCetak_ mengecilkan fon dengan SATU nilai k untuk seluruh jadual
// sehingga tinggi SEBENAR masuk bajet, dengan lantai keras 0.6 (60% saiz asas). Jika masih tidak
// muat pada lantai itu, padding dan line-height dirapatkan sehingga 0 (bukan fon), dan hanya selepas
// itu berhenti — data melampau dibiarkan melimpah, bukan disembunyikan. Ujian ini menjalankan fungsi
// sebenar daripada builder.js dengan DOM tiruan yang tingginya bergantung pada saiz fon, line-height
// dan padding, supaya gelung pemampatan benar-benar diuji, bukan sekadar diperiksa teksnya.
const source = readFileSync(new URL("../builder.js", import.meta.url), "utf8");
const mula = source.indexOf("function mampatRingkasanCetak_(");
const blok = source.slice(mula, source.indexOf("\nfunction ", mula + 10));

// Tinggi sebenar sebuah jadual = thead(24) + jumlah tinggi baris; tinggi baris = fon x line-height
// + 2 x padding menegak + sempadan(2), meniru reflow pelayar (line-height 1.05, padding 3px asal).
const padV = (td) => {
  const p = td.style.padding;
  if (p === "") return 3;
  if (p === "0") return 0;
  const m = String(p).match(/^([\d.]+)px/);
  return m ? parseFloat(m[1]) : 3;
};
const tinggiTd = (td, fonAsal) => {
  const fon = parseFloat(td.style.fontSize) || fonAsal;
  const lh = td.style.lineHeight ? parseFloat(td.style.lineHeight) : 1.05;
  return fon * lh + padV(td) * 2 + 2;
};

function buatJadual(baris, fonAsal, opts = {}) {
  const sel = [];
  for (let i = 0; i < baris; i += 1) {
    const asas = opts.bases ? (opts.bases[i] !== undefined ? opts.bases[i] : fonAsal) : fonAsal;
    const isJumlah = opts.jumlahCols && opts.jumlahCols.has(i);
    sel.push({
      dataset: {},
      style: { fontSize: asas + "px", padding: "", lineHeight: "" },
      classList: { contains: (c) => isJumlah && c === "c" },
      get textContent() { return "BM"; },
    });
  }
  const tbl = {
    _sel: sel,
    querySelectorAll: (pemilih) => (pemilih === "tbody td" ? sel : []),
    getBoundingClientRect: () => ({ height: 24 + sel.reduce((s, td) => s + tinggiTd(td, fonAsal), 0) }),
  };
  return tbl;
}

function jalankan(blokSumber, args, persekitaran) {
  const context = vm.createContext({
    Math, Number, String, Array, Object, isNaN, console,
    parseFloat, parseInt, ...persekitaran,
  });
  vm.runInContext(blokSumber, context);
  return vm.runInContext(`mampatRingkasanCetak_(${args})`, context);
}

const getComputedStyle_ = (el) => ({ fontSize: el.style.fontSize || "15px" });

test("ringkasan melebihi bajet dimampatkan dengan satu k sehingga masuk bajet, fon di atas lantai 0.6", () => {
  const tbl = buatJadual(15, 15);
  const sebelum = tbl.getBoundingClientRect().height;
  assert.ok(sebelum > 300, `prasyarat: jadual mesti lebih tinggi daripada bajet (${sebelum}px)`);
  jalankan(blok, "tbl,300", { tbl, getComputedStyle: getComputedStyle_ });
  const selepas = tbl.getBoundingClientRect().height;
  assert.ok(selepas <= 300.6, `jadual mesti masuk bajet selepas pemampatan (${selepas}px)`);
  const fon = tbl._sel.map((td) => parseFloat(td.style.fontSize));
  assert.ok(fon.every((f) => f === fon[0]), `semua td mesti guna k yang sama (${fon.join(",")})`);
  assert.ok(fon[0] < 15, "fon mesti dikecilkan");
  assert.ok(fon[0] >= 9, `fon tidak boleh jatuh di bawah lantai 0.6 (9px), dapat ${fon[0]}px`);
});

test("jadual yang sudah muat tidak dikecilkan langsung", () => {
  const tbl = buatJadual(5, 10.5);
  jalankan(blok, "tbl,3000", { tbl, getComputedStyle: getComputedStyle_ });
  assert.equal(tbl._sel[0].style.fontSize, "10.50px", "fon asal mesti dikekalkan apabila sudah muat");
  assert.equal(tbl._sel[0].style.padding, "3.00px 6.00px", "padding asal dipulihkan, tidak dirapatkan");
});

test("panggilan berulang tidak mengecilkan fon berganda", () => {
  const tbl = buatJadual(15, 15);
  jalankan(blok, "tbl,300", { tbl, getComputedStyle: getComputedStyle_ });
  const kali1 = tbl._sel[0].style.fontSize;
  jalankan(blok, "tbl,300", { tbl, getComputedStyle: getComputedStyle_ });
  assert.equal(tbl._sel[0].style.fontSize, kali1, "saiz asal mesti diambil daripada dataset, bukan saiz semasa");
});

test("lantai keras 0.6: fon tidak pernah di bawah 60% asas walau bajet mustahil, jadual dibiar melimpah", () => {
  const tbl = buatJadual(15, 15);
  jalankan(blok, "tbl,30", { tbl, getComputedStyle: getComputedStyle_ });
  const fon = parseFloat(tbl._sel[0].style.fontSize);
  assert.ok(Math.abs(fon - 9) < 0.01, `fon mesti berhenti pada 9px (lantai 0.6 = 60% saiz asas), bukan ${fon}px`);
  assert.equal(tbl._sel[0].style.padding, "0", "padding mesti dirapatkan ke 0 selepas lantai fon dicapai");
  const selepas = tbl.getBoundingClientRect().height;
  assert.ok(selepas > 30.6, `jadual dibiarkan melimpah secara terkawal (${selepas}px > bajet), bukan disembunyikan`);
});

test("lajur JUMLAH (td.c) kekal sekurang-kurangnya sebesar lajur lain walaupun asasnya lebih kecil", () => {
  // 3 baris x 3 lajur: lajur ke-3 (indeks % 3 === 2) ialah JUMLAH dan diberi asas lebih kecil
  // (10px) untuk mensimulasikan CSS yang silap; mampatRingkasanCetak_ mesti menaikkannya ke asas
  // terbesar supaya tiada lajur menjadi lebih kecil/lenyap.
  const jumlahCols = new Set([2, 5, 8]);
  const bases = [15, 15, 10, 15, 15, 10, 15, 15, 10];
  const tbl = buatJadual(9, 15, { bases, jumlahCols });
  jalankan(blok, "tbl,60", { tbl, getComputedStyle: getComputedStyle_ });
  const jumFon = parseFloat(tbl._sel[2].style.fontSize);
  const lainFon = parseFloat(tbl._sel[0].style.fontSize);
  assert.ok(jumFon >= lainFon, `fon lajur JUMLAH (${jumFon}px) mesti >= lajur lain (${lainFon}px)`);
  assert.equal(jumFon, lainFon, "lajur JUMLAH dinaikkan ke asas terbesar, sama besar dengan lajur Subjek");
});

test("laluan ringkasan cetak benar-benar memanggil pemampatan dengan bajet tolak tandatangan", () => {
  const isi = source.slice(source.indexOf("function isiTinggiCetak_("), source.indexOf("function kemasSelCetak_("));
  assert.match(isi, /const bajet=Math\.max\(60,ruangUtama-hTandatangan\)/, "bajet ringkasan mesti tolak tinggi tandatangan");
  assert.match(isi, /pasangBarisTinggi_\(tbl,\[\.\.\.tbody\.rows\],hThead,bajet\)/);
  assert.match(isi, /mampatRingkasanCetak_\(tbl,bajet\)/, "pemampatan mesti dipanggil untuk table.sum");
});
