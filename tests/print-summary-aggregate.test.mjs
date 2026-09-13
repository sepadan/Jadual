import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../builder.js', import.meta.url), 'utf8');
const start = source.indexOf('function ringkasanKelas(');
const end = source.indexOf('function tarikhCetak(');
const slice = source.slice(start, end);

// ringkasanKelas() mesti mengasingkan SATU BARIS BAGI SETIAP PASANGAN subjek+guru, bukan
// menggabungkan semua guru bagi satu subjek ke dalam sel yang sama. Apabila satu subjek pernah
// diajar oleh lebih daripada satu guru pada hari berlainan (perkongsian/gantian pertengahan minggu
// - biasa dalam sekolah sebenar, bukan kes rekaan), setiap guru muncul sebagai baris berasingan
// dengan jumlah waktunya sendiri (contoh "BM | AIZUDDIN | 10"), dan nama dipaparkan sebagai kod
// ringkas kerana helaian cetak ialah paparan jadual.
test('a subject taught by more than one teacher across the week produces one row per teacher', () => {
  const S = {
    jadual: { slots: [
      { kelasId: 'k1', subjekId: 'bm', guruId: 'g1', hari: 'ISNIN', panjang: 1 },
      { kelasId: 'k1', subjekId: 'bm', guruId: 'g2', hari: 'SELASA', panjang: 1 },
      { kelasId: 'k1', subjekId: 'bi', guruId: 'g1', hari: 'RABU', panjang: 2 },
    ] },
  };
  const guru = { g1: { nama: 'GURU SATU', kod: 'G1' }, g2: { nama: 'GURU DUA', kod: 'G2' } };
  const subjek = { bm: { kod: 'BM' }, bi: { kod: 'BI' } };
  const context = {
    S,
    num: (v, d = 0) => { const n = parseInt(v, 10); return isNaN(n) ? d : n; },
    kodSubjek: (id) => (subjek[id] ? subjek[id].kod : '?'),
    namaGuru: (id, pendek) => { const g = guru[id]; if (!g) return '—'; return pendek ? (g.kod || g.nama) : g.nama; },
    acaraUntuk: () => [],
    console,
  };
  vm.runInNewContext(slice, context);
  const R = context.ringkasanKelas('k1');

  const bmRows = R.rows.filter((r) => r.subjek === 'BM');
  assert.equal(bmRows.length, 2, 'BM taught by two teachers must be two separate rows, one per teacher');
  assert.deepEqual(bmRows.map((r) => r.kelas).sort(), ['G1', 'G2'], 'each teacher short code shown in its own row');
  assert.equal(bmRows[0].jum + bmRows[1].jum, 2, 'the two BM periods split across the two teacher rows');
  assert.equal(R.rows.length, 3, 'row count must equal distinct subject+teacher pairs (3), not distinct subjects (2)');
});
