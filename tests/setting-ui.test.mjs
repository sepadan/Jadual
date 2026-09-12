import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The feature is wired from three places that can drift apart: the card offers the button only for a
// remedial teacher, the dialog holds the grid, and the save path must send the whole version to
// Sheets because the server rewrites that version's rows.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const app = read("app.js");
const css = read("styles.css");

test("the teacher profile offers Guru Pemulihan as a standard position", () => {
  assert.match(html, /<option>Guru Pemulihan<\/option>/, "the position cannot be chosen on the teacher card");
});

test("the teacher card offers the timetable button, and only for a remedial teacher", () => {
  const card = app.slice(app.indexOf("function renderTeachers"), app.indexOf("function renderTeacherRestoreNotices"));
  assert.match(card, /teacher\.position === "Guru Pemulihan"/, "the button is not gated on the role");
  assert.match(card, /data-setting-slots="\$\{esc\(teacher\.id\)\}"/, "the button does not carry the teacher id");
  assert.match(card, /Tetapan Jadual/, "the button label is missing from the card");
  assert.match(card, /\[data-setting-slots\]'\)\.forEach\(\(button\) => button\.addEventListener\("click", \(\) => openSettingDialog\(button\.dataset\.settingSlots\)\)\)/, "the card button is not wired");
});

test("the weekly dialog exists with its grid and its controls", () => {
  for (const id of ["settingDialog", "settingDialogTitle", "settingGrid", "settingCount", "saveSettingSlots", "clearSettingSlots"]) {
    assert.ok(html.includes(`id="${id}"`), `the dialog is missing #${id}`);
  }
  assert.match(html, /data-close-setting/, "there is no way to close the dialog without saving");
  assert.match(app, /\$\("#saveSettingSlots"\)\.addEventListener\("click", saveSettingSlots\)/, "save is not wired");
  assert.match(app, /\$\("#clearSettingSlots"\)\.addEventListener\("click", clearSettingSlots\)/, "clear is not wired");
});

test("a cell can be claimed by touch and by keyboard, and refuses a lesson", () => {
  assert.match(app, /role="button" tabindex="0" aria-pressed="\$\{chosen\}"/, "the cells are not reachable or announced");
  assert.match(app, /if \(event\.key !== "Enter" && event\.key !== " "\) return;/, "the grid cannot be operated from a keyboard");
  assert.match(app, /if \(cell\.state === "lesson"\) return/, "a teaching period is offered as a free space");
  assert.match(css, /\.setting-cell\.free \{ cursor: pointer/, "a free space does not look tappable");
  assert.match(css, /\.setting-grid \{ overflow-x: auto/, "the wide grid cannot be scrolled on a phone");
});

test("saving sends every row of the active version, because Sheets rewrites that version", () => {
  const save = app.slice(app.indexOf("function settingVersion"), app.indexOf("function validClockTime"));
  assert.match(save, /const versionRows = db\.schedule\.filter\(\(row\) => row\.versionId === version\.id\)/, "only the changed rows would travel and the rest of the version would be lost");
  assert.match(save, /remoteWrite\("importSchedule", \{ version, rows: versionRows \}/, "the timetable is not saved through the schedule handler");
  assert.match(save, /return officialScheduleVersion\(db\) \|\| selectedScheduleVersion\(db, todayIso\(\)\)/, "the version being edited is not the active one");
  assert.match(save, /if \(!version\) return toast\(/, "saving without an active timetable is not refused");
});

test("the offline shell carries the new module so a phone can load it", () => {
  const sw = read("sw.js");
  assert.match(sw, /"\.\/setting-slots\.js\?v=[\d.]+"/, "setting-slots.js is missing from the service-worker cache list");
});

test("the card button is big enough for a thumb on a phone", () => {
  // Slice from the phone block itself: an earlier comment mentions @media print, so search forward.
  const start = css.indexOf("@media (max-width: 760px)");
  const mobile = css.slice(start, start + css.slice(start).indexOf("@media print"));
  assert.match(mobile, /\.mini-button\.setting \{ min-height: 40px; \}/, "the remedial teacher's card button is below the phone touch target");
});
