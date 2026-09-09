import test from 'node:test';import assert from 'node:assert/strict';import {draftFromPdf} from '../pdf-builder.js';
const teachers=[{id:'t1',name:'GURU SATU',shortName:'SATU',active:true}];
const rows=[{teacherId:'t1',day:'IS',period:1,subject:'BM',className:'1B'},{teacherId:'t1',day:'SEL',period:2,subject:'BM',className:'1B'},{teacherId:'t1',day:'IS',period:12,subject:'KOKU',className:'',isDuty:true}];
test('reviewed aSc import becomes editable subjects, classes, allocation and timetable',()=>{
  const state=draftFromPdf(rows,teachers,{masa:{},kekangan:{}});assert.equal(state.guru.length,1);assert.equal(state.kelas[0].nama,'1B');assert.equal(state.agihan[0].waktu,2);assert.equal(state.jadual.slots.length,2);assert.deepEqual(state.guru[0].tidakAda,['ISNIN-12']);assert.equal(state.masa.waktu.ISNIN,12);
});
test('PDF builder rejects an empty matched timetable and duplicate teacher periods',()=>{
  assert.throws(()=>draftFromPdf(rows,[],{}),/Tiada slot/);assert.throws(()=>draftFromPdf([...rows,rows[0]],teachers,{}),/berulang/);
});
