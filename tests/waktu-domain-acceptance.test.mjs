// Ujian penerimaan domain waktu — regresi tingkah laku, BUKAN audit kod.
// Skop (arahan pengguna): (1) waktu setiap kelas/hari berbeza, (2) import aSc automatik
// dengan override manual, (3) Tahap 1 (Tahun 1-3) tiada KOKU, (4) slot tetap (waktu
// tetapan) hanya blok masa — tidak dikira jumlah subjek atau beban guru, (5) waktu balik
// setiap kelas/hari berbeza dan jangan jana selepas waktu balik.
//
// Semua data adalah SINTETIK (nama guru/kelas rekaan). Fail produksi (builder.js,
// builder-relief.js, pdf-builder.js) dan ujian sedia ada TIDAK disentuh — DeepSeek
// pemilik fail tersebut sedang membetulkannya. Ujian ini memanggil enjin sebenar
// (draftFromPdf daripada pdf-builder.js, dan fungsi global builder.js dimuat melalui
// vm mengikut corak tests/builder-engine.test.mjs sedia ada).
//
// Kegagalan (RED) dibenarkan dan didokumenkan dalam laporan berasingan; syarat ujian
// TIDAK dilemahkan semata-mata untuk lulus. Nota penting: ujian ini sengaja TIDAK
// mengandaikan "slot terakhir yang terisi" sebagai bukti waktu balik apabila sumber
// tidak menyatakannya secara eksplisit — waktu balik diuji melalui `kelas.waktuHari`
// yang eksplisit (medan sumber yang sama digunakan oleh enjin sebenar di builder.js),
// bukan tekaan daripada kedudukan slot terakhir.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { draftFromPdf } from '../pdf-builder.js';

const teachers = [
  { id: 't1', name: 'GURU SATU', shortName: 'SATU', position: 'Guru Akademik Biasa', active: true },
  { id: 't2', name: 'GURU DUA', shortName: 'DUA', position: 'Guru Akademik Biasa', active: true },
];
const row = (tid, day, period, subj, cls, extra = {}) => ({
  teacherId: tid, day, period, startTime: '07:30', endTime: '08:00', subject: subj, className: cls, ...extra,
});

/* ============================================================
   1) IMPORT ASC AUTOMATIK — waktu kelas/hari terus daripada data
      sumber, berbeza ikut kelas DAN ikut hari (bukan satu nilai global).
   ============================================================ */
test('import aSc menetapkan kelas.waktuHari automatik, berbeza ikut kelas dan ikut hari', () => {
  const rows = [
    row('t1', 'IS', 1, 'BM', '1 BIJAK'), row('t1', 'IS', 5, 'BM', '1 BIJAK'),
    row('t2', 'IS', 1, 'MT', '4 BIJAK'), row('t2', 'IS', 8, 'MT', '4 BIJAK'),
    row('t1', 'SEL', 2, 'BM', '1 BIJAK'), row('t2', 'SEL', 6, 'MT', '4 BIJAK'),
  ];
  const metadata = {
    periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
    pages: [
      { teacherId: 't1', rawName: 'PN GURU SATU', classTeacherClass: '1 BIJAK' },
      { teacherId: 't2', rawName: 'PN GURU DUA', classTeacherClass: '4 BIJAK' },
    ],
  };
  const state = draftFromPdf(rows, teachers, {}, metadata);
  const kecil = state.kelas.find((k) => k.nama === '1 BIJAK');
  const besar = state.kelas.find((k) => k.nama === '4 BIJAK');
  assert.ok(kecil && besar, 'kedua-dua kelas mesti wujud selepas import');
  assert.equal(kecil.waktuHari.ISNIN, 5, '1 BIJAK: waktu balik Isnin daripada baris sebenar (waktu 5)');
  assert.equal(besar.waktuHari.ISNIN, 8, '4 BIJAK: waktu balik Isnin BERBEZA daripada 1 BIJAK (waktu 8)');
  assert.equal(kecil.waktuHari.SELASA, 2, '1 BIJAK: waktu balik Selasa berbeza daripada Isnin (waktu 2)');
  assert.equal(besar.waktuHari.SELASA, 6, '4 BIJAK: waktu balik Selasa berbeza daripada Isnin (waktu 6)');
});

