// PENGESAHAN AKHIR (Claude) — bukan audit umum, bukan skrip produksi/ujian rasmi.
// Menyemak SATU isu penting yang diminta penyelia:
//   "import kedua PDF BERBEZA mesti memperbaharui nilai auto (bukan menyimpan semua nilai
//    auto lama sebagai override); pengesahan manual satu hari tidak boleh mengesahkan hari
//    lain senyap."
//
// Memanggil draftFromPdf SEBENAR daripada pdf-builder.js (tiada mock, tiada suntingan
// produksi). Data sintetik sepenuhnya — tiada nama guru/kelas sekolah sebenar, tiada
// rangkaian, tiada Apps Script. Jalankan: node tools/verify-waktu-final-import.mjs
import { draftFromPdf } from '../pdf-builder.js';

const teachers = [{ id: 't1', name: 'GURU CONTOH SATU', shortName: 'SATU', position: 'Guru Akademik Biasa', active: true }];
const row = (day, period) => ({ teacherId: 't1', day, period, startTime: '07:30', endTime: '08:00', subject: 'BM', className: '1 CONTOH' });
const metadata = { periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }] };

const results = [];
function record(name, expected, actual, note) {
  const pass = JSON.stringify(expected) === JSON.stringify(actual);
  results.push({ name, expected, actual, pass, note });
  console.log(`${pass ? 'LULUS' : 'GAGAL'} — ${name}`);
  console.log(`  jangka : ${JSON.stringify(expected)}`);
  console.log(`  sebenar: ${JSON.stringify(actual)}`);
  if (note) console.log(`  nota   : ${note}`);
}

console.log('=== Kes 1: import PDF #1 (asal) ===');
const rowsPdf1 = [row('IS', 1), row('IS', 5), row('SEL', 1), row('SEL', 2)];
const state1 = draftFromPdf(rowsPdf1, teachers, {}, metadata);
const k1 = state1.kelas[0];
console.log('kelas.waktuHari selepas import #1:', JSON.stringify(k1.waktuHari), 'inferens:', k1.waktuHariInferens);

console.log('\n=== Kes 1 (sambungan): import PDF #2 BERBEZA, TIADA pengesahan manual di antaranya ===');
// PDF #2 ialah kemas kini sebenar sekolah (cth. penggal baharu): ISNIN kini 9 waktu, bukan 5.
// Kelas ini tidak pernah disahkan manual (waktuHariInferens kekal true selepas import #1).
const rowsPdf2Different = [row('IS', 1), row('IS', 9), row('SEL', 1), row('SEL', 2)];
const state2 = draftFromPdf(rowsPdf2Different, teachers, state1, metadata);
const k2 = state2.kelas[0];
record(
  'Kes 1 — nilai AUTO (tidak pernah disahkan) mesti diperbaharui oleh PDF #2 yang berbeza (ISNIN: 5 -> 9)',
  9, k2.waktuHari.ISNIN,
  'Jangkaan kontrak: nilai inferens (belum disahkan admin) tidak patut "terkunci" pada nilai PDF pertama.'
);
console.log('kelas.waktuHari selepas import #2 (tiada pengesahan manual):', JSON.stringify(k2.waktuHari), 'inferens:', k2.waktuHariInferens);

console.log('\n=== Kes 2: admin sahkan HANYA satu hari (ISNIN), kemudian PDF #3 berbeza pada hari LAIN (SELASA) ===');
const stateConfirmedIsninOnly = structuredClone(state1);
// Simulasi tindakan UI sebenar (builder.js baris ~483): mengedit SATU sel ISNIN menetapkan
// waktuHariInferens=false untuk KESELURUHAN kelas (bukan hanya ISNIN) — lihat pengesahan
// tools/verify-waktu-final.mjs untuk bukti tingkah laku ini dalam pelayar sebenar.
stateConfirmedIsninOnly.kelas[0].waktuHari.ISNIN = 5; // admin sahkan nilai sedia ada betul
stateConfirmedIsninOnly.kelas[0].waktuHariInferens = false; // set oleh oninput sebenar di UI
const rowsPdf3DifferentSelasa = [row('IS', 1), row('IS', 5), row('SEL', 1), row('SEL', 7)];
const state3 = draftFromPdf(rowsPdf3DifferentSelasa, teachers, stateConfirmedIsninOnly, metadata);
const k3 = state3.kelas[0];
record(
  'Kes 2 — ISNIN yang DISAHKAN admin mesti kekal (5), tidak ditimpa oleh PDF #3',
  5, k3.waktuHari.ISNIN
);
record(
  'Kes 2 — SELASA yang TIDAK PERNAH disahkan (hanya "ikut serta" pengesahan ISNIN secara senyap) sepatutnya masih boleh diperbaharui oleh PDF #3 (SELASA: 2 -> 7)',
  7, k3.waktuHari.SELASA,
  'Jangkaan kontrak: pengesahan satu hari tidak patut mengesahkan hari lain secara senyap kerana waktuHariInferens ialah SATU bendera bagi keseluruhan kelas, bukan per-hari.'
);
console.log('kelas.waktuHari selepas import #3 (ISNIN disahkan, SELASA tidak):', JSON.stringify(k3.waktuHari), 'inferens:', k3.waktuHariInferens);

const fail = results.filter((r) => !r.pass);
console.log(`\n=== RINGKASAN: ${results.length - fail.length}/${results.length} lulus ===`);
fail.forEach((r) => console.log(`  GAGAL: ${r.name}`));
process.exitCode = fail.length ? 1 : 0;
