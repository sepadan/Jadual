import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PERIODS, DAY_CODES } from "../data.js";
import { weekGrid, claimableCell } from "../week-view.js";
import { tafsirTampalPemulihan, susunTampalPemulihan, laporanTampalPemulihan } from "../tampal-pemulihan.js";

// SEMENTARA: kotak tampal untuk borang PDPC. Parser mesti longgar (dokumen sekolah, bukan borang
// web) tetapi tidak boleh menanda baris yang tidak difahaminya secara senyap.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const app = read("app.js");
const waktu = PERIODS.map((item) => Number(item.period));

test("borang PDPC ditampal dalam beberapa gaya dan semuanya difahami", () => {
  const teks = ["IS 4 MT 3B", "ISNIN 5 MT 3B", "IS-7 BM 3B", "SELASA 1 1M1S", "JUM 1 B.ALQ", "KHA 5 BM 3 BIJAK", "", "   "].join("\n");
  const { tanda, ralat } = tafsirTampalPemulihan(teks, { hari: DAY_CODES, waktu });
  assert.equal(ralat.length, 0, `baris sah ditolak: ${JSON.stringify(ralat)}`);
  assert.deepEqual(tanda, [
    { h: "IS", w: 4, s: "MT", k: "3B" },
    { h: "IS", w: 5, s: "MT", k: "3B" },
    { h: "IS", w: 7, s: "BM", k: "3B" },
    { h: "SEL", w: 1, s: "1M1S", k: "" },
    { h: "JUM", w: 1, s: "B.ALQ", k: "" },
    { h: "KHA", w: 5, s: "BM", k: "3 BIJAK" },
  ]);
});

test("baris yang tidak difahami dilaporkan dengan nombor barisnya", () => {
  const { tanda, ralat } = tafsirTampalPemulihan("IS 4 MT 3B\nMT 3B\nAHAD 2 BM 3B\nIS 17 BM 3B", { hari: DAY_CODES, waktu });
  assert.equal(tanda.length, 1);
  assert.deepEqual(ralat.map((item) => item.baris), [2, 3, 4]);
  assert.match(ralat[0].sebab, /HARI WAKTU SUBJEK/);
  assert.match(ralat[1].sebab, /tidak dikenali/);
  assert.match(ralat[2].sebab, /tiada dalam jam sekolah/);
});

test("waktu yang sudah berisi dilangkau dengan sebab, bukan ditindih", () => {
  const rows = [
    { versionId: "v1", teacherId: "t1", day: "IS", period: 4, startTime: "09:00", endTime: "09:30", subject: "MT", className: "3 BIJAK" },
    { versionId: "v1", teacherId: "t1", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: "PERHIMPUNAN", className: "", isDuty: true },
  ];
  const grid = weekGrid({ rows, days: DAY_CODES, periods: PERIODS, teacherId: "t1" });
  const { tanda } = tafsirTampalPemulihan("IS 1 PER\nIS 2 BM 3B\nIS 4 MT 3B", { hari: DAY_CODES, waktu });
  const { boleh, dilangkau } = susunTampalPemulihan({ grid, tanda, bolehTanda: claimableCell });
  assert.deepEqual(boleh.map((item) => `${item.h}-${item.w}`), ["IS-2"]);
  assert.equal(dilangkau.length, 2);
  assert.match(dilangkau[0].sebab, /sudah ada tugas lain/, "tugas yang ada tidak dinamakan");
  assert.match(dilangkau[1].sebab, /sudah ada kelas sebenar/, "kelas sebenar tidak dinamakan");
  assert.match(laporanTampalPemulihan({ boleh, dilangkau, ralat: [] }), /^1 waktu ditanda · 2 dilangkau/);
});

test("baris pendua dalam satu tampalan dilaporkan, bukan menimpa senyap", () => {
  const grid = weekGrid({ rows: [], days: DAY_CODES, periods: PERIODS, teacherId: "t1" });
  const { tanda } = tafsirTampalPemulihan("IS 4 MT 3B\nIS 4 BM 2C\nIS 5 MT 3B", { hari: DAY_CODES, waktu });
  const { boleh, dilangkau } = susunTampalPemulihan({ grid, tanda, bolehTanda: claimableCell });
  assert.deepEqual(boleh.map((item) => `${item.h}-${item.w}-${item.s}`), ["IS-4-MT", "IS-5-MT"], "baris kedua menimpa yang pertama");
  assert.match(dilangkau[0].sebab, /dua kali/, "pendua tidak dilaporkan");
  assert.equal(boleh.length, 2, "kiraan tidak sepadan dengan bilangan slot sebenar");
});

test("kotak tampal hanya berfungsi untuk admin, dan simpanan tetap melalui Simpan tetapan", () => {
  for (const id of ["tampalPemulihanBox", "tampalPemulihanTeks", "tampalPemulihanGuna", "tampalPemulihanLaporan"]) {
    assert.ok(html.includes(`id="${id}"`), `kotak tampal tiada #${id}`);
  }
  assert.match(app, /\$\("#tampalPemulihanGuna"\)\.addEventListener\("click", gunaTampalPemulihan\)/, "butang tanda tidak diwayarkan");
  assert.match(app, /function gunaTampalPemulihan\(\) \{\s*\n\s*if \(!requireAdmin\(\)\) return;/, "kotak tampal boleh dijalankan tanpa login admin");
  assert.match(app, /settingSelection\.add\(id\);\s*\n\s*settingDetails\[id\] = \{ subjek: item\.s, kelas: item\.k \};/, "tanda yang ditampal tidak masuk ke dalam pilihan tetapan");
  assert.doesNotMatch(app, /gunaTampalPemulihan[\s\S]{0,400}remoteWrite/, "kotak tampal menulis sendiri ke Sheets dan bukannya melalui Simpan tetapan");
});
