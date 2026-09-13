import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { draftFromPdf } from '../pdf-builder.js';

// ===== IMPORT: bilangan waktu per kelas per hari + aktiviti terhad kepada kelas sebenar =====

const teachers = [
  { id: 't1', name: 'GURU SATU', shortName: 'SATU', position: 'Guru Akademik Biasa', active: true },
  { id: 't2', name: 'GURU DUA', shortName: 'DUA', position: 'Guru Akademik Biasa', active: true },
];
const mk = (tid, day, period, subj, cls) => ({
  teacherId: tid, day, period, startTime: '07:30', endTime: '08:00', subject: subj, className: cls,
});

test('import menulis kelas.waktuHari daripada baris yang diimport', () => {
  const rows = [
    mk('t1', 'IS', 1, 'BM', '1 BIJAK'), mk('t1', 'IS', 11, 'BM', '1 BIJAK'),
    mk('t2', 'IS', 1, 'MT', '4 BIJAK'), mk('t2', 'IS', 12, 'MT', '4 BIJAK'),
    mk('t1', 'SEL', 2, 'BM', '1 BIJAK'), mk('t2', 'SEL', 2, 'MT', '4 BIJAK'),
  ];
  const metadata = {
    schoolName: 'SK PAYA REDAN, MUAR', teacherTitle: 'JADUAL WAKTU PERSENDIRIAN GURU 2026',
    year: '2026', effectiveDate: '2026-09-14', principalName: 'ENCIK BESAR', principalTitle: 'GURU BESAR',
    periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
    pages: [
      { teacherId: 't1', rawName: 'PN GURU SATU', classTeacherClass: '1 BIJAK' },
      { teacherId: 't2', rawName: 'PN GURU DUA', classTeacherClass: '4 BIJAK' },
    ],
  };
  const state = draftFromPdf(rows, teachers, {}, metadata);
  const b1 = state.kelas.find((k) => k.nama === '1 BIJAK');
  const b4 = state.kelas.find((k) => k.nama === '4 BIJAK');
  assert.ok(b1 && b4, 'kedua-dua kelas mesti wujud');
  assert.equal(b1.waktuHari.ISNIN, 11, '1 BIJAK ada 11 waktu pada Isnin');
  assert.equal(b4.waktuHari.ISNIN, 12, '4 BIJAK ada 12 waktu pada Isnin');
  assert.equal(b1.waktuHari.SELASA, 2, '1 BIJAK ada 2 waktu pada Selasa');
});

test('import mengehadkan KOKU kepada kelas yang benar-benar ada aktiviti itu', () => {
  const rows = [
    mk('t1', 'IS', 1, 'BM', '1 BIJAK'),
    mk('t2', 'IS', 1, 'MT', '4 BIJAK'),
    { teacherId: 't2', day: 'RAB', period: 11, startTime: '12:50', endTime: '13:20', subject: 'KOKU', className: '', isDuty: true },
  ];
  const metadata = {
    schoolName: 'SK PAYA REDAN, MUAR', teacherTitle: 'JADUAL WAKTU PERSENDIRIAN GURU 2026',
    year: '2026', effectiveDate: '2026-09-14', principalName: 'ENCIK BESAR', principalTitle: 'GURU BESAR',
    periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
    pages: [
      { teacherId: 't1', rawName: 'PN GURU SATU', classTeacherClass: '1 BIJAK' },
      { teacherId: 't2', rawName: 'PN GURU DUA', classTeacherClass: '4 BIJAK' },
    ],
  };
  const state = draftFromPdf(rows, teachers, {}, metadata);
  const koku = state.acara.find((a) => a.kod === 'KOKU');
  const b2 = state.kelas.find((k) => k.nama === '4 BIJAK');
  assert.ok(koku, 'KOKU mesti menjadi slot tetap');
  assert.equal(koku.skop, 'kelas', 'KOKU hanya 4 BIJAK, jadi skop kelas bukan semua');
  assert.deepEqual(koku.kelas, [b2.id], 'senarai kelas mesti tepat kepada kelas yang ada KOKU');
});

// ===== BUILDER: skop tahap + jana/validasi guna bilangan waktu per kelas =====

const source = readFileSync(new URL('../builder.js', import.meta.url), 'utf8');
const node = { querySelector: () => ({}), querySelectorAll: () => [] };
const context = vm.createContext({
  console, setTimeout, clearTimeout, performance,
  document: { getElementById: () => node },
});
vm.runInContext(source.slice(0, source.indexOf('function jadualCetak(')), context);
vm.runInContext(source.slice(source.indexOf('function jadualCetak('), source.indexOf('function lembaranIndukBahagian(')), context);
const jalankan = (code) => JSON.parse(vm.runInContext(code, context));

