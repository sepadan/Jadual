import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Executes the builder's cover-timetable functions as they ship, with the builder's own helpers
// stubbed: the button, the marking and the "never copy twice" rule are all real code paths.
const source = readFileSync(new URL("../builder.js", import.meta.url), "utf8");

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from builder.js`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") { depth -= 1; if (!depth) return source.slice(start, index + 1); }
  }
  throw new Error(`${name} is not closed`);
}

const block = ["coverListBuilder", "pautanGantian", "janaJadualGantian"].map(extract).join("\n");

function builderContext(state) {
  let counter = 0;
  const context = {
    S: state,
    subjekById: (id) => state.subjek.find((subject) => subject.id === id),
    uid: () => `x${++counter}`,
    simpan: () => {}, ulang: () => {}, toast: () => {},
    JSON, Object, Array, String, Number, console,
  };
  vm.createContext(context);
  vm.runInContext(`${block}\nglobalThis.__jana = janaJadualGantian; globalThis.__pautan = pautanGantian;`, context);
  return context;
}

function state(overrides = {}) {
  return {
    subjek: [{ id: "s1", kod: "BA", nama: "BA" }, { id: "s2", kod: "MT", nama: "MT" }],
    kelas: [{ id: "k1", nama: "6 BIJAK" }],
    guru: [
      { id: "g-nora", directoryId: "t-nora", nama: "NORA" },
      { id: "g-aina", directoryId: "t-aina", nama: "AINA", coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }]) },
    ],
    agihan: [{ id: "a1", kelasId: "k1", subjekId: "s1", guruId: "g-nora", pairGuruIds: [], waktu: "" },
             { id: "a2", kelasId: "k1", subjekId: "s2", guruId: "g-nora", pairGuruIds: [], waktu: "" }],
    ...overrides,
  };
}

test("the cover timetable button copies the lessons the link allows, and marks them", () => {
  const current = state();
  const context = builderContext(current);
  const result = context.__jana();
  assert.deepEqual({ added: result.added, skipped: result.skipped, total: result.total }, { added: 1, skipped: 0, total: 1 }, "only the BA allocation is covered by the link");
  const copied = current.agihan.filter((item) => item.dariGantian);
  assert.equal(copied.length, 1);
  assert.equal(copied[0].guruId, "g-aina");
  assert.equal(copied[0].subjekId, "s1", "the copied allocation must be the subject taken over");
  assert.equal(copied[0].gantiGuruId, "g-nora");
  assert.equal(current.agihan.filter((item) => item.guruId === "g-nora").length, 2, "the original keeps their own allocations");
});

test("pressing it again copies nothing more", () => {
  const current = state();
  const context = builderContext(current);
  context.__jana();
  const again = context.__jana();
  assert.deepEqual({ added: again.added, skipped: again.skipped }, { added: 0, skipped: 1 });
  assert.equal(current.agihan.filter((item) => item.dariGantian).length, 1);
});

test("a whole-timetable link copies every allocation of the replaced teacher", () => {
  const current = state();
  current.guru = [
    current.guru[0],
    { id: "g-mystep", directoryId: "t-mystep", nama: "MYSTEP", coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: [] }]) },
  ];
  const context = builderContext(current);
  const result = context.__jana();
  assert.equal(result.added, 2, "both allocations belong to the replaced teacher");
  assert.equal(current.agihan.filter((item) => item.guruId === "g-mystep").length, 2);
});

test("one covering teacher can take the lessons of more than one teacher", () => {
  const current = state();
  current.guru = [
    current.guru[0],
    { id: "g-wee", directoryId: "t-wee", nama: "WEE" },
    { id: "g-aina", directoryId: "t-aina", nama: "AINA", coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }, { teacherId: "t-wee", subjects: [] }]) },
  ];
  current.agihan.push({ id: "a3", kelasId: "k1", subjekId: "s2", guruId: "g-wee", pairGuruIds: [], waktu: "" });
  const context = builderContext(current);
  const result = context.__jana();
  assert.equal(result.added, 2, "one allocation from each covered teacher");
  const copied = current.agihan.filter((item) => item.dariGantian).map((item) => item.gantiGuruId).sort();
  assert.deepEqual(copied, ["g-nora", "g-wee"]);
});

test("a builder without cover links copies nothing", () => {
  const current = state();
  current.guru = [current.guru[0]];
  const context = builderContext(current);
  assert.deepEqual(context.__pautan(), []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.__jana())), { added: 0, skipped: 0, total: 0 });
});
