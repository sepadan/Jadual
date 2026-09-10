import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { convertBuilderSchedule } from '../builder-relief.js';

test('integrated builder generates a clash-free timetable and exports it to relief', async()=>{
  const source=readFileSync(new URL('../builder.js',import.meta.url),'utf8');
  const node = {querySelector:()=>({}),querySelectorAll:()=>[]};
  const context=vm.createContext({console,setTimeout,clearTimeout,performance,document:{getElementById:()=>node}});
  vm.runInContext(source.slice(0,source.indexOf("function jadualCetak(")),context);
  const result=await vm.runInContext(`(async()=>{
    S=kosong(); S.subjek=[{id:'bm',kod:'BM',nama:'Bahasa Melayu',ganda:false}];
    S.kelas=[{id:'1b',nama:'1B',tahap:1}];
    S.guru=[{id:'g1',nama:'GURU SATU',maxHari:8,tidakAda:['ISNIN-2']},{id:'g2',nama:'GURU DUA',maxHari:8,tidakAda:[]}];
    S.peruntukan={bm:{1:5}}; S.agihan=[{id:'a',kelasId:'1b',subjekId:'bm',guruId:'g1',pairGuruIds:['g2'],waktu:'',ganda:0}];
    S.acara=[{id:'event',hari:'ISNIN',mula:1,panjang:1,skop:'semua',kod:'PER'}];
    S.kekangan.cubaan=4;
    const generated=await janaJadual({});S.jadual={slots:generated.slots};
    return JSON.stringify({generated,issues:semakJadual(),state:S,times:jalurMasa()});
  })()`,context);
  const {generated,issues,state,times}=JSON.parse(result);
  assert.equal(generated.ok,true);assert.equal(generated.gagal.length,0);assert.deepEqual(issues,[]);
  assert.equal(generated.slots.length,10);assert.ok(generated.slots.every(slot=>slot.pairing));
  for(const primary of generated.slots.filter(slot=>slot.guruId==='g1')) assert.ok(generated.slots.some(slot=>slot.guruId==='g2'&&slot.hari===primary.hari&&slot.mula===primary.mula));
  const converted=convertBuilderSchedule(state,[{id:'t1',name:'GURU SATU',active:true},{id:'t2',name:'GURU DUA',active:true}],times);
  assert.equal(converted.rows.filter(r=>!r.isDuty).length,10);
  assert.equal(converted.rows.filter(r=>r.isDuty).length,3);
});
