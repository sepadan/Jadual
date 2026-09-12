import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Executes the real delete/archive/reset functions from Code.gs against fake sheets, so the rules
// that protect the school's records (what may be removed, what may not) are checked, not described.
const source = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const block = source.slice(source.indexOf("// ===== Padam sebenar"), source.indexOf("function absenceCoversPeriod_("));
const versionBlock = source.slice(source.indexOf("function archiveVersions_("), source.indexOf("// Wipes the selected tables"));

function makeWorld(rows) {
  const tables = JSON.parse(JSON.stringify(rows));
  const maxRows = Object.fromEntries(Object.entries(tables).map(([name, items]) => [name, items.length + 1]));
  const sheetOf = (name) => ({
    getLastRow: () => (tables[name] || []).length + 1,
    getLastColumn: () => 3,
    getMaxRows: () => maxRows[name],
    getFrozenRows: () => 1,
    insertRowsAfter: (_index, count) => { maxRows[name] += count; },
    deleteRow: (index) => {
      if (maxRows[name] - 1 <= 1) throw new Error("Sorry, it is not possible to delete all non-frozen rows.");
      tables[name].splice(index - 2, 1);
      maxRows[name] -= 1;
    },
    getRange: () => ({ setValue: () => {}, getValues: () => [["", "", "", "", ""]] }),
  });
  const context = vm.createContext({
    JSON, Object, String, Number, Array, Math, console,
    database_: () => ({ getSheetByName: (name) => sheetOf(name) }),
    readObjects_: (name) => JSON.parse(JSON.stringify(tables[name] || [])),
    text_: (value) => (value == null ? "" : String(value)),
    bumpRevision_: () => { context.__bumped = (context.__bumped || 0) + 1; },
    audit_: () => {},
    bool_: (value) => value === true,
    parseJson_: (value, fallback) => fallback,
    __tables: tables,
  });
  vm.runInContext(block + "\n" + versionBlock, context);
  return context;
}

const base = {
  Absences: [
    { id: "a1", date: "2026-09-18", teacherId: "t-nora", status: "active" },
    { id: "a2", date: "2026-09-18", teacherId: "t-wee", status: "active" },
  ],
  Reliefs: [
    { id: "r1", date: "2026-09-18", absentTeacherId: "t-nora", period: 2, status: "published" },
    { id: "r2", date: "2026-09-18", absentTeacherId: "t-wee", period: 5, status: "published" },
    { id: "r3", date: "2026-09-11", absentTeacherId: "t-nora", period: 1, status: "published" },
  ],
  Teachers: [
    { id: "t-nora", name: "NORA", status: "active" },
    { id: "t-wee", name: "WEE", status: "active" },
  ],
  Schedule: [{ versionId: "v1", teacherId: "t-nora", day: "JUM", period: 2 }],
  ScheduleVersions: [
    { id: "v1", status: "active" },
    { id: "v0", status: "superseded" },
    { id: "v-old", status: "archived" },
  ],
  BuilderState: [{ revision: 1, index: 0, chunk: "{}" }],
};

test("deleting an absence removes the row and only its reliefs", () => {
  const world = makeWorld(base);
  const result = JSON.parse(JSON.stringify(vm.runInContext('deleteAbsence_({id:"a1"})', world)));
  assert.equal(result.deleted, 1);
  assert.equal(result.reliefs, 1, "the relief of the same date and teacher must go with it");
  assert.deepEqual(world.__tables.Absences.map((row) => row.id), ["a2"]);
  assert.deepEqual(world.__tables.Reliefs.map((row) => row.id), ["r2", "r3"], "other teachers' reliefs must stay");
  assert.ok(world.__bumped, "the revision was not bumped, so other devices would keep the old data");
});

