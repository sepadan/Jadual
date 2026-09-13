import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Executes the builder's cover-timetable functions as they ship, with the builder's own helpers
// stubbed: the button, the ownership-transfer rule and the stale-copy cleanup are all real paths.
// Semantics (matching teacher-coverage.js):
//   - Personel MySTEP replaces: the covered teacher's allocation is TRANSFERRED to the covering
//     teacher (guruId changes), never copied — so the class's unique slot count stays the same.
//   - Guru Praktikal shares: the covering teacher is added as a pair (both hold the same slot).
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
      { id: "g-mystep", directoryId: "t-mystep", nama: "MYSTEP", jawatan: "Personel MySTEP", coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }]) },
    ],
    agihan: [{ id: "a1", kelasId: "k1", subjekId: "s1", guruId: "g-nora", pairGuruIds: [], waktu: "5", periods: ["ISNIN|1", "ISNIN|2", "ISNIN|3", "ISNIN|4", "ISNIN|5"] },
             { id: "a2", kelasId: "k1", subjekId: "s2", guruId: "g-nora", pairGuruIds: [], waktu: "2", periods: ["SELASA|1", "SELASA|2"] }],
    ...overrides,
  };
}

test("a Personel MySTEP takes ownership of the covered teacher's lesson (transfer, not copy)", () => {
  const current = state();
  const context = builderContext(current);
  const result = context.__jana();
  assert.deepEqual({ added: result.added, skipped: result.skipped, total: result.total }, { added: 1, skipped: 0, total: 1 }, "only the BA allocation is covered by the link");
  const mystep = current.agihan.filter((item) => item.guruId === "g-mystep");
  assert.equal(mystep.length, 1, "one allocation now belongs to MYSTEP");
  assert.equal(mystep[0].subjekId, "s1", "the transferred allocation is the covered subject (BA)");
  assert.equal(current.agihan.length, 2, "no new row is created — ownership is transferred, not copied");
  assert.equal(current.agihan.filter((item) => item.guruId === "g-nora").length, 1, "the original keeps only MT (BA moved to MYSTEP)");
  assert.deepEqual(mystep[0].periods, ["ISNIN|1", "ISNIN|2", "ISNIN|3", "ISNIN|4", "ISNIN|5"], "the transferred row keeps its periods (unique slot count unchanged)");
});

test("pressing it again transfers nothing more", () => {
  const current = state();
  const context = builderContext(current);
  context.__jana();
  const again = context.__jana();
  assert.deepEqual({ added: again.added, skipped: again.skipped }, { added: 0, skipped: 0 }, "the second press finds no covered teacher left to transfer");
  assert.equal(current.agihan.length, 2, "agihan count unchanged after the second press");
});

test("a whole-timetable MySTEP link transfers every allocation of the replaced teacher", () => {
  const current = state();
  current.guru = [
    current.guru[0],
    { id: "g-mystep", directoryId: "t-mystep", nama: "MYSTEP", jawatan: "Personel MySTEP", coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: [] }]) },
  ];
  const context = builderContext(current);
  const result = context.__jana();
  assert.equal(result.added, 2, "both allocations are transferred");
  assert.equal(current.agihan.filter((item) => item.guruId === "g-mystep").length, 2, "MYSTEP owns both");
  assert.equal(current.agihan.filter((item) => item.guruId === "g-nora").length, 0, "the original no longer owns anything");
});

test("a Guru Praktikal shares the lesson as a pair (both hold the same slot)", () => {
  const current = state();
  current.guru = [
    current.guru[0],
    { id: "g-prak", directoryId: "t-prak", nama: "PRAK", jawatan: "Guru Praktikal", coversJson: JSON.stringify([{ teacherId: "t-nora", subjects: ["BA"] }]) },
  ];
  const context = builderContext(current);
  const result = context.__jana();
  assert.equal(result.added, 1, "one allocation is shared");
  const ba = current.agihan.find((item) => item.subjekId === "s1");
  assert.equal(ba.guruId, "g-nora", "the original stays the owner");
  assert.ok(ba.pairGuruIds.includes("g-prak"), "the practical teacher is added as a pair");
  assert.equal(current.agihan.length, 2, "no new row is created (shared via pair, class stays one slot)");
});

test("stale copies from the old version are cleaned up before the transfer", () => {
  const current = state();
  // Simulate an old-version copy: a duplicate row for the same class+subject, no periods.
  current.agihan.push({ id: "a3", kelasId: "k1", subjekId: "s1", guruId: "g-mystep", pairGuruIds: [], waktu: "", ganda: 0, dariGantian: true, gantiGuruId: "g-nora" });
  const context = builderContext(current);
  const result = context.__jana();
  assert.equal(result.added, 1, "BA transferred to MYSTEP");
  assert.equal(current.agihan.length, 2, "the stale copy is removed and only the transferred original remains");
  assert.equal(current.agihan.filter((item) => item.dariGantian).length, 0, "no stale copies remain");
});

test("a builder without cover links copies nothing", () => {
  const current = state();
  current.guru = [current.guru[0]];
  const context = builderContext(current);
  assert.deepEqual([...context.__pautan()], []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.__jana())), { added: 0, skipped: 0, total: 0 });
});
