import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Ujian ini menjaga sebab deleteRows_ ditulis semula: satu simpanan jadual dulu memanggil
// sheet.deleteRow() sekali untuk SETIAP baris (587 baris = 587 panggilan API), jadi simpanan
// mengambil minit dan boleh terputus di tengah. Sekarang ia mesti membaca sekali dan menulis sekali.
const source = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const block = source.slice(source.indexOf("// ===== Padam sebenar"), source.indexOf("function absenceCoversPeriod_("));

function makeCountingWorld(rowCount) {
  const headers = ["id", "versionId", "teacherId", "day", "period"];
  const lines = [headers];
  for (let index = 0; index < rowCount; index += 1) lines.push(["r" + index, index < rowCount / 2 ? "v1" : "v2", "t" + index, "IS", 1 + (index % 12)]);
  const kemas = JSON.parse(JSON.stringify(lines));
  const jumlah = { baca: 0, tulis: 0, deleteRow: 0 };
  const sheet = {
    getLastRow: () => kemas.length,
    getLastColumn: () => headers.length,
    getMaxRows: () => kemas.length + 10,
    getFrozenRows: () => 1,
    insertRowsAfter: () => {},
    deleteRow: () => { jumlah.deleteRow += 1; },
    getRange: (row, column, numRows, numColumns) => ({
      getValues: () => { jumlah.baca += 1; return kemas.slice(row - 1, row - 1 + numRows).map((line) => line.slice(column - 1, column - 1 + numColumns)); },
      setValues: (values) => { jumlah.tulis += 1; kemas.length = row - 1; kemas.push(...values.filter((line) => line.some((value) => value !== ""))); return null; },
      setValue: () => {},
    }),
  };
  const context = vm.createContext({
    JSON, Object, String, Number, Array, Math, console,
    database_: () => ({ getSheetByName: () => sheet }),
    readObjects_: () => [],
    text_: (value) => (value == null ? "" : String(value)),
    Utilities: { formatDate: () => "2026-09-14" },
  });
  vm.runInContext(block, context);
  return { context, jumlah, kemas };
}

test("padam serentak: satu baca dan satu tulis untuk 587 baris, bukan ribuan deleteRow", () => {
  const dunia = makeCountingWorld(587);
  const dibuang = vm.runInContext('deleteRows_("Schedule", function (row) { return row.versionId === "v1"; })', dunia.context);
  assert.equal(dibuang, 294, "bilangan baris yang dipadam mesti tepat");
  assert.equal(dunia.jumlah.deleteRow, 0, "deleteRow baris demi baris tidak boleh digunakan lagi");
  assert.equal(dunia.jumlah.baca, 1, "satu bacaan sahaja");
  assert.equal(dunia.jumlah.tulis, 1, "satu tulisan sahaja");
  assert.equal(dunia.kemas.length - 1, 293, "baris yang tinggal ditera semula dengan tepat");
});

test("padam serentak: tiada baris padan bermakna tiada tulisan langsung", () => {
  const dunia = makeCountingWorld(40);
  const dibuang = vm.runInContext('deleteRows_("Schedule", function (row) { return row.versionId === "tiada"; })', dunia.context);
  assert.equal(dibuang, 0);
  assert.equal(dunia.jumlah.tulis, 0, "jangan tulis semula bila tiada apa yang padam");
  assert.equal(dunia.kemas.length - 1, 40, "semua baris kekal");
});

test("padam serentak: nilai mentah (tarikh/masa) ditulis semula tanpa ditukar bentuk", () => {
  const headers = ["id", "date"];
  let kemas = [];
  const sheet = {
    getLastRow: () => kemas.length,
    getLastColumn: () => headers.length,
    getFrozenRows: () => 1,
    insertRowsAfter: () => {},
    getRange: (row, column, numRows, numColumns) => ({
      getValues: () => kemas.slice(row - 1, row - 1 + numRows).map((line) => line.slice(column - 1, column - 1 + numColumns)),
      setValues: (values) => { kemas = [headers].concat(values.filter((line) => line.some((value) => value !== ""))); return null; },
      setValue: () => {},
    }),
  };
  const context = vm.createContext({
    JSON, Object, String, Number, Array, Math, console,
    database_: () => ({ getSheetByName: () => sheet }),
    // Semakan rentas-realm: Date yang dicipta dalam vm bukan `instanceof Date` hos.
    Utilities: { formatDate: (nilai) => (Object.prototype.toString.call(nilai) === "[object Date]" ? "2026-09-14" : String(nilai)) },
  });
  // Tarikh dibuat DI DALAM konteks vm, kerana `instanceof Date` dalam skrip diukur pada realm vm.
  kemas = [headers, ["a1", vm.runInContext('new Date("2026-09-14T00:00:00Z")', context)], ["a2", "2026-09-15"], ["a3", vm.runInContext('new Date("2026-09-14T00:00:00Z")', context)]];
  vm.runInContext(block, context);
  // Tapis ikut tarikh: padanan mesti melihat teks "2026-09-14" (sama seperti readObjects_),
  // bukan String(Date) gaya "Mon Sep 14 2026".
  const dibuang = vm.runInContext('deleteRows_("Absences", function (row) { return String(row.date) === "2026-09-14" && row.id === "a1"; })', context);
  assert.equal(dibuang, 1);
  assert.equal(kemas.length - 1, 2);
  assert.equal(Object.prototype.toString.call(kemas[2][1]), "[object Date]", "nilai Date asal mesti kekal sebagai Date, bukan teks");
  assert.deepEqual(kemas.slice(1).map((line) => line[0]), ["a2", "a3"]);
});
