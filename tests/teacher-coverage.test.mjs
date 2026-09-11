import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { coverList, coverLinks, coverageRows, coveredTeacherSubjects, fullyCoveredIds, sharedPairKey, sharedPairs } from "../teacher-coverage.js";
import { buildReliefDrafts, coverageHiddenIds } from "../relief-engine.js";

const ASRAF = { id: "t-asraf", name: "ASRAF", position: "Guru Akademik Biasa", active: true, reliefEligible: true };
const NORA = { id: "t-nora", name: "NORA", position: "Guru Akademik Biasa", active: true, reliefEligible: true };
const WEE = { id: "t-wee", name: "WEE", position: "Guru Akademik Biasa", active: true, reliefEligible: true };
const MYSTEP = { id: "t-mystep", name: "MYSTEP", position: "Personel MySTEP", active: true, reliefEligible: true };
const PRAK = { id: "t-prak", name: "PRAK", position: "Guru Praktikal", active: true, reliefEligible: true };

const rows = [
  { versionId: "v1", teacherId: "t-asraf", day: "JUM", period: 1, subject: "BA", className: "3 BIJAK" },
  { versionId: "v1", teacherId: "t-nora", day: "JUM", period: 2, subject: "BA", className: "6 BIJAK" },
  { versionId: "v1", teacherId: "t-nora", day: "JUM", period: 3, subject: "SN", className: "6 BIJAK" },
  { versionId: "v1", teacherId: "t-wee", day: "JUM", period: 4, subject: "MT", className: "4 BIJAK" },
];
const version = { id: "v1", label: "ujian", effectiveDate: "2026-09-01", status: "active", createdAt: "2026-09-01T00:00:00.000Z" };

function makeDb(teachers, extra = {}) {
  return { school: "SK Ujian", revision: 1, teachers, schedule: rows, scheduleVersions: [version], absences: [], reliefs: [], reliefSettings: { dailyLimit: 2 }, ...extra };
}

test("cover links read the JSON list and still understand the older single-link columns", () => {
  const list = coverList({ coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }, { teacherId: "t-wee", subjects: [] }]) });
  assert.deepEqual(list, [{ teacherId: "t-nora", subjects: ["BA"] }, { teacherId: "t-wee", subjects: [] }]);
  assert.deepEqual(JSON.parse(JSON.stringify(coverList({ coversTeacherId: "t-asraf", coversSubjects: "ba, sn" }))), [{ teacherId: "t-asraf", subjects: ["BA", "SN"] }], "the old shape must keep working");
  assert.deepEqual(coverList({ coversSubjects: "BA" }), [], "no teacher means no link");
  assert.deepEqual(coverList({ coversJson: "{bukan json}" }), []);
});

test("a Personel MySTEP replaces every lesson; a practical teacher shares the chosen subjects", () => {
  const myStep = coverageRows(rows, [{ ...MYSTEP, coversJson: JSON.stringify([{ teacherId: "t-asraf", subjects: [] }]) }]);
  const asrafRows = myStep.filter((row) => row.period === 1);
  assert.equal(asrafRows.length, 1, "a replaced lesson must not be duplicated");
  assert.equal(asrafRows[0].teacherId, "t-mystep");
  assert.equal(asrafRows[0].coveredFor, "t-asraf");

  const shared = coverageRows(rows, [{ ...PRAK, coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }]) }]);
  const noraBa = shared.filter((row) => row.period === 2);
  const noraSn = shared.filter((row) => row.period === 3);
  assert.deepEqual(noraBa.map((row) => row.teacherId).sort(), ["t-nora", "t-prak"], "both teachers are in that class");
  assert.equal(noraBa.find((row) => row.teacherId === "t-prak").sharedWith, "t-nora");
  assert.deepEqual(noraSn.map((row) => row.teacherId), ["t-nora"], "a subject outside the link is untouched");
});

test("a practical teacher can share the lessons of more than one teacher", () => {
  const teachers = [{ ...PRAK, coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: [] }, { teacherId: "t-wee", subjects: [] }]) }];
  const links = coverLinks(teachers);
  assert.deepEqual(links.map((link) => link.coveredId), ["t-nora", "t-wee"]);
  const effective = coverageRows(rows, teachers);
  assert.deepEqual(effective.filter((row) => row.teacherId === "t-prak").map((row) => row.period), [2, 3, 4]);
  assert.equal(fullyCoveredIds({ teachers, rows }).size, 0, "a practical teacher never hides anyone");
});

