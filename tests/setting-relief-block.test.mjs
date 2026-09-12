import test from "node:test";
import assert from "node:assert/strict";
import { PERIODS } from "../data.js";
import { activeScheduleRows, rankCandidates } from "../relief-engine.js";
import { mergeSettingRows } from "../setting-slots.js";

// The promise of the remedial-teacher feature is not "a row appears in the grid" but "relief stops
// offering that teacher while they are in a setting period". That claim crosses two modules, so it
// is asserted across them: setting-slots.js writes the rows, relief-engine.js must honour them.
const DATE = "2026-09-11"; // a Friday, so the day code is JUM
const DAY = "JUM";

function database(rows) {
  return {
    school: "SK Paya Redan, Muar",
    revision: 7,
    reliefSettings: { dailyLimit: 2, ignorePairingWhenCovered: false },
    teachers: [
      { id: "t1", name: "GURU HADIR", shortName: "HADIR", position: "Guru Akademik Biasa", active: true, reliefEligible: true },
      { id: "t2", name: "GURU GANTI", shortName: "GANTI", position: "Guru Akademik Biasa", active: true, reliefEligible: true },
      { id: "t3", name: "GURU PEMULIHAN", shortName: "PEMULIHAN", position: "Guru Pemulihan", active: true, reliefEligible: true },
    ],
    scheduleVersions: [{ id: "v1", label: "Jadual ujian", effectiveDate: "2026-09-01", status: "active", createdAt: "2026-09-01T00:00:00.000Z" }],
    schedule: rows,
    absences: [{ id: "a1", date: DATE, teacherId: "t1", allDay: true, periods: [], status: "active", createdAt: DATE, updatedAt: DATE }],
    reliefs: [],
  };
}

const lesson = (teacherId, period) => ({
  versionId: "v1", teacherId, day: DAY, period, startTime: "07:30", endTime: "08:00",
  subject: "BM", className: "4 BIJAK",
});

test("a period claimed on the weekly grid removes the teacher from relief for that period only", () => {
  const before = database([lesson("t1", 1), lesson("t1", 3), lesson("t2", 2)]);
  const { rows, added } = mergeSettingRows({
    rows: before.schedule, teacherId: "t3", versionId: "v1",
    selected: ["JUM-1", "JUM-2", "JUM-3"], periods: PERIODS,
  });
  const db = { ...before, schedule: rows };

  assert.equal(added, 3, "the three claimed periods were not written");
  assert.equal(rows.length, 6, "lessons were lost while claiming setting periods");

  // Period 1: only t2 is free to cover — t3 is in a setting period now.
  const period1 = rankCandidates({ db, date: DATE, day: DAY, period: 1, startTime: "07:30", absentTeacherId: "t1" }).map((t) => t.id);
  assert.deepEqual(period1, ["t2"], `relief still offers a teacher in a setting period: ${period1.join(", ")}`);

  // Period 4: no setting period, so the remedial teacher is offered again (the owner's choice).
  const period4 = rankCandidates({ db, date: DATE, day: DAY, period: 4, startTime: "09:00", absentTeacherId: "t1" }).map((t) => t.id).sort();
  assert.deepEqual(period4, ["t2", "t3"], `a free remedial teacher is no longer offered: ${period4.join(", ")}`);
});

test("the claimed periods reach the active timetable the app renders", () => {
  const before = database([lesson("t1", 1), lesson("t2", 2)]);
  const { rows } = mergeSettingRows({
    rows: before.schedule, teacherId: "t3", versionId: "v1",
    selected: ["JUM-1"], periods: PERIODS,
  });
  const active = activeScheduleRows({ ...before, schedule: rows }, DATE)
    .filter((row) => row.teacherId === "t3" && row.day === DAY && Number(row.period) === 1);
  assert.equal(active.length, 1, "the setting period never reaches the active timetable");
  assert.equal(active[0].subject, "PEMULIHAN");
  assert.equal(active[0].isDuty, true);
  assert.equal(active[0].className, "", "a setting period must not invent a class name");
  assert.equal(active[0].startTime, "07:30", "the setting period ignores the official clock");
});

test("unticking a period again gives relief back to that teacher", () => {
  const before = database([lesson("t1", 1), lesson("t1", 3), lesson("t2", 2)]);
  const claimed = mergeSettingRows({
    rows: before.schedule, teacherId: "t3", versionId: "v1", selected: ["JUM-1"], periods: PERIODS,
  });
  const released = mergeSettingRows({
    rows: claimed.rows, teacherId: "t3", versionId: "v1", selected: [], periods: PERIODS,
  });
  const db = { ...before, schedule: released.rows };
  assert.equal(released.rows.length, 3, "releasing a period left its duty row behind");
  const period1 = rankCandidates({ db, date: DATE, day: DAY, period: 1, startTime: "07:30", absentTeacherId: "t1" }).map((t) => t.id).sort();
  assert.deepEqual(period1, ["t2", "t3"], "the released period is still blocked");
});