/* ============================================================
   Enjin builder.js dimuat sekali melalui vm (corak sama seperti
   tests/builder-engine.test.mjs sedia ada) untuk semua ujian di bawah.
   ============================================================ */
const source = readFileSync(new URL('../builder.js', import.meta.url), 'utf8');
const domNode = { querySelector: () => ({}), querySelectorAll: () => [] };
const context = vm.createContext({
  console, setTimeout, clearTimeout, performance,
  document: { getElementById: () => domNode },
});
vm.runInContext(source.slice(0, source.indexOf('function jadualCetak(')), context);
const jalankan = (code) => JSON.parse(vm.runInContext(code, context));
const jalankanAsync = async (code) => JSON.parse(await vm.runInContext(code, context));

/* ============================================================
   2) OVERRIDE MANUAL — enjin (waktuHariKelas) mesti guna nilai
      kelas.waktuHari SEMASA (termasuk suntingan manual admin),
      bukan nilai global S.masa.waktu, dan validasi (semakJadual)
      mesti tanda 'luar' jika slot melangkaui waktu balik kelas itu.
   ============================================================ */
test('override manual pada kelas.waktuHari diutamakan berbanding nilai global oleh enjin', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1,waktuHari:{ISNIN:5}}];
    S.masa.waktu={ISNIN:8,SELASA:8,RABU:8,KHAMIS:8,JUMAAT:8};
    S.jadual={slots:[{id:'x1',kelasId:'1b',subjekId:'bm',guruId:'g1',hari:'ISNIN',mula:6,panjang:1}]};
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
    return JSON.stringify({
      override:waktuHariKelas('1b','ISNIN'),
      gugurGlobal:waktuHariKelas('1b','SELASA'),
      isu:semakJadual().map(i=>i.t),
    });
  })()`);
  assert.equal(r.override, 5, 'kelas dengan waktuHari eksplisit (5) mesti mengatasi nilai global (8)');
  assert.equal(r.gugurGlobal, 8, 'hari tanpa nilai kelas gugur ke nilai global (8)');
  assert.ok(r.isu.includes('luar'), 'slot pada waktu 6 bagi kelas yang balik pada waktu 5 mesti ditanda luar/selepas balik');
});

/* ============================================================
   3) KONTRAK — override manual mesti KEKAL walaupun aSc diimport
      semula (mis. admin baiki nilai PDF yang tersalah baca, kemudian
      import semula PDF yang sama/versi kemas kini). Jika enjin
      mengira semula waktuHari daripada baris PDF tanpa mengekalkan
      override sedia ada, ini satu KEGAGALAN kontrak (RED diterima,
      TIDAK dilemahkan).
   ============================================================ */
test('[KONTRAK] override manual kelas.waktuHari kekal selepas aSc diimport semula', () => {
  const rows = [
    row('t1', 'IS', 1, 'BM', '1 BIJAK'),
    row('t1', 'IS', 5, 'BM', '1 BIJAK'),
  ];
  const metadata = { periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }] };
  const state1 = draftFromPdf(rows, teachers, {}, metadata);
  assert.equal(state1.kelas[0].waktuHari.ISNIN, 5, 'nilai automatik awal daripada PDF ialah 5');

  // Admin secara manual membetulkan waktu balik sebenar (cth. PDF tidak menangkap
  // waktu tambahan tanpa subjek kelas eksplisit pada hari itu).
  state1.kelas[0].waktuHari.ISNIN = 7;

  // Import semula PDF yang sama (aliran biasa: admin buka semula fail aSc),
  // menghantar draf semasa (dengan override) sebagai asas (base).
  const state2 = draftFromPdf(rows, teachers, state1, metadata);

  assert.equal(
    state2.kelas[0].waktuHari.ISNIN, 7,
    'override manual (7) mesti kekal selepas import semula — bukan ditulis ganti senyap kepada nilai PDF (5)'
  );
});

/* ============================================================
   4) KONTRAK — Tahap 1 (Tahun 1-3) tiada KOKU. Walaupun admin
      tersilap konfigur slot tetap KOKU merangkumi tahap 1-3, enjin
      MESTI mengecualikan kelas tahap 1-3 daripada slot tersebut.
      Tiada larangan sedemikian wujud pada masa ujian ini ditulis
      (kelasTerkenaAcara/acaraUntuk tiada sekatan tahap-KOKU), jadi
      RED di sini mendedahkan jurang sebenar, bukan andaian salah.
   ============================================================ */
test('[KONTRAK] slot tetap KOKU tidak boleh terpakai kepada kelas Tahap 1-3 (Tahun 1-3)', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[
      {id:'1b',nama:'1 BIJAK',tahap:1},
      {id:'3b',nama:'3 BIJAK',tahap:3},
      {id:'4b',nama:'4 BIJAK',tahap:4},
    ];
    S.acara=[{id:'e1',kod:'KOKU',nama:'Kokurikulum',hari:'RABU',mula:11,panjang:2,skop:'tahap',tahap:[1,3,4],guru:[],kelas:[]}];
    return JSON.stringify({
      terkena:kelasTerkenaAcara(S.acara[0]).sort(),
      tahap1Nampak:acaraUntuk('kelas','1b').map(a=>a.kod),
      tahap3Nampak:acaraUntuk('kelas','3b').map(a=>a.kod),
      tahap4Nampak:acaraUntuk('kelas','4b').map(a=>a.kod),
    });
  })()`);
  assert.deepEqual(
    r.terkena, ['4b'],
    'KOKU hanya boleh terpakai kepada kelas Tahun 4+ walaupun dikonfigurasikan merangkumi tahap 1,3,4'
  );
  assert.deepEqual(r.tahap1Nampak, [], 'Tahun 1 tidak boleh nampak KOKU pada jadualnya');
  assert.deepEqual(r.tahap3Nampak, [], 'Tahun 3 tidak boleh nampak KOKU pada jadualnya');
  assert.deepEqual(r.tahap4Nampak, ['KOKU'], 'Tahun 4 kekal nampak KOKU seperti biasa');
});

