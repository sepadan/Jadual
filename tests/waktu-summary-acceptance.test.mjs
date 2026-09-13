// Ujian penerimaan (Claude, membantu DeepSeek) — bukan audit umum. DeepSeek pemilik builder.js
// sedang membetulkan ringkasanKelas()/ringkasanGuru() supaya slot tetap (acara: PER, 1M1S,
// B.ALQ, KOKU) tidak lagi dikira sebagai baris ringkasan subjek atau ditambah ke Jumlah
// Waktu/beban guru. Fail ini TIDAK menyentuh builder.js atau ujian sedia ada
// (tests/print-summary-aggregate.test.mjs dll., milik DeepSeek) — ia hanya memuatkan fungsi
// sebenar melalui vm, sama seperti corak print-summary-aggregate.test.mjs sedia ada.
//
// Syarat pengguna diuji di sini (tingkah laku, BUKAN regex ke atas kod sumber):
//   1) Acara tetap (PER/1M1S/B.ALQ/KOKU) TIADA baris dalam ringkasan subjek (R.rows).
//   2) Acara tetap TIDAK ditambah ke Jumlah Waktu / beban guru (R.jum).
//   3) Baris guru+subjek / kelas+subjek NORMAL (bukan acara) kekal betul — termasuk apabila satu
//      waktu diajar oleh SEPASANG guru (pairing), setiap guru dalam pasangan itu mengekalkan
//      jumlah waktunya sendiri yang betul.
// Grid aktiviti (matriks()/gridSkrin()/jadualCetak()) memanggil acaraUntuk() terus dan TIDAK
// melalui ringkasanKelas/ringkasanGuru, jadi ia di luar skop perubahan ini — disahkan dengan
// bacaan read-only (lihat laporan), bukan diuji semula di sini.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../builder.js', import.meta.url), 'utf8');
const start = source.indexOf('function ringkasanGuru(');
const end = source.indexOf('function tarikhCetak(');
const slice = source.slice(start, end);

function makeContext({ subjek, kelas, guru, slots, acaraByKelas = {}, acaraByGuru = {} }) {
  const S = { jadual: { slots } };
  return {
    S,
    num: (v, d = 0) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; },
    kodSubjek: (id) => (subjek[id] ? subjek[id].kod : '?'),
    namaKelas: (id) => (kelas[id] ? kelas[id].nama : '?'),
    namaGuru: (id, pendek) => { const g = guru[id]; if (!g) return '—'; return pendek ? (g.kod || g.nama) : g.nama; },
    kelasById: (id) => kelas[id] || null,
    // acaraUntuk('kelas', id) / acaraUntuk('guru', id) — fixture ringkas mengikut mode+id, meniru
    // slot tetap PER/1M1S/B.ALQ/KOKU yang sebenar-benar kelihatan pada grid aktiviti kelas/guru itu.
    acaraUntuk: (mode, id) => (mode === 'kelas' ? (acaraByKelas[id] || []) : (acaraByGuru[id] || [])),
    console,
  };
}

const FIXED_ACTIVITY_CODES = ['PER', '1M1S', 'B.ALQ', 'KOKU'];

test('ringkasanKelas: acara tetap (PER/1M1S/B.ALQ/KOKU) tiada baris dan tiada sumbangan kepada Jumlah Waktu', () => {
  const subjek = { bm: { kod: 'BM' }, mt: { kod: 'MT' } };
  const guru = { g1: { nama: 'GURU SATU', kod: 'G1' }, g2: { nama: 'GURU DUA', kod: 'G2' } };
  const kelas = { k1: { nama: '1 BIJAK', tahap: 1 } };
  const slots = [
    { kelasId: 'k1', subjekId: 'bm', guruId: 'g1', hari: 'ISNIN', panjang: 1 },
    { kelasId: 'k1', subjekId: 'bm', guruId: 'g1', hari: 'SELASA', panjang: 2 },
    { kelasId: 'k1', subjekId: 'mt', guruId: 'g2', hari: 'RABU', panjang: 2 },
  ];
  const acaraByKelas = { k1: FIXED_ACTIVITY_CODES.map((kod) => ({ kod, panjang: kod === 'KOKU' ? 2 : 1 })) };
  const context = makeContext({ subjek, kelas, guru, slots, acaraByKelas });
  vm.runInNewContext(slice, context);

  const R = context.ringkasanKelas('k1');

  FIXED_ACTIVITY_CODES.forEach((kod) => {
    assert.ok(!R.rows.some((r) => r.subjek === kod), `${kod} tidak boleh muncul sebagai baris dalam ringkasan subjek kelas`);
  });
  assert.equal(R.rows.length, 2, 'hanya baris subjek+guru sebenar (BM/G1, MT/G2), bukan 2 + 4 acara');
  const bmRow = R.rows.find((r) => r.subjek === 'BM');
  const mtRow = R.rows.find((r) => r.subjek === 'MT');
  assert.equal(bmRow.jum, 3, 'BM: 1 + 2 waktu sebenar (acara tidak dicampur masuk)');
  assert.equal(mtRow.jum, 2);
  assert.equal(R.jum, 5, 'Jumlah Waktu kelas mesti 3+2=5 sahaja — bukan +1 (PER) +2 (1M1S diandaikan) +1 (B.ALQ) +2 (KOKU)');
});

