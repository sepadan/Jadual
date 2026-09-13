// Ujian penerimaan bebas (Claude, membantu DeepSeek) — bukan audit umum. DeepSeek pemilik
// builder.js baru menukar ringkasan cetak kepada TIGA jumlah berasingan (subjek / tetapan /
// kelas). Fail ini TIDAK menyentuh builder.js, tools/*, atau ujian sedia ada
// (tests/waktu-per-kelas.test.mjs, tests/waktu-summary-acceptance.test.mjs) — ia memuatkan
// fungsi SEBENAR (ringkasanKelas, ringkasanGuru, lembaranKelas) melalui vm, mengikut corak
// tests/builder-engine.test.mjs sedia ada (slice sebelum panggilan modul-tahap muat()).
//
// Kontrak diuji (arahan pengguna terkini — waktu tetapan MASIH dikira dalam jumlah waktu kelas):
//   1) ringkasanKelas: R.jum = jumlah SUBJEK sahaja; R.rowsTetapan = baris aktiviti tetap
//      (guru dipaparkan sebagai '—'); R.jumlahTetapan = jumlah waktu aktiviti tetap;
//      R.jumlahKelas = R.jum + R.jumlahTetapan.
//   2) Aktiviti bertindih pada slot (hari|waktu) yang SAMA tidak dikira berganda dalam
//      R.jumlahTetapan (union, bukan jumlah panjang mentah) — pertindihan direkod dalam R.clash.
//   3) ringkasanGuru kekal subjek sahaja — tiada medan/beban bagi aktiviti tetap.
//   4) lembaranKelas (HTML cetak) memaparkan TIGA baris jumlah berasingan berlabel ("Waktu
//      Subjek", "Waktu Tetapan", "Jumlah Waktu Kelas") dan baris aktiviti tetap dikategorikan
//      (kelas CSS berasingan), bukan disamar sebagai baris subjek biasa.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../builder.js', import.meta.url), 'utf8');
const node = { querySelector: () => ({}), querySelectorAll: () => [] };
const context = vm.createContext({
  console, setTimeout, clearTimeout, performance,
  document: { getElementById: () => node },
});
// Muatkan semua fungsi/deklarasi (kosong, ringkasanKelas, ringkasanGuru, lembaranKelas,
// jadualCetak, acaraUntuk, kelasLayakAcara, ...) TANPA menjalankan kod modul-tahap yang
// memerlukan `window`/localStorage sebenar (tiada dalam vm) — sama seperti had slice
// tests/builder-engine.test.mjs, hanya lebih jauh sedikit supaya turut merangkumi
// jadualCetak()/lembaranKelas(). Had tepat: sebelum `window.addEventListener('beforeprint'...)`
// (wiring paparan cetak sebenar, tidak digunakan oleh ujian tingkah laku fungsi ini).
vm.runInContext(source.slice(0, source.indexOf("window.addEventListener('beforeprint'")), context);
const jalankan = (code) => vm.runInContext(code, context);

const FIXTURE = `(()=>{
  S=kosong();
  S.sekolah.nama='SK CONTOH'; S.sekolah.tajukKelas='JADUAL WAKTU KELAS';
  S.hari=['ISNIN','SELASA','RABU','KHAMIS','JUMAAT'];
  S.masa.waktu={ISNIN:8,SELASA:8,RABU:8,KHAMIS:8,JUMAAT:8};
  S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false},{id:'mt',kod:'MT',nama:'MT',ganda:false}];
  // Kelas ini SENGAJA Tahap 2 (Tahun 4): KOKU hanya terpakai Tahap 2 ke atas (Tahap 1/Tahun 1-3
  // tiada kokurikulum — diuji dalam tests/waktu-per-kelas.test.mjs). Kelas Tahap 1 di sini akan
  // mengecualikan KOKU secara sah dan membuatkan jangkaan union/clash di bawah tidak bermakna.
  S.kelas=[{id:'k1',nama:'4 BIJAK',tahap:4,guruKelas:''}];
  S.guru=[{id:'g1',nama:'GURU SATU',kod:'G1',maxHari:10,tidakAda:[]},{id:'g2',nama:'GURU DUA',kod:'G2',maxHari:10,tidakAda:[]}];
  S.jadual={slots:[
    {kelasId:'k1',subjekId:'bm',guruId:'g1',hari:'ISNIN',mula:1,panjang:3},
    {kelasId:'k1',subjekId:'mt',guruId:'g2',hari:'RABU',mula:1,panjang:2}
  ]};
  // Empat aktiviti tetap dikonfigurasikan skop 'kelas' merangkumi k1 — PER dan 1M1S SENGAJA
  // bertindih pada RABU waktu 6 (satu-satu waktu, dua acara) untuk menguji union/clash.
  S.acara=[
    {id:'a1',kod:'PER',hari:'ISNIN',mula:4,panjang:1,skop:'kelas',kelas:['k1'],guru:[],tahap:[]},
    {id:'a2',kod:'1M1S',hari:'RABU',mula:6,panjang:1,skop:'kelas',kelas:['k1'],guru:[],tahap:[]},
    {id:'a3',kod:'B.ALQ',hari:'JUMAAT',mula:1,panjang:1,skop:'kelas',kelas:['k1'],guru:[],tahap:[]},
    {id:'a4',kod:'KOKU',hari:'RABU',mula:6,panjang:1,skop:'kelas',kelas:['k1'],guru:[],tahap:[]}
  ];
  return {ringkas:ringkasanKelas('k1'),html:lembaranKelas('k1',false)};
})()`;