test('acara skop tahap dihormati oleh acaraUntuk dan kelasTerkenaAcara', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1},{id:'2b',nama:'2 BIJAK',tahap:2}];
    S.acara=[{id:'e1',kod:'AKT',hari:'RABU',mula:11,panjang:2,skop:'tahap',tahap:[2],guru:[],kelas:[]}];
    return JSON.stringify({
      k2:acaraUntuk('kelas','2b').map(a=>a.kod),
      k1:acaraUntuk('kelas','1b').map(a=>a.kod),
      terlibat:kelasTerkenaAcara(S.acara[0]),
    });
  })()`);
  assert.deepEqual(r.k2, ['AKT'], 'aktiviti tahap 2 mesti kelihatan pada kelas Tahun 2');
  assert.deepEqual(r.k1, [], 'aktiviti tahap 2 tidak boleh kelihatan pada kelas Tahun 1');
  assert.deepEqual(r.terlibat, ['2b'], 'kelasTerkenaAcara mesti mengembalikan hanya kelas tahap terpilih');
});

test('validasi guna bilangan waktu per kelas dan waktuHariKelas gugur ke nilai global', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1,waktuHari:{ISNIN:11}}];
    S.masa.waktu={ISNIN:12,SELASA:12,RABU:12,KHAMIS:12,JUMAAT:10};
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
    S.guru=[{id:'g1',nama:'GURU',maxHari:12,tidakAda:[]}];
    S.peruntukan={bm:{1:5}};
    S.agihan=[{id:'a',kelasId:'1b',subjekId:'bm',guruId:'g1',pairGuruIds:[],waktu:'',ganda:0}];
    S.jadual={slots:[{id:'x1',kelasId:'1b',subjekId:'bm',guruId:'g1',hari:'ISNIN',mula:12,panjang:1}]};
    return JSON.stringify({
      override:waktuHariKelas('1b','ISNIN'),
      fallback:waktuHariKelas('1b','SELASA'),
      issues:semakJadual().map(i=>i.t),
    });
  })()`);
  assert.equal(r.override, 11, 'nilai kelas (11) mesti mengatasi nilai global');
  assert.equal(r.fallback, 12, 'hari tanpa nilai kelas gugur ke nilai global (12)');
  assert.ok(r.issues.includes('luar'), 'slot pada waktu 12 bagi kelas 11 waktu mesti ditanda luar');
});

test('jana jadual tidak meletakkan slot melebihi bilangan waktu kelas', async () => {
  const raw = await vm.runInContext(`(async()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1,waktuHari:{ISNIN:3,SELASA:3,RABU:3,KHAMIS:3,JUMAAT:3}}];
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
    S.guru=[{id:'g1',nama:'GURU',maxHari:12,tidakAda:[]}];
    S.peruntukan={bm:{1:15}};
    S.agihan=[{id:'a',kelasId:'1b',subjekId:'bm',guruId:'g1',pairGuruIds:[],waktu:'',ganda:0}];
    S.kekangan.cubaan=4;
    const gen=await janaJadual({});
    return JSON.stringify({ok:gen.ok,gagal:(gen.gagal||[]).length,slots:(gen.slots||[]).map(s=>[s.hari,s.mula])});
  })()`, context);
  const r = JSON.parse(raw);
  assert.equal(r.ok, true, 'jana mesti berjaya dalam 3 waktu × 5 hari');
  assert.equal(r.gagal, 0);
  assert.equal(r.slots.length, 15, 'kesemua 15 waktu BM mesti dijadualkan');
  assert.ok(r.slots.every(([, mula]) => mula >= 1 && mula <= 3), 'tiada slot melebihi 3 waktu bagi kelas ini');
});

// ===== PERATURAN DOMAIN BAHARU =====

test('import menanda waktuHari sebagai inferens dan mengekalkan override manual selepas import semula', () => {
  const rows = [mk('t1', 'IS', 5, 'BM', '1 BIJAK')];
  const metadata = {
    periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
    pages: [{ teacherId: 't1', rawName: 'PN GURU SATU', classTeacherClass: '1 BIJAK' }],
  };
  const first = draftFromPdf(rows, teachers, {}, metadata);
  const k = first.kelas.find((x) => x.nama === '1 BIJAK');
  assert.equal(k.waktuHari.ISNIN, 5, 'nilai automatik daripada baris PDF');
  assert.equal(k.waktuHariAuto.ISNIN, 5, 'provenance auto per hari mesti direkodkan (inferens, perlu pengesahan)');

  // Admin membetulkan waktu balik sebenar secara manual (PDF tidak menangkapnya).
  k.waktuHari.ISNIN = 7;

  const second = draftFromPdf(rows, teachers, first, metadata);
  const k2 = second.kelas.find((x) => x.nama === '1 BIJAK');
  assert.equal(k2.waktuHari.ISNIN, 7, 'override manual (7) mesti kekal selepas import semula, bukan ditimpa kepada 5');
});

