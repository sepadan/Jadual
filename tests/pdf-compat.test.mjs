import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const akar = new URL("../", import.meta.url);
const baca = (nama) => readFileSync(new URL(nama, akar), "utf8");

const kompat = baca("vendor/pdf-compat.js");
const pembalut = baca("vendor/pdf.worker.compat.js");
const appJs = baca("app.js");
const indexHtml = baca("index.html");
const swJs = baca("sw.js");

/** Jalankan pemeriksaan dalam proses berasingan yang API 2025-nya dibuang (tiru enjin lama). */
function enjinLama() {
  const fixture = fileURLToPath(new URL("fixtures/pdf-compat-enjin-lama.mjs", import.meta.url));
  const sasaran = fileURLToPath(new URL("vendor/pdf-compat.js", akar));
  const keluaran = execFileSync(process.execPath, [fixture, sasaran], { encoding: "utf8" });
  return JSON.parse(keluaran.trim().split("\n").pop());
}

const lama = enjinLama();

test("pdf.js 6 memang memanggil API 2025 tanpa pemeriksaan (sebab lapisan ini wujud)", () => {
  const lib = baca("vendor/pdf.min.js");
  const pekerja = baca("vendor/pdf.worker.min.js");
  for (const api of ["Promise.try(", "URL.parse(", "Promise.withResolvers("]) {
    assert.ok(
      lib.includes(api) || pekerja.includes(api),
      `pdf.js masih memanggil ${api} - kalau tidak, lapisan keserasian boleh disemak semula`,
    );
  }
});

test("keserasian: Promise.withResolvers dan Promise.try pulih pada enjin lama", () => {
  assert.equal(lama.withResolversJenis, "function");
  assert.equal(lama.withResolversNilai, true);
  assert.equal(lama.tryJenis, "function");
  assert.equal(lama.tryNilai, 5);
  assert.equal(lama.tryTolak, "letup", "ralat segerak mesti menjadi janji yang ditolak");
});

test("keserasian: URL.parse memulangkan URL atau null tanpa membaling", () => {
  assert.equal(lama.urlParseJenis, "function");
  assert.equal(lama.urlParseBetul, "/a/b");
  assert.equal(lama.urlParseAsas, "https://contoh.my/x");
  assert.equal(lama.urlParseSalah, null);
});

test("keserasian: Math.sumPrecise tepat pada nombor besar (Neumaier)", () => {
  assert.equal(lama.sumPreciseJenis, "function");
  assert.equal(lama.sumPreciseTepat, 1);
  assert.equal(lama.sumPreciseKosong, 0);
  assert.equal(lama.sumPrecisePerpuluhan, 0.30000000000000004);
});

test("keserasian: Uint8Array.toHex / toBase64 mengikut spesifikasi ES2025", () => {
  assert.equal(lama.toHexJenis, "function");
  assert.equal(lama.toBase64Jenis, "function");
  assert.equal(lama.toHex, "0001020fff");
  assert.equal(lama.toBase64, "TWFu");
  assert.equal(lama.toBase64Padding, "TWE=");
});

test("keserasian: sokongan asas lain pulih (hasOwn, at, findLast, replaceAll, structuredClone)", () => {
  assert.deepEqual(lama.hasOwn, [true, false]);
  assert.equal(lama.at, 3);
  assert.equal(lama.findLast, 2);
  assert.equal(lama.findLastIndex, 1);
  assert.equal(lama.replaceAll, "a+b+c");
  assert.equal(lama.structuredClone, 2);
});

test("lapisan keserasian tidak menimpa API asal yang sudah ada", () => {
  const asal = {
    withResolvers: Promise.withResolvers,
    hasOwn: Object.hasOwn,
    at: Array.prototype.at,
    structuredClone: globalThis.structuredClone,
  };
  // Muatkan dalam proses ujian ini: API yang wujud mesti kekal objek yang SAMA.
  eval(kompat);
  assert.equal(Promise.withResolvers, asal.withResolvers);
  assert.equal(Object.hasOwn, asal.hasOwn);
  assert.equal(Array.prototype.at, asal.at);
  assert.equal(globalThis.structuredClone, asal.structuredClone);
});

test("fail keserasian boleh dipakai sebagai skrip biasa DAN modul (tiada import/export)", () => {
  assert.equal(/^\s*(import|export)\s/m.test(kompat), false, "kompat mesti bebas import/export");
  assert.ok(kompat.includes("globalThis"), "mesti guna globalThis supaya selamat dalam worker");
});

test("pekerja pdf.js memuatkan lapisan keserasian SEBELUM pustaka (turutan import)", () => {
  const satu = pembalut.indexOf("./pdf-compat.js");
  const dua = pembalut.indexOf("./pdf.worker.min.js");
  assert.ok(satu >= 0 && dua >= 0, "pembalut mesti mengimport kedua-dua fail");
  assert.ok(satu < dua, "keserasian mesti diimport dahulu, jika tidak ralat kekal");
});

test("aplikasi memuatkan keserasian sebelum modul dan menunjuk pekerja ke pembalut", () => {
  const kedudukanKompat = indexHtml.indexOf("./vendor/pdf-compat.js");
  const kedudukanModul = indexHtml.search(/<script[^>]+src="\.\/app\.js[^"]*"/);
  assert.ok(kedudukanKompat > 0, "index.html mesti memuatkan pdf-compat.js");
  assert.ok(kedudukanModul > 0 && kedudukanKompat < kedudukanModul, "keserasian mesti dimuatkan dahulu");
  assert.ok(appJs.includes('"./vendor/pdf.worker.compat.js"'), "workerSrc mesti guna pembalut");
  assert.equal(
    appJs.includes('new URL("./vendor/pdf.worker.min.js"'),
    false,
    "workerSrc tidak boleh kembali kepada pustaka mentah",
  );
  assert.ok(swJs.includes("./vendor/pdf-compat.js") && swJs.includes("./vendor/pdf.worker.compat.js"));
});
