import test from "node:test";
import assert from "node:assert/strict";
import { PERIODS, DAY_CODES } from "../data.js";
import { SETTING_SUBJECT } from "../setting-slots.js";
import { effectivePeriods, restColumns, subjectColour, weekGrid } from "../week-view.js";

// The grid is the shape the school asked for (the builder's Lihat & Edit screen): days down the
// side, periods across the top, a REHAT column where the school clock has a break, a colour per
// subject and a legend. These rows are one teacher's week in the active version.
const rows = [
  { versionId: "v1", teacherId: "t1", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: "BM", className: "3 BIJAK" },
  { versionId: "v1", teacherId: "t1", day: "IS", period: 4, startTime: "09:00", endTime: "09:30", subject: "MT", className: "4 BIJAK" },
  { versionId: "v1", teacherId: "t1", day: "RAB", period: 2, startTime: "08:00", endTime: "08:30", subject: "BM", className: "3 BIJAK" },
  { versionId: "v1", teacherId: "t1", day: "JUM", period: 1, startTime: "07:30", endTime: "08:00", subject: SETTING_SUBJECT, className: "", isDuty: true },
  { versionId: "v1", teacherId: "t1", day: "KHA", period: 7, startTime: "10:50", endTime: "11:20", subject: "PERHIMPUNAN", className: "", isDuty: true },
];
const grid = weekGrid({ rows, days: DAY_CODES, periods: PERIODS, todayCode: "RAB" });

const cellOf = (model, day, period) => model.rows.find((line) => line.day === day)?.cells.find((cell) => cell.period === period);

test("days are the rows and periods are the columns, like the builder screen", () => {
  assert.deepEqual(grid.rows.map((line) => line.day), DAY_CODES, "the school days are not the rows");
  const periods = grid.columns.filter((column) => column.kind === "period").map((column) => column.period);
  assert.equal(periods.length, PERIODS.length, "not every period is a column");
  assert.equal(grid.rows.every((line) => line.cells.length === PERIODS.length), true, "a day is missing cells");
  assert.equal(grid.columns[0].kind, "label", "the day column is not first");
});

test("every period column carries the clock of that period", () => {
  const first = grid.columns.find((column) => column.kind === "period" && column.period === 1);
  assert.equal(first.startTime, "07:30", "the period clock is wrong");
  const sixth = grid.columns.find((column) => column.kind === "period" && column.period === 6);
  assert.equal(sixth.startTime, "10:20", "the clock after the break is wrong");
});

test("the break in the school clock becomes one REHAT column spanning every day", () => {
  const rests = grid.columns.filter((column) => column.kind === "rest");
  assert.equal(rests.length, 1, "the 20 minute break after period 5 did not become a REHAT column");
  assert.equal(rests[0].label, "REHAT");
  assert.equal(rests[0].after, 5, "the break is not placed after period 5");
  // the rest column must sit between period 5 and period 6
  const order = grid.columns.map((column) => (column.kind === "period" ? column.period : column.kind));
  assert.deepEqual(order.slice(order.indexOf(5), order.indexOf(6) + 1), [5, "rest", 6], "REHAT is not between period 5 and 6");
});

test("a break is only drawn where the clock really has a gap", () => {
  const tight = restColumns([{ period: 1, startTime: "07:30", endTime: "08:00" }, { period: 2, startTime: "08:00", endTime: "08:30" }]);
  assert.equal(tight.length, 0, "a break was invented between back-to-back periods");
});

