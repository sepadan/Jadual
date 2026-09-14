import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fetchWithTimeout } from "../admin-api.js";

// Pressing "Simpan tetapan" starts a network check before anything is written. The admin reported
// that the press produced nothing at all: the button only went disabled, and when the school
// connection did not answer it stayed that way for ever. These tests drive the real save path with
// controlled promises and a controlled clock, so a silent or unbounded press fails here.
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const source = app.slice(app.indexOf("const SETTING_STATUS_TIMEOUT"), app.indexOf("function validClockTime"));
assert.ok(source.length > 400, "the save path could not be extracted from app.js");

function element(id) {
  const classes = new Set();
  const attributes = {};
  return {
    id, disabled: false, textContent: "", closed: false,
    classList: {
      toggle(name, on) { if (on === undefined ? classes.has(name) : !on) classes.delete(name); else classes.add(name); },
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    removeAttribute(name) { delete attributes[name]; },
    close() { this.closed = true; },
  };
}

// One press, one world: the dialog, the school connection and the clock are all fakes the test drives.
function harness({ status, sync } = {}) {
  const nodes = { saveSettingSlots: element("saveSettingSlots"), settingDialog: element("settingDialog"), settingStatus: element("settingStatus") };
  const timers = new Map();
  let nextTimer = 1;
  let now = 0;
  const toasts = [];
  const writes = [];
  const renders = [];
  const selection = new Set(Array.from({ length: 27 }, (_, index) => `IS-${index + 1}`));
  const db = { revision: 7, schedule: [{ versionId: "v-1", teacherId: "g-1", day: "IS", period: 1 }] };
  const version = { id: "v-1", label: "Jadual ujian" };

  const context = vm.createContext({
    $: (selector) => nodes[selector.slice(1)],
    api: { isConfigured: () => true, status: status || (() => Promise.resolve({ revision: 7 })) },
    db, settingGuard: null, settingSelection: selection, settingDetails: {}, settingTeacherId: "g-1",
    settingVersion: () => version,
    settingVersionSignature: () => "sig-1",
    syncData: sync || (() => Promise.resolve()),
    renderSettingGrid: () => renders.push("grid"),
    renderAll: () => renders.push("all"),
    persist: () => renders.push("persist"),
    toast: (message, type) => toasts.push({ message, type }),
    requireAdmin: () => true,
    teacherById: () => ({ name: "GURU PEMULIHAN UJIAN" }),
    mergeSettingRows: ({ rows, selected }) => ({ rows: [...rows, ...selected.map((key) => ({ versionId: "v-1", key, subject: "PEMULIHAN · BM", isDuty: true }))], added: selected.length }),
    PERIODS: [], SETTING_SUBJECT: "PEMULIHAN",
    remoteWrite: (action, data, message) => { writes.push({ action, data, message }); return Promise.resolve(true); },
    setTimeout: (fn, ms) => { const handle = nextTimer++; timers.set(handle, { fn, at: now + Number(ms || 0) }); return handle; },
    clearTimeout: (handle) => timers.delete(handle),
    Promise, Number, String, Error, Math, JSON, console,
  });
  vm.runInContext(source, context);

  return {
    context, nodes, toasts, writes, selection, db,
    button: nodes.saveSettingSlots,
    note: nodes.settingStatus,
    // Let queued microtasks run without letting real time pass.
    settle: async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); },
    advance: async (ms) => {
      now += ms;
      for (const [handle, timer] of [...timers]) if (timer.at <= now) { timers.delete(handle); timer.fn(); }
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    },
    pendingTimers: () => timers.size,
  };
}

test("the press answers at once while the school connection is still being read", async () => {
  let resolveStatus;
  const world = harness({ status: () => new Promise((resolve) => { resolveStatus = resolve; }) });
  const press = world.context.saveSettingSlots();
  await world.settle();

  assert.equal(world.button.disabled, true, "a second press is not blocked while the check runs");
  assert.equal(world.button.getAttribute("aria-busy"), "true", "the button is not announced as busy");
  assert.equal(world.nodes.settingDialog.getAttribute("aria-busy"), "true", "the dialog is not announced as busy");
  assert.equal(world.button.classList.contains("is-busy"), true, "the button shows no spinner");
  assert.match(world.button.textContent, /^Menyemak jadual terkini/, "the button label still reads as if nothing was pressed");
  assert.match(world.note.textContent, /Menyemak jadual terkini/, "the dialog says nothing about the wait");
  assert.equal(world.note.classList.contains("hidden"), false, "the status line stays hidden while the app works");
  assert.equal(world.writes.length, 0, "the timetable was written before the check finished");

  resolveStatus({ revision: 7 });
  await press;
  assert.equal(world.button.disabled, false, "the button is left disabled after the work finished");
  assert.equal(world.button.textContent, "Simpan tetapan", "the busy label is never restored");
});