test('ringkasanKelas: R.jum ialah jumlah SUBJEK sahaja (3 BM + 2 MT = 5), tidak termasuk tetapan', () => {
  const { ringkas } = jalankan(FIXTURE);
  assert.equal(ringkas.rows.length, 2, 'dua baris subjek: BM/G1 dan MT/G2');
  assert.equal(ringkas.jum, 5, 'R.jum mesti 3+2=5 — HANYA subjek, walaupun ada 4 aktiviti tetap');
  ['PER', '1M1S', 'B.ALQ', 'KOKU'].forEach((kod) => {
    assert.ok(!ringkas.rows.some((r) => r.subjek === kod), `${kod} tidak boleh muncul dalam R.rows (baris subjek)`);
  });
});

test('ringkasanKelas: rowsTetapan menyenaraikan aktiviti tetap dengan guru "—"', () => {
  const { ringkas } = jalankan(FIXTURE);
  assert.equal(ringkas.rowsTetapan.length, 4, 'kesemua 4 aktiviti tetap mesti ada baris dalam rowsTetapan: ' + JSON.stringify(ringkas.rowsTetapan));
  const kodSenarai = Array.from(ringkas.rowsTetapan, (r) => r.subjek).sort();
  assert.deepEqual(kodSenarai, ['1M1S', 'B.ALQ', 'KOKU', 'PER']);
  ringkas.rowsTetapan.forEach((r) => assert.equal(r.kelas, '—', `${r.subjek}: lajur guru mesti "—", bukan nama guru sebenar`));
});

test('ringkasanKelas: aktiviti bertindih pada slot SAMA (RABU waktu 6: 1M1S + KOKU) dikira SEKALI (union), bukan dua kali', () => {
  const { ringkas } = jalankan(FIXTURE);
  // Waktu tetapan sah: ISNIN-4 (PER), RABU-6 (1M1S DAN KOKU bertindih — 1 waktu unik), JUMAAT-1 (B.ALQ) = 3 waktu unik.
  assert.equal(ringkas.jumlahTetapan, 3, 'RABU waktu 6 (1M1S+KOKU bertindih) mesti dikira SEKALI sahaja — union, bukan 4 waktu mentah');
  assert.ok(ringkas.clash.length >= 1, 'pertindihan RABU waktu 6 mesti direkod dalam R.clash');
  assert.ok(ringkas.clash.some((c) => String(c).includes('RABU') && String(c).includes('6')), 'rekod clash mesti merujuk RABU waktu 6');
});

test('ringkasanKelas: jumlahKelas mesti SAMA dengan jum + jumlahTetapan (5 + 3 = 8)', () => {
  const { ringkas } = jalankan(FIXTURE);
  assert.equal(ringkas.jumlahKelas, ringkas.jum + ringkas.jumlahTetapan, 'jumlahKelas mesti tepat jum+jumlahTetapan, bukan dikira berasingan/silap kira');
  assert.equal(ringkas.jumlahKelas, 8, 'jangkaan konkrit: 5 (subjek) + 3 (tetapan union) = 8');
});

