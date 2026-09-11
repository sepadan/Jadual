import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReliefDrafts, cancelAbsenceAndReliefs, cancelReliefsAssignedToAbsence, dayCodeFromDate, rankCandidates, reliefHasActiveAbsence, validateReliefs } from "../relief-engine.js";

function fixture() {
  return {
    teachers: [
      { id: "absent", name: "Guru Tiada", active: true, reliefEligible: true, priority: 3 },
      { id: "free", name: "Guru Lapang", active: true, reliefEligible: true, priority: 3 },
      { id: "busy", name: "Guru Sibuk", active: true, reliefEligible: true, priority: 3 },
      { id: "excluded", name: "Guru Dikecualikan", active: true, reliefEligible: false, priority: 1 },
    ],
    scheduleVersions: [{ id: "v1", effectiveDate: "2026-09-01", status: "active" }],
    schedule: [
      { versionId: "v1", teacherId: "absent", day: "RAB", period: 2, startTime: "08:00", endTime: "08:30", subject: "BM", className: "2 BIJAK" },
      { versionId: "v1", teacherId: "absent", day: "RAB", period: 8, subject: "KOKU", className: "" },
      { versionId: "v1", teacherId: "busy", day: "RAB", period: 2, subject: "SN", className: "3 BIJAK" },
    ],
    absences: [{ id: "a1", date: "2026-09-09", teacherId: "absent", allDay: true, periods: [], status: "active" }],
    reliefs: [],
  };
}

test("tarikh sekolah dipadankan kepada kod hari", () => {
  assert.equal(dayCodeFromDate("2026-09-09"), "RAB");
  assert.equal(dayCodeFromDate("2026-09-12"), null);
});

test("calon sibuk dan tidak layak ditolak", () => {
  const ranked = rankCandidates({ db: fixture(), date: "2026-09-09", day: "RAB", period: 2, absentTeacherId: "absent" });
  assert.deepEqual(ranked.map((teacher) => teacher.id), ["free"]);
});

test("satu draf relief dibina daripada slot guru tiada", () => {
  const drafts = buildReliefDrafts(fixture(), "2026-09-09");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].replacementTeacherId, "free");
  assert.equal(drafts[0].className, "2 BIJAK");
});

test("pilihan relief sah lulus semakan", () => {
  const db = fixture();
  const drafts = buildReliefDrafts(db, "2026-09-09");
  assert.deepEqual(validateReliefs(db, drafts), []);
});

test('daily load outranks manual priority and weekly relief',()=>{
  const db=fixture();db.schedule=db.schedule.filter(r=>r.teacherId!=='busy');
  db.teachers.find(t=>t.id==='free').priority=9;
  db.teachers.find(t=>t.id==='busy').priority=1;
  db.schedule.push({versionId:'v1',teacherId:'busy',day:'RAB',period:5});
  const ranked=rankCandidates({db,date:'2026-09-09',day:'RAB',period:2,absentTeacherId:'absent'});
  assert.equal(ranked[0].id,'free');
});
test('drafts reserve earlier choices and respect default two relief periods',()=>{
  const db=fixture();db.teachers=db.teachers.filter(t=>t.id!=='busy');
  db.schedule=[2,3,4].map(period=>({...db.schedule[0],period}));
  const drafts=buildReliefDrafts(db,'2026-09-09');
  assert.equal(drafts.filter(r=>r.replacementTeacherId==='free').length,2);
  assert.equal(drafts[2].replacementTeacherId,'');
  drafts[2].replacementTeacherId='free';assert.ok(validateReliefs(db,drafts).length);
  db.reliefSettings={dailyLimit:3};assert.deepEqual(validateReliefs(db,drafts),[]);
  db.reliefSettings={dailyLimit:0};assert.ok(buildReliefDrafts(db,'2026-09-09').every(r=>!r.replacementTeacherId));
});
test('published relief consumes daily allowance but cancelled relief does not',()=>{
  const db=fixture();db.reliefs=[{id:'x',date:'2026-09-09',period:4,absentTeacherId:'absent',replacementTeacherId:'free',status:'published'},{id:'y',date:'2026-09-09',period:5,absentTeacherId:'absent',replacementTeacherId:'free',status:'published'}];
  const args={db,date:'2026-09-09',day:'RAB',period:2,absentTeacherId:'absent'};
  assert.equal(rankCandidates(args).length,0);
  db.reliefs[1].status='cancelled';assert.equal(rankCandidates(args)[0].id,'free');
});

test('cancelling an absence also cancels only its related reliefs immediately',()=>{
  const db=fixture();
  db.absences.push({id:'other-absence',date:'2026-09-09',teacherId:'busy',allDay:true,status:'active'});
  db.reliefs=[
    {id:'related-1',date:'2026-09-09',period:2,absentTeacherId:'absent',replacementTeacherId:'free',status:'published'},
    {id:'related-2',date:'2026-09-09',period:3,absentTeacherId:'absent',replacementTeacherId:'busy',status:'published'},
    {id:'other',date:'2026-09-09',period:4,absentTeacherId:'busy',replacementTeacherId:'free',status:'published'},
  ];
  const result=cancelAbsenceAndReliefs(db,'a1','2026-09-11T01:02:03.000Z');
  assert.equal(result.absence.status,'cancelled');
  assert.deepEqual(result.reliefs.map(item=>item.id),['related-1','related-2']);
  assert.ok(result.reliefs.every(item=>item.status==='cancelled'));
  assert.equal(db.reliefs.find(item=>item.id==='other').status,'published');
});

