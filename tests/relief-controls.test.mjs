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

test("the absence list lives inside the relief screen, not in its own tab", () => {
  const reliefScreen = html.slice(html.indexOf('id="view-hari-ini"'), html.indexOf('id="view-jadual"'));
  assert.ok(reliefScreen.includes('id="absenceList"'), "the absence list is not part of the relief screen");
  assert.ok(reliefScreen.includes('data-open-absence'), "the + Tambah control is not part of the relief screen");
  assert.equal(html.includes('id="view-ketiadaan"'), false, "the separate absence tab is still present");
  assert.equal(html.includes('data-view="ketiadaan"'), false, "a navigation entry still points at the absence tab");
  assert.equal(html.includes("absenceFilterDate"), false, "a second date control is still present");
  assert.equal(app.includes('showView("ketiadaan")'), false, "app.js still navigates to the removed tab");
});

test("rekod guru tiada points at the embedded list instead of the form", () => {
  assert.ok(app.includes('$("#openAbsence").addEventListener("click", showAbsenceBlock);'), "the relief button is not wired to the absence list");
  const body = functionBody("showAbsenceBlock");
  assert.match(body, /renderAbsences\(\)/);
  assert.match(body, /absenceBlock/);
  assert.equal(app.includes('$("#openAbsence").addEventListener("click", openAbsenceDialog)'), false, "the form must not open straight from the relief screen");
});

test("+ Tambah opens the absence form, and one date drives both lists", () => {
  assert.ok(html.includes("data-open-absence"), "the + Tambah control is missing");
  assert.ok(app.includes("$$('[data-open-absence]').forEach((button) => button.addEventListener(\"click\", openAbsenceDialog))"), "+ Tambah no longer opens the form");
  const body = functionBody("renderAbsences");
  assert.match(body, /#reliefDate/);
  assert.match(app, /#reliefDate"\)\.addEventListener\("change",\(\)=>\{renderDashboard\(\);renderAbsences\(\);\}\)/);
});

test("the guide text no longer describes numbered steps", () => {
  assert.equal(app.includes("1. Rekod guru tiada → 2. Jana relief"), false);
  assert.ok(app.includes("Buka Rekod guru tiada"));
});