/* ============================================================
   5) Slot tetap (waktu tetapan / acara) hanya blok masa — TIDAK
      dikira sebagai beban guru (maxHariGuru) atau bilangan subjek
      sehari. Guru dengan had 2 waktu sehari mesti masih boleh
      mengajar 2 waktu PENUH pada hari yang sama dengan slot tetap
      (mesyuarat) sepanjang 2 waktu, kerana slot tetap tidak masuk
      kira beban.
   ============================================================ */
test('slot tetap (acara) hanya blok masa dan tidak dikira sebagai beban guru/subjek', async () => {
  const raw = await jalankanAsync(`(async()=>{
    S=kosong();
    S.hari=['RABU'];
    S.masa.waktu={RABU:4};
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1,waktuHari:{RABU:4}}];
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
    S.guru=[{id:'g1',nama:'GURU SATU',maxHari:2,tidakAda:[]}];
    S.kekangan.maxHariGuru=2;
    S.peruntukan={bm:{1:2}};
    S.agihan=[{id:'a',kelasId:'1b',subjekId:'bm',guruId:'g1',pairGuruIds:[],waktu:'',ganda:0}];
    // Slot tetap (mesyuarat) menduduki waktu 1-2 guru g1 — BUKAN mengajar.
    S.acara=[{id:'e1',kod:'MESY',nama:'Mesyuarat',hari:'RABU',mula:1,panjang:2,skop:'guru',guru:['g1'],kelas:[],tahap:[]}];
    S.kekangan.cubaan=6;
    const gen=await janaJadual({});
    return JSON.stringify({ok:gen.ok,gagal:(gen.gagal||[]).length,slots:(gen.slots||[]).map(s=>s.mula)});
  })()`);
  const r = raw;
  assert.equal(r.ok, true, 'jana mesti berjaya — beban sebenar guru (2 waktu mengajar) masih dalam had maxHariGuru=2');
  assert.equal(r.gagal, 0, 'tiada waktu BM yang gagal dijadualkan');
  assert.equal(r.slots.length, 2, 'kedua-dua waktu BM (bukan MESY) berjaya dijadualkan');
  assert.ok(r.slots.every((m) => m === 3 || m === 4), 'waktu BM mesti selepas slot tetap (waktu 1-2 diduduki MESY), iaitu waktu 3 & 4');
});

