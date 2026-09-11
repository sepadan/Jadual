import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every element app.js reaches for with $("#id") must exist in index.html. A stale reference
// throws inside wireEvents and stops the whole app from starting, which no source-level string
// assertion would notice.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const referenced = new Set([...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
// Created by the builder at runtime rather than present in index.html.
const dynamic = new Set(["dlgBody", "content", "cetakArea", "janaHasil", "builderRoot"]);

test("every id app.js looks up exists in index.html", () => {
  const missing = [...referenced].filter((id) => !htmlIds.has(id) && !dynamic.has(id)).sort();
  assert.deepEqual(missing, [], `app.js looks up ids that do not exist: ${missing.join(", ")}`);
});

test("every element the wiring attaches a listener to is looked up defensively or exists", () => {
  const wired = [...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)\.addEventListener/g)].map((match) => match[1]);
  const missing = [...new Set(wired)].filter((id) => !htmlIds.has(id)).sort();
  assert.deepEqual(missing, [], `listeners are attached to ids that do not exist: ${missing.join(", ")}`);
});

test("Google Sheets connection remains internal and is not configurable in Settings", () => {
  assert.equal(html.includes("Sambungan Google Sheets"), false);
  for (const id of ["apiUrl", "autoSync", "testApi", "saveSettings"]) {
    assert.equal(htmlIds.has(id), false, `removed Settings control still exists: ${id}`);
    assert.equal(referenced.has(id), false, `app.js still dereferences removed Settings control: ${id}`);
  }
  assert.equal(htmlIds.has("loginApiUrl"), true, "login connection field must remain available");
  assert.match(app, /if \(config\.autoSync\) syncData\(false\)/, "background Sheets synchronization was removed");
});
