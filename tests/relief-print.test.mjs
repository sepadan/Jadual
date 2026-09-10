import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReliefPrintModel,reliefPrintHtml} from '../relief-print.js';

const periods=Array.from({length:11},(_,index)=>({period:index+1,startTime:`0${index+7}:30`,endTime:`0${index+8}:00`}));
const db={school:'SK Paya Redan, Muar',teachers:[
  {id:'a',name:'GURU TIADA',shortName:'PN. NORA'},
  {id:'b',name:'GURU GANTI',shortName:'EN. AZUAN'},
],reliefs:[
  {date:'2026-09-10',status:'published',absentTeacherId:'a',replacementTeacherId:'b',period:1,className:'5C'},
  {date:'2026-09-10',status:'draft',absentTeacherId:'a',replacementTeacherId:'b',period:2,className:'6B'},
]};

test('official relief sheet groups published periods by absent teacher',()=>{
  const model=buildReliefPrintModel(db,'2026-09-10',periods);
  assert.equal(model.dateLabel,'10/09/2026');
  assert.equal(model.dayLabel,'KHAMIS');
  assert.equal(model.periods.length,11);
  assert.equal(model.groups.length,1);
  assert.deepEqual(model.groups[0].slots[1],{classes:['5C'],replacements:['EN. AZUAN']});
  assert.equal(model.groups[0].slots[2],undefined);
});

test('official relief sheet includes class, replacement and signature rows',()=>{
  const html=reliefPrintHtml(buildReliefPrintModel(db,'2026-09-10',periods));
  assert.match(html,/JADUAL GURU GANTI/);
  assert.match(html,/relief-print-name-label[^>]*>NAMA GURU<br>TIDAK HADIR/);
  assert.ok(!html.includes('rowspan="3"'));
  assert.match(html,/PN\. NORA/);
  assert.match(html,/KELAS/);
  assert.match(html,/GURU<br>GANTI/);
  assert.match(html,/T\/TANGAN/);
});
