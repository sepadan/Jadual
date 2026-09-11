import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Runs the deployed cache helpers against a fake CacheService: the point of the chunking is that a
// payload larger than the 100 KB per-key limit still comes back byte-identical.
const source = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const block = source.slice(source.indexOf("var BOOT_CACHE_TTL_"), source.indexOf("function bootstrap_("));

function makeContext() {
  const store = new Map();
  let puts = 0;
  const cache = {
    get: (key) => (store.has(key) ? store.get(key) : null),
    getAll: (keys) => Object.fromEntries(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
    putAll: (map) => { puts += 1; Object.entries(map).forEach(([k, v]) => store.set(k, v)); },
  };
  const context = vm.createContext({
    CacheService: { getScriptCache: () => cache },
    JSON, Object, String, Number, Math, Array, console,
    __store: store,
    __puts: () => puts,
  });
  vm.runInContext(block, context);
  return context;
}

const bigPayload = (bytes) => ({
  revision: 42,
  teachers: Array.from({ length: Math.ceil(bytes / 200) }, (_, index) => ({ id: `g-${index}`, name: `GURU ${index}`.padEnd(120, "X") })),
});

test("a database larger than one cache key round trips byte for byte", () => {
  const context = makeContext();
  const data = bigPayload(320 * 1024);
  const text = JSON.stringify(data);
  assert.ok(text.length > 100 * 1024, "the fixture must exceed the per-key limit to be meaningful");
  vm.runInContext("writeBootCache_(42, __data)", vm.createContext({ ...context, __data: data }));
  const chunkCount = Number(context.__store.get("boot-42-n"));
  assert.equal(chunkCount, Math.ceil(text.length / 90000), "the payload was not split as expected");
  const restored = vm.runInContext("readBootCache_(42)", vm.createContext({ ...context, __data: data }));
  assert.equal(JSON.stringify(restored), text, "the cached copy differs from what was stored");
});

test("a missing chunk rebuilds instead of serving a broken database", () => {
  const context = makeContext();
  const data = bigPayload(320 * 1024);
  vm.runInContext("writeBootCache_(7, __data)", vm.createContext({ ...context, __data: data }));
  context.__store.delete("boot-7-1");
  assert.equal(vm.runInContext("readBootCache_(7)", vm.createContext({ ...context, __data: data })), null);
});

test("a new revision never reads the previous revision's cache", () => {
  const context = makeContext();
  const data = bigPayload(320 * 1024);
  vm.runInContext("writeBootCache_(1, __data)", vm.createContext({ ...context, __data: data }));
  assert.equal(vm.runInContext("readBootCache_(2)", vm.createContext({ ...context, __data: data })), null, "revision 2 must not inherit revision 1");
});

test("bootstrap serves the cache on the second call and rebuilds after a write", () => {
  const cacheStore = new Map();
  const cache = {
    get: (key) => (cacheStore.has(key) ? cacheStore.get(key) : null),
    getAll: (keys) => Object.fromEntries(keys.filter((k) => cacheStore.has(k)).map((k) => [k, cacheStore.get(k)])),
    putAll: (map) => Object.entries(map).forEach(([k, v]) => cacheStore.set(k, v)),
  };
  let revision = 5;
  let sheetReads = 0;
  const context = vm.createContext({
    CacheService: { getScriptCache: () => cache },
    JSON, Object, String, Number, Math, Array, console, Date,
    configValue_: (key) => (key === "DATA_REVISION" ? String(revision) : key === "UPDATED_AT" ? "2026-01-01T00:00:00.000Z" : ""),
    reliefDailyLimit_: () => 2,
    bool_: (value) => value === true,
    readObjects_: (name) => { sheetReads += 1; return [{ name, rows: 3 }]; },
    parseJson_: (value, fallback) => fallback,
  });
  vm.runInContext(source.slice(source.indexOf("var BOOT_CACHE_TTL_"), source.indexOf("function importSchedule_(")), context);
  const first = vm.runInContext("bootstrap_(0)", context);
  const readsAfterFirst = sheetReads;
  const second = vm.runInContext("bootstrap_(0)", context);
  assert.equal(sheetReads, readsAfterFirst, "the second bootstrap still read the sheets");
  assert.deepEqual(JSON.parse(JSON.stringify(second.data)), JSON.parse(JSON.stringify(first.data)));
  revision = 6;
  vm.runInContext("bootstrap_(0)", context);
  assert.ok(sheetReads > readsAfterFirst, "a new revision must read the sheets again");
});