test('orphan relief is ignored and no longer consumes the daily limit',()=>{
  const db=fixture();
  db.absences[0].status='cancelled';
  db.reliefs=[{id:'orphan',date:'2026-09-09',period:4,absentTeacherId:'absent',replacementTeacherId:'free',status:'published'}];
  assert.equal(reliefHasActiveAbsence(db,db.reliefs[0]),false);
  assert.equal(rankCandidates({db,date:'2026-09-09',day:'RAB',period:2,absentTeacherId:'busy'})[0].id,'free');
});

test('guru ganti yang kemudian tidak hadir digugurkan dan slot asal dijana semula',()=>{
  const db=fixture();
  db.reliefs=[{id:'r-old',date:'2026-09-09',day:'RAB',period:2,absentTeacherId:'absent',replacementTeacherId:'free',className:'2 BIJAK',subject:'BM',status:'published'}];
  const replacementAbsence={id:'a-free',date:'2026-09-09',teacherId:'free',allDay:false,periods:[2],status:'active'};
  db.absences.push(replacementAbsence);

  assert.equal(reliefHasActiveAbsence(db,db.reliefs[0]),false);
  const cancelled=cancelReliefsAssignedToAbsence(db,replacementAbsence,'2026-09-11T03:00:00.000Z');
  assert.deepEqual(cancelled.map(item=>item.id),['r-old']);
  assert.equal(db.reliefs[0].status,'cancelled');

  const drafts=buildReliefDrafts(db,'2026-09-09');
  const originalSlot=drafts.find(item=>item.absentTeacherId==='absent'&&item.period===2);
  assert.ok(originalSlot);
  assert.notEqual(originalSlot.replacementTeacherId,'free');
  assert.ok(!originalSlot.candidates.some(item=>item.id==='free'));
});

test('ketiadaan separa guru ganti hanya membatalkan waktu yang diliputi',()=>{
  const db=fixture();
  db.reliefs=[2,3].map(period=>({id:`r-${period}`,date:'2026-09-09',period,absentTeacherId:'absent',replacementTeacherId:'free',status:'published'}));
  const absence={date:'2026-09-09',teacherId:'free',allDay:false,periods:[2],status:'active'};
  const cancelled=cancelReliefsAssignedToAbsence(db,absence,'now');
  assert.deepEqual(cancelled.map(item=>item.id),['r-2']);
  assert.equal(db.reliefs[1].status,'published');
});

test('guru prasekolah hanya layak selepas masa tamat sesi yang sah',()=>{
  const db=fixture();
  db.schedule=db.schedule.filter(row=>row.teacherId!=='busy');
  db.teachers.push({id:'pra',name:'Guru Prasekolah',position:'Guru Prasekolah',active:true,reliefEligible:true,priority:3,preschoolEndTime:'11:30'});
  const args={db,date:'2026-09-09',day:'RAB',period:2,absentTeacherId:'absent'};
  assert.equal(rankCandidates({...args,startTime:'11:00'}).some(t=>t.id==='pra'),false);
  assert.equal(rankCandidates({...args,startTime:'11:30'}).some(t=>t.id==='pra'),true);
  assert.equal(rankCandidates({...args,startTime:'12:00'}).some(t=>t.id==='pra'),true);
  db.teachers.find(t=>t.id==='pra').preschoolEndTime='';
  assert.equal(rankCandidates({...args,startTime:'12:00'}).some(t=>t.id==='pra'),false);
  db.teachers.find(t=>t.id==='pra').preschoolEndTime='tidak-sah';
  assert.equal(rankCandidates({...args,startTime:'12:00'}).some(t=>t.id==='pra'),false);
  db.teachers.find(t=>t.id==='pra').position='Guru Akademik Biasa';
  assert.equal(rankCandidates({...args,startTime:'11:00'}).some(t=>t.id==='pra'),true);
});

test('jana dan sahkan relief menguatkuasakan masa tamat prasekolah',()=>{
  const db=fixture();
  db.teachers.find(t=>t.id==='free').reliefEligible=false;
  db.teachers.push({id:'pra',name:'Guru Prasekolah',position:'Guru Prasekolah',active:true,reliefEligible:true,priority:3,preschoolEndTime:'08:30'});
  assert.equal(buildReliefDrafts(db,'2026-09-09')[0].replacementTeacherId,'');
  db.teachers.find(t=>t.id==='pra').preschoolEndTime='07:30';
  const drafts=buildReliefDrafts(db,'2026-09-09');
  assert.equal(drafts[0].replacementTeacherId,'pra');
  assert.deepEqual(validateReliefs(db,drafts),[]);
  db.teachers.find(t=>t.id==='pra').preschoolEndTime='08:30';
  assert.match(validateReliefs(db,drafts)[0],/sudah tidak tersedia/);
});

test('pairing setting skips only when another active teacher is present for that slot',()=>{
  const db=fixture();db.schedule.push({...db.schedule[0],teacherId:'busy'});
  assert.equal(buildReliefDrafts(db,'2026-09-09').length,1);
  db.reliefSettings={dailyLimit:2,ignorePairingWhenCovered:true};
  assert.equal(buildReliefDrafts(db,'2026-09-09').length,0);
  db.absences.push({date:'2026-09-09',teacherId:'busy',allDay:false,periods:[3],status:'active'});
  assert.equal(buildReliefDrafts(db,'2026-09-09').length,0);
  db.absences[1].periods=[2];assert.equal(buildReliefDrafts(db,'2026-09-09').length,2);
});
