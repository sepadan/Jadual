import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PERIODS, DAY_CODES } from "../data.js";
import { weekGrid, claimableCell } from "../week-view.js";
import { bacaPemulihanHash, kodPemulihan, kiraPerubahanPemulihan, pilihGuruPemulihan, susunSlotPemulihan } from "../pautan-pemulihan.js";

// SEMENTARA: pautan "tandakan jadual pemulihan sekali gus". Ia mesti selamat (perlu admin), jujur
// (tidak menandai waktu yang sudah ada kelas) dan tidak menyimpan sendiri tanpa tekanan pentadbir.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const app = read("app.js");

const slot = [
  { h: "IS", w: 2, s: "MT", k: "3B" },
  { h: "IS", w: 3, s: "BM", k: "3B" },
  { h: "IS", w: 4, s: "BM", k: "3 BIJAK" },
];
const rows = [{ versionId: "v1", teacherId: "t1", day: "IS", period: 4, startTime: "09:00", endTime: "09:30", subject: "BM", className: "3 BIJAK" }];
const grid = weekGrid({ rows, days: DAY_CODES, periods: PERIODS, teacherId: "t1" });
const kunci = (hari, waktu) => `${hari}-${waktu}`;

test("pautan membawa senarai waktu pemulihan dan boleh dibaca semula", () => {
  const muatan = { guru: "AMIRAH BINTI SHEIKH ISMAIL", slot };
  const kod = kodPemulihan(muatan);
  assert.match(kod, /^[A-Za-z0-9_-]+$/, "kod pautan mengandungi aksara yang perlu di-escape dalam URL");
  assert.deepEqual(bacaPemulihanHash(`#pemulihan=${kod}`), muatan);
  assert.deepEqual(bacaPemulihanHash(`https://contoh/#lain=1&pemulihan=${kod}`), muatan);
});

test("pautan rosak atau tiada tidak memecahkan aplikasi", () => {
  assert.equal(bacaPemulihanHash(""), null);
  assert.equal(bacaPemulihanHash("#pemulihan=bukan-base64!!"), null);
  assert.equal(bacaPemulihanHash(`#pemulihan=${kodPemulihan({ guru: "X" })}`), null, "muatan tanpa senarai slot diterima");
});

test("waktu yang sudah ada kelas sebenar dilaporkan, bukan ditanda", () => {
  const { tanda, terkunci } = susunSlotPemulihan({ grid, slot, bolehTanda: claimableCell });
  assert.deepEqual(tanda.map((item) => kunci(item.hari, item.waktu)), ["IS-2", "IS-3"]);
  assert.equal(tanda[0].subjek, "MT");
  assert.equal(tanda[0].kelas, "3B");
  assert.equal(terkunci.length, 1);
  assert.match(terkunci[0].sebab, /kelas sebenar/);
});

test("kiraan tanda baharu, kemas kini dan yang sudah betul", () => {
  const { tanda } = susunSlotPemulihan({ grid, slot, bolehTanda: claimableCell });
  const kira = kiraPerubahanPemulihan({ tanda, pilihan: new Set(["IS-2"]), butiran: { "IS-2": { subjek: "MT", kelas: "3B" } }, kunci });
  assert.deepEqual(kira, { baharu: 1, dikemas: 0, sama: 1 });
  const kemas = kiraPerubahanPemulihan({ tanda, pilihan: new Set(["IS-2"]), butiran: { "IS-2": { subjek: "BM", kelas: "3B" } }, kunci });
  assert.deepEqual(kemas, { baharu: 1, dikemas: 1, sama: 0 });
});

test("nama guru dipadan dengan longgar, dan pentadbir memilih bila tidak padan", () => {
  const guru = [
    { id: "g1", name: "AMIRAH BINTI SHEIKH ISMAIL", shortName: "AMIRAH", position: "Guru Pemulihan", active: true },
    { id: "g2", name: "MHD FAIDZAL BIN YUSOF", shortName: "FAIDZAL", position: "Guru Akademik", active: true },
  ];
  assert.equal(pilihGuruPemulihan({ nama: "AMIRAH BT SHEIKH ISMAIL", guru }).tepat?.id, "g1", "ejaan BINTI/BT memutuskan padanan");
  assert.equal(pilihGuruPemulihan({ nama: "amirah binti sheikh ismail", guru }).tepat?.id, "g1", "huruf besar/kecil memutuskan padanan");
  assert.equal(pilihGuruPemulihan({ nama: "AMIRAH", guru }).tepat?.id, "g1", "nama pendek tidak dipadan");
  const tiada = pilihGuruPemulihan({ nama: "NAMA TIADA", guru });
  assert.equal(tiada.tepat, null);
  assert.deepEqual(tiada.calon.map((item) => item.id), ["g1"], "senarai pilihan bukan guru pemulihan sahaja");
});

test("pautan memerlukan admin dan menyimpan melalui aliran tetapan biasa", () => {
  for (const id of ["pautanPemulihanDialog", "pautanPemulihanRingkas", "pautanPemulihanKira", "pautanPemulihanSimpan", "pautanPemulihanGuru", "pautanPemulihanPilih"]) {
    assert.ok(html.includes(`id="${id}"`), `dialog pautan tiada #${id}`);
  }
  assert.match(app, /if \(!admin\) return false;/, "pautan boleh dijalankan tanpa login admin");
  assert.match(app, /\$\("#pautanPemulihanSimpan"\)\.addEventListener\("click", simpanPautanPemulihan\)/, "butang simpan tidak diwayarkan");
  assert.match(app, /async function simpanPautanPemulihan\(\) \{[\s\S]{0,220}await saveSettingSlots\(\)/, "simpanan tidak melalui aliran tetapan biasa");
  assert.match(app, /history\.replaceState\(null, "", `\$\{location\.pathname\}\$\{location\.search\}`\)/, "pautan kekal dalam bar alamat selepas digunakan");
});