/* ============================================================
   6) Waktu balik setiap kelas/hari berbeza — jangan jana selepas
      waktu balik SESUATU KELAS walaupun kelas lain pada hari yang
      sama mempunyai waktu balik lebih lewat (had hari global lebih
      tinggi). Ini mengelak andaian "satu waktu balik untuk semua".
   ============================================================ */
test('jana jadual tidak meletakkan slot melebihi waktu balik sesuatu kelas walaupun kelas lain pada hari sama balik lebih lewat', async () => {
  const raw = await jalankanAsync(`(async()=>{
    S=kosong();
    S.hari=['ISNIN'];
    S.masa.waktu={ISNIN:8};
    S.kelas=[
      {id:'kecil',nama:'1 KECIL',tahap:1,waktuHari:{ISNIN:3}},
      {id:'besar',nama:'6 BESAR',tahap:6,waktuHari:{ISNIN:8}}
    ];
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
    S.guru=[{id:'g1',nama:'GURU SATU',maxHari:10,tidakAda:[]},{id:'g2',nama:'GURU DUA',maxHari:10,tidakAda:[]}];
    S.peruntukan={bm:{1:3,6:8}};
    S.agihan=[
      {id:'a1',kelasId:'kecil',subjekId:'bm',guruId:'g1',pairGuruIds:[],waktu:'',ganda:0},
      {id:'a2',kelasId:'besar',subjekId:'bm',guruId:'g2',pairGuruIds:[],waktu:'',ganda:0}
    ];
    // Longgarkan had berturut-turut/subjek-sehari yang tidak relevan dengan waktu balik,
    // supaya ujian ini menguji HANYA sekatan waktu balik kelas, bukan had lain.
    S.kekangan.maxBerturut=8; S.kekangan.maxSubjekSehari=8;
    S.kekangan.cubaan=8;
    const gen=await janaJadual({});
    S.jadual={slots:gen.slots};
    return JSON.stringify({
      ok:gen.ok,gagal:(gen.gagal||[]).length,
      kecil:gen.slots.filter(s=>s.kelasId==='kecil').map(s=>s.mula),
      besar:gen.slots.filter(s=>s.kelasId==='besar').map(s=>s.mula),
      isu:semakJadual().filter(i=>i.t==='luar'),
    });
  })()`);
  const r = raw;
  assert.equal(r.ok, true, 'jana mesti berjaya untuk kedua-dua kelas');
  assert.equal(r.gagal, 0);
  assert.equal(r.kecil.length, 3, 'kelas kecil (balik awal) mesti dapat 3 waktu penuh');
  assert.equal(r.besar.length, 8, 'kelas besar (balik lewat) mesti dapat 8 waktu penuh');
  assert.ok(r.kecil.every((m) => m <= 3), 'TIADA slot kelas kecil selepas waktu baliknya (waktu 3) walaupun hari itu global sehingga waktu 8');
  assert.ok(r.besar.every((m) => m <= 8), 'kelas besar boleh guna sehingga waktu baliknya sendiri (waktu 8)');
  assert.deepEqual(r.isu, [], 'semakJadual tidak boleh laporkan sebarang slot luar waktu balik kelas');
});
