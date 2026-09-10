import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReliefDrafts, dayCodeFromDate, rankCandidates, validateReliefs } from "../relief-engine.js";

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
  const db=fixture();db.reliefs=[{id:'x',date:'2026-09-09',period:4,replacementTeacherId:'free',status:'published'},{id:'y',date:'2026-09-09',period:5,replacementTeacherId:'free',status:'published'}];
  const args={db,date:'2026-09-09',day:'RAB',period:2,absentTeacherId:'absent'};
  assert.equal(rankCandidates(args).length,0);
  db.reliefs[1].status='cancelled';assert.equal(rankCandidates(args)[0].id,'free');
});
