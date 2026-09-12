import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The grid is wired from places that can drift apart: the markup no longer offers a day picker, the
// renderer draws days as rows through period columns with a REHAT column, and the stylesheet has to
// carry the shape (vertical REHAT cell, tinted blocks, a legend) on screen and on paper.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const app = read("app.js");
const css = read("styles.css");
const sw = read("sw.js");

test("the timetable pane has no day picker left", () => {
  assert.doesNotMatch(html, /id="scheduleDay"/, "the day picker is still in the markup");
  assert.doesNotMatch(app, /scheduleDay/, "the renderer still reads a day picker");
});

test("the renderer builds the grid from the school days and periods, not from a picked day", () => {
  const render = app.slice(app.indexOf("function timetableHtml"), app.indexOf("function openAbsenceDialog"));
  assert.match(render, /weekGrid\(\{ rows, days: DAY_CODES, periods: PERIODS/, "the grid is not built from the school days and periods");
  assert.match(render, /const rows = versionRows\.filter\(matches\)/, "the entity filter was dropped, so every teacher's rows would share one grid");
  assert.doesNotMatch(render, /row\.day === /, "a day filter survived somewhere in the renderer");
});

test("the same grid serves the relief timetable and the remedial teacher's setting grid", () => {
  const relief = app.slice(app.indexOf("function renderSchedule"), app.indexOf("function openAbsenceDialog"));
  const setting = app.slice(app.indexOf("function renderSettingGrid"), app.indexOf("function saveSettingSlots"));
  assert.match(relief, /timetableHtml\(grid,/, "the relief timetable does not use the shared grid");
  assert.match(setting, /timetableHtml\(grid,/, "the setting grid does not use the shared grid");
  assert.match(setting, /weekGrid\(\{ rows: settingVersionRows\(version\), teacherId: settingTeacherId, days: DAY_CODES, periods: PERIODS/, "the setting grid was rebuilt by hand, or it lost the teacher filter");
});

test("the rest column is drawn once, vertically, spanning every day", () => {
  const render = app.slice(app.indexOf("function timetableHtml"), app.indexOf("function renderSchedule"));
  assert.match(render, /return `<td class="vert" rowspan="\$\{grid\.rows\.length\}">\$\{esc\(column\.label\)\}<\/td>`/, "the REHAT column is not a single vertical cell");
  assert.match(render, /if \(index > 0\) return "";/, "the rest cell would be repeated on every day row");
  assert.match(css, /table\.timetable td\.vert \{[^}]*writing-mode: vertical-rl/, "the rest column is not written vertically");
});

test("each block carries its subject, its class and its colour", () => {
  const relief = app.slice(app.indexOf("function renderSchedule"), app.indexOf("function openAbsenceDialog"));
  assert.match(relief, /class="blk has"[^>]*style="--sc:\$\{esc\(cell\.colour\)\}"/, "the subject colour is not applied to the block");
  assert.match(relief, /<span class="sub">\$\{esc\(cell\.subject\)\}<\/span><span class="cls">\$\{esc\(cell\.label\)\}<\/span>/, "the block does not show the subject and the class");
  assert.match(relief, /class="blk free" data-schedule-cell=/, "an empty period is not a free cell");
});

test("the legend and the scroll hint sit under the grid", () => {
  const render = app.slice(app.indexOf("function timetableHtml"), app.indexOf("function renderSchedule"));
  assert.match(render, /class="legend"/, "the timetable has no colour legend");
  assert.match(render, /Leret ke kiri\/kanan untuk melihat semua waktu\./, "the phone hint is missing");
  assert.match(render, /<p class="timetable-hint">/, "the hint is not styled as a hint");
  assert.match(css, /\.legend i b \{ width: 11px/, "the legend swatch is missing");
});

test("the grid scrolls sideways instead of squeezing the periods on a phone", () => {
  assert.match(css, /\.timetable-wrap \{ overflow-x: auto/, "the grid cannot scroll sideways");
  const start = css.indexOf("@media (max-width: 760px)");
  const mobile = css.slice(start, start + css.slice(start).indexOf("@media print"));
  assert.match(mobile, /table\.timetable \{ min-width: 640px/, "the phone grid would be squeezed instead of scrolled");
  assert.match(css, /table\.timetable \{[^}]*table-layout: fixed/, "the columns would follow their content instead of the grid");
});

test("the class view still exists, so a class timetable is read in the same shape", () => {
  assert.match(html, /<select id="scheduleType"><option value="teacher">Guru<\/option><option value="class">Kelas<\/option>/, "the Guru/Kelas switch was lost");
  assert.match(app, /const byClass = admin && \$\("#scheduleType"\)\.value === "class"/, "the class view is not honoured");
});

test("the offline shell carries the grid module", () => {
  assert.match(sw, /"\.\/week-view\.js\?v=[\d.]+"/, "week-view.js is missing from the service-worker cache list");
});