test("a school connection that never answers ends in a clear refusal, not a dead button", async () => {
  const world = harness({ status: () => new Promise(() => {}) });
  const press = world.context.saveSettingSlots();
  await world.settle();
  assert.equal(world.button.disabled, true);

  await world.advance(60000);
  await press;

  assert.equal(world.button.disabled, false, "the press never ends: the button stays dead for ever");
  assert.equal(world.button.textContent, "Simpan tetapan", "the button is not usable again");
  assert.equal(world.button.getAttribute("aria-busy"), "false", "the button is still announced as busy after it failed");
  assert.equal(world.nodes.settingDialog.getAttribute("aria-busy"), "false", "the dialog is still announced as busy");
  assert.equal(world.button.classList.contains("is-busy"), false, "the spinner keeps turning after the failure");
  assert.match(world.note.textContent, /tidak menjawab|tidak dapat mengesahkan/i, "the dialog does not explain the failure");
  assert.match(world.note.textContent, /Simpanan tidak dibuat/, "the admin is not told their marks were not written");
  assert.equal(world.note.classList.contains("error"), true, "the failure does not read as a failure");
  assert.equal(world.nodes.settingDialog.closed, false, "the dialog closed and the admin's work vanished");
  assert.equal(world.selection.size, 27, "the 27 marks were lost by the failed save");
  assert.equal(world.writes.length, 0, "an unverified timetable was written to Sheets anyway");
  assert.equal(world.db.schedule.length, 1, "the device database was rewritten despite the failed check");
  assert.ok(world.toasts.some((item) => item.type === "error"), "no toast reports the failure");
});

test("a check that fails outright refuses the same way and keeps the marks", async () => {
  const world = harness({ status: () => Promise.reject(new Error("Sambungan gagal (500).")) });
  await world.context.saveSettingSlots();

  assert.equal(world.button.disabled, false);
  assert.match(world.note.textContent, /Sambungan gagal \(500\)/, "the real reason is hidden from the admin");
  assert.equal(world.nodes.settingDialog.closed, false, "the dialog closed on a failed check");
  assert.equal(world.selection.size, 27, "the marks were dropped");
  assert.equal(world.writes.length, 0, "a write went out after a failed check");
});

// A moved revision means the timetable must be reloaded first. That reload is a whole bootstrap, so
// it needs its own label and its own bound: this is the case the admin waits longest on.
test("reloading a changed timetable reports itself and is bounded too", async () => {
  let syncStarted = false;
  const world = harness({
    status: () => Promise.resolve({ revision: 9 }),
    sync: () => { syncStarted = true; return new Promise(() => {}); },
  });
  const press = world.context.saveSettingSlots();
  await world.settle();
  assert.equal(syncStarted, true, "the newer timetable is never loaded");
  assert.match(world.button.textContent, /^Memuatkan jadual terkini/, "the longer wait is not reported on the button");
  assert.match(world.note.textContent, /Memuatkan jadual terkini/, "the dialog does not report the longer wait");

  await world.advance(120000);
  await press;
  assert.equal(world.button.disabled, false, "a hung bootstrap leaves the dialog stuck for ever");
  assert.match(world.note.textContent, /tidak selesai|tidak menjawab|tidak dapat mengesahkan/i, "the stuck reload is not explained");
  assert.equal(world.writes.length, 0, "the version was rewritten without being verified");
  assert.equal(world.selection.size, 27, "the marks were lost while the timetable reloaded");
});

test("an unchanged school revision still saves, closes and sends the whole version", async () => {
  const world = harness({ status: () => Promise.resolve({ revision: 7 }) });
  await world.context.saveSettingSlots();

  assert.equal(world.writes.length, 1, "the timetable was not sent to Sheets");
  assert.equal(world.writes[0].action, "importSchedule");
  assert.equal(world.writes[0].data.rows.length, 28, "the whole version does not travel with the write");
  assert.match(world.writes[0].message, /27 waktu tetapan disimpan/);
  assert.equal(world.nodes.settingDialog.closed, true, "the dialog stayed open after a good save");
  assert.equal(world.button.disabled, false);
  assert.equal(world.button.textContent, "Simpan tetapan");
  assert.equal(world.note.textContent, "", "the busy line is left behind on the closed dialog");
  assert.equal(world.note.classList.contains("hidden"), true);
  assert.ok(world.context.settingGuard, "the dialog's snapshot was not refreshed after saving");
});

// A timer left behind by a resolved race fires later and, in the browser, keeps the page busy.
test("the deadline timer is cleared once the work is done", async () => {
  const world = harness({ status: () => Promise.resolve({ revision: 7 }) });
  await world.context.saveSettingSlots();
  assert.equal(world.pendingTimers(), 0, "a deadline timer is left running after the save finished");
});

test("the underlying request is cancelled, not just abandoned", async () => {
  const originalFetch = globalThis.fetch;
  let capturedSignal;
  globalThis.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    capturedSignal = options.signal;
    capturedSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  try {
    await assert.rejects(fetchWithTimeout("https://example.invalid/status", {}, 10), /tidak menjawab dalam 1 saat/);
    assert.equal(capturedSignal?.aborted, true, "the fetch signal was not aborted when its budget ended");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(source, /api\.status\(SETTING_STATUS_TIMEOUT\)/, "the save path asks for an unbounded status read");
});
