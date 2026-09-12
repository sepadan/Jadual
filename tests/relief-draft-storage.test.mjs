import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// A relief draft lives only on the device, so a device that silently refuses to store it is the one
// way an admin can lose a day of relief work while believing it was saved.
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const slice = source.slice(source.indexOf("let storageWarned"), source.indexOf("function restoreDrafts"));

function run(localStorage) {
  const toasts = [];
  const context = vm.createContext({
    console, JSON,
    DRAFT_KEY: "sistem-jadual-draf-relief-v1",
    currentDrafts: [{ id: "d1", period: 2 }],
    generatedReliefKey: "key-1",
    $: () => ({ value: "2026-09-12" }),
    localStorage,
    toast: (message, type) => toasts.push({ message, type }),
  });
  vm.runInContext(slice, context);
  context.saveDrafts();
  return toasts;
}

test("a relief draft that the device refuses to store is reported, not swallowed", () => {
  const toasts = run({ setItem() { throw new Error("QuotaExceededError"); } });
  assert.equal(toasts.length, 1, "nothing told the admin the draft was not saved");
  assert.match(toasts[0].message, /Storan peranti penuh/, "the warning does not explain what happened");
  assert.equal(toasts[0].type, "error", "a lost draft must not be reported as a friendly note");
});

test("the warning is raised once, not on every keystroke", () => {
  const toasts = run({ setItem() { throw new Error("QuotaExceededError"); } });
  assert.equal(toasts.length, 1);
});

test("a device that stores the draft normally stays quiet", () => {
  const written = [];
  const toasts = run({ setItem: (key, value) => written.push(key) });
  assert.deepEqual(toasts, [], "the admin is warned even though the draft was saved");
  assert.equal(written.length, 1, "the draft was not written to the device");
});