test("a Personel MySTEP hides a fully replaced teacher, and never one still teaching something", () => {
  const everything = [{ ...MYSTEP, coversJson: JSON.stringify([{ teacherId: "t-asraf", subjects: [] }]) }];
  assert.deepEqual([...fullyCoveredIds({ teachers: [ASRAF, ...everything], rows })], ["t-asraf"]);
  assert.deepEqual([...coverageHiddenIds(makeDb([ASRAF, ...everything]))], ["t-asraf"]);
  const subset = [{ ...MYSTEP, coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }]) }];
  assert.equal(fullyCoveredIds({ teachers: [NORA, ...subset], rows }).size, 0, "SN is still theirs to teach");
  const legacy = [{ ...MYSTEP, coversTeacherId: "t-asraf", coversSubjects: "" }];
  assert.deepEqual([...fullyCoveredIds({ teachers: [ASRAF, ...legacy], rows })], ["t-asraf"], "older records still hide");
});

test("the practical teacher's own timetable can be produced from the shared lessons", () => {
  const teachers = [NORA, WEE, { ...PRAK, coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }, { teacherId: "t-wee", subjects: [] }]) }];
  const effective = coverageRows(rows, teachers);
  const own = effective.filter((row) => row.teacherId === "t-prak");
  assert.deepEqual(own.map((row) => `${row.day}${row.period}:${row.subject}`), ["JUM2:BA", "JUM4:MT"]);
  assert.deepEqual(coveredTeacherSubjects(rows, "t-nora"), ["BA", "SN"]);
  const pairs = sharedPairs(rows, teachers);
  assert.deepEqual([...pairs.get(sharedPairKey(rows[1]))].sort(), ["t-nora", "t-prak"]);
});

test("a shared lesson needs no relief while the other teacher of the pair is in school", () => {
  const date = "2026-09-11"; // Friday
  const teachers = [ASRAF, NORA, WEE, { ...PRAK, coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }]) }];
  const away = { id: "a1", date, teacherId: "t-nora", allDay: true, periods: [], status: "active", createdAt: date, updatedAt: date };
  const drafts = buildReliefDrafts(makeDb(teachers, { absences: [away] }), date);
  assert.deepEqual(drafts.map((draft) => draft.period), [3], "period 2 is already covered by the practical teacher");
  const bothAway = [away, { ...away, id: "a2", teacherId: "t-prak" }];
  const bothDrafts = buildReliefDrafts(makeDb(teachers, { absences: bothAway }), date);
  assert.deepEqual(bothDrafts.map((draft) => draft.period).sort(), [2, 3], "with nobody in the class a relief is needed after all");
});

test("the Apps Script public payload applies the same cover rules", () => {
  const source = readFileSync(new URL("../apps-script/Builder.gs", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("function coverSubjects_("), source.indexOf("// One cache entry per day"));
  const context = { Object, JSON, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(block, context);
  const teachers = [
    { id: "t-asraf", name: "ASRAF", active: true, position: "Guru Akademik Biasa" },
    { id: "t-nora", name: "NORA", active: true, position: "Guru Akademik Biasa" },
    { id: "t-mystep", name: "MYSTEP", active: true, position: "Personel MySTEP", coversJson: JSON.stringify([{ teacherId: "t-asraf", subjects: [] }]) },
    { id: "t-prak", name: "PRAK", active: true, position: "Guru Praktikal", coversTeacherId: "t-nora", coversSubjects: "BA" },
  ];
  const serverRows = context.coverRows_(rows, teachers);
  const clientRows = coverageRows(rows, teachers);
  assert.deepEqual(
    [...serverRows.map((row) => `${row.teacherId}|${row.period}`)].sort(),
    [...clientRows.map((row) => `${row.teacherId}|${row.period}`)].sort(),
    "the public timetable must match the app",
  );
  assert.deepEqual([...Object.keys(context.coverHiddenIds_(teachers, rows))], ["t-asraf"]);
});