test('import mengecualikan KOKU daripada kelas Tahap 1 (Tahun 1–3) walaupun guru Tahap 1 membawa KOKU', () => {
  const rows = [
    mk('t1', 'IS', 1, 'BM', '1 BIJAK'),
    mk('t2', 'IS', 1, 'MT', '4 BIJAK'),
    { teacherId: 't1', day: 'RAB', period: 11, startTime: '12:50', endTime: '13:20', subject: 'KOKU', className: '', isDuty: true },
    { teacherId: 't2', day: 'RAB', period: 11, startTime: '12:50', endTime: '13:20', subject: 'KOKU', className: '', isDuty: true },
  ];
  const metadata = {
    periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
    pages: [
      { teacherId: 't1', rawName: 'PN GURU SATU', classTeacherClass: '1 BIJAK' },
      { teacherId: 't2', rawName: 'PN GURU DUA', classTeacherClass: '4 BIJAK' },
    ],
  };
  const state = draftFromPdf(rows, teachers, {}, metadata);
  const koku = state.acara.find((a) => a.kod === 'KOKU');
  const b1 = state.kelas.find((k) => k.nama === '1 BIJAK');
  const b4 = state.kelas.find((k) => k.nama === '4 BIJAK');
  assert.ok(koku, 'KOKU mesti menjadi slot tetap');
  assert.deepEqual(koku.kelas, [b4.id], 'KOKU hanya Tahap 2 (4 BIJAK)');
  assert.ok(!koku.kelas.includes(b1.id), 'KOKU mesti mengecualikan kelas Tahap 1');
});

test('slot tetap (acara skop guru) menyekat masa tetapi tidak dikira beban/jumlah subjek', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1}];
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false}];
    S.guru=[{id:'g1',nama:'GURU SATU',maxHari:8,tidakAda:[]}];
    S.peruntukan={bm:{1:5}};
    S.agihan=[{id:'a',kelasId:'1b',subjekId:'bm',guruId:'g1',pairGuruIds:[],waktu:'',ganda:0}];
    S.acara=[{id:'e1',kod:'MESY',nama:'Mesyuarat',hari:'ISNIN',mula:3,panjang:2,skop:'guru',guru:['g1'],kelas:[],tahap:[]}];
    const st=stat(); const C=binaKonteks();
    return JSON.stringify({beban:st.bebanGuru['g1'],jum:st.jumWaktu,blok:C.guruBlok[0][2]});
  })()`);
  assert.equal(r.beban, 5, 'slot tetap tidak menambah beban mengajar guru');
  assert.equal(r.jum, 5, 'slot tetap tidak dikira jumlah waktu subjek');
  assert.equal(r.blok, 1, 'slot tetap mesti menyekat masa guru pada waktu itu');
});

test('lembaran induk kelas memakai waktuHariKelas untuk sempadan waktu balik', () => {
  const start = source.indexOf('function lembaranIndukBahagian(');
  const end = source.indexOf('function senaraiJenisCetak(');
  const master = source.slice(start, end);
  assert.match(master, /waktuHariKelas\(entiti\.id,hari\)/, 'lembaran induk kelas mesti guna waktu per kelas');
  assert.match(master, /mode==='kelas'\?/, 'sempadan kelas mesti berbeza daripada sempadan guru');
});

// ===== PROVENANCE PER HARI (override) =====

test('nilai auto berubah kepada nilai PDF baru apabila tiada override manual', () => {
  const rows1 = [mk('t1', 'IS', 5, 'BM', '1 BIJAK')];
  const rows2 = [mk('t1', 'IS', 9, 'BM', '1 BIJAK')];
  const metadata = { periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }] };
  const s1 = draftFromPdf(rows1, teachers, {}, metadata);
  assert.equal(s1.kelas[0].waktuHari.ISNIN, 5);
  const s2 = draftFromPdf(rows2, teachers, s1, metadata);
  assert.equal(s2.kelas[0].waktuHari.ISNIN, 9, 'auto mesti berubah daripada 5 kepada 9, bukan kekal 5');
});

test('hanya hari yang diedit manual kekal; hari auto lain berubah pada import baru', () => {
  const rows1 = [mk('t1', 'IS', 5, 'BM', '1 BIJAK'), mk('t1', 'SEL', 2, 'BM', '1 BIJAK')];
  const metadata = { periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }] };
  const s1 = draftFromPdf(rows1, teachers, {}, metadata);
  assert.equal(s1.kelas[0].waktuHari.SELASA, 2);

  // Admin edit ISNIN sahaja (override manual); SELASA kekal auto.
  s1.kelas[0].waktuHari.ISNIN = 7;

  const rows2 = [mk('t1', 'IS', 9, 'BM', '1 BIJAK'), mk('t1', 'SEL', 7, 'BM', '1 BIJAK')];
  const s2 = draftFromPdf(rows2, teachers, s1, metadata);
  assert.equal(s2.kelas[0].waktuHari.ISNIN, 7, 'hari diedit manual (ISNIN) mesti kekal 7');
  assert.equal(s2.kelas[0].waktuHari.SELASA, 7, 'hari auto (SELASA) mesti berubah kepada nilai PDF baru 7, bukan kekal 2');
});

test('hariManual menanda override manual per hari', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1,waktuHari:{ISNIN:7,SELASA:2},waktuHariAuto:{ISNIN:5,SELASA:2}}];
    return JSON.stringify({isnin:hariManual('1b','ISNIN'),selasa:hariManual('1b','SELASA'),rabu:hariManual('1b','RABU')});
  })()`);
  assert.equal(r.isnin, true, 'ISNIN (7 vs auto 5) mesti ditanda manual');
  assert.equal(r.selasa, false, 'SELASA (2 sama auto 2) mesti kekal inferens');
  assert.equal(r.rabu, false, 'hari tanpa nilai mesti bukan manual');
});