test("a lesson block carries the subject and the class", () => {
  const cell = cellOf(grid, "IS", 1);
  assert.equal(cell.state, "lesson");
  assert.equal(cell.subject, "BM");
  assert.equal(cell.label, "3 BIJAK");
  assert.match(cell.colour, /^#[0-9a-f]{6}$/i, "the block has no colour");
});

test("masa tetapan is its own state, not a lesson and not a free space", () => {
  assert.equal(cellOf(grid, "JUM", 1).state, "setting", "masa tetapan reads as a lesson or a space");
  assert.equal(cellOf(grid, "KHA", 7).state, "duty", "another duty row is not a lesson");
  assert.equal(cellOf(grid, "SEL", 3).state, "free", "an empty period is not free");
  assert.equal(cellOf(grid, "SEL", 3).subject, "", "a free space carries a subject");
});

test("the same subject keeps the same colour, and the school colour wins when it exists", () => {
  assert.equal(subjectColour("BM", {}), subjectColour("bm", {}), "the colour depends on the spelling of the code");
  assert.equal(subjectColour("BM", { BM: "#123456" }), "#123456", "the school's own colour was ignored");
  assert.equal(cellOf(grid, "IS", 1).colour, cellOf(grid, "RAB", 2).colour, "the same subject is drawn in two colours");
  assert.notEqual(cellOf(grid, "IS", 1).colour, cellOf(grid, "IS", 4).colour, "different subjects share one colour");
});

test("the legend lists every subject shown, once", () => {
  const codes = grid.legend.map((item) => item.code).sort();
  assert.deepEqual(codes, ["BM", "MT", SETTING_SUBJECT, "PERHIMPUNAN"], "the legend does not match the grid");
  assert.equal(new Set(grid.legend.map((item) => item.colour)).size, grid.legend.length, "two legend chips share a colour");
});

test("today is marked on the day row so a teacher can find the current line", () => {
  assert.equal(grid.rows.filter((line) => line.today).map((line) => line.day).join(), "RAB", "today is not marked, or marked twice");
});

test("the version's own clock is used when it differs from the school default", () => {
  const custom = weekGrid({
    rows: [{ versionId: "v1", teacherId: "t1", day: "IS", period: 1, startTime: "07:45", endTime: "08:15", subject: "BM", className: "1 AMANAH" }],
    days: DAY_CODES,
    periods: PERIODS,
  });
  const column = custom.columns.find((item) => item.kind === "period" && item.period === 1);
  assert.equal(column.startTime, "07:45", "the timetable's own start time was ignored");
  assert.equal(effectivePeriods([{ period: 3, startTime: "09:05", endTime: "09:35" }], PERIODS).find((period) => period.period === 3).startTime, "09:05");
});

test("a grid is one teacher's week: another teacher's lesson at the same slot cannot lock it", () => {
  // This happened for real: the remedial teacher's grid showed another teacher's lesson at 07:30
  // Monday, so the period the remedial teacher had claimed was drawn locked and could not be edited.
  const other = { versionId: "v1", teacherId: "t9", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: "BI", className: "6 BIJAK" };
  const mine = { versionId: "v1", teacherId: "t1", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: SETTING_SUBJECT, className: "", isDuty: true };
  const scoped = weekGrid({ rows: [other, mine], teacherId: "t1", days: DAY_CODES, periods: PERIODS });
  assert.equal(cellOf(scoped, "IS", 1).state, "setting", "the other teacher's row took the slot");
  assert.equal(scoped.legend.some((item) => item.code === "BI"), false, "the legend listed another teacher's subject");
});

test("a duplicate row cannot hide the lesson already shown", () => {
  const doubled = weekGrid({ rows: [...rows, { versionId: "v1", teacherId: "t1", day: "IS", period: 1, subject: "BI", className: "5 BIJAK" }], days: DAY_CODES, periods: PERIODS });
  assert.equal(cellOf(doubled, "IS", 1).subject, "BM", "a later duplicate replaced the lesson shown");
});

test("a grid with nothing in it is still a full week", () => {
  const empty = weekGrid({ rows: [], days: DAY_CODES, periods: PERIODS });
  assert.equal(empty.rows.length, DAY_CODES.length);
  assert.equal(empty.legend.length, 0, "an empty grid produced a legend");
  assert.equal(empty.total, 0);
});
