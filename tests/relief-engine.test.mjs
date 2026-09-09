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
