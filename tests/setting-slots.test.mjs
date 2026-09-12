import test from "node:test";
import assert from "node:assert/strict";
import { PERIODS } from "../data.js";
import { SETTING_SUBJECT, isSettingRow, mergeSettingRows, settingKey, settingSelectionFromRows, settingSignature } from "../setting-slots.js";

const VERSION = "v1";
const lesson = { versionId: VERSION, teacherId: "t1", day: "JUM", period: 3, startTime: "08:30", endTime: "09:00", subject: "BA", className: "3 BIJAK" };
const otherTeacher = { versionId: VERSION, teacherId: "t9", day: "JUM", period: 1, startTime: "07:30", endTime: "08:00", subject: "MT", className: "4 BIJAK" };
const oldSetting = { versionId: VERSION, teacherId: "t1", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: SETTING_SUBJECT, className: "", isDuty: true };
const importedDuty = { versionId: VERSION, teacherId: "t1", day: "SEL", period: 2, startTime: "08:00", endTime: "08:30", subject: "PK", className: "", isDuty: true };
const rows = [lesson, otherTeacher, oldSetting, importedDuty];

// The guard that stops one admin overwriting another admin's timetable compares these signatures,
// so the signature has to change for every real change and for nothing else.
test("the version signature ignores order but notices every real change", () => {
  const base = settingSignature({ rows, versionId: VERSION });
  assert.equal(settingSignature({ rows: [...rows].reverse(), versionId: VERSION }), base, "row order changed the signature");
  assert.notEqual(settingSignature({ rows: rows.filter((row) => row !== otherTeacher), versionId: VERSION }), base, "a removed row does not change the signature");
  assert.notEqual(settingSignature({ rows: [...rows, { ...lesson, period: 4, startTime: "09:00", endTime: "09:30" }], versionId: VERSION }), base, "an added row does not change the signature");
  assert.notEqual(settingSignature({ rows: rows.map((row) => (row === lesson ? { ...lesson, className: "5 BIJAK" } : row)), versionId: VERSION }), base, "a moved class does not change the signature");
  assert.notEqual(settingSignature({ rows: rows.map((row) => (row === lesson ? { ...lesson, subject: "MT" } : row)), versionId: VERSION }), base, "a changed subject does not change the signature");
  assert.notEqual(settingSignature({ rows: rows.map((row) => (row === lesson ? { ...lesson, startTime: "09:30" } : row)), versionId: VERSION }), base, "a changed clock does not change the signature");
  assert.notEqual(settingSignature({ rows: rows.map((row) => (row === oldSetting ? { ...oldSetting, isDuty: false } : row)), versionId: VERSION }), base, "a duty row turned into a lesson does not change the signature");
});

test("the signature covers one version only, so another version cannot fake a change", () => {
  const base = settingSignature({ rows, versionId: VERSION });
  const elsewhere = { ...lesson, versionId: "v2", period: 9 };
  assert.equal(settingSignature({ rows: [...rows, elsewhere], versionId: VERSION }), base, "another version's rows leaked into the signature");
  assert.notEqual(settingSignature({ rows, versionId: "v2" }), base, "two different versions share one signature");
});

test("the signature survives the round trip through a save", () => {
  const before = settingSignature({ rows, versionId: VERSION });
  const { rows: after } = mergeSettingRows({ rows, teacherId: "t1", versionId: VERSION, selected: [], periods: PERIODS });
  assert.notEqual(settingSignature({ rows: after, versionId: VERSION }), before, "dropping a claimed period left the signature unchanged");
});

test("only a PEMULIHAN duty row counts as a setting row", () => {
  assert.equal(isSettingRow(oldSetting), true);
  assert.equal(isSettingRow({ ...oldSetting, subject: "PEM" }), false);
  assert.equal(isSettingRow({ ...lesson, isDuty: true, subject: SETTING_SUBJECT }), true);
  assert.equal(isSettingRow(lesson), false);
  assert.equal(isSettingRow(importedDuty), false, "a duty row imported from a PDF is not a setting row");
});

// The grid that used to be asserted here is now built by week-view.js, which owns the cell states;
// setting-grid.test covers the part that matters for claiming: occupied cells stay out of reach.
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
