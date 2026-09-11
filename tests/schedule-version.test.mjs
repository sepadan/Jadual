import test from "node:test";
import assert from "node:assert/strict";
import { activeScheduleRows, selectedScheduleVersion } from "../relief-engine.js";

// Mirrors the versions published in the school database on 11 September 2026: an official
// version effective 10 September, plus an earlier import that carries a later effective date.
function fixture() {
  return {
    teachers: [],
    scheduleVersions: [
      { id: "v-14-borang", label: "Jadual 14.09.2026", status: "superseded", effectiveDate: "2026-09-14", createdAt: "2026-09-10T02:57:08.171Z" },
      { id: "v-rasmi", label: "Jadual 14.09.2026", status: "active", effectiveDate: "2026-09-10", createdAt: "2026-09-10T14:37:12.539Z" },
      { id: "v-lama", label: "Jadual lama", status: "superseded", effectiveDate: "2026-08-01", createdAt: "2026-07-30T00:00:00.000Z" },
    ],
    schedule: [
      { versionId: "v-rasmi", teacherId: "g1", day: "KHA", period: 2, className: "3 BIJAK" },
      { versionId: "v-14-borang", teacherId: "g1", day: "KHA", period: 2, className: "3 BIJAK" },
      { versionId: "v-lama", teacherId: "g1", day: "KHA", period: 2, className: "3 BIJAK" },
    ],
  };
}

test("an official version stays authoritative when an older import is dated later", () => {
  assert.equal(selectedScheduleVersion(fixture(), "2026-09-14").id, "v-rasmi");
  assert.equal(selectedScheduleVersion(fixture(), "2026-09-21").id, "v-rasmi");
  assert.deepEqual(Array.from(activeScheduleRows(fixture(), "2026-09-21"), (row) => row.versionId), ["v-rasmi"]);
});

test("the official version applies from its effective date onwards, not before", () => {
  assert.equal(selectedScheduleVersion(fixture(), "2026-09-10").id, "v-rasmi");
  assert.equal(selectedScheduleVersion(fixture(), "2026-09-09").id, "v-lama");
});

test("a superseded version still answers dates before any official version", () => {
  const db = fixture();
  db.scheduleVersions = db.scheduleVersions.filter((version) => version.status !== "active");
  assert.equal(selectedScheduleVersion(db, "2026-09-20").id, "v-14-borang");
  assert.equal(selectedScheduleVersion(db, "2026-08-15").id, "v-lama");
});

test("dates before every effective date resolve to no timetable", () => {
  assert.equal(selectedScheduleVersion(fixture(), "2026-07-01"), null);
  assert.deepEqual(activeScheduleRows(fixture(), "2026-07-01"), []);
});

test("the newest official version wins when two are marked active", () => {
  const db = fixture();
  db.scheduleVersions = db.scheduleVersions.map((version) => ({ ...version, status: "active" }));
  assert.equal(selectedScheduleVersion(db, "2026-09-21").id, "v-14-borang");
});

test("versions without an effective date are ignored instead of winning", () => {
  const db = fixture();
  db.scheduleVersions.push({ id: "tiada-tarikh", status: "active", effectiveDate: "" });
  assert.equal(selectedScheduleVersion(db, "2026-09-21").id, "v-rasmi");
});
