import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { canCover, coverLinks, coverList, coveredTeacherSubjects } from "../teacher-coverage.js";

// The dialog rows are the only place these links are edited, so run the real functions against a
// small DOM stand-in rather than asserting on the source text.
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
function functionBody(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from app.js`);
  const end = app.indexOf("\n}", start);
  return app.slice(start, end + 2);
}

const ASRAF = { id: "t-asraf", name: "ASRAF", position: "Guru Akademik Biasa", active: true };
const NORA = { id: "t-nora", name: "NORA", position: "Guru Akademik Biasa", active: true };
const WEE = { id: "t-wee", name: "WEE", position: "Guru Akademik Biasa", active: true };
const MYSTEP = { id: "t-mystep", name: "MYSTEP", position: "Personel MySTEP", active: true, coversJson: JSON.stringify([{ teacherId: "t-asraf", subjects: [] }]) };
const PRAK = { id: "t-prak", name: "PRAK", position: "Guru Praktikal", active: true, coversTeacherId: "t-nora", coversSubjects: "BA" };
const rows = [
  { versionId: "v1", teacherId: "t-asraf", day: "JUM", period: 1, subject: "BA", className: "3 BIJAK" },
  { versionId: "v1", teacherId: "t-nora", day: "JUM", period: 2, subject: "BA", className: "6 BIJAK" },
  { versionId: "v1", teacherId: "t-nora", day: "JUM", period: 3, subject: "SN", className: "6 BIJAK" },
];
const db = { teachers: [ASRAF, NORA, WEE, MYSTEP, PRAK], schedule: rows };

function elements(ids) {
  return new Map(Object.entries(ids).map(([id, init]) => [id, {
    classList: { _set: new Set(init.classes || []), add(name) { this._set.add(name); }, remove(name) { this._set.delete(name); }, contains(name) { return this._set.has(name); } },
    innerHTML: "",
    value: init.value || "",
    checked: init.checked || false,
  }]));
}

function harness(draft, position, selfId) {
  const els = elements({ teacherId: { value: selfId }, teacherPosition: { value: position }, teacherCoverRows: {}, teacherCoverWrap: { classes: ["hidden"] } });
  const context = {
    db, coverDraft: draft, coverList, coverLinks, coveredTeacherSubjects, canCover,
    esc: (value) => String(value),
    $: (selector) => els.get(selector.replace("#", "")) || { classList: { add() {}, remove() {}, contains: () => true }, innerHTML: "", value: "" },
    $$: (selector) => (selector === ".cover-subject" ? [] : []),
    JSON, Set, Number, String, Object, Array,
  };
  vm.createContext(context);
  vm.runInContext(`${functionBody("coverRowsHtml")}\nthis.coverRowsHtml = coverRowsHtml;`, context);
  return { html: context.coverRowsHtml(), els };
}

test("the picker still offers the teacher a record already replaces", () => {
  const { html } = harness([{ teacherId: "t-asraf", all: true, subjects: [] }], "Personel MySTEP", "t-mystep");
  assert.match(html, /<option value="t-asraf" selected>ASRAF<\/option>/, "the hidden teacher must stay selectable on their own covering record");
});

test("the row lists every subject of the replaced teacher, the taken-over one included", () => {
  const { html } = harness([{ teacherId: "t-nora", all: false, subjects: ["BA"] }], "Guru Praktikal", "t-prak");
  assert.match(html, /value="BA" checked/);
  assert.match(html, /value="SN"/, "a subject the link does not take is still offered");
  assert.equal(/disabled/.test(html), false, "chips are selectable when “Semua jadual” is off");
  const all = harness([{ teacherId: "t-nora", all: true, subjects: [] }], "Guru Praktikal", "t-prak").html;
  assert.equal(/disabled/.test(all), true, "every chip is locked while “Semua jadual” is on");
});

test("a second row can be added for another teacher, and each row keeps its own choice", () => {
  const draft = [
    { teacherId: "t-nora", all: false, subjects: ["BA"] },
    { teacherId: "t-wee", all: true, subjects: [] },
  ];
  const { html } = harness(draft, "Guru Praktikal", "t-prak");
  assert.equal((html.match(/class="cover-row"/g) || []).length, 2);
  assert.match(html, /<option value="t-nora" selected>NORA<\/option>/);
  assert.match(html, /<option value="t-wee" selected>WEE<\/option>/);
});

test("an ordinary position shows no cover rows at all", () => {
  const { els } = harness([], "Guru Akademik Biasa", "t-wee");
  const context = {
    db, coverDraft: [], coverList, coverLinks, coveredTeacherSubjects, canCover, currentTeacherPosition: () => els.get("teacherPosition").value,
    esc: String, $: (selector) => els.get(selector.replace("#", "")), $$: () => [],
    JSON, Set, Number, String, Object, Array,
  };
  vm.createContext(context);
  vm.runInContext("let coverDraft = [];\n" + functionBody("renderTeacherCover") + "\nthis.run = renderTeacherCover;", context);
  context.run();
  assert.equal(els.get("teacherCoverWrap").classList.contains("hidden"), true);
});

test("saving keeps one entry per row, with an empty subject list meaning the whole timetable", () => {
  const context = {
    JSON, Set, Number, String, Object, Array,
    coverDraft: [
      { teacherId: "t-nora", all: false, subjects: ["BA"] },
      { teacherId: "t-wee", all: true, subjects: [] },
      { teacherId: "", all: true, subjects: [] },
    ],
  };
  vm.createContext(context);
  vm.runInContext(`${functionBody("coverDraftEntries")}\nthis.entries = coverDraftEntries;`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.entries())), [
    { teacherId: "t-nora", subjects: ["BA"] },
    { teacherId: "t-wee", subjects: [] },
  ]);
});
