import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { canCover, coverLinks, coverSubjects, coveredTeacherSubjects, coverageRows } from "../teacher-coverage.js";

// These two functions are the ones the live app runs into a DOM. They are executed here against fake
// elements, because a source-level check cannot tell whether the covered teacher was offered back.
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from app.js`);
  const end = app.indexOf("\n}", start);
  return app.slice(start, end + 2);
}

function makeElement(init = {}) {
  const classes = new Set(init.classes || []);
  return {
    innerHTML: "",
    value: init.value || "",
    checked: init.checked ?? false,
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
  };
}

const teachers = [
  { id: "t-asraf", name: "ASRAF", position: "Guru Akademik Biasa", active: true },
  { id: "t-nora", name: "NORA", position: "Guru Akademik Biasa", active: true },
  { id: "t-mystep", name: "MYSTEP A", position: "Personel MySTEP", active: true, coversTeacherId: "t-asraf", coversSubjects: "" },
  { id: "t-prak", name: "PRAK B", position: "Guru Praktikal", active: true, coversTeacherId: "t-nora", coversSubjects: "BA" },
];

const rows = [
  { versionId: "v1", teacherId: "t-asraf", day: "JUM", period: 1, subject: "BA", className: "3 BIJAK" },
  { versionId: "v1", teacherId: "t-nora", day: "JUM", period: 2, subject: "BA", className: "6 BIJAK" },
  { versionId: "v1", teacherId: "t-nora", day: "JUM", period: 3, subject: "SN", className: "6 BIJAK" },
];

function harness({ teacherId, position, covers, allChecked, teacherAllChecked = allChecked, coversValue = covers }) {
  const elements = {
    "#teacherCoverWrap": makeElement({ classes: ["hidden"] }),
    "#teacherCoverSubjects": makeElement({ classes: ["hidden"] }),
    "#teacherCoverSubjectList": makeElement(),
    "#teacherCovers": makeElement({ value: coversValue }),
    "#teacherCoverAll": makeElement({ checked: teacherAllChecked }),
    "#teacherId": makeElement({ value: teacherId }),
    "#teacherPosition": makeElement({ value: position }),
    "#teacherPositionOther": makeElement({ value: "" }),
  };
  const context = {
    db: { teachers, schedule: rows },
    $: (selector) => elements[selector] ?? makeElement(),
    esc: (value) => String(value),
    canCover,
    coverLinks,
    coverSubjects,
    coveredTeacherSubjects,
    // behave like the real resolver: taken-over lessons already read as the covering teacher's
    effectiveScheduleRows: () => coverageRows(rows, teachers),
    // deliberately hides the covered teacher, the way the real list does
    activeTeachers: () => teachers.filter((teacher) => teacher.active && teacher.id !== "t-asraf"),
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource("currentTeacherPosition")}\n${functionSource("renderTeacherCover")}\n${functionSource("renderTeacherCoverSubjects")}`, context);
  return { elements, context };
}

test("editing the covering teacher still offers the teacher they already replace", () => {
  const { elements, context } = harness({ teacherId: "t-mystep", position: "Personel MySTEP", covers: "t-asraf", allChecked: true });
  vm.runInContext("renderTeacherCover()", context);
  const select = elements["#teacherCovers"];
  assert.match(select.innerHTML, /value="t-asraf"/, "the replaced teacher vanished from the picker, so the link could not be kept");
  assert.equal(select.value, "t-asraf", "the existing choice must stay selected");
  assert.equal(elements["#teacherCoverWrap"].classList.contains("hidden"), false);
});

test("the subject chips list every subject of the replaced teacher, taken over ones included", () => {
  const { elements, context } = harness({ teacherId: "t-prak", position: "Guru Praktikal", covers: "t-nora", allChecked: false });
  vm.runInContext("renderTeacherCover()", context);
  const chips = elements["#teacherCoverSubjectList"].innerHTML;
  assert.match(chips, /value="BA"/);
  assert.match(chips, /value="SN"/);
  assert.match(chips, /value="BA" checked/, "the subject already taken over must be ticked");
  assert.equal(elements["#teacherCoverSubjects"].classList.contains("hidden"), false);
});

test("an ordinary position hides the cover controls", () => {
  const { elements, context } = harness({ teacherId: "t-asraf", position: "Guru Akademik Biasa", covers: "" });
  vm.runInContext("renderTeacherCover()", context);
  assert.equal(elements["#teacherCoverWrap"].classList.contains("hidden"), true);
});
