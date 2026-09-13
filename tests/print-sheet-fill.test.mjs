import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const js = readFileSync("builder.js", "utf8");
const css = readFileSync("builder.css", "utf8");
const flat = css.replace(/\s+/g, "");

test("the print sheet is a definite A4 box so the grid can fill it", () => {
  const rule = flat.slice(flat.indexOf("#builderRoot#cetakArea.sheet{"));
  assert.ok(/^#builderRoot#cetakArea\.sheet\{[^}]*height:767px/.test(rule), "sheet box: " + rule.slice(0, 90));
});

test("row heights are set from the measured sheet, not left to flex/grid", () => {
  assert.match(js, /function isiTinggiCetak_\(/, "the fill pass must exist");
  assert.match(js, /kemasSelCetak_\(akar\)\{\s*\n\s*isiTinggiCetak_\(akar\);/, "cell fit must run the fill pass");
  assert.match(js, /tr\.style\.height=sasaran\+'px'/, "rows get an explicit height");
  assert.match(js, /tbl\.style\.height=\(hThead\+sasaran\*baris\.length\)\+'px'/, "table gets the summed height");
});

test("print and PDF share one geometry (A4 landscape, 5 mm margins, 287 x 200 mm sheet)", () => {
  assert.match(flat, /@page\{size:A4landscape;margin:5mm\}/, "page margins must match the export");
  assert.match(flat, /#builderRoot#cetakArea\.sheet\{width:100%;height:200mm;min-height:0\}/, "print sheet is the same box");
  assert.ok(!flat.includes("var(--rowh,15mm)"), "the old print-only 15mm row height must be gone");
});

test("every exported page is landscape A4", () => {
  assert.match(js, /new jsPDF\(\{orientation:'landscape',unit:'mm',format:'a4'/, "landscape A4");
  assert.match(js, /pdf\.addPage\('a4','landscape'\)/, "later pages landscape too");
});
