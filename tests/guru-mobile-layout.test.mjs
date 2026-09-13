import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../builder.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../builder.js", import.meta.url), "utf8");
const harness = readFileSync(new URL("../tools/verify-print.html", import.meta.url), "utf8");

// Aduan sebenar: pada telefon, senarai Guru memaksa jadual 980px, jadi pentadbir hanya nampak
// sebahagian lajur - nama terpotong dan medan Kod di luar skrin.
const kiraKekhususan = (sel) => ({
  id: (sel.match(/#/g) || []).length,
  kelas: (sel.match(/\.[a-zA-Z]/g) || []).length,
  elemen: (sel.match(/(?:^|[\s>+~])[a-zA-Z][a-zA-Z0-9]*/g) || []).length,
});

test("override telefon untuk senarai Guru mengalahkan peraturan asas 980px", () => {
  const asas = "#builderRoot .teacher-table";
  const ganti = "#builderRoot .tblwrap table.teacher-table";
  assert.ok(css.includes(`${asas}{min-width:980px}`), "peraturan asas min-width:980px mesti wujud dalam CSS");
  assert.ok(css.includes(`${ganti}{min-width:0`), "override telefon mesti bersarang dalam .tblwrap supaya kekhususannya lebih tinggi");

  const sAsas = kiraKekhususan(asas);
  const sGanti = kiraKekhususan(ganti);
  // Peraturan media TIDAK menambah kekhususan, dan peraturan asas datang kemudian dalam fail ini;
  // tanpa kekhususan lebih tinggi, min-width:980px akan menang dan pembetulan telefon tidak berkesan.
  assert.ok(
    sGanti.id > sAsas.id || (sGanti.id === sAsas.id && sGanti.kelas > sAsas.kelas) || (sGanti.id === sAsas.id && sGanti.kelas === sAsas.kelas && sGanti.elemen > sAsas.elemen),
    `kekhususan override (${JSON.stringify(sGanti)}) mesti lebih tinggi daripada peraturan asas (${JSON.stringify(sAsas)})`,
  );
});

test("pada telefon, kepala jadual disembunyikan dan setiap baris menjadi kad dengan label", () => {
  const blok = css.slice(css.indexOf("@media(max-width:820px)"));
  assert.match(blok, /\.teacher-table thead\{display:none\}/, "kepala jadual mesti disembunyikan pada telefon");
  assert.match(blok, /\.teacher-table tbody tr\{display:flex;flex-wrap:wrap/, "baris mesti membalut supaya medan tidak terkeluar skrin");
  assert.match(blok, /nth-child\(2\)::before\{content:"Kod"/, "medan kod mesti ada label kerana kepala jadual disembunyikan");
  assert.match(blok, /nth-child\(3\)::before\{content:"Maks\/hari"/, "medan Maks/hari mesti ada label");
  assert.match(blok, /nth-child\(1\)\{flex:1 1 100%\}/, "nama guru mesti selebar kad");
});

test("jadual borang yang masih melimpah memberi petunjuk leret, bukan terpotong senyap", () => {
  assert.match(js, /function tandaLeretBolehSkrol_\(akar\)/, "fungsi petunjuk mesti wujud");
  assert.match(js, /if\(def\.after\) def\.after\(\);\s*\n\s*tandaLeretBolehSkrol_\(\);/m, "petunjuk mesti dipasang selepas setiap render");
  const fn = js.slice(js.indexOf("function tandaLeretBolehSkrol_("), js.indexOf("function ulang()"));
  assert.match(fn, /scrollhint-auto'\)\.forEach\(el=>el\.remove\(\)\)/, "petunjuk lama mesti dibuang dahulu supaya tidak berganda");
  assert.match(fn, /scrollWidth<=wrap\.clientWidth\+1/, "petunjuk hanya apabila benar-benar melimpah");
});

test("halaman harness pengesahan memakai viewport mudah alih seperti aplikasi sebenar", () => {
  // Tanpa meta viewport, Chromium memakai lebar susun-atur 980px dan ukuran telefon menjadi palsu -
  // peraturan @media(max-width:820px) tidak akan diuji langsung.
  assert.match(harness, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});
