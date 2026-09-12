import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

// Three promises the school asked for, each of which can silently rot:
// 1. syncing is automatic, so no manual sync button is left anywhere;
// 2. the round "?" button opens the published user guide;
// 3. the published guide is regenerated whenever the app changes, so it can never describe an older
//    system than the one the teachers are holding.
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const html = read("index.html");
const app = read("app.js");
const builder = read("builder.js");
const data = read("data.js");

test("the manual sync button is gone, because syncing is automatic", () => {
  assert.doesNotMatch(html, /syncButton/, "the sync button is still in the markup");
  assert.doesNotMatch(app, /syncButton/, "the code still drives a sync button");
  assert.match(app, /setInterval\(syncIfChanged,\s*8000\)/, "nothing syncs automatically any more");
  assert.match(app, /window\.addEventListener\("online", \(\) => \{ updateConnectionUi\(\);/, "a reconnect no longer triggers a sync");
});

test("the round ? button opens the published guide", () => {
  assert.match(html, /<button id="helpButton" class="icon-button round" title="Panduan penggunaan \(PDF\)" aria-label="Buka panduan penggunaan">\?<\/button>/, "the guide button is missing from the top bar");
  assert.match(app, /\$\("#helpButton"\)\.addEventListener\("click", \(\) => window\.open\("\.\/panduan\/panduan-penggunaan-sistem-jadual\.pdf", "_blank", "noopener"\)\)/, "the guide button is not wired to the guide");
});

test("the guide is published with the app, and it is a real document", () => {
  for (const name of ["panduan-penggunaan-sistem-jadual.pdf", "panduan-penggunaan-sistem-jadual.html"]) {
    const file = new URL(`../panduan/${name}`, import.meta.url);
    const size = statSync(file).size;
    assert.ok(size > 20000, `${name} is too small to be the guide (${size} bytes)`);
  }
});

test("the published guide describes this version of the app, not an older one", () => {
  const version = data.match(/APP_VERSION = "([\d.]+)"/)?.[1];
  assert.ok(version, "the app version could not be read");
  const guide = read("panduan/panduan-penggunaan-sistem-jadual.html");
  assert.match(guide, new RegExp(version.replace(/\./g, "\\.")), `the guide does not mention version ${version} — regenerate it (python panduan_html.py … && node html-to-pdf.mjs …)`);
  assert.match(guide, /Butang bulat/, "the guide does not explain the guide button");
});

test("the Panduan entry is out of the builder menu", () => {
  assert.doesNotMatch(html, /<option value="bantuan">/, "the builder menu still offers Panduan");
  assert.doesNotMatch(html, /data-v="bantuan"/, "the builder sidebar still offers Panduan");
  assert.doesNotMatch(builder, /VIEWS\.bantuan/, "the builder still carries a Panduan view nobody can reach");
});

test("the guide source ships with the app, so the PDF can always be rebuilt", () => {
  const markdown = read("panduan/panduan-penggunaan-sistem-jadual.md");
  assert.match(markdown, /Lajur `REHAT` menegak/, "the guide does not explain the REHAT column");
  assert.match(markdown, /hari persekolahan ke bawah/, "the guide still describes the old orientation");
});