// ===== INFERENS TAMAT HARI MERANGKUMI ACARA TETAP (bug acceptance PDF sebenar) =====

test('inferens tamat hari merangkumi KOKU 11-12 (RABU 12 untuk Tahap 2) tanpa menambah agihan/subjek/beban', () => {
  // 4 BIJAK (Tahap 2): pelajaran RABU berakhir waktu 10, KOKU RABU 11-12 dibawa guru kelasnya (t2).
  // 1 BIJAK (Tahap 1): pelajaran RABU berakhir waktu 10, tiada KOKU.
  const rows = [
    mk('t2', 'RAB', 1, 'MT', '4 BIJAK'), mk('t2', 'RAB', 10, 'MT', '4 BIJAK'),
    mk('t1', 'RAB', 1, 'BM', '1 BIJAK'), mk('t1', 'RAB', 10, 'BM', '1 BIJAK'),
    { teacherId: 't2', day: 'RAB', period: 11, startTime: '12:50', endTime: '13:20', subject: 'KOKU', className: '', isDuty: true },
    { teacherId: 't2', day: 'RAB', period: 12, startTime: '13:20', endTime: '13:50', subject: 'KOKU', className: '', isDuty: true },
  ];
  const metadata = {
    periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
    pages: [
      { teacherId: 't1', rawName: 'PN GURU SATU', classTeacherClass: '1 BIJAK' },
      { teacherId: 't2', rawName: 'PN GURU DUA', classTeacherClass: '4 BIJAK' },
    ],
  };
  const state = draftFromPdf(rows, teachers, {}, metadata);
  const b4 = state.kelas.find((k) => k.nama === '4 BIJAK');
  const b1 = state.kelas.find((k) => k.nama === '1 BIJAK');
  assert.equal(b4.waktuHari.RABU, 12, '4 BIJAK (Tahap 2) RABU mesti 12 kerana KOKU 11-12');
  assert.equal(b1.waktuHari.RABU, 10, '1 BIJAK (Tahap 1) RABU mesti kekal 10 tanpa KOKU');
  // KOKU mesti kekal acara, bukan subjek/agihan.
  assert.ok(state.subjek.every((s) => s.kod !== 'KOKU'), 'KOKU tidak boleh menjadi subjek');
  assert.ok(!state.agihan.some((a) => { const s = state.subjek.find((x) => x.id === a.subjekId); return s && s.kod === 'KOKU'; }), 'KOKU tidak boleh menjadi agihan subjek');
  // Jumlah waktu subjek MT (4 BIJAK) = 2 slot pelajaran sahaja, bukan termasuk KOKU.
  const mt = state.subjek.find((s) => s.kod === 'MT');
  const agihanMT = state.agihan.find((a) => a.subjekId === mt.id && a.kelasId === b4.id);
  assert.equal(agihanMT.waktu, 2, 'jumlah waktu MT mesti 2 (slot 1 dan 10), tidak termasuk KOKU');
});

test('override manual yang memotong KOKU menghasilkan amaran konflik dan tidak memadam aktiviti', () => {
  const rows = [
    mk('t2', 'RAB', 1, 'MT', '4 BIJAK'), mk('t2', 'RAB', 10, 'MT', '4 BIJAK'),
    { teacherId: 't2', day: 'RAB', period: 11, startTime: '12:50', endTime: '13:20', subject: 'KOKU', className: '', isDuty: true },
    { teacherId: 't2', day: 'RAB', period: 12, startTime: '13:20', endTime: '13:50', subject: 'KOKU', className: '', isDuty: true },
  ];
  const metadata = {
    periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
    pages: [{ teacherId: 't2', rawName: 'PN GURU DUA', classTeacherClass: '4 BIJAK' }],
  };
  const first = draftFromPdf(rows, teachers, {}, metadata);
  const k = first.kelas.find((x) => x.nama === '4 BIJAK');
  assert.equal(k.waktuHari.RABU, 12, 'RABU auto 12 (KOKU 11-12)');

  // Admin override manual kepada 10 — memotong KOKU 11-12.
  k.waktuHari.RABU = 10;

  const second = draftFromPdf(rows, teachers, first, metadata);
  const k2 = second.kelas.find((x) => x.nama === '4 BIJAK');
  assert.equal(k2.waktuHari.RABU, 10, 'override manual (10) mesti kekal');
  assert.ok(Array.isArray(second.amaran) && second.amaran.length, 'amaran konflik mesti direkodkan');
  const warn = second.amaran.find((a) => a.kod === 'KOKU' && a.hari === 'RABU');
  assert.ok(warn, 'amaran mesti menandakan KOKU RABU');
  assert.equal(warn.akhir, 12, 'amaran mesti menyatakan aktiviti berakhir waktu 12');
  assert.ok(second.acara.some((a) => a.kod === 'KOKU'), 'KOKU mesti kekal, tidak dipadam senyap');
});

