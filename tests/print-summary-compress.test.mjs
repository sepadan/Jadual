import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Ringkasan sisi yang banyak baris ialah kes sebenar yang memecahkan satu-A4: 15 baris pada fon
// asal 15px menghasilkan jadual 679px dalam bajet 558px. Pada elemen `table`, `height` ialah
// MINIMUM, jadi tinggi baris tidak boleh memendekkannya — fon sel mesti dikurangkan. Ujian ini
// menjalankan fungsi sebenar daripada builder.js dengan DOM tiruan yang tingginya bergantung pada
// saiz fon, supaya gelung pemampatan itu benar-benar diuji, bukan sekadar diperiksa teksnya.
const source = readFileSync(new URL("../builder.js", import.meta.url), "utf8");
const mula = source.indexOf("function mampatRingkasanCetak_(");
const blok = source.slice(mula, source.indexOf("\nfunction ", mula + 10));

function buatJadual(baris, fonAsal) {
  const sel = [];
  for (let i = 0; i < baris; i += 1) {
    sel.push({ dataset: {}, style: { fontSize: fonAsal + "px", padding: "" }, get textContent() { return "BM"; } });
  }
  const tbl = {
    _sel: sel,
    querySelectorAll: (pemilih) => (pemilih === "tbody td" ? sel : []),
    // Tinggi sebenar sebuah jadual datang daripada kandungan: font x line-height + padding menegak
    // + sempadan, didarab bilangan baris. Inilah yang menjadikan `height` tidak berguna.
    getBoundingClientRect: () => {
      const tinggi = sel.reduce((jumlah, td) => {
        const fon = parseFloat(td.style.fontSize) || fonAsal;
        // Padding menegak 24px + sempadan sepadan dengan kes sebenar (15 baris = 679px pada fon 15px).
        const pad = td.style.padding && td.style.padding.includes("0px") ? 0 : 24;
        return jumlah + fon * 1.4 + pad + 2;
      }, 24); // + thead
      return { height: tinggi };
    },
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

test("ringkasan 15 baris dimampatkan sehingga masuk bajet satu A4", () => {
  const tbl = buatJadual(15, 15);
  const sebelum = tbl.getBoundingClientRect().height;
  assert.ok(sebelum > 558, `prasyarat: jadual mesti lebih tinggi daripada bajet (${sebelum}px)`);
  jalankan(blok, "tbl,558", { tbl, getComputedStyle: getComputedStyle_ });
  const selepas = tbl.getBoundingClientRect().height;
  assert.ok(selepas <= 558.6, `jadual mesti masuk bajet selepas pemampatan (${selepas}px)`);
  const fon = parseFloat(tbl._sel[0].style.fontSize);
  assert.ok(fon < 15, "fon mesti dikecilkan");
  assert.ok(fon >= 7.5, "fon tidak boleh jatuh di bawah separuh saiz asal (kebolehbacaan)");
});

test("jadual yang sudah muat tidak dikecilkan langsung", () => {
  const tbl = buatJadual(5, 10.5);
  jalankan(blok, "tbl,3000", { tbl, getComputedStyle: getComputedStyle_ });
  assert.equal(tbl._sel[0].style.fontSize, "10.50px", "fon asal mesti dikekalkan apabila sudah muat");
  assert.equal(tbl._sel[0].style.padding, "", "padding tidak boleh disentuh apabila sudah muat");
});

test("panggilan berulang tidak mengecilkan fon berganda", () => {
  const tbl = buatJadual(15, 15);
  jalankan(blok, "tbl,558", { tbl, getComputedStyle: getComputedStyle_ });
  const kali1 = tbl._sel[0].style.fontSize;
  jalankan(blok, "tbl,558", { tbl, getComputedStyle: getComputedStyle_ });
  assert.equal(tbl._sel[0].style.fontSize, kali1, "saiz asal mesti diambil daripada dataset, bukan saiz semasa");
});

test("bajet mustahil berhenti di lantai 0.5, bukan mengecil tanpa henti", () => {
  const tbl = buatJadual(15, 15);
  jalankan(blok, "tbl,10", { tbl, getComputedStyle: getComputedStyle_ });
  const fon = parseFloat(tbl._sel[0].style.fontSize);
  assert.ok(Math.abs(fon - 7.5) < 0.01, `fon mesti berhenti pada 7.5px, bukan ${fon}px`);
});

test("laluan ringkasan cetak benar-benar memanggil pemampatan dengan bajet tolak tandatangan", () => {
  const isi = source.slice(source.indexOf("function isiTinggiCetak_("), source.indexOf("function kemasSelCetak_("));
  assert.match(isi, /const bajet=Math\.max\(60,ruangUtama-hTandatangan\)/, "bajet ringkasan mesti tolak tinggi tandatangan");
  assert.match(isi, /pasangBarisTinggi_\(tbl,\[\.\.\.tbody\.rows\],hThead,bajet\)/);
  assert.match(isi, /mampatRingkasanCetak_\(tbl,bajet\)/, "pemampatan mesti dipanggil untuk table.sum");
});
