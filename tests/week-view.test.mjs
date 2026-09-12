import test from "node:test";
import assert from "node:assert/strict";
import { PERIODS, DAY_CODES } from "../data.js";
import { SETTING_SUBJECT } from "../setting-slots.js";
import { WEEK_FREE_LABEL, weekLessonCount, weekTableModel } from "../week-view.js";

// A teacher reading their timetable wants the whole week in one look. The pane used to show a single
// day, so the tests below pin the two things that made the day view wrong: every school day is
// present, and every period of every day is a cell even when nothing is taught.
const rows = [
  { versionId: "v1", teacherId: "t1", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: "BA", className: "3 BIJAK" },
  { versionId: "v1", teacherId: "t1", day: "IS", period: 5, startTime: "09:30", endTime: "10:00", subject: "MT", className: "4 BIJAK" },
  { versionId: "v1", teacherId: "t1", day: "JUM", period: 1, startTime: "07:30", endTime: "08:00", subject: "PEMULIHAN", className: "", isDuty: true },
  { versionId: "v1", teacherId: "t9", day: "RAB", period: 2, startTime: "08:00", endTime: "08:30", subject: "BI", className: "1 BIJAK" },
];
const timeFor = (period) => (PERIODS.find((item) => Number(item.period) === period)?.startTime || "");
const model = weekTableModel({ rows, days: DAY_CODES, periods: PERIODS, timeFor, todayCode: "RAB" });

test("the week shows all five school days, not the day that was picked", () => {
  assert.deepEqual(model.columns.map((column) => column.code), ["IS", "SEL", "RAB", "KHA", "JUM"], "a school day is missing from the week");
  assert.deepEqual(model.rows.map((row) => row.period), PERIODS.map((item) => Number(item.period)), "a period is missing from the week");
  for (const row of model.rows) {
    assert.equal(row.cells.length, 5, `period ${row.period} does not have one cell per school day`);
  }
});

test("a lesson cell names the subject and the class", () => {
  const cell = model.rows.find((row) => row.period === 1).cells.find((item) => item.day === "IS");
  assert.equal(cell.state, "lesson");
  assert.equal(cell.subject, "BA");
  assert.equal(cell.label, "3 BIJAK");
});

test("setting time is not shown as a lesson and not as a free space", () => {
  const cell = model.rows.find((row) => row.period === 1).cells.find((item) => item.day === "JUM");
  assert.equal(cell.state, "setting", "a remedial setting period is indistinguishable from a lesson");
  assert.equal(cell.subject, SETTING_SUBJECT);
  assert.equal(cell.label, "Aktiviti", "a duty row has no class and must not read as one");
  assert.equal(cell.label === WEEK_FREE_LABEL, false, "setting time is offered as a free space");
});

test("an untaught period is a free cell with the clock of that period", () => {
  const line = model.rows.find((row) => row.period === 4);
  assert.equal(line.cells.every((cell) => cell.state === "free"), true, "an empty period is not marked free");
  assert.equal(line.cells[0].label, WEEK_FREE_LABEL);
  assert.match(line.time, /^[0-9]{2}:[0-9]{2}$/, "the period has no clock beside it");
});

test("today is marked, so the teacher can find the current column", () => {
  assert.equal(model.columns.find((column) => column.code === "RAB").today, true, "today is not marked in the week");
  assert.equal(model.columns.filter((column) => column.today).length, 1, "more than one day is marked as today");
});

test("the week holds the rows it is given, and the caller decides whose week it is", () => {
  // renderSchedule filters by the selected teacher or class before calling the model, so the model
  // must place exactly what it receives — no more (another teacher) and no less.
  const filtered = weekTableModel({ rows: rows.filter((row) => row.teacherId === "t1"), days: DAY_CODES, periods: PERIODS, timeFor });
  assert.equal(weekLessonCount(filtered), 3, "the week dropped or invented rows");
  assert.equal(filtered.rows.flatMap((row) => row.cells).some((cell) => cell.subject === "BI"), false, "another teacher's lesson leaked into the week");
});

test("a duplicate row cannot hide the lesson already shown", () => {
  const duplicate = weekTableModel({
    rows: [...rows, { versionId: "v1", teacherId: "t1", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: "XX", className: "6 BIJAK" }],
    days: DAY_CODES, periods: PERIODS, timeFor, todayCode: "",
  });
  const cell = duplicate.rows.find((row) => row.period === 1).cells.find((item) => item.day === "IS");
  assert.equal(cell.subject, "BA", "a later duplicate replaced the lesson that was already placed");
});

test("a row for a day the school does not use is ignored", () => {
  const saturday = weekTableModel({ rows: [{ day: "SAB", period: 1, subject: "BA", className: "3 BIJAK" }], days: DAY_CODES, periods: PERIODS, timeFor });
  assert.equal(weekLessonCount(saturday), 0, "a row outside the school week was placed in the grid");
});