// ===== RINGKASAN CETAK: Waktu Subjek vs Waktu Tetapan vs Jumlah Waktu Kelas =====

test('ringkasan kelas HTML bezakan Waktu Subjek, Waktu Tetapan dan Jumlah Waktu Kelas (acara kekal grid)', () => {
  const html = vm.runInContext(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1,waktuHari:{ISNIN:10}}];
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false},{id:'mt',kod:'MT',nama:'MT',ganda:false}];
    S.guru=[{id:'g1',nama:'GURU SATU',kod:'G1',maxHari:12,tidakAda:[]}];
    S.peruntukan={bm:{1:5},mt:{1:5}};
    S.agihan=[{id:'a1',kelasId:'1b',subjekId:'bm',guruId:'g1',pairGuruIds:[],waktu:'',ganda:0},{id:'a2',kelasId:'1b',subjekId:'mt',guruId:'g1',pairGuruIds:[],waktu:'',ganda:0}];
    S.jadual={slots:[
      {id:'x1',kelasId:'1b',subjekId:'bm',guruId:'g1',hari:'ISNIN',mula:2,panjang:5},
      {id:'x2',kelasId:'1b',subjekId:'mt',guruId:'g1',hari:'RABU',mula:1,panjang:5},
    ]};
    S.acara=[
      {id:'e1',kod:'PER',nama:'Perhimpunan',hari:'ISNIN',mula:1,panjang:1,skop:'semua',guru:[],kelas:[],tahap:[]},
      {id:'e2',kod:'1M1S',nama:'1M1S',hari:'SELASA',mula:1,panjang:2,skop:'semua',guru:[],kelas:[],tahap:[]},
      {id:'e3',kod:'B.ALQ',nama:'B.ALQ',hari:'JUMAAT',mula:1,panjang:1,skop:'semua',guru:[],kelas:[],tahap:[]},
    ];
    return lembaranKelas('1b');
  })()`, context);

  const sum = html.match(/<table class="sum">[\s\S]*?<\/table>/)[0];

  // Kategori: acara ialah baris "sum-set" dengan guru dash (—), bukan baris subjek (guru kod).
  for (const kod of ['PER', '1M1S', 'B.ALQ']) {
    const setRow = new RegExp(`class="sum-set"><td>${kod}</td><td>—</td><td class="c">`);
    assert.ok(setRow.test(sum), `${kod} mesti muncul sebagai baris Waktu Tetapan (guru dash), bukan subjek`);
  }
  // Baris subjek BM/MT kekal dengan guru kod G1 (bukan dash).
  assert.ok(/<td>BM<\/td><td class="[^"]*">G1<\/td><td class="c">5<\/td>/.test(sum), 'BM mesti baris subjek dengan guru G1, jumlah 5');
  assert.ok(/<td>MT<\/td><td class="[^"]*">G1<\/td><td class="c">5<\/td>/.test(sum), 'MT mesti baris subjek dengan guru G1, jumlah 5');

  // Jumlah sebenar (bukan hardcode): Waktu Subjek 10, Waktu Tetapan 4, Jumlah Waktu Kelas 14.
  const ws = html.match(/Waktu Subjek<\/td><td class="c" style="font-weight:700">(\d+)<\/td>/);
  const wt = html.match(/Waktu Tetapan<\/td><td class="c">(\d+)<\/td>/);
  const wk = html.match(/Jumlah Waktu Kelas<\/td><td class="c" style="font-weight:700">(\d+)<\/td>/);
  assert.ok(ws, 'baris Waktu Subjek mesti wujud');
  assert.equal(Number(ws[1]), 10, 'Waktu Subjek = 10 (BM 5 + MT 5)');
  assert.ok(wt, 'baris Waktu Tetapan mesti wujud');
  assert.equal(Number(wt[1]), 4, 'Waktu Tetapan = 4 (PER 1 + 1M1S 2 + B.ALQ 1)');
  assert.ok(wk, 'baris Jumlah Waktu Kelas mesti wujud');
  assert.equal(Number(wk[1]), 14, 'Jumlah Waktu Kelas = 14 (10 subjek + 4 tetapan)');

  // Acara tetap KEKAL dalam grid (jadual .pt).
  const grid = html.match(/<table class="pt">[\s\S]*?<\/table>/)[0];
  for (const kod of ['PER', '1M1S', 'B.ALQ']) {
    assert.ok(grid.includes(kod), `${kod} mesti kekal dalam grid`);
  }
});

test('Waktu Tetapan dikira union: acara bertindih tidak dikira berganda, bertindih direkod sebagai clash', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1}];
    S.jadual={slots:[]};
    S.acara=[
      {id:'e1',kod:'PER',nama:'Perhimpunan',hari:'ISNIN',mula:1,panjang:2,skop:'semua',guru:[],kelas:[],tahap:[]},
      {id:'e2',kod:'1M1S',nama:'1M1S',hari:'ISNIN',mula:2,panjang:2,skop:'semua',guru:[],kelas:[],tahap:[]},
    ];
    const R=ringkasanKelas('1b');
    return JSON.stringify({jumlahTetapan:R.jumlahTetapan,jumlahKelas:R.jumlahKelas,clash:R.clash.length});
  })()`);
  assert.equal(r.jumlahTetapan, 3, 'union slot ISNIN 1,2,3 = 3, bukan 4');
  assert.equal(r.jumlahKelas, 3, 'jumlah kelas = 0 subjek + 3 tetapan');
  assert.equal(r.clash, 1, 'satu slot bertindih (ISNIN|2) direkodkan sebagai clash');
});

