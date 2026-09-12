import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// A reset can empty the Teachers sheet, and the timetable that survives still points at those ids:
// PDF import then has nothing to match and the builder has nothing to place. These tests run the
// real restore function from Code.gs against fake sheets, so the school's roster — and the promise
// that an edited profile is never overwritten — is checked by execution, not by description.
const source = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const roster = source.slice(source.indexOf("var INITIAL_TEACHERS = ["), source.indexOf("function setupSystem()"));
const sheetHeaders = source.slice(source.indexOf("var SHEETS = {"), source.indexOf("// The audit log stays useful"));
const restore = source.slice(source.indexOf("function restoreTeachers_("), source.indexOf("function absenceCoversPeriod_("));

const TEACHER_HEADERS = ["id", "name", "shortName", "position", "reliefEligible", "priority", "active", "createdAt", "updatedAt", "coversTeacherId", "coversSubjects", "coversJson", "preschoolEndTime"];
const COLUMNS = TEACHER_HEADERS.length;

function rowOf(overrides = {}) {
  const row = new Array(COLUMNS).fill("");
  ["id", "name", "shortName", "position", "reliefEligible", "priority", "active"].forEach((key) => {
    if (key in overrides) row[TEACHER_HEADERS.indexOf(key)] = overrides[key];
  });
  return row;
}

function makeSheet(grid) {
  return {
    getLastRow: () => grid.reduce((last, row, index) => (row.some((value) => value !== "" && value != null) ? index + 1 : last), 0),
    getLastColumn: () => grid.reduce((max, row) => Math.max(max, row.length), 1),
    getMaxRows: () => grid.length + 10,
    getFrozenRows: () => 1,
    insertRowsAfter: () => {},
    deleteRow: () => {},
    getRange: (row, col, numRows = 1, numCols = 1) => ({
      getValues: () => Array.from({ length: numRows }, (_, r) => Array.from({ length: numCols }, (_, c) => grid[row - 1 + r]?.[col - 1 + c] ?? "")),
      setValues: (values) => values.forEach((line, r) => {
        const target = row - 1 + r;
        grid[target] = grid[target] || new Array(COLUMNS).fill("");
        line.forEach((value, c) => { grid[target][col - 1 + c] = value; });
      }),
      setValue: (value) => {
        grid[row - 1] = grid[row - 1] || new Array(COLUMNS).fill("");
        grid[row - 1][col - 1] = value;
      },
    }),
  };
}

function makeWorld(extraRows = [], withHeader = true) {
  const grid = withHeader ? [TEACHER_HEADERS.slice()] : [];
  extraRows.forEach((row) => grid.push(row.slice()));
  const readObjects = () => {
    const head = grid[0] || [];
    return grid.slice(1)
      .filter((row) => row.some((value) => value !== "" && value != null))
      .map((row) => Object.fromEntries(head.map((key, index) => [key, row[index] ?? ""])));
  };
  const context = vm.createContext({
    JSON, Object, String, Number, Array, Math, Date, console,
    database_: () => ({ getSheetByName: () => makeSheet(grid) }),
    readObjects_: readObjects,
    text_: (value) => (value == null ? "" : String(value)),
    audit_: () => {},
    __grid: grid,
    __rows: () => readObjects(),
  });
  vm.runInContext(sheetHeaders + "\n" + roster + "\n" + restore, context);
  return context;
}

const run = (world, call) => JSON.parse(JSON.stringify(vm.runInContext(call, world)));

test("an empty Teachers sheet is filled with the school's roster under its original ids", () => {
  const world = makeWorld();
  const result = run(world, 'restoreTeachers_({confirm:"PULIH"})');
  assert.equal(result.added.length, 23, "the whole built-in roster must come back");
  assert.equal(world.__rows().length, 23);
  assert.deepEqual(world.__grid[0], TEACHER_HEADERS, "the header row must stay untouched");
  const head = world.__rows()[0];
  assert.equal(head.id, "g-khairul-izam");
  assert.equal(head.name, "KHAIRUL IZAM BIN ABD SAMAT");
  assert.equal(head.position, "Guru Besar");
  assert.equal(head.active, true);
  assert.ok(result.added.some((teacher) => teacher.id === "g-mazlina"), "ids the surviving timetable refers to must be restored");
});

test("a profile the school has edited is never overwritten", () => {
  const world = makeWorld([rowOf({ id: "g-nora", name: "NORA MOHAINIM (PENGURUS ICT)", shortName: "NORA", position: "Guru Akademik", reliefEligible: false, priority: 2, active: true })]);
  const result = run(world, 'restoreTeachers_({confirm:"PULIH"})');
  assert.equal(result.added.length, 22);
  assert.equal(result.skipped, 1);
  const kept = world.__rows().filter((teacher) => teacher.id === "g-nora");
  assert.equal(kept.length, 1, "a teacher must not be duplicated");
  assert.equal(kept[0].name, "NORA MOHAINIM (PENGURUS ICT)");
  assert.equal(kept[0].reliefEligible, false);
});

test("the restore needs the confirmation word", () => {
  const world = makeWorld();
  assert.throws(() => vm.runInContext("restoreTeachers_({})", world), /PULIH/);
  assert.throws(() => vm.runInContext('restoreTeachers_({confirm:"pulih"})', world), /PULIH/);
  assert.equal(world.__rows().length, 0, "a stray request must not add anyone");
});

test("a Teachers sheet that lost its header row gets one back", () => {
  const world = makeWorld([], false);
  const result = run(world, 'restoreTeachers_({confirm:"PULIH"})');
  assert.equal(result.added.length, 23);
  assert.deepEqual(world.__grid[0], TEACHER_HEADERS);
  assert.equal(world.__rows().length, 23);
});

test("restoring twice adds nothing the second time", () => {
  const world = makeWorld();
  run(world, 'restoreTeachers_({confirm:"PULIH"})');
  const second = run(world, 'restoreTeachers_({confirm:"PULIH"})');
  assert.equal(second.added.length, 0);
  assert.equal(second.skipped, 23);
  assert.equal(world.__rows().length, 23);
});

test("the app offers the restore where an empty directory blocks the work", () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /data-restore-teachers/, "the admin needs a button, not an instruction to edit Sheets by hand");
  assert.ok((html.match(/class="[^"]*teacher-restore-notice/g) || []).length >= 2, "both the directory and the import screen must show it");
  assert.match(app, /function renderTeacherRestoreNotices\(\)/, "the notice must follow the data");
  assert.match(app, /renderTeacherRestoreNotices\(\);/, "renderAll must refresh the notice");
  assert.match(app, /remoteWrite\("restoreTeachers",\s*\{\s*confirm:\s*"PULIH"\s*\}/, "the button must write the restore to Sheets");
  assert.match(app, /async function restoreTeacherProfiles\(\)[\s\S]*?requireAdmin\(\)/, "only an admin session may restore");
  assert.match(app, /Tiada profil guru dalam sistem/, "the PDF import must say why nothing matched");
});