test("a teacher that is still referenced is refused, a clean one is removed", () => {
  const world = makeWorld(base);
  assert.throws(() => vm.runInContext('deleteTeacher_({id:"t-nora"})', world), /masih ada 1 waktu dalam jadual/);
  assert.deepEqual(world.__tables.Teachers.length, 2);
  const clean = makeWorld({ ...base, Schedule: [], Absences: [], Reliefs: [] });
  const result = JSON.parse(JSON.stringify(vm.runInContext('deleteTeacher_({id:"t-nora"})', clean)));
  assert.equal(result.deleted, 1);
  assert.deepEqual(clean.__tables.Teachers.map((row) => row.id), ["t-wee"]);
});

test("old timetables are archived, never the one in force", () => {
  const world = makeWorld(base);
  const archived = JSON.parse(JSON.stringify(vm.runInContext("archiveVersions_({})", world)));
  assert.equal(archived.archived, 1, "only the superseded version may be archived");
  const removed = JSON.parse(JSON.stringify(vm.runInContext('archiveVersions_({ids:["v-old","v1"],remove:true})', world)));
  assert.equal(removed.removed, 1, "only an archived version may be deleted");
  assert.deepEqual(world.__tables.ScheduleVersions.map((row) => row.id).sort(), ["v0", "v1"]);
});

test("reset needs the confirmation word and only clears what was chosen", () => {
  const world = makeWorld(base);
  assert.throws(() => vm.runInContext('resetData_({targets:{absences:true},confirm:"padam"})', world), /Taip PADAM/);
  assert.throws(() => vm.runInContext('resetData_({targets:{},confirm:"PADAM"})', world), /sekurang-kurangnya satu/);
  const result = JSON.parse(JSON.stringify(vm.runInContext('resetData_({targets:{absences:true,reliefs:true},confirm:"PADAM"})', world)));
  assert.equal(result.cleared.absences, 2);
  assert.equal(result.cleared.reliefs, 3);
  assert.equal(world.__tables.Absences.length, 0);
  assert.equal(world.__tables.Reliefs.length, 0);
  assert.equal(world.__tables.Teachers.length, 2, "a table that was not chosen must survive");
  assert.equal(world.__tables.ScheduleVersions.length, 3);
});

test("schedule and builder replacement use the same guarded row deletion", () => {
  const importBlock = source.slice(source.indexOf("function importSchedule_("), source.indexOf("function ensureSheet_("));
  const builder = readFileSync(new URL("../apps-script/Builder.gs", import.meta.url), "utf8");
  const saveBlock = builder.slice(builder.indexOf("function saveBuilder_("), builder.indexOf("function pruneBuilderRevisions_("));
  assert.match(importBlock, /deleteRows_\("Schedule"/);
  assert.doesNotMatch(importBlock, /scheduleSheet\.deleteRow/);
  assert.match(saveBlock, /deleteRows_\('BuilderState'/);
  assert.doesNotMatch(saveBlock, /sheet\.deleteRow/);
});

test("the device copy round-trips as data, not as a nested string", () => {
  const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const start = source.indexOf('const ADMIN_DB_KEY');
  const block = source.slice(start, source.indexOf("function persist()", start));
  let store = {};
  const context = vm.createContext({
    JSON, Date, localStorage: {
      setItem: (key, value) => { store[key] = String(value); },
      getItem: (key) => (key in store ? store[key] : null),
    },
    db: { revision: 42, teachers: [{ id: "t1" }] },
  });
  vm.runInContext(block, context);
  vm.runInContext("cacheAdminDb()", context);
  const restored = vm.runInContext("cachedAdminDb().data", context);
  assert.equal(restored.revision, 42, "a refresh must get the records back, not null");
  assert.equal(restored.teachers.length, 1);
  store["sistem-jadual-data-admin-v1"] = JSON.stringify({ savedAt: 1, data: JSON.stringify({ revision: 42 }) });
  assert.equal(vm.runInContext("cachedAdminDb()", context), null, "a doubly-encoded payload must be rejected, not crash the refresh");
  store["sistem-jadual-data-admin-v1"] = "{not json";
  assert.equal(vm.runInContext("cachedAdminDb()", context), null, "a corrupt payload must not break the app");
});