// ===== SLOT KONGSI (baris bertindih) — kira unik, bukan baris =====

test('import: baris bertindih (kelas+hari+waktu sama, guru berbeza) jadi slot pairing kongsi, bukan dua waktu', () => {
  const rows = [
    mk('t1', 'IS', 7, 'BM', '1 BIJAK'),   // mengajar bersama: dua guru BM pada waktu 7
    mk('t2', 'IS', 7, 'BM', '1 BIJAK'),
    mk('t1', 'IS', 1, 'MT', '1 BIJAK'),
  ];
  const metadata = {
    schoolName: 'SK PAYA REDAN, MUAR', teacherTitle: 'JADUAL WAKTU PERSENDIRIAN GURU 2026',
    year: '2026', effectiveDate: '2026-09-14', principalName: 'ENCIK BESAR', principalTitle: 'GURU BESAR',
    periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
    pages: [
      { teacherId: 't1', rawName: 'PN GURU SATU', classTeacherClass: '1 BIJAK' },
      { teacherId: 't2', rawName: 'PN GURU DUA', classTeacherClass: '4 BIJAK' },
    ],
  };
  const state = draftFromPdf(rows, teachers, {}, metadata);
  const b1 = state.kelas.find((k) => k.nama === '1 BIJAK');
  const bm = state.subjek.find((s) => s.kod === 'BM');
  const slots7 = state.jadual.slots.filter((s) => s.hari === 'ISNIN' && s.mula === 7);
  assert.equal(slots7.length, 2, 'dua slot (satu per guru) pada waktu 7');
  assert.ok(slots7.every((s) => s.pairing), 'slot bertindih mesti pairing (slot kongsi), bukan pertembungan');
  const agBM = state.agihan.find((a) => a.kelasId === b1.id && a.subjekId === bm.id);
  assert.equal(agBM.waktu, 1, 'BM waktu unik = 1 (waktu 7 dikongsi dua guru, bukan 2)');
  assert.equal(agBM.pairGuruIds.length, 1, 'guru kedua BM direkod sebagai pairGuruIds (mengajar bersama)');
});

