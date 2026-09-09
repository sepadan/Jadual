import test from 'node:test';
import assert from 'node:assert/strict';
import { convertBuilderSchedule } from '../builder-relief.js';
import { activeScheduleRows } from '../relief-engine.js';
const teachers = [{id:'directory-1',name:'GURU SATU',active:true}];
const times = [{p:1,mula:'08:00',tamat:'08:30'},{p:2,mula:'08:30',tamat:'09:00'}];
function fixture() { return {guru:[{id:'g1',nama:'Guru Satu',tidakAda:[]}],kelas:[{id:'k1',nama:'1B'}],subjek:[{id:'s1',kod:'BM'}],acara:[],jadual:{slots:[{guruId:'g1',kelasId:'k1',subjekId:'s1',hari:'ISNIN',mula:1,panjang:2}]}}; }
test('native timetable maps names and expands blocks with configured times',()=>{
  const result=convertBuilderSchedule(fixture(),teachers,times);
  assert.equal(result.rows.length,2); assert.equal(result.rows[1].startTime,'08:30'); assert.equal(result.rows[0].teacherId,'directory-1'); assert.equal(result.rows[0].className,'1B');
});
test('unknown native teachers are ignored, not silently matched',()=>{
  const state=fixture();state.guru[0].nama='SYAHIDAH';
  const result=convertBuilderSchedule(state,teachers,times);assert.equal(result.rows.length,0);assert.deepEqual(result.missing,['SYAHIDAH']);
});
test('fixed events and unavailable periods block relief',()=>{
  const state=fixture();state.guru[0].tidakAda=['SELASA-1'];state.acara=[{skop:'semua',hari:'RABU',mula:1,panjang:1,kod:'PERHIMPUNAN'}];
  const result=convertBuilderSchedule(state,teachers,times);assert.equal(result.rows.filter(r=>r.isDuty).length,2);
});
test('teacher clashes cannot be activated',()=>{
  const state=fixture();state.jadual.slots.push({...state.jadual.slots[0]});assert.throws(()=>convertBuilderSchedule(state,teachers,times),/Pertembungan/);
});
test('future activation preserves the previous effective timetable',()=>{
  const db={scheduleVersions:[{id:'old',status:'superseded',effectiveDate:'2026-01-01'},{id:'new',status:'active',effectiveDate:'2026-09-14'}],schedule:[{versionId:'old'},{versionId:'new'}]};
  assert.equal(activeScheduleRows(db,'2026-09-09')[0].versionId,'old');assert.equal(activeScheduleRows(db,'2026-09-14')[0].versionId,'new');
});
