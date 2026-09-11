import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { coverageRows, fullyCoveredIds, coveredTeacherSubjects, coverageLabel } from "../teacher-coverage.js";
import { coverageHiddenIds, rankCandidates } from "../relief-engine.js";

const teachers = [
  { id: "t-asraf", name: "ASRAF", position: "Guru Akademik Biasa", active: true, reliefEligible: true },
  { id: "t-nora", name: "NORA", position: "Guru Akademik Biasa", active: true, reliefEligible: true },
  { id: "t-mystep", name: "MYSTEP A", position: "Personel MySTEP", active: true, reliefEligible: true, coversTeacherId: "t-asraf", coversSubjects: "" },
  { id: "t-prak", name: "PRAK B", position: "Guru Praktikal", active: true, reliefEligible: true, coversTeacherId: "t-nora", coversSubjects: "BA" },
  { id: "t-other", name: "OTHER", position: "Guru Akademik Biasa", active: true, reliefEligible: true },
];

const rows = [
  { versionId: "v1", teacherId: "t-asraf", day: "JUM", period: 3, subject: "BA", className: "3 BIJAK", startTime: "09:00", endTime: "09:30" },
  { versionId: "v1", teacherId: "t-nora", day: "JUM", period: 6, subject: "BA", className: "6 BIJAK", startTime: "10:20", endTime: "10:50" },
  { versionId: "v1", teacherId: "t-nora", day: "JUM", period: 8, subject: "SN", className: "6 BIJAK", startTime: "11:20", endTime: "11:50" },
];

const db = {
  teachers,
  schedule: rows,
  scheduleVersions: [{ id: "v1", label: "Jadual 1", status: "active", effectiveDate: "2026-01-01" }],
  absences: [],
  reliefs: [],
  reliefSettings: {},
};

test("a MySTEP teacher takes over every lesson; a practical teacher only the chosen subjects", () => {
  const resolved = coverageRows(rows, teachers);
  assert.equal(resolved[0].teacherId, "t-mystep", "the covered teacher's lesson still stands under the original");
  assert.equal(resolved[0].coveredFor, "t-asraf");
  assert.equal(resolved[1].teacherId, "t-prak", "BA is taken over by the practical teacher");
  assert.equal(resolved[2].teacherId, "t-nora", "SN stays with the original teacher");
});

test("a Personel MySTEP hides a fully replaced teacher, a practical teacher never does", () => {
  assert.deepEqual([...fullyCoveredIds({ teachers, rows })], ["t-asraf"]);
  const allTaken = [
    { ...teachers.find((t) => t.id === "t-prak"), coversSubjects: "" },
  ];
  const praktikalAll = [teachers[1], allTaken[0]];
  assert.equal(fullyCoveredIds({ teachers: praktikalAll, rows }).size, 0, "a practical teacher must not hide the original");
  const myStepSubset = [{ id: "t-mystep2", name: "MYSTEP C", position: "Personel MySTEP", active: true, coversTeacherId: "t-nora", coversSubjects: "BA" }];
  assert.equal(fullyCoveredIds({ teachers: [teachers[1], ...myStepSubset], rows }).size, 0, "the original still teaches SN, so they stay visible");
  const myStepEverything = [{ id: "t-mystep3", name: "MYSTEP D", position: "Personel MySTEP", active: true, coversTeacherId: "t-nora", coversSubjects: "" }];
  assert.deepEqual([...fullyCoveredIds({ teachers: [teachers[1], ...myStepEverything], rows })], ["t-nora"], "taking every subject of the original hides them");
});

test("the hidden teacher disappears from the teacher list and from relief candidates", () => {
  assert.deepEqual([...coverageHiddenIds(db)], ["t-asraf"]);
  const candidates = rankCandidates({ db, date: "2026-09-11", day: "JUM", period: 3, absentTeacherId: "t-other" });
  const ids = candidates.map((teacher) => teacher.id);
  assert.equal(ids.includes("t-asraf"), false, "the replaced teacher is not offered as relief");
  assert.equal(ids.includes("t-mystep"), false, "the covering teacher is busy with the lesson they took over");
  const periodSix = rankCandidates({ db, date: "2026-09-11", day: "JUM", period: 6, absentTeacherId: "t-other" }).map((teacher) => teacher.id);
  assert.equal(periodSix.includes("t-prak"), false, "the practical teacher is busy with the lesson they took over");
  assert.equal(periodSix.includes("t-mystep"), true, "the MySTEP teacher is free at a period they do not cover");
});

test("subject chips come from the covered teacher's own timetable", () => {
  assert.deepEqual(coveredTeacherSubjects(rows, "t-nora"), ["BA", "SN"]);
  assert.equal(coverageLabel({ teachers, teacherId: "t-prak" }), "NORA · BA");
  assert.equal(coverageLabel({ teachers, teacherId: "t-mystep" }), "ASRAF · semua jadual");
  assert.equal(coverageLabel({ teachers, teacherId: "t-other" }), "");
});

test("the Apps Script public payload applies the same cover rules", () => {
  const source = readFileSync(new URL("../apps-script/Builder.gs", import.meta.url), "utf8");
  const start = source.indexOf("function coverSubjects_(");
  const end = source.indexOf("// One cache entry per day");
  assert.ok(start > 0 && end > start, "the cover helpers are missing from Builder.gs");
  const context = { Object, String, Number };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const hidden = context.coverHiddenIds_(teachers, rows);
  assert.deepEqual(Object.keys(hidden), ["t-asraf"], "the mirror must hide the same teacher as the client");
  const mirrored = context.coverRows_(rows, teachers);
  assert.deepEqual(mirrored.map((row) => row.teacherId), coverageRows(rows, teachers).map((row) => row.teacherId), "client and server must file the same lessons under the same teacher");
});
