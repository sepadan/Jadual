import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Newlines normalised so the assertions do not depend on the checkout's line endings.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function functionBody(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing from app.js`);
  const rest = app.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  return rest.slice(0, end < 0 ? rest.length : end);
}

// Quote style is a formatting choice, so comparisons flatten it rather than pin it.
const flat = (source) => source.replace(/['"]/g, '"');
const has = (source, snippet) => flat(source).includes(flat(snippet));

test("the relief screen offers plain actions instead of numbered steps", () => {
  for (const label of [">Rekod guru tiada<", ">Jana<", ">Terbitkan<", ">Cetak<", ">Eksport PDF<"]) {
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
  assert.ok(reliefScreen.includes('id="absenceBlock"') && reliefScreen.includes('id="reliefBlock"'), "the two work blocks are not siblings in the relief screen");
  assert.equal(html.includes('id="view-ketiadaan"'), false, "the separate absence tab is still present");
  assert.equal(html.includes('data-view="ketiadaan"'), false, "a navigation entry still points at the absence tab");
  assert.equal(html.includes("absenceFilterDate"), false, "a second date control is still present");
  assert.equal(app.includes('showView("ketiadaan")'), false, "app.js still navigates to the removed tab");
});

test("generate sits in the relief block like + Tambah sits in the absence block", () => {
  const blocks = html.slice(html.indexOf('id="absenceBlock"'), html.indexOf('id="reliefPrintSheet"'));
  const absenceHead = blocks.slice(0, blocks.indexOf('id="reliefBlock"'));
  const reliefHead = blocks.slice(blocks.indexOf('id="reliefBlock"'));
  assert.match(absenceHead, /data-open-absence>\+ Tambah</, "the absence block lost its + Tambah button");
  assert.match(reliefHead, /id="generateRelief"[^>]*>Jana</, "the relief block lost its Jana button");
});

test("the relief block holds two panels: senarai and preview", () => {
  assert.ok(html.includes('data-relief-panel="senarai"') && html.includes('data-relief-panel="preview"'), "the relief sub-menus are missing");
  assert.ok(html.includes('id="reliefPanelSenarai"') && html.includes('id="reliefPanelPreview"'), "the relief panels are missing");
  assert.ok(html.includes('id="reliefPreview"'), "the preview container is missing");
  assert.ok(app.includes("$$('[data-relief-panel]').forEach((button) => button.addEventListener(\"click\", () => setReliefPanel(button.dataset.reliefPanel)))"), "the sub-menus are not wired");
  const body = functionBody("setReliefPanel");
  assert.match(body, /reliefPanelPreview/);
  assert.match(body, /aria-selected/);
  assert.match(body, /tabIndex/);
});

test("arrow keys are handled by the shared, testable helper", () => {
  assert.match(app, /if \(moveTabFocus\(list, event\.key\)\) event\.preventDefault\(\);/);
  assert.match(functionBody("moveTabFocus"), /next\.focus\(\);\n  next\.click\(\)/, "a programmatic click does not move focus, so the next arrow press would stall");
});

test("the relief screen has two sub tabs: Ketiadaan guru and Relief", () => {
  const tabs = [...html.matchAll(/data-relief-tab="([^"]+)"[^>]*>([^<]+)</g)].map((match) => [match[1], match[2].trim()]);
  assert.deepEqual(tabs, [["ketiadaan", "Ketiadaan guru"], ["relief", "Relief"]]);
  assert.ok(html.includes('role="tablist" aria-label="Pengurusan relief harian"'), "the sub tab bar is not a tablist");
  assert.ok(html.includes('id="absenceBlock" class="relief-tabpanel"') && html.includes('id="reliefBlock" class="relief-tabpanel hidden"'), "only one panel may be visible at a time");
  assert.equal(html.includes("work-columns"), false, "the rejected two-column layout is still in the markup");
  assert.ok(app.includes("$$('[data-relief-tab]').forEach((button) => button.addEventListener(\"click\", () => setReliefTab(button.dataset.reliefTab)))"), "the sub tabs are not wired");
  const body = functionBody("setReliefTab");
  assert.match(body, /absenceBlock/);
  assert.match(body, /reliefBlock/);
  assert.match(body, /tabIndex/);
});

test("the publish bar only appears on the relief sub tab", () => {
  const body = functionBody("updateDraftActions");
  assert.match(body, /reliefTab !== "relief"/);
  assert.match(functionBody("setReliefTab"), /updateDraftActions\(\)/);
  assert.ok(has(app, 'setReliefTab(reliefTab);'), "the sub tabs are not initialised on start-up");
});

test("arrow keys move within one tab level only", () => {
  assert.match(app, /\[role="tablist"\]'\)\.forEach\(\(list\) => list\.addEventListener\("keydown"/);
  assert.ok(has(app, "const tabs = $$('[role=\"tab\"]', list);"), "the handler does not scope itself to its own tablist");
  assert.match(app, /ArrowLeft/);
  assert.match(app, /ArrowRight/);
});

test("print and export are separate buttons, and export always writes a PDF", () => {
  assert.ok(has(app, '$("#printRelief").addEventListener("click", printReliefSheet);'), "the print button is not wired");
  assert.ok(has(app, '$("#exportReliefPdf").addEventListener("click", exportReliefPdf);'), "the export button is not wired");
  const printBody = functionBody("printReliefSheet");
  assert.match(printBody, /window\.print\(\)/);
  assert.equal(printBody.includes("openReliefPdf"), false, "printing must not silently export instead");
  const exportBody = functionBody("exportReliefPdf");
  assert.match(exportBody, /openReliefPdf\(model/);
  assert.equal(app.includes("shouldUseDirectPdf"), false, "the device-dependent shortcut is gone");
});

test("the preview shows drafts too, while the printed sheet stays official", () => {
  const body = functionBody("renderReliefPreview");
  assert.match(body, /includeDrafts:true/);
  assert.match(app, /const model=buildReliefPrintModel\(db,date,PERIODS\);\n  const html=reliefPrintHtml\(model\);\n  \$\('#reliefPrintSheet'\)\.innerHTML=html;/);
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

test("the preview stacks the period number above its clock", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(css, /\.relief-preview \.relief-print-period \{ display: block;/, "without this the number and clock run together as 107:30 on screen");
  assert.match(css, /\.relief-preview \.relief-print-clock \{ display: block;/);
});
