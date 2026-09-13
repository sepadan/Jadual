import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../builder.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../builder.css',import.meta.url),'utf8');

test('print menu exposes all four requested timetable formats',()=>{
  for(const label of ['Jadual Guru','Jadual Kelas','Jadual Induk Kelas','Jadual Induk Guru']) {
    assert.ok(source.includes(`>${label}</button>`),`${label} is missing`);
  }
  assert.ok(source.includes("cetakJenis==='induk-kelas'"));
  assert.ok(source.includes("cetakJenis==='induk-guru'"));
});

test('clearing the print selection stays empty until the format changes',()=>{
  assert.ok(source.includes("cetakPilih===null"));
  assert.ok(source.includes("cetakPilih=new Set(on?senarai.map"));
  assert.ok(!source.includes("if(!cetakPilih.size)"));
});

test('all print includes personal and both master timetable families',()=>{
  const preview=source.slice(source.indexOf('function pratontonCetak()'),source.indexOf('/* ============================================================\n   DATA & SANDARAN'));
  assert.match(preview,/S\.guru\.map\(g=>lembaranGuru/);
  assert.match(preview,/S\.kelas\.map\(k=>lembaranKelas/);
  assert.match(preview,/S\.hari\.map\(lembaranIndukKelas\)/);
  assert.match(preview,/S\.hari\.map\(lembaranIndukGuru\)/);
});

test('master timetables use fixed period columns without content-driven colspan',()=>{
  const master=source.slice(source.indexOf('function lembaranIndukBahagian('),source.indexOf('/* ============================================================\n   CETAK'));
  assert.match(master,/<colgroup>\$\{cols\}<\/colgroup>/);
  assert.match(master,/JADUAL INDUK \$\{jenis\}/);
  // Masa dalam kepala cetak dipecah dua baris melalui tmJulat_(), bukan satu baris panjang.
  assert.match(master,/\$\{tmJulat_\(jm\[p-1\]\.mula,jm\[p-1\]\.tamat\)\}/);
  assert.ok(!master.includes('colspan="${c.len}"'));
});

test('builder print CSS keeps aSc-style side summary and uniform borders',()=>{
  assert.match(css,/#builderRoot \.sh-body\{display:flex/);
  assert.ok(!css.includes('.sh-#builderRoot'));
  assert.match(css,/#builderRoot table\.pt\{border:1px solid #000;border-collapse:collapse;border-spacing:0;[^}]*table-layout:fixed/);
  assert.match(css,/#builderRoot table\.pt th,#builderRoot table\.pt td\{[^}]*border:1px solid #000/);
  assert.match(css,/#builderRoot table\.sum\{[^}]*table-layout:fixed/);
  assert.match(css,/#builderRoot table\.sum th,#builderRoot table\.sum td\{[^}]*white-space:normal!important;[^}]*overflow-wrap:anywhere/);
  assert.ok(source.includes('kelasSaizRingkasan(r.kelas)'));
  assert.match(css,/\.pt-col-master-name\{width:82px\}/);
});

test('short teacher names stay inside timetable cells, the side summary and the class-sheet header',()=>{
  const summary=source.slice(source.indexOf('function ringkasanKelas('),source.indexOf('function tarikhCetak('));
  const sheet=source.slice(source.indexOf('function lembaranKelas('),source.indexOf('const HAD_BARIS_INDUK'));
  const iSel=source.indexOf('function teksSel(');
  const timetable=source.slice(iSel, source.indexOf('\nfunction ', iSel+10));
  // Sel jadual mesti guna nama PENDEK (kod guru) supaya muat; pemboleh ubah dalaman tidak penting,
  // jadi padanan tidak dipakukan pada satu nama pemboleh ubah sahaja.
  assert.match(timetable, /namaGuru\([^)]*guruId[^)]*,\s*true\)/);
  // Ringkasan sisi helaian kelas guna nama ringkas (satu baris per pasangan subjek+guru), dan
  // kepala "GURU KELAS:" juga nama ringkas seperti helaian rujukan. Tajuk helaian guru kekal nama
  // penuh (g.nama) - hanya kepala kelas dan ringkasan yang pakai nama ringkas.
  assert.ok(summary.includes('namaGuru(gid,true)'));
  assert.ok(sheet.includes('namaGuru(k.guruKelas,true)'));
});

test('master time zero is one readable shared cell instead of repeated narrow labels',()=>{
  const master=source.slice(source.indexOf('function lembaranIndukBahagian('),source.indexOf('/* ============================================================\n   CETAK'));
  assert.match(master,/if\(pra&&ri===0\).*rowspan="\$\{senarai\.length\}"/s);
  assert.ok(!master.includes('if(pra) body+=`<td class="pt-master-pre">'));
});

test('class order is natural from Year 1 through Year 6',()=>{
  const start=source.indexOf('function tahunKelas('),end=source.indexOf('/* ---------- Carian ---------- */');
  assert.ok(start>=0&&end>start,'class comparator helper missing');
  const context={S:{kelas:[
    {nama:'6 BIJAK',tahap:6},{nama:'3 BIJAK',tahap:3},{nama:'5 CERDIK',tahap:5},
    {nama:'2 CERDIK',tahap:2},{nama:'1 BIJAK',tahap:1},{nama:'5 BIJAK',tahap:5},{nama:'2 BIJAK',tahap:2},
  ]}};
  vm.runInNewContext(source.slice(start,end),context);
  context.susunKelas();
  assert.deepEqual(context.S.kelas.map(item=>item.nama),['1 BIJAK','2 BIJAK','2 CERDIK','3 BIJAK','5 BIJAK','5 CERDIK','6 BIJAK']);
  assert.match(source,/function go\(v\)\{\s*susunKelas\(\);/);
});

test('mobile print preview preserves desktop sheet geometry with horizontal scrolling',()=>{
  assert.match(css,/#builderRoot #cetakArea\{[^}]*overflow-x:auto/);
  assert.match(css,/@media screen and \(max-width:860px\)[\s\S]*#builderRoot #cetakArea \.sheet\{width:1100px;max-width:none/);
  assert.match(css,/#builderRoot #cetakArea \.sh-body\{flex-direction:row/);
  assert.match(css,/#builderRoot #cetakArea \.sh-side\{width:250px;flex:0 0 250px/);
  // 5 mm = margin yang sama digunakan oleh eksport PDF (287 x 200 mm), supaya cetakan dan PDF
  // kelihatan sama; 8 mm dahulu menghasilkan halaman yang berbeza daripada fail PDF.
  assert.match(css,/@page\{size:A4 landscape;margin:5mm\}/);
});

test('PDF export generates and downloads a PDF independently from printing',()=>{
  const view=source.slice(source.indexOf("VIEWS.cetak="),source.indexOf('function pilihSemuaCetak'));
  const pdf=view.indexOf('Eksport PDF</button>'),print=view.indexOf('Cetak</button>');
  assert.ok(pdf>=0&&print>pdf);
  assert.match(source,/async function eksportPdfJadual\(\)/);
  assert.match(source,/function cetakJadual\(\)/);
  const exporter=source.slice(source.indexOf('async function eksportPdfJadual('),source.indexOf('function pratontonCetak('));
  assert.match(exporter,/html2canvas/);
  assert.match(exporter,/jspdf\.jsPDF/);
  assert.match(exporter,/pdf\.save\(/);
  assert.ok(!exporter.includes('window.print()'));
});

test('a stale PDF library script is replaced instead of leaving export pending',async()=>{
  const start=source.indexOf('const pemuatanSkripPdf='),end=source.indexOf('function namaFailPdf(');
  assert.ok(start>=0&&end>start,'PDF loader state and helper missing');
  let removed=false,appended=false,ready=false;
  const stale={remove(){removed=true;}};
  const document={
    querySelector(){return stale;},
    createElement(){return {dataset:{},remove(){}};},
    head:{appendChild(script){appended=true;ready=true;queueMicrotask(()=>script.onload());}},
  };
  const context={document,window:{},console};
  vm.runInNewContext(source.slice(start,end),context);
  await context.muatSkripPdf('./vendor/test.js',()=>ready);
  assert.equal(removed,true);
  assert.equal(appended,true);
});

test('print header supports effective date and avoids a duplicate year',()=>{
  assert.ok(source.includes('Tarikh mula berkuat kuasa'));
  assert.ok(source.includes("S.sekolah.bermula?`BERMULA"));
  assert.match(source,/tahun&&!text\.includes\(tahun\)/);
});