test('ringkasanGuru: acara tetap (PER/1M1S/B.ALQ/KOKU) tiada baris dan tiada sumbangan kepada beban guru', () => {
  const subjek = { bm: { kod: 'BM' } };
  const guru = { g1: { nama: 'GURU SATU', kod: 'G1' } };
  const kelas = { k1: { nama: '1 BIJAK', tahap: 1 } };
  const slots = [
    { kelasId: 'k1', subjekId: 'bm', guruId: 'g1', hari: 'ISNIN', panjang: 1 },
    { kelasId: 'k1', subjekId: 'bm', guruId: 'g1', hari: 'SELASA', panjang: 1 },
  ];
  const acaraByGuru = { g1: FIXED_ACTIVITY_CODES.map((kod) => ({ kod, panjang: kod === 'KOKU' ? 2 : 1 })) };
  const context = makeContext({ subjek, kelas, guru, slots, acaraByGuru });
  vm.runInNewContext(slice, context);

  const R = context.ringkasanGuru('g1');

  FIXED_ACTIVITY_CODES.forEach((kod) => {
    assert.ok(!R.rows.some((r) => r.subjek === kod), `${kod} tidak boleh muncul sebagai baris dalam ringkasan guru`);
  });
  assert.equal(R.rows.length, 1, 'hanya satu baris BM/1 BIJAK, bukan 1 + 4 acara');
  assert.equal(R.rows[0].jum, 2, 'BM: 1+1 waktu sebenar');
  assert.equal(R.jum, 2, 'Jumlah Waktu (beban) guru mesti 2 sahaja — acara tidak menambah beban');
});

test('ringkasanGuru: pasangan guru (dua guru, satu waktu) — setiap guru kekal jumlah waktunya sendiri, tanpa acara mengganggu', () => {
  const subjek = { bm: { kod: 'BM' }, mt: { kod: 'MT' } };
  const guru = { g1: { nama: 'GURU SATU', kod: 'G1' }, g2: { nama: 'GURU DUA', kod: 'G2' } };
  const kelas = { k1: { nama: '1 BIJAK', tahap: 1 }, k2: { nama: '2 BIJAK', tahap: 2 } };
  // Waktu berpasangan: satu slot BM/k1/ISNIN diajar BERSAMA oleh g1 DAN g2 (dua baris slot berasingan
  // dengan hari+mula+kelas+subjek sama — corak sebenar janaJadual/convertBuilderSchedule untuk
  // pairing), ditambah waktu MT/k2 yang hanya g1 ajar seorang diri (bukan pasangan).
  const slots = [
    { kelasId: 'k1', subjekId: 'bm', guruId: 'g1', hari: 'ISNIN', panjang: 1 },
    { kelasId: 'k1', subjekId: 'bm', guruId: 'g2', hari: 'ISNIN', panjang: 1 },
    { kelasId: 'k2', subjekId: 'mt', guruId: 'g1', hari: 'RABU', panjang: 2 },
  ];
  const acaraByGuru = { g1: [{ kod: 'PER', panjang: 1 }, { kod: 'KOKU', panjang: 2 }], g2: [{ kod: 'B.ALQ', panjang: 1 }] };
  const context = makeContext({ subjek, kelas, guru, slots, acaraByGuru });
  vm.runInNewContext(slice, context);

  const rG1 = context.ringkasanGuru('g1');
  const rG2 = context.ringkasanGuru('g2');

  assert.equal(rG1.rows.length, 2, 'g1: baris BM/1 BIJAK (pasangan) + MT/2 BIJAK (seorang diri), tiada baris acara');
  assert.equal(rG1.rows.find((r) => r.subjek === 'BM').jum, 1, 'g1 mengajar BM 1 waktu sahaja (bahagiannya dalam pasangan itu)');
  assert.equal(rG1.rows.find((r) => r.subjek === 'MT').jum, 2);
  assert.equal(rG1.jum, 3, 'Jumlah Waktu g1 mesti 1+2=3 — bukan +1 (PER) +2 (KOKU)');

  assert.equal(rG2.rows.length, 1, 'g2: hanya baris BM/1 BIJAK (bahagiannya dalam pasangan), tiada baris acara');
  assert.equal(rG2.rows[0].jum, 1, 'g2 mengajar BM 1 waktu sahaja — bukan 2 (jumlah gabungan pasangan)');
  assert.equal(rG2.jum, 1, 'Jumlah Waktu g2 mesti 1 — bukan +1 (B.ALQ)');
});
