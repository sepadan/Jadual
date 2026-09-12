import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = read("app.js");
const code = read("apps-script/Code.gs");
const builder = read("apps-script/Builder.gs");

// Bacaan draf ~1 MB mengambil ~3.4 saat, jadi ia tidak boleh berada pada laluan log masuk.
test("the login payload no longer carries the draft", () => {
  const route = code.slice(code.indexOf("if(request.action==='bootstrap')"), code.indexOf("if(request.action==='builder')"));
  assert.ok(route.length > 40, "the bootstrap route was not found");
  assert.equal(/readBuilder_\(\)/.test(route), false, "every login still pays for the ~1 MB draft");
  assert.match(code, /if\(request\.action==='builder'\) return output_\(\{ok:true,builder:readBuilder_\(\)\}\);/, "the draft has no route of its own");
});

// Cache Apps Script mesti berkunci pada revisi: simpan menaikkan revisi, jadi draf basi tidak boleh dibaca.
test("the draft read is cached per revision", () => {
  const body = builder.slice(builder.indexOf("function readBuilder_()"), builder.indexOf("function saveBuilder_"));
  const cachedAt = body.indexOf("builderCacheRead_(revision)");
  const sheetAt = body.indexOf("readObjects_('BuilderState')");
  assert.ok(cachedAt >= 0 && sheetAt > cachedAt, "the sheet is still read before the cache is consulted");
  assert.match(body, /builderCacheWrite_\(revision,\{revision:revision,state:result\.state\}\)/, "the parsed draft is never cached");
  assert.match(builder, /function builderCacheKeys_\(revision\)/, "the cache key ignores the revision");
  assert.match(builder, /'bld-'\+revision\+'-'/, "the cache key ignores the revision");
  assert.match(builder, /if\(count<1\|\|count>40\) return;/, "an oversized draft must not be cached (100 KB per key)");
});

// Pane mesti terbuka pada draf terakhir sebelum rangkaian disentuh, dan tidak memadam kerja baharu.
test("the pane opens on the last draft before the network", () => {
  const body = app.slice(app.indexOf("async function loadBuilder()"), app.indexOf("\nasync function enterAdmin("));
  const cacheAt = body.indexOf("await readBuilderDeviceCache()");
  const netAt = body.indexOf("await api.builderData()");
  assert.ok(cacheAt >= 0 && netAt > cacheAt, "the pane still waits for Google Sheets before it can show a draft");
  assert.match(body, /setBuilderStatus\('Draf peranti dibuka · menyemak draf terbaharu di Sheets/, "the user is not told the draft on screen is the older copy");
  assert.match(body, /if \(cached && builderDirty\)/, "a slow read can overwrite edits made while it ran");
  assert.match(body, /if \(cached\) \{/, "a failed read throws away the draft already on screen");
  assert.match(body, /await writeBuilderDeviceCache\(cloud\.builder\)/, "a fresh draft is never kept for the next open");
});

test("the device copy survives a logout and goes with a data reset", () => {
  // Draf pembina ialah dokumen jadual sekolah, bukan data pelajar, dan ia yang membuat pembina
  // terbuka serta-merta pada setiap sesi. Ia dibuang apabila pentadbir memadam data.
  const leave = app.slice(app.indexOf("async function leaveAdmin("), app.indexOf("async function saveBuilderCloud("));
  assert.equal(
    /clearBuilderDeviceCache\(\)/.test(leave),
    false,
    "logging out throws away the draft copy, so the next open waits on Sheets again",
  );
  const reset = app.slice(app.indexOf('await remoteWrite("resetData"'), app.indexOf('await remoteWrite("resetData"') + 400);
  assert.match(reset, /clearBuilderDeviceCache\(\)/, "a data reset leaves the old draft copy on the device");
  assert.match(app, /async function readBuilderDeviceCache\(\)/, "there is no device copy to open the pane with");
});

// Memuatkan draf menyalakan builder-saved juga (kadangkala lewat), jadi "berubah" mesti datang
// daripada sentuhan sebenar — jika tidak, draf Sheets yang tiba kemudian ditolak dan amaran "belum
// disimpan" muncul untuk kerja yang tidak pernah dibuat.
test("only real work counts as an edit", () => {
  assert.match(app, /let builderUserTouched = false;/, "there is no signal for real work");
  const handler = app.slice(app.indexOf("document.addEventListener('builder-saved'"), app.indexOf("window.addEventListener('beforeunload'"));
  assert.match(handler, /if\(builderUserTouched\|\|builderDirty\)/, "a load still reads as an unsaved change");
  assert.match(handler, /setBuilderStatus\('Draf berubah/, "the workspace never reports unsaved work");
  const baseline = app.slice(app.indexOf("function markBuilderBaseline()"), app.indexOf("async function readBuilderDeviceCache()"));
  assert.match(baseline, /builderDirty = false; builderUserTouched = false;/, "the baseline does not clear the loaded state");
  for (const anchor of ["function applyBuilderCloud(", "const cached = await readBuilderDeviceCache();"]) {
    const slice = app.slice(app.indexOf(anchor), app.indexOf(anchor) + 1400);
    assert.match(slice, /markBuilderBaseline\(\)/, `the draft loaded after ${anchor} is not taken as the baseline`);
  }
  assert.match(app, /\["pointerdown", "keydown"\]\) \$\("#schedule-generator-pane"\)\.addEventListener/, "nothing listens for real touches on the builder");
});
