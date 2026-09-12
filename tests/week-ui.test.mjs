import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The week pane is wired from three places that can drift apart: the markup no longer offers a day
// picker, the renderer builds one cell per day and period, and the offline shell ships the module.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const app = read("app.js");
const css = read("styles.css");
const sw = read("sw.js");

test("the timetable pane no longer asks for a day", () => {
  const pane = html.slice(html.indexOf('id="schedule-relief-pane"'), html.indexOf('id="view-pemulihan"') > 0 ? html.indexOf('id="view-pemulihan"') : html.length);
  assert.doesNotMatch(pane, /id="scheduleDay"/, "the day picker is still in the timetable pane");
  assert.doesNotMatch(app, /scheduleDay/, "the renderer still reads a day picker that is gone");
  assert.match(pane, /id="scheduleGrid"/, "the pane lost its grid");
});

test("the renderer builds the week from the school days, not from a picked day", () => {
  const render = app.slice(app.indexOf("function renderSchedule"), app.indexOf("function openAbsenceDialog"));
  assert.match(render, /weekTableModel\(\{ rows, days: DAY_CODES, periods: PERIODS, timeFor, todayCode \}\)/, "the week is not built from the school days");
  assert.match(render, /const rows = versionRows\.filter\(matches\)/, "the entity filter was dropped, so every teacher's rows would be in one week");
  assert.doesNotMatch(render, /row\.day === /, "a day filter survived somewhere in the renderer");
});

test("the class view still exists, so a class timetable can be read as a week too", () => {
  assert.match(html, /<select id="scheduleType"><option value="teacher">Guru<\/option><option value="class">Kelas<\/option>/, "the Guru/Kelas switch was lost");
  assert.match(app, /const byClass = admin && \$\("#scheduleType"\)\.value === "class"/, "the class view is not honoured");
});

test("the grid is styled as a five-column week and can be printed", () => {
  assert.match(css, /\.week-table \{ width: 100%; table-layout: fixed;/, "the week table has no fixed layout, so the day columns would follow their content");
  assert.match(css, /\.week-table thead th\.today \{/, "today is not marked in the header");
  assert.match(css, /\.week-table td\.setting \{/, "setting time looks the same as a lesson");
  assert.match(css, /\.schedule-grid \{ overflow-x: auto;/, "the week cannot scroll sideways on a narrow screen");
});

test("the offline shell carries the week module so a phone can load it", () => {
  assert.match(sw, /"\.\/week-view\.js\?v=[\d.]+"/, "week-view.js is missing from the service-worker cache list");
});