test('stat & semakan kapasiti kira slot unik, bukan baris agihan bertindih (3 guru satu slot); guru dikira sibuk', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1,waktuHari:{ISNIN:11}}];
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false},{id:'mt',kod:'MT',nama:'MT',ganda:false},{id:'sn',kod:'SN',nama:'SN',ganda:false}];
    S.guru=[{id:'g1',nama:'G1',kod:'G1',maxHari:12,tidakAda:[]},{id:'g2',nama:'G2',kod:'G2',maxHari:12,tidakAda:[]},{id:'g3',nama:'G3',kod:'G3',maxHari:12,tidakAda:[]}];
    S.peruntukan={bm:{1:5},mt:{1:5},sn:{1:5}};
    // Tiga agihan berkongsi slot ISNIN|3 (3 guru / 3 subjek kumpulan selari).
    S.agihan=[
      {id:'a1',kelasId:'1b',subjekId:'bm',guruId:'g1',pairGuruIds:[],waktu:5,ganda:0,periods:['ISNIN|1','ISNIN|2','ISNIN|3','ISNIN|4','ISNIN|5']},
      {id:'a2',kelasId:'1b',subjekId:'mt',guruId:'g2',pairGuruIds:[],waktu:5,ganda:0,periods:['ISNIN|3','ISNIN|4','ISNIN|5','ISNIN|6','ISNIN|7']},
      {id:'a3',kelasId:'1b',subjekId:'sn',guruId:'g3',pairGuruIds:[],waktu:5,ganda:0,periods:['ISNIN|3','ISNIN|8','ISNIN|9','ISNIN|10','ISNIN|11']},
    ];
    const st=stat();
    const warn=amaranAwal();
    return JSON.stringify({jum:st.jumWaktu,baris:st.barisAgihan,b1:st.bebanGuru['g1'],b2:st.bebanGuru['g2'],b3:st.bebanGuru['g3'],warn});
  })()`);
  assert.equal(r.baris, 15, 'baris agihan mentah = 15 (5 + 5 + 5)');
  assert.equal(r.jum, 11, 'waktu subjek unik = 11 (union ISNIN 1-11), bukan 15');
  assert.equal(r.b1, 5, 'g1 dikira sibuk 5 waktu');
  assert.equal(r.b2, 5, 'g2 dikira sibuk 5 waktu');
  assert.equal(r.b3, 5, 'g3 dikira sibuk 5 waktu');
  assert.ok(!r.warn.includes('1 BIJAK'), 'tiada amaran kapasiti palsu (unik 11 ≤ kapasiti)');
});

test('semakJadual: dua slot pada waktu kelas sama mesti pairing (slot kongsi), selain itu pertembungan', () => {
  const r = jalankan(`(()=>{
    S=kosong();
    S.kelas=[{id:'1b',nama:'1 BIJAK',tahap:1,waktuHari:{ISNIN:11}}];
    S.subjek=[{id:'bm',kod:'BM',nama:'BM',ganda:false},{id:'mt',kod:'MT',nama:'MT',ganda:false}];
    S.guru=[{id:'g1',nama:'G1',kod:'G1',maxHari:12,tidakAda:[]},{id:'g2',nama:'G2',kod:'G2',maxHari:12,tidakAda:[]}];
    S.jadual={slots:[
      {id:'x1',kelasId:'1b',subjekId:'bm',guruId:'g1',hari:'ISNIN',mula:3,panjang:1,pairing:false},
      {id:'x2',kelasId:'1b',subjekId:'mt',guruId:'g2',hari:'ISNIN',mula:3,panjang:1,pairing:false},
    ]};
    const isu1=semakJadual();
    S.jadual.slots.forEach(s=>s.pairing=true);
    const isu2=semakJadual();
    return JSON.stringify({kelas:isu1.filter(i=>i.t==='kelas').length,kelas2:isu2.filter(i=>i.t==='kelas').length});
  })()`);
  assert.equal(r.kelas, 1, 'dua slot bukan pairing pada waktu kelas sama = 1 pertembungan kelas');
  assert.equal(r.kelas2, 0, 'slot pairing kongsi pada waktu kelas sama bukan pertembungan');
});

// ===== PAUTAN GANTIAN (Personel MySTEP / Guru Praktikal) semasa import =====

const coverMeta = (pages) => ({
  schoolName: 'SK PAYA REDAN, MUAR', teacherTitle: 'JADUAL WAKTU PERSENDIRIAN GURU 2026',
  year: '2026', effectiveDate: '2026-09-14', principalName: 'ENCIK BESAR', principalTitle: 'GURU BESAR',
  periods: [{ period: 1, startTime: '07:30', endTime: '08:00' }],
  pages,
});

test('import: Personel MySTEP menggantikan guru asal pada slot kongsi — SATU slot, MySTEP milik, asal dikeluarkan', () => {
  const teachersLocal = [
    { id: 't1', name: 'GURU ASAL', shortName: 'ASAL', position: 'Guru Akademik Biasa', active: true },
    { id: 'tm', name: 'CIK MYSTEP', shortName: 'MY', position: 'Personel MySTEP', active: true, coversJson: JSON.stringify([{ teacherId: 't1', subjects: [] }]) },
  ];
  const rows = [
    mk('t1', 'IS', 7, 'BM', '1 BIJAK'),   // guru asal
    mk('tm', 'IS', 7, 'BM', '1 BIJAK'),   // MySTEP (menggantikan t1)
  ];
  const metadata = coverMeta([
    { teacherId: 't1', rawName: 'PN GURU ASAL', classTeacherClass: '1 BIJAK' },
    { teacherId: 'tm', rawName: 'CIK MYSTEP', classTeacherClass: '' },
  ]);
  const state = draftFromPdf(rows, teachersLocal, {}, metadata);
  const slots7 = state.jadual.slots.filter((s) => s.hari === 'ISNIN' && s.mula === 7);
  assert.equal(slots7.length, 1, 'SATU slot sahaja pada ISNIN 7 (bukan dua)');
  const myG = state.guru.find((g) => g.directoryId === 'tm');
  const asalG = state.guru.find((g) => g.directoryId === 't1');
  assert.equal(slots7[0].guruId, myG.id, 'slot dimiliki guru MySTEP');
  assert.ok(!state.jadual.slots.some((s) => s.guruId === asalG.id), 'guru asal tiada slot (diganti sepenuhnya)');
  const b1 = state.kelas.find((k) => k.nama === '1 BIJAK');
  const bm = state.subjek.find((s) => s.kod === 'BM');
  const agBM = state.agihan.find((a) => a.kelasId === b1.id && a.subjekId === bm.id);
  assert.equal(agBM.guruId, myG.id, 'agihan BM milik MySTEP');
  assert.equal(agBM.pairGuruIds.length, 0, 'tiada pair (guru asal dikeluarkan)');
});

test('import: Guru Praktikal berkongsi slot — guru asal kekal, kedua-dua jadi pair', () => {
  const teachersLocal = [
    { id: 't1', name: 'GURU ASAL', shortName: 'ASAL', position: 'Guru Akademik Biasa', active: true },
    { id: 'tp', name: 'CIK PRAKTIKAL', shortName: 'PRK', position: 'Guru Praktikal', active: true, coversJson: JSON.stringify([{ teacherId: 't1', subjects: [] }]) },
  ];
  const rows = [
    mk('t1', 'IS', 7, 'BM', '1 BIJAK'),
    mk('tp', 'IS', 7, 'BM', '1 BIJAK'),
  ];
  const metadata = coverMeta([
    { teacherId: 't1', rawName: 'PN GURU ASAL', classTeacherClass: '1 BIJAK' },
    { teacherId: 'tp', rawName: 'CIK PRAKTIKAL', classTeacherClass: '' },
  ]);
  const state = draftFromPdf(rows, teachersLocal, {}, metadata);
  const slots7 = state.jadual.slots.filter((s) => s.hari === 'ISNIN' && s.mula === 7);
  assert.equal(slots7.length, 2, 'dua slot (asal + praktikal) kekal berkongsi');
  assert.ok(slots7.every((s) => s.pairing), 'kedua-dua slot pairing (kongsi)');
  const b1 = state.kelas.find((k) => k.nama === '1 BIJAK');
  const bm = state.subjek.find((s) => s.kod === 'BM');
  const agBM = state.agihan.find((a) => a.kelasId === b1.id && a.subjekId === bm.id);
  assert.equal(agBM.pairGuruIds.length, 1, 'satu pair (praktikal berkongsi, guru asal kekal)');
});

test('import: tiga guru satu slot — MySTEP menggantikan satu, baki dua jadi pair, tiada slot berganda', () => {
  const teachersLocal = [
    { id: 't1', name: 'GURU ASAL', shortName: 'ASAL', position: 'Guru Akademik Biasa', active: true },
    { id: 't2', name: 'GURU DUA', shortName: 'DUA', position: 'Guru Akademik Biasa', active: true },
    { id: 'tm', name: 'CIK MYSTEP', shortName: 'MY', position: 'Personel MySTEP', active: true, coversJson: JSON.stringify([{ teacherId: 't1', subjects: [] }]) },
  ];
  const rows = [
    mk('t1', 'IS', 4, 'ALQ2', '6 BIJAK'),
    mk('t2', 'IS', 4, 'ALQ2', '6 BIJAK'),
    mk('tm', 'IS', 4, 'ALQ2', '6 BIJAK'),
  ];
  const metadata = coverMeta([
    { teacherId: 't1', rawName: 'PN GURU ASAL', classTeacherClass: '1 BIJAK' },
    { teacherId: 't2', rawName: 'PN GURU DUA', classTeacherClass: '4 BIJAK' },
    { teacherId: 'tm', rawName: 'CIK MYSTEP', classTeacherClass: '' },
  ]);
  const state = draftFromPdf(rows, teachersLocal, {}, metadata);
  const slots4 = state.jadual.slots.filter((s) => s.hari === 'ISNIN' && s.mula === 4);
  assert.equal(slots4.length, 2, 'MySTEP + satu guru asal kekal = 2 slot (t1 diganti, dikeluarkan)');
  const asalG = state.guru.find((g) => g.directoryId === 't1');
  assert.ok(!state.jadual.slots.some((s) => s.guruId === asalG.id), 'guru asal t1 tiada slot (diganti)');
  assert.ok(slots4.every((s) => s.pairing), 'dua slot baki pairing (kongsi)');
  const b6 = state.kelas.find((k) => k.nama === '6 BIJAK');
  const alq = state.subjek.find((s) => s.kod === 'ALQ2');
  const ag = state.agihan.find((a) => a.kelasId === b6.id && a.subjekId === alq.id);
  const myG = state.guru.find((g) => g.directoryId === 'tm');
  const duaG = state.guru.find((g) => g.directoryId === 't2');
  assert.ok([myG.id, duaG.id].includes(ag.guruId), 'agihan milik MySTEP atau guru dua (bukan guru asal t1)');
  assert.equal(ag.pairGuruIds.length, 1, 'satu pair sahaja (bukan dua)');
});
