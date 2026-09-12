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

// The button belongs to the profile dialog now, never to the card face: a card that carries it again
// would put a labelled button in the row of icon buttons the whole list shares.
test("the card no longer offers the timetable button", () => {
  const card = app.slice(app.indexOf("function renderTeachers"), app.indexOf("function renderTeacherRestoreNotices"));
  assert.doesNotMatch(card, /data-setting-slots/, "the button is back on the card face");
  assert.match(card, /<div class="teacher-actions"><button class="mini-button" data-edit-teacher=/, "the edit button was lost with it");
});

test("the profile dialog holds the timetable button, and only for a saved remedial teacher", () => {
  const dialog = html.slice(html.indexOf('id="teacherDialog"'), html.indexOf('id="settingDialog"'));
  assert.match(dialog, /<button type="button" class="button ghost hidden" id="teacherSettingSlots"/, "the button is missing from the profile or starts visible");
  assert.match(dialog, /tetapan jadual/i, "the button has no label");
  const toggle = app.slice(app.indexOf("function toggleTeacherSettingButton"), app.indexOf("function currentTeacherPosition"));
  assert.match(toggle, /db\.teachers\.find\(\(item\) => item\.id === \$\("#teacherId"\)\.value\)/, "a brand-new teacher would be offered the button before it is saved");
  assert.match(toggle, /currentTeacherPosition\(\) !== "Guru Pemulihan"/, "a teacher of another jawatan would be offered the button");
  assert.match(app, /toggleTeacherSettingButton\(\);\s*\n\s*populatePreschoolReliefTimes/, "the button is not refreshed when the profile opens");
  assert.match(app, /\$\('#teacherPosition'\)\.addEventListener\('change',[\s\S]*toggleTeacherSettingButton\(\);/, "choosing Guru Pemulihan in the dropdown does not reveal the button");
});

test("opening the grid from the profile closes the profile first", () => {
  const wiring = app.slice(app.indexOf("$('#teacherSettingSlots').addEventListener"), app.indexOf("$('#downloadTeachers').addEventListener"));
  assert.match(wiring, /\$\('#teacherDialog'\)\.close\(\)/, "a second dialog would stack on top of the profile");
  assert.ok(wiring.indexOf("$('#teacherId').value") < wiring.indexOf("openSettingDialog(id)"), "the grid opens for the wrong teacher");
  assert.match(wiring, /if\(!id\) return;/, "an unsaved profile could open the grid for nobody");
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
  assert.match(save, /const versionRows = db\.schedule\.filter\(\(row\) => row\.versionId === active\.id\)/, "only the changed rows would travel and the rest of the version would be lost");
  assert.match(save, /remoteWrite\("importSchedule", \{ version: active, rows: versionRows \}/, "the timetable is not saved through the schedule handler");
  assert.match(save, /return officialScheduleVersion\(db\) \|\| selectedScheduleVersion\(db, todayIso\(\)\)/, "the version being edited is not the active one");
  assert.match(save, /if \(!version\) return toast\(/, "saving without an active timetable is not refused");
});

// The whole-version rewrite is why a stale dialog used to be able to erase another admin's work:
// the check must happen before the merge, and it must refuse instead of guessing.
test("a fresh save checks the school revision before rewriting the version", () => {
  const save = app.slice(app.indexOf("async function settingDriftCheck"), app.indexOf("function validClockTime"));
  assert.match(save, /await api\.status\(\)/, "the school revision is never read before saving");
  assert.match(save, /await syncData\(false\)/, "the newer timetable is never loaded, so the admin cannot see what changed");
  assert.match(save, /if \(fresh && fresh\.id === version\.id && freshSignature === expected\.signature\) return \{ ok: true \}/, "an unchanged version is not recognised as safe to write");
  assert.match(save, /renderSettingGrid\(\)/, "the grid is not refreshed after the drift, so the ticks would be stale");
  const guarded = save.slice(save.indexOf("const check = await settingDriftCheck"));
  assert.ok(guarded.indexOf("if (!check.ok) return toast") < guarded.indexOf("mergeSettingRows"), "the merge runs before the drift check");
  assert.match(save, /catch \(error\) \{[\s\S]*Simpanan tidak dibuat/, "a failed check writes anyway instead of refusing");
});

test("the dialog remembers the version it opened with", () => {
  const open = app.slice(app.indexOf("function openSettingDialog"), app.indexOf("function renderSettingGrid"));
  assert.match(open, /settingGuard = \{ revision: Number\(db\.revision \|\| 0\), versionId: version\.id, signature: settingVersionSignature\(version\) \}/, "the dialog opens without a snapshot, so drift cannot be detected");
});

test("a claim on a period that has become a lesson is dropped, not written", () => {
  const grid = app.slice(app.indexOf("function renderSettingGrid"), app.indexOf("function toggleSettingCell"));
  assert.match(grid, /if \(!cell \|\| cell\.state === "lesson"\) settingSelection\.delete\(key\)/, "stale ticks survive a refresh and could claim a teaching period");
});

test("the offline shell carries the new module so a phone can load it", () => {
  const sw = read("sw.js");
  assert.match(sw, /"\.\/setting-slots\.js\?v=[\d.]+"/, "setting-slots.js is missing from the service-worker cache list");
});

test("the profile dialog's buttons are big enough for a thumb on a phone", () => {
  // Slice from the phone block itself: an earlier comment mentions @media print, so search forward.
  const start = css.indexOf("@media (max-width: 760px)");
  const mobile = css.slice(start, start + css.slice(start).indexOf("@media print"));
  assert.match(mobile, /#teacherDialog \.dialog-actions \.button \{ min-height: 40px; \}/, "the remedial teacher's button is below the phone touch target");
});
