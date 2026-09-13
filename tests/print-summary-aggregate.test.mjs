import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../builder.js', import.meta.url), 'utf8');
const start = source.indexOf('function ringkasanKelas(');
const end = source.indexOf('function tarikhCetak(');
const slice = source.slice(start, end);

// ringkasanKelas() dahulu digabung ikut subjek+guru, jadi satu subjek yang pernah diajar oleh lebih
// daripada satu guru pada hari berlainan (perkongsian/gantian pertengahan minggu - biasa dalam
// sekolah sebenar, bukan kes rekaan) menghasilkan SATU BARIS BAGI SETIAP GURU dan boleh melimpahi
// jadual ringkasan sisi. Ia mesti digabung ikut subjek sahaja, dengan semua nama guru terlibat
// kekal dipaparkan dalam sel yang sama (tiada maklumat dibuang).
test('a subject taught by more than one teacher across the week collapses into one summary row, not one per teacher', () => {
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
  assert.equal(bmRows.length, 1, 'BM must collapse to a single row even though two teachers taught it on different days');
  assert.match(bmRows[0].kelas, /GURU SATU/, 'the first full teacher name must still be shown (no information dropped)');
  assert.match(bmRows[0].kelas, /GURU DUA/, 'the second full teacher name must still be shown (no information dropped)');
  assert.equal(bmRows[0].jum, 2, 'total periods must still be summed across both teachers');
  assert.equal(R.rows.length, 2, 'row count must equal distinct subject count (2), not distinct subject+teacher pairs (3)');
});
