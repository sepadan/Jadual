import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
  assert.match(master,/\$\{jm\[p-1\]\.mula\} - \$\{jm\[p-1\]\.tamat\}/);
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

test('print header supports effective date and avoids a duplicate year',()=>{
  assert.ok(source.includes('Tarikh mula berkuat kuasa'));
  assert.ok(source.includes("S.sekolah.bermula?`BERMULA"));
  assert.match(source,/tahun&&!text\.includes\(tahun\)/);
});
