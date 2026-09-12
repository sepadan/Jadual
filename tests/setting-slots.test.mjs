import test from "node:test";
import assert from "node:assert/strict";
import { PERIODS } from "../data.js";
import { SETTING_SUBJECT, isSettingRow, mergeSettingRows, settingGridModel, settingKey, settingSelectionFromRows } from "../setting-slots.js";

const VERSION = "v1";
const lesson = { versionId: VERSION, teacherId: "t1", day: "JUM", period: 3, startTime: "08:30", endTime: "09:00", subject: "BA", className: "3 BIJAK" };
const otherTeacher = { versionId: VERSION, teacherId: "t9", day: "JUM", period: 1, startTime: "07:30", endTime: "08:00", subject: "MT", className: "4 BIJAK" };
const oldSetting = { versionId: VERSION, teacherId: "t1", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: SETTING_SUBJECT, className: "", isDuty: true };
const importedDuty = { versionId: VERSION, teacherId: "t1", day: "SEL", period: 2, startTime: "08:00", endTime: "08:30", subject: "PK", className: "", isDuty: true };
const rows = [lesson, otherTeacher, oldSetting, importedDuty];

test("only a PEMULIHAN duty row counts as a setting row", () => {
  assert.equal(isSettingRow(oldSetting), true);
  assert.equal(isSettingRow({ ...oldSetting, subject: "PEM" }), false);
  assert.equal(isSettingRow({ ...lesson, isDuty: true, subject: SETTING_SUBJECT }), true);
  assert.equal(isSettingRow(lesson), false);
  assert.equal(isSettingRow(importedDuty), false, "a duty row imported from a PDF is not a setting row");
});

test("the weekly grid separates lessons, claimed periods and free spaces", () => {
  const model = settingGridModel({ rows, teacherId: "t1", periods: PERIODS });
  const at = (day, period) => model.cells.find((cell) => cell.day === day && cell.period === period);
  assert.equal(model.cells.length, 5 * PERIODS.length);
  assert.equal(at("JUM", 3).state, "lesson");
  assert.equal(at("JUM", 3).subject, "BA");
  assert.equal(at("IS", 1).state, "setting");
  assert.equal(at("SEL", 2).state, "lesson", "an imported duty row keeps the period out of reach");
  assert.equal(at("IS", 4).state, "free");
  assert.equal(at("IS", 1).startTime, "07:30", "the grid carries the official clock of the period");
});

test("the dialog opens with this teacher's claimed periods already ticked", () => {
  assert.deepEqual(settingSelectionFromRows({ rows, teacherId: "t1" }), [settingKey("IS", 1)]);
  assert.deepEqual(settingSelectionFromRows({ rows: [{ ...oldSetting, versionId: "v2" }], teacherId: "t1" }), [settingKey("IS", 1)]);
  assert.deepEqual(settingSelectionFromRows({ rows, teacherId: "t9" }), []);
});

test("saving writes duty rows with the official clock and drops the previous ticks", () => {
  const result = mergeSettingRows({ rows, teacherId: "t1", versionId: VERSION, selected: ["JUM-1", "JUM-2"], periods: PERIODS });
  assert.equal(result.added, 2);
  assert.equal(result.removed, 1, "the earlier setting rows of this teacher must be replaced");
  assert.equal(result.skipped, 0);
  const added = result.rows.filter(isSettingRow);
  assert.deepEqual(added.map((row) => `${row.day}-${row.period}`), ["JUM-1", "JUM-2"]);
  assert.deepEqual(added[0], { versionId: VERSION, teacherId: "t1", day: "JUM", period: 1, startTime: "07:30", endTime: "08:00", subject: SETTING_SUBJECT, className: "", isDuty: true });
  assert.ok(added.every((row) => row.className === ""), "a setting period must not appear as a class in the pickers");
  assert.ok(result.rows.includes(lesson) && result.rows.includes(otherTeacher), "lessons of other teachers and days survive");
});

test("a period that already holds a lesson is never overwritten by a setting tick", () => {
  const result = mergeSettingRows({ rows, teacherId: "t1", versionId: VERSION, selected: ["JUM-3", "SEL-2", "JUM-1"], periods: PERIODS });
  assert.equal(result.added, 1, "only the genuinely free period is claimed");
  assert.equal(result.skipped, 2, "the lesson and the imported duty period are refused");
  assert.ok(result.rows.includes(lesson), "the lesson itself is untouched");
  assert.ok(result.rows.includes(importedDuty), "an imported duty row is neither replaced nor duplicated");
  assert.equal(result.rows.filter((row) => row.day === "JUM" && row.period === 3).length, 1);
});

test("nonsense or repeated ticks are ignored instead of corrupting the timetable", () => {
  const result = mergeSettingRows({ rows, teacherId: "t1", versionId: VERSION, selected: ["JUM-1", "jum-1", "AHAD-2", "JUM-99", ""], periods: PERIODS });
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 4);
});

test("settings of another version are left alone so an old timetable keeps its records", () => {
  const otherVersion = { ...oldSetting, versionId: "v0", day: "RAB", period: 5 };
  const result = mergeSettingRows({ rows: [...rows, otherVersion], teacherId: "t1", versionId: VERSION, selected: ["JUM-1"], periods: PERIODS });
  assert.ok(result.rows.includes(otherVersion), "a setting row from another version must survive");
  assert.equal(result.removed, 1, "only the rows of the version being edited are replaced");
});
