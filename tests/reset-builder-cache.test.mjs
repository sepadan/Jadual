import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../apps-script/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Cache draf dikunci pada BUILDER_REVISION. Set semula data yang memadam draf mesti menaikkan revisi
// itu juga, jika tidak draf yang baru dipadam masih dilayan daripada cache sehingga 6 jam.
test("a reset that deletes the draft also invalidates the draft cache", () => {
  const code = read("Code.gs");
  const reset = code.slice(code.indexOf("function resetData_(data)"), code.indexOf("function resetData_(data)") + 1400);
  assert.match(reset, /if \(cleared\.builder\) \{/, "a reset of the builder target leaves the cached draft alive");
  assert.match(reset, /builderCacheClear_\(configValue_\("BUILDER_REVISION"\)\)/, "the cached chunks of the old revision are not removed");
  assert.match(reset, /setConfig_\("BUILDER_REVISION", String\(Number\(configValue_\("BUILDER_REVISION"\) \|\| 0\) \+ 1\)\)/, "the draft revision is not bumped, so readBuilder_ keeps its old cache key");
  assert.ok(reset.indexOf("builderCacheClear_") < reset.indexOf("bumpRevision_()"), "the draft cache is cleared only after the data revision moved");
});

test("the builder cache clear removes the count and every chunk", () => {
  const builder = read("Builder.gs");
  const fn = builder.slice(builder.indexOf("function builderCacheClear_(revision)"), builder.indexOf("function builderCacheClear_(revision)") + 700);
  assert.match(fn, /var all=\[keys\.count\]/, "the chunk count key is left behind");
  assert.match(fn, /all\.push\(keys\.chunk\(index\)\)/, "the chunks are not removed");
  assert.match(fn, /cache\.removeAll\(all\)/, "nothing is actually removed from the cache");
  assert.match(fn, /catch\(error\) \{\}/, "a cache failure would break the reset");
});
