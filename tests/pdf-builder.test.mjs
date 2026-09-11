import test from 'node:test';import assert from 'node:assert/strict';import {draftFromPdf} from '../pdf-builder.js';
const teachers=[{id:'t1',name:'GURU SATU',shortName:'SATU',position:'Guru Akademik Biasa',active:true},{id:'t2',name:'GURU DUA',shortName:'DUA',position:'Guru Penolong Kanan HEM',active:true}];
const rows=[
  {teacherId:'t1',day:'IS',period:1,startTime:'07:30',endTime:'08:00',subject:'BM',className:'1 BIJAK'},
  {teacherId:'t1',day:'SEL',period:2,startTime:'08:00',endTime:'08:30',subject:'BM',className:'1 BIJAK'},
  {teacherId:'t2',day:'IS',period:1,startTime:'07:30',endTime:'08:00',subject:'BM',className:'1 BIJAK'},
  {teacherId:'t1',day:'IS',period:12,startTime:'13:20',endTime:'13:50',subject:'KOKU',className:'',isDuty:true},
];
const metadata={schoolName:'SK PAYA REDAN, MUAR',teacherTitle:'JADUAL WAKTU PERSENDIRIAN GURU 2026',year:'2026',effectiveDate:'2026-09-14',principalName:'ENCIK BESAR',principalTitle:'GURU BESAR',periods:[{period:1,startTime:'07:30',endTime:'08:00'},{period:2,startTime:'08:00',endTime:'08:30'}],pages:[{teacherId:'t1',rawName:'PN GURU SATU',classTeacherClass:'1 BIJAK'}]};
test('reviewed aSc import populates every editable builder section',()=>{
  const state=draftFromPdf(rows,teachers,{masa:{},kekangan:{},guru:[{id:'lama',directoryId:'t1',nama:'GURU SATU',tidakAda:['JUMAAT-1']}]},metadata);
  assert.equal(state.sekolah.nama,'SK PAYA REDAN, MUAR');assert.equal(state.sekolah.tahun,'2026');assert.equal(state.sekolah.bermula,'2026-09-14');
  assert.equal(state.guru.length,2);assert.equal(state.guru[0].jawatan,'Guru Akademik Biasa');assert.deepEqual(state.guru[0].tidakAda,['JUMAAT-1']);
  assert.equal(state.kelas[0].nama,'1 BIJAK');assert.equal(state.kelas[0].guruKelas,state.guru[0].id);
  assert.equal(state.subjek[0].kod,'BM');assert.equal(state.agihan[0].waktu,2);assert.equal(state.peruntukan[state.subjek[0].id][1],2);
  assert.equal(state.jadual.slots.length,3);assert.ok(state.jadual.slots.every(slot=>slot.kunci));assert.ok(state.jadual.slots.filter(slot=>slot.hari==='ISNIN').every(slot=>slot.pairing));
  assert.equal(state.acara[0].kod,'KOKU');assert.equal(state.acara[0].skop,'guru');assert.equal(state.masa.mula,'07:30');
});
test('PDF builder rejects an empty matched timetable and duplicate teacher periods',()=>{
  assert.throws(()=>draftFromPdf(rows,[],{}),/Tiada slot/);assert.throws(()=>draftFromPdf([...rows,rows[0]],teachers,{}),/berulang/);
});
