import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// The builder is where an admin spends hours arranging a timetable. The draft used to live only in
// memory: `simpan()` changed a label and `muat()` read a localStorage key nobody ever wrote, so a
// reload threw the session away unless "Simpan draf ke Sheets" had been pressed. These tests pin the
// device save down so that promise cannot quietly rot again.
const source = readFileSync(new URL("../builder.js", import.meta.url), "utf8");
const head = source.slice(0, source.indexOf("/* ---------- Pengiraan masa ---------- */"));

function sandbox(store = {}, options = {}) {
  const written = [];
  const node = { textContent: "", className: "", querySelector: () => node, querySelectorAll: () => [], innerHTML: "" };
  const localStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      if (options.failWrites) throw new Error("QuotaExceededError");
      written.push([key, value]);
      store[key] = String(value);
    },
    removeItem: (key) => { delete store[key]; },
  };
  const context = vm.createContext({
    console, setTimeout, clearTimeout, JSON,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    localStorage,
    document: { getElementById: () => node, querySelector: () => node, querySelectorAll: () => [], dispatchEvent: () => {} },
  });
  vm.runInContext(head, context);
  return { context, store, written, node };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 400));

test("editing the builder writes the draft to the device, and a reload reads it back", async () => {
  const store = {};
  const first = sandbox(store);
  first.context.jadualEditorState = "SEKOLAH";
  vm.runInContext(`S=kosong(); S.sekolah.nama='SEKOLAH KEBANGSAAN PAYA REDAN'; S.kelas=[{id:'1b',nama:'1B',tahap:1}]; simpan();`, first.context);
  await flush();
  assert.ok(store["janajadual.v3"], "nothing was written to the device — a reload would lose the timetable");
  assert.match(store["janajadual.v3"], /SEKOLAH KEBANGSAAN PAYA REDAN/);

  // A second page load on the same device: muat() must bring the work back and say it came from here.
  const second = sandbox(store);
  const restored = vm.runInContext("muat()", second.context);
  assert.equal(restored, true, "the saved draft was not restored");
  assert.equal(vm.runInContext("drafPeranti", second.context), true, "the builder does not know the draft came from this device");
  assert.equal(vm.runInContext("S.sekolah.nama", second.context), "SEKOLAH KEBANGSAAN PAYA REDAN");
  assert.equal(vm.runInContext("S.kelas.length", second.context), 1);
});

test("coalesced writes still flush when the page is left", async () => {
  const store = {};
  const { context, written } = sandbox(store);
  vm.runInContext("S=kosong(); S.subjek=[{id:'bm',kod:'BM'}]; simpan(); simpan(); simpan(); flushStoran();", context);
  assert.equal(written.length, 1, "each keystroke wrote the whole builder state");
  assert.match(store["janajadual.v3"], /"BM"/);
});

test("a device that refuses to store says so instead of pretending the draft is safe", async () => {
  const { context, node } = sandbox({}, { failWrites: true });
  vm.runInContext("S=kosong(); simpan(); flushStoran();", context);
  assert.equal(vm.runInContext("memOnly", context), true, "the builder kept claiming the draft was saved");
  assert.match(node.textContent, /Storan peranti penuh/, "the admin is never told the device cannot store the draft");
});

test("work kept only on the device can be put aside and taken back", async () => {
  const { context, store } = sandbox({});
  // The admin edits the builder on a device that is already holding a draft.
  vm.runInContext("S=kosong(); S.sekolah.nama='SEKOLAH PERANTI'; simpan(); flushStoran();", context);
  const deviceState = JSON.parse(vm.runInContext("JSON.stringify(S)", context));
  const put = vm.runInContext("simpanSampingan(S)", context);
  assert.equal(put, true, "the device copy could not be put aside");
  assert.ok(vm.runInContext("adaSampingan()", context), "the aside copy is not reported");
  // Something else becomes the live state (here: the Sheets draft arriving at login).
  vm.runInContext("S=kosong(); S.sekolah.nama='SEKOLAH SHEETS';", context);
  assert.equal(vm.runInContext("pulihSampingan()", context), true, "the aside copy could not be taken back");
  assert.equal(vm.runInContext("S.sekolah.nama", context), "SEKOLAH PERANTI", "the aside copy came back wrong");
  assert.equal(vm.runInContext("adaSampingan()", context), false, "the aside copy is still pending after being taken back");
  assert.ok(store["janajadual.v3"].includes("SEKOLAH PERANTI"), "the restored draft was not written to the device");
  assert.equal(deviceState.sekolah.nama, "SEKOLAH PERANTI");
});

test("app.js loads the Sheets draft at login and keeps the device copy aside", () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /hasDeviceDraft\(\)/, "app.js no longer asks whether a device draft was restored");
  assert.match(app, /stashDeviceDraft\(/, "app.js discards device-only work when Sheets arrives");
  assert.match(app, /Draf Sheets telah dimuatkan/, "app.js does not report that the Sheets draft is live");
  assert.match(app, /updateDeviceDraftButton\(\)/, "the device copy is never offered back to the admin");
  // Sheets is the source of truth, so it must be applied on every login — the device copy is put
  // aside first, never used instead.
  const body = app.slice(app.indexOf("async function loadBuilder()"), app.indexOf("async function enterAdmin("));
  assert.ok(
    body.indexOf("stashDeviceDraft(") < body.indexOf("setState(cloud.builder.state)"),
    "app.js replaces the live draft with the Sheets copy before putting the device copy aside",
  );
  assert.ok(
    !/if\(cloud\.builder\?\.state && deviceDraft\)/.test(body),
    "the device draft still wins over Sheets at login",
  );
});