test('ringkasanGuru: kekal subjek sahaja, tiada medan/beban bagi aktiviti tetap', () => {
  const { rG1 } = jalankan(`(()=>{
    S=kosong();
    S.hari=['ISNIN','SELASA','RABU','KHAMIS','JUMAAT'];
    S.masa.waktu={ISNIN:8,SELASA:8,RABU:8,KHAMIS:8,JUMAAT:8};
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
    S.kelas=[{id:'k1',nama:'1 BIJAK',tahap:1,guruKelas:''}];
    S.guru=[{id:'g1',nama:'GURU SATU',kod:'G1',maxHari:10,tidakAda:[]}];
    S.jadual={slots:[{kelasId:'k1',subjekId:'bm',guruId:'g1',hari:'ISNIN',mula:1,panjang:2}]};
    S.acara=[{id:'a1',kod:'PER',hari:'ISNIN',mula:4,panjang:1,skop:'guru',kelas:[],guru:['g1'],tahap:[]},
             {id:'a2',kod:'KOKU',hari:'RABU',mula:6,panjang:2,skop:'guru',kelas:[],guru:['g1'],tahap:[]}];
    return {rG1:ringkasanGuru('g1')};
  })()`);
  assert.equal(rG1.rows.length, 1, 'hanya baris BM, tiada baris PER/KOKU');
  assert.equal(rG1.jum, 2, 'beban guru mesti 2 (BM sahaja) — PER/KOKU tidak menambah beban');
  assert.equal(rG1.jumlahTetapan, undefined, 'ringkasanGuru tidak patut ada medan jumlahTetapan langsung — ia bukan konsep beban guru');
  assert.equal(rG1.jumlahKelas, undefined, 'ringkasanGuru tidak patut ada medan jumlahKelas — itu konsep kelas, bukan guru');
});

test('lembaranKelas (HTML cetak): tiga baris jumlah berlabel berasingan, nilai tepat', () => {
  const { html } = jalankan(FIXTURE);
  assert.match(html, />Waktu Subjek<[^]*?class="c"[^>]*>5</, 'baris "Waktu Subjek" mesti papar 5');
  assert.match(html, />Waktu Tetapan<[^]*?class="c"[^>]*>3</, 'baris "Waktu Tetapan" mesti papar 3 (union, bukan 4)');
  assert.match(html, />Jumlah Waktu Kelas<[^]*?class="c"[^>]*>8</, 'baris "Jumlah Waktu Kelas" mesti papar 8 (5+3)');
});

test('lembaranKelas (HTML cetak): baris aktiviti tetap dikategorikan berasingan (kelas CSS), bukan disamar sebagai baris subjek', () => {
  const { html } = jalankan(FIXTURE);
  ['PER', '1M1S', 'B.ALQ', 'KOKU'].forEach((kod) => {
    const re = new RegExp(`<tr class="sum-set">\\s*<td>${kod.replace('.', '\\.')}</td>`);
    assert.ok(re.test(html), `${kod} mesti muncul dalam baris tr.sum-set (dikategorikan), bukan baris subjek biasa`);
  });
  // Baris subjek biasa (BM/MT) TIDAK boleh memakai kelas sum-set yang sama.
  assert.ok(!/<tr class="sum-set">\s*<td>BM<\/td>/.test(html), 'BM (subjek sebenar) tidak boleh ditanda sebagai baris aktiviti tetap');
  assert.ok(!/<tr class="sum-set">\s*<td>MT<\/td>/.test(html), 'MT (subjek sebenar) tidak boleh ditanda sebagai baris aktiviti tetap');
});

