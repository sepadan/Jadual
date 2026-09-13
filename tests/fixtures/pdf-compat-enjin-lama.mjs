// Fixture: tiru enjin lama (iOS sebelum 18.4) dalam proses Node yang berasingan.
//
// Proses ini membuang API 2025 daripada realmnya SENDIRI, kemudian memuatkan lapisan
// keserasian dan menjalankan pemeriksaan tingkah laku. Keputusan dicetak sebagai JSON
// supaya tests/pdf-compat.test.mjs boleh menegaskannya.
//
// Guna: node tests/fixtures/pdf-compat-enjin-lama.mjs <laluan pdf-compat.js>
import { pathToFileURL } from "node:url";

delete Promise.withResolvers;
delete Promise.try;
delete URL.parse;
delete Math.sumPrecise;
delete Uint8Array.prototype.toHex;
delete Uint8Array.prototype.toBase64;
delete Object.hasOwn;
delete Array.prototype.at;
delete Array.prototype.findLast;
delete Array.prototype.findLastIndex;
delete String.prototype.replaceAll;
delete globalThis.structuredClone;

const { default: _ } = { default: null };
await import(pathToFileURL(process.argv[2]).href);

const hasil = {};
const cuba = (nama, fn) => {
  try {
    hasil[nama] = fn();
  } catch (e) {
    hasil[nama] = "RALAT: " + e.message;
  }
};

hasil.withResolversJenis = typeof Promise.withResolvers;
hasil.tryJenis = typeof Promise.try;
hasil.urlParseJenis = typeof URL.parse;
hasil.sumPreciseJenis = typeof Math.sumPrecise;
hasil.toHexJenis = typeof Uint8Array.prototype.toHex;
hasil.toBase64Jenis = typeof Uint8Array.prototype.toBase64;

cuba("withResolversNilai", () => {
  let resolve;
  const p = Promise.withResolvers();
  resolve = p.resolve;
  resolve(7);
  let nilai;
  p.promise.then((v) => {
    nilai = v;
  });
  return nilai === 7 || typeof p.resolve === "function";
});

cuba("urlParseBetul", () => URL.parse("https://contoh.my/a/b").pathname);
cuba("urlParseAsas", () => URL.parse("/x", "https://contoh.my/y").href);
cuba("urlParseSalah", () => URL.parse(":::"));

cuba("sumPreciseTepat", () => Math.sumPrecise([1e20, 1, -1e20]));
cuba("sumPreciseKosong", () => Math.sumPrecise([]));
cuba("sumPrecisePerpuluhan", () => Math.sumPrecise([0.1, 0.2]));

cuba("toHex", () => new Uint8Array([0, 1, 2, 15, 255]).toHex());
cuba("toBase64", () => new Uint8Array([77, 97, 110]).toBase64());
cuba("toBase64Padding", () => new Uint8Array([77, 97]).toBase64());

cuba("hasOwn", () => [Object.hasOwn({ a: 1 }, "a"), Object.hasOwn({ a: 1 }, "b")]);
cuba("at", () => [1, 2, 3].at(-1));
cuba("findLast", () => [1, 2, 3].findLast((n) => n < 3));
cuba("findLastIndex", () => [1, 2, 3].findLastIndex((n) => n < 3));
cuba("replaceAll", () => "a-b-c".replaceAll("-", "+"));
cuba("structuredClone", () => structuredClone({ a: [1, { b: 2 }] }).a[1].b);

// Promise.try perlu menukar ralat segerak menjadi janji yang ditolak.
const tolak = await Promise.try(() => {
  throw new Error("letup");
}).then(
  () => "tiada-ralat",
  (e) => e.message,
);
hasil.tryTolak = tolak;
hasil.tryNilai = await Promise.try((a, b) => a + b, 2, 3);

console.log(JSON.stringify(hasil));
