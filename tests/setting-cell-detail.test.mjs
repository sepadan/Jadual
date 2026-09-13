import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PERIODS, DAY_CODES } from "../data.js";
import {
  SETTING_SUBJECT, isSettingRow, mergeSettingRows, parseSettingSubject, settingDetailsFromRows, settingSubjectValue,
} from "../setting-slots.js";
import { weekGrid } from "../week-view.js";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const app = read("app.js");
const css = read("styles.css");

// Guru pemulihan hanya mengambil SEBAHAGIAN murid dari sebuah kelas, jadi waktu pemulihan menyimpan
// subjek + kelas ASAL murid itu di dalam medan `subject`, selepas penanda "PEMULIHAN". `className`
// mesti kekal kosong: enjin relief menganggap setiap baris yang ada className sebagai waktu kelas
// yang perlu digantikan guru ganti, dan waktu pemulihan tidak boleh mencetuskan guru ganti.
const periods = PERIODS.filter((item) => [1, 2, 3, 4].includes(Number(item.period)));
const settingRow = {
  versionId: "v1", teacherId: "t1", day: "IS", period: 1,
  startTime: "07:30", endTime: "08:00", subject: SETTING_SUBJECT, className: "", isDuty: true,
};

test("a remedial slot keeps the subject and the pupils' own class, and never a className", () => {
  const result = mergeSettingRows({
    rows: [settingRow],
    teacherId: "t1",
    versionId: "v1",
    selected: ["IS-1", "IS-2", "IS-3"],
    periods,
    details: { "IS-2": { subjek: "BM", kelas: "3B" }, "IS-3": { subjek: "KOKU", kelas: "" } },
  });
  const bm = result.rows.find((row) => row.period === 2);
  assert.equal(bm.subject, `${SETTING_SUBJECT} · BM · 3B`, "the subject and class were not stored together");
  assert.equal(bm.className, "", "a className would make the relief engine look for a replacement teacher");
  assert.equal(bm.isDuty, true, "the slot stopped being a duty row");
  const koku = result.rows.find((row) => row.period === 3);
  assert.equal(koku.subject, `${SETTING_SUBJECT} · KOKU`, "an activity without a class keeps a dangling separator");
  assert.equal(koku.className, "", "a className would make the relief engine look for a replacement teacher");
});

test("a slot saved without a subject stays plain masa pemulihan, as before this feature", () => {
  const result = mergeSettingRows({ rows: [], teacherId: "t1", versionId: "v1", selected: ["SEL-1"], periods });
  assert.equal(result.rows[0].subject, SETTING_SUBJECT, "the old plain label was lost");
  assert.equal(isSettingRow(result.rows[0]), true, "the plain label is no longer recognised as masa pemulihan");
});

test("the stored subject round-trips back into the picker", () => {
  assert.equal(settingSubjectValue({ subjek: "bm", kelas: " 2C " }), `${SETTING_SUBJECT} · bm · 2C`);
  assert.deepEqual(parseSettingSubject(`${SETTING_SUBJECT} · BM · 3B`), { subjek: "BM", kelas: "3B", detail: "BM 3B" });
  assert.deepEqual(parseSettingSubject(`${SETTING_SUBJECT} · MT`), { subjek: "MT", kelas: "", detail: "MT" });
  assert.deepEqual(parseSettingSubject(SETTING_SUBJECT), { subjek: "", kelas: "", detail: "" });
  assert.equal(isSettingRow({ isDuty: true, subject: `${SETTING_SUBJECT} · BM · 3B` }), true, "the detailed form is not recognised as masa pemulihan");
  assert.equal(isSettingRow({ isDuty: true, subject: "PEM" }), false, "any duty row starting with PEM counts as masa pemulihan");
  assert.equal(isSettingRow({ isDuty: false, subject: SETTING_SUBJECT }), false, "a teaching row counted as masa pemulihan");
});

test("the picker opens with what is already stored, for that teacher only", () => {
  const rows = [
    settingRow,
    { versionId: "v1", teacherId: "t1", day: "IS", period: 4, subject: `${SETTING_SUBJECT} · MT · 5C`, className: "", isDuty: true },
    { versionId: "v1", teacherId: "t2", day: "IS", period: 2, subject: `${SETTING_SUBJECT} · BM · 6B`, className: "", isDuty: true },
  ];
  const details = settingDetailsFromRows({ rows, teacherId: "t1" });
  assert.deepEqual(details["IS-1"], { subjek: "", kelas: "", detail: "" }, "a plain slot must open empty");
  assert.deepEqual(details["IS-4"], { subjek: "MT", kelas: "5C", detail: "MT 5C" }, "the stored detail was not read back");
  assert.equal(details["IS-2"], undefined, "another teacher's slot leaked into this teacher's grid");
});

test("the timetable writes the subject and the class under the Pemulihan heading", () => {
  const grid = weekGrid({
    rows: [settingRow, { ...settingRow, period: 2, subject: `${SETTING_SUBJECT} · BM · 3B` }],
    days: DAY_CODES,
    periods: PERIODS,
  });
  const cellOf = (day, period) => grid.rows.find((line) => line.day === day).cells.find((item) => item.period === period);
  const marked = cellOf("IS", 2);
  assert.equal(marked.state, "setting", "a remedial slot is not drawn as masa pemulihan");
  assert.equal(marked.subject, SETTING_SUBJECT, "the heading is not Pemulihan");
  assert.equal(marked.label, "BM 3B", "the subject and the class are not shown under the heading");
  assert.equal(marked.locked, false, "a remedial slot can no longer be edited");
  assert.equal(cellOf("IS", 1).label, "", "an old plain slot shows a stray label");
});

test("the picker is wired from the grid to the save, and both choices reach Sheets", () => {
  for (const id of ["settingCellDialog", "settingCellTitle", "settingCellSubject", "settingCellSubjects", "settingCellClass", "settingCellApply", "settingCellRemove"]) {
    assert.ok(html.includes(`id="${id}"`), `the picker dialog is missing #${id}`);
  }
  assert.match(html, /id="settingCellSubject" list="settingCellSubjects"/, "the subject is typed blind, with no suggestions from the school's own subjects");
  assert.match(app, /cell\.addEventListener\("click", \(\) => openSettingCellDialog\(cell\.dataset\.settingCell\)\)/, "a cell no longer opens the picker");
  assert.match(app, /settingSelection\.add\(key\);\s*\n\s*settingDetails\[key\] = \{ subjek, kelas \};/, "the chosen subject and class are not kept");
  assert.match(app, /mergeSettingRows\(\{ rows: db\.schedule,[\s\S]{0,200}details: settingDetails \}\)/, "the chosen subject and class are dropped on save");
  assert.match(app, /if \(!subjek\) return toast\(/, "a slot can be saved with no subject at all");
  assert.match(app, /\$\("#settingCellRemove"\)\.addEventListener\("click", removeSettingCell\)/, "a ticked slot can no longer be unticked");
  assert.match(app, /subjects = \(state\.subjek \|\| \[\]\)\.map/, "the picker does not offer the school's subject list");
  assert.match(app, /if \(!row\.isDuty && row\.className\) classes\.add/, "a duty row's className was offered as a class");
});

test("a claimed period reads as a heading with a smaller line under it", () => {
  assert.match(css, /table\.timetable td\.blk \.sub \{ display: block; font-size: 9px;/, "the heading line has no style of its own");
  assert.match(css, /#settingDialog table\.timetable td\.chosen \.sub \{ color: #6b4708; \}/, "the heading of a claimed period is unreadable on the claim colour");
});
