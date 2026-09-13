import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../builder.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../builder.js", import.meta.url), "utf8");
const harness = readFileSync(new URL("../tools/verify-print.html", import.meta.url), "utf8");

const blokTelefon = css.slice(css.indexOf("ke atas: lebar minimum dikekalkan") >= 0 ? css.lastIndexOf("@media(max-width:820px)") : 0);

// Keputusan pengguna (pemilik sistem): pada telefon, JANGAN padatkan jadual borang menjadi kad -
// "saya nak ikut macam browser desktop, lepastu guna scroll je nak lihat dan edit". Jadi susun atur
// desktop (semua lajur) mesti kekal, dan hanya leretan mendatar disediakan. Percubaan memadatkan
// menjadi kad pernah dibuat dan DIBATALKAN - ujian ini menghalangnya daripada berulang.
test("senarai Guru dan Subjek kekalkan susun atur desktop pada telefon", () => {
  assert.match(css, /@media\(max-width:820px\)\{[^}]*\.tblwrap\{overflow-x:auto/, "pembalut mesti meleret mendatar pada telefon");
  assert.match(css, /table\.dt\.teacher-table\{min-width:980px\}/, "lebar minimum desktop mesti KEKAL pada telefon");
  assert.match(css, /table\.dt\.subject-table\{min-width:1050px\}/, "senarai Subjek juga kekal seperti desktop");
  assert.match(css, /thead th\{position:sticky;top:0\}/, "kepala jadual mesti kekal kelihatan semasa meleret");
});

test("tiada susun atur kad yang menyembunyikan lajur pada telefon", () => {
  assert.doesNotMatch(css, /\.teacher-table thead\{display:none\}/, "kepala jadual tidak boleh disembunyikan");
  assert.doesNotMatch(css, /nth-child\(2\)::before\{content:"Kod"/, "label ::before hanya perlu untuk susun atur kad yang sudah dibatalkan");
  assert.doesNotMatch(css, /\.teacher-table tbody td\{display:block;padding:0;border:0/, "sel tidak boleh dijadikan blok (susun atur kad)");
});

test("jadual yang lebih lebar daripada skrin memberi petunjuk leret, bukan terpotong senyap", () => {
  assert.match(js, /function tandaLeretBolehSkrol_\(akar\)/, "fungsi petunjuk mesti wujud");
  assert.match(js, /if\(def\.after\) def\.after\(\);\s*\n\s*tandaLeretBolehSkrol_\(\);/m, "petunjuk mesti dipasang selepas setiap render");
  const fn = js.slice(js.indexOf("function tandaLeretBolehSkrol_("), js.indexOf("function ulang()"));
  assert.match(fn, /scrollhint-auto'\)\.forEach\(el=>el\.remove\(\)\)/, "petunjuk lama mesti dibuang dahulu supaya tidak berganda");
  assert.match(fn, /scrollWidth<=wrap\.clientWidth\+1/, "petunjuk hanya apabila benar-benar melimpah");
});

test("halaman harness pengesahan memakai viewport mudah alih seperti aplikasi sebenar", () => {
  assert.match(harness, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});