// Fixture: TIGA aktiviti bertindih pada slot yang SAMA (ISNIN waktu 2). Versi awal mengumpul
// pertindihan yang sama berulang kali ke dalam R.clash (3 entri untuk 1 slot) — ditemui oleh
// semakan bebas Gemini, dibetulkan dengan Set dan dikunci di sini.
const FIXTURE_TIGA = `(()=>{
  S=kosong();
  S.sekolah.nama='SK CONTOH'; S.sekolah.tajukKelas='JADUAL WAKTU KELAS';
  S.hari=['ISNIN','SELASA','RABU','KHAMIS','JUMAAT'];
  S.masa.waktu={ISNIN:8,SELASA:8,RABU:8,KHAMIS:8,JUMAAT:8};
  S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
  S.kelas=[{id:'k1',nama:'4 BIJAK',tahap:4,guruKelas:''}];
  S.guru=[{id:'g1',nama:'GURU SATU',kod:'G1',maxHari:10,tidakAda:[]}];
  S.jadual={slots:[{kelasId:'k1',subjekId:'bm',guruId:'g1',hari:'ISNIN',mula:1,panjang:1}]};
  S.acara=[
    {id:'a1',kod:'PER',hari:'ISNIN',mula:2,panjang:1,skop:'kelas',kelas:['k1'],guru:[],tahap:[]},
    {id:'a2',kod:'1M1S',hari:'ISNIN',mula:2,panjang:1,skop:'kelas',kelas:['k1'],guru:[],tahap:[]},
    {id:'a3',kod:'B.ALQ',hari:'ISNIN',mula:2,panjang:1,skop:'kelas',kelas:['k1'],guru:[],tahap:[]}
  ];
  return JSON.stringify(ringkasanKelas('k1'));
})()`;

test('ringkasanKelas: tiga aktiviti bertindih pada satu slot dilaporkan SEKALI dalam clash', () => {
  const R = JSON.parse(jalankan(FIXTURE_TIGA));
  assert.equal(R.jumlahTetapan, 1, 'ISNIN waktu 2 dikira sekali sahaja (union)');
  assert.equal(R.clash.length, 1, 'slot bertindih dilaporkan sekali, bukan berulang setiap aktiviti');
  assert.ok(R.clash[0].includes('ISNIN') && R.clash[0].includes('2'), 'clash merujuk ISNIN waktu 2');
});

// Fixture: SATU slot kelas-waktu dikongsi DUA guru (guru asal + pengganti). Jumlah waktu kelas
// mesti mengira slot itu SEKALI sahaja (44+4=48 pada data aSc sebenar, bukan 47/51).
const FIXTURE_KONGSI = `(()=>{
  S=kosong();
  S.sekolah.nama='SK CONTOH'; S.sekolah.tajukKelas='JADUAL WAKTU KELAS';
  S.hari=['ISNIN','SELASA','RABU','KHAMIS','JUMAAT'];
  S.masa.waktu={ISNIN:8,SELASA:8,RABU:8,KHAMIS:8,JUMAAT:8};
  S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
  S.kelas=[{id:'k1',nama:'4 BIJAK',tahap:4,guruKelas:''}];
  S.guru=[{id:'g1',nama:'GURU ASAL',kod:'G1',maxHari:10,tidakAda:[]},{id:'g2',nama:'GURU MYSTEP',kod:'G2',maxHari:10,tidakAda:[]}];
  S.jadual={slots:[
    {kelasId:'k1',subjekId:'bm',guruId:'g1',hari:'ISNIN',mula:1,panjang:2,pairing:true},
    {kelasId:'k1',subjekId:'bm',guruId:'g2',hari:'ISNIN',mula:1,panjang:2,pairing:true},
    {kelasId:'k1',subjekId:'bm',guruId:'g2',hari:'SELASA',mula:1,panjang:1}
  ]};
  S.acara=[{id:'a1',kod:'PER',hari:'RABU',mula:8,panjang:1,skop:'kelas',kelas:['k1'],guru:[],tahap:[]}];
  return JSON.stringify(ringkasanKelas('k1'));
})()`;

test('slot dikongsi dua guru dikira SEKALI dalam jumlah kelas (tidak berganda)', () => {
  const R = JSON.parse(jalankan(FIXTURE_KONGSI));
  assert.equal(R.jum, 3, '3 slot unik: ISNIN 1 + ISNIN 2 + SELASA 1 (ISNIN dikongsi dua guru dikira sekali)');
  assert.equal(R.jumlahTetapan, 1, 'satu slot tetap (PER)');
  assert.equal(R.jumlahKelas, R.jum + R.jumlahTetapan, 'jumlahKelas = subjek + tetapan');
  assert.equal(R.dikongsi, 2, 'dua slot dikongsi dilaporkan untuk nota ringkasan');
  assert.ok(R.barisAgihan >= R.jum, 'baris agihan mentah sentiasa >= slot unik');
});
