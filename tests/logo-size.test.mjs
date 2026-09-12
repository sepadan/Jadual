import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const builder = read("builder.js");
const app = read("app.js");

// Satu logo beresolusi kamera (886 KB) pernah menjadi 93% daripada muatan draf: setiap bacaan draf
// menghantar hampir 1 MB ke setiap peranti. Logo dicetak pada kepala surat A4, jadi ia dikecilkan
// sebelum ia masuk ke dalam draf.
test("a logo is shrunk before it enters the draft", () => {
  const upload = builder.slice(builder.indexOf("$('#logoIn').onchange"), builder.indexOf("$('#logoIn').onchange") + 700);
  assert.match(upload, /kecilkanLogo_\(r\.result\)/, "the uploaded image is stored at camera size");
  assert.match(upload, /S\.sekolah\['logo'\+logoSlot\]=kecil/, "the shrunken image is not the one kept");
});

test("the size policy keeps a printable logo", () => {
  assert.match(builder, /const LOGO_MAX_SIDE_=480/, "there is no cap on the logo size");
  assert.match(builder, /const LOGO_MAX_BYTES_=150\*1024/, "there is no cap on the logo bytes");
  const helper = builder.slice(builder.indexOf("async function kecilkanLogo_"), builder.indexOf("async function kecilkanLogo_") + 1600);
  assert.match(helper, /Math\.min\(1,LOGO_MAX_SIDE_\/Math\.max\(lebar,tinggi\)\)/, "the logo is not scaled down to the cap");
  assert.match(helper, /png\.length<=jpg\.length\?png:jpg/, "the smaller encoding is not chosen");
  assert.match(helper, /return src;/, "a failed shrink would lose the logo");
});

test("a draft that already holds a big logo is shrunk on load and on save", () => {
  assert.match(builder, /shrinkLogos: async \(state\) =>/, "the builder does not offer a shrink for loaded drafts");
  assert.match(app, /async function shrinkLoadedLogos\(\)/, "a draft from Sheets keeps its oversized logo");
  assert.match(app, /const logoKecil = await shrinkLoadedLogos\(\)/, "the loaded draft is never shrunk");
  assert.match(app, /if \(logoKecil\) builderDirty = true;/, "a shrunk logo is not offered for saving");
  assert.match(app, /const state=await window\.jadualBuilder\.shrinkLogos\(structuredClone\(sebelum\)\)/, "saving writes the oversized logo back to Sheets");
});
