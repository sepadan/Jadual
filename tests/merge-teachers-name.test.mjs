import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// "nama guru tidak keluar di bahagian Guru dan ketersediaan": mergeTeachers menyalin `t.name`
// (nama penuh direktori) ke `g.nama` tanpa sandaran. Apabila rekod direktori tiada nama tetapi
// masih ada shortName, nama guru dalam pembina jadi kosong — baris Guru dan dialog "Waktu tidak
// tersedia" (kedua-duanya memaparkan g.nama) kosong, manakala grid masih memaparkan kod (namaGuru
// pakai `kod||nama`). Ujian ini menjalankan mergeTeachers sebenar daripada builder.js dan memaku
// bahawa nama tidak boleh dikosongkan oleh rekod direktori yang kosong.
const source = readFileSync(new URL("../builder.js", import.meta.url), "utf8");
const mula = source.indexOf("mergeTeachers(teachers) {");
const blok = "function " + source.slice(mula, source.indexOf("\n  seedSchool", mula)).replace(/,\s*$/, "");

function runMerge(initialGuru, teachers) {
  const context = vm.createContext({
    console, Object, String, Array, Number, Math, JSON,
    uid: () => "u" + Math.random().toString(36).slice(2, 10),
    simpan: () => {}, ulang: () => {},
  });
  vm.runInContext(blok, context);
  const out = vm.runInContext(
    `(() => { S = { guru: ${JSON.stringify(initialGuru)} };
       const count = mergeTeachers(${JSON.stringify(teachers)});
       return JSON.stringify({ count, guru: S.guru }); })()`,
    context,
  );
  return JSON.parse(out);
}

test("rekod direktori tanpa nama tetapi ada shortName tidak menghasilkan guru tanpa nama", () => {
  const { guru } = runMerge([], [
    { id: "g1", name: "", shortName: "AZIZI", position: "Guru Akademik", active: true, coversJson: "" },
  ]);
  assert.equal(guru.length, 1);
  assert.equal(guru[0].nama, "AZIZI");
  assert.equal(guru[0].kod, "AZIZI");
});

test("mergeTeachers tidak memadam nama penuh sedia ada apabila nama direktori kosong", () => {
  const { guru } = runMerge(
    [{ id: "x", nama: "MOHAMAD AZIZI BIN BASRI", kod: "AZIZI", directoryId: "g1", maxHari: 8, tidakAda: [] }],
    [{ id: "g1", name: "", shortName: "AZIZI", position: "Guru Akademik", active: true, coversJson: "" }],
  );
  assert.equal(guru.length, 1, "padanan ikut directoryId, bukan buat guru baharu");
  assert.equal(guru[0].nama, "MOHAMAD AZIZI BIN BASRI");
});

test("nama penuh direktori tetap dipakai apabila ia wujud (tiada perubahan kelakuan biasa)", () => {
  const { guru } = runMerge([], [
    { id: "g1", name: "MOHAMAD AZIZI BIN BASRI", shortName: "AZIZI", position: "Guru Akademik", active: true, coversJson: "" },
  ]);
  assert.equal(guru[0].nama, "MOHAMAD AZIZI BIN BASRI");
  assert.equal(guru[0].kod, "AZIZI");
});
