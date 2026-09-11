import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function functionBody(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from app.js`);
  const rest = app.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  return rest.slice(0, end < 0 ? rest.length : end);
}

test("the relief screen offers plain actions instead of numbered steps", () => {
  for (const label of [">Rekod guru tiada<", ">Jana<", ">Terbitkan<"]) {
    assert.ok(html.includes(label), `${label} is missing from the relief screen`);
  }
  for (const stale of ["1. Rekod guru tiada", "2. Jana relief", "3. Terbitkan relief"]) {
    assert.equal(html.includes(stale), false, `${stale} is still shown`);
  }
});

test("the generate button still exists and carries its own label", () => {
  const button = html.match(/<button id="generateRelief"[^>]*>([^<]*)</);
  assert.ok(button, "the generate button is missing");
  assert.equal(button[1], "Jana");
});

test("rekod guru tiada opens the absence page instead of the form", () => {
  assert.ok(app.includes('$("#openAbsence").addEventListener("click", openKetiadaanPage);'), "the relief button is not wired to the absence page");
  const body = functionBody("openKetiadaanPage");
  assert.match(body, /showView\("ketiadaan"\)/);
  assert.match(body, /absenceFilterDate/);
  assert.match(body, /renderAbsences\(\)/);
  assert.equal(app.includes('$("#openAbsence").addEventListener("click", openAbsenceDialog)'), false, "the form must not open straight from the relief screen");
});

test("the absence page keeps the + Tambah control that opens the form", () => {
  assert.ok(html.includes('data-open-absence'), "the + Tambah control is missing");
  assert.ok(app.includes("$$('[data-open-absence]').forEach((button) => button.addEventListener(\"click\", openAbsenceDialog))"), "+ Tambah no longer opens the form");
});

test("the guide text no longer describes numbered steps", () => {
  assert.equal(app.includes("1. Rekod guru tiada → 2. Jana relief"), false);
  assert.ok(app.includes("Buka Rekod guru tiada"));
});
