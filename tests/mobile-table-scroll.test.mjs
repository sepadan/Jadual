import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

// Jadual lebar mesti kekal selebar desktop pada telefon dan hanya disediakan leretan mendatar.
// Tanpa min-width, lajur nama dihimpit sampai namanya tidak kelihatan: Slot Tetap pada lajur
// "Nama", Senarai Kelas pada lajur "Guru Kelas" (diukur pada 390px: 44px -> nama tidak nampak).
test("wide builder tables keep their desktop width and scroll sideways on a phone", () => {
  const css = read("builder.css");
  // Ada dua blok @media(max-width:820px) - ambil yang mengandungi peraturan jadual, bukan yang
  // menguruskan grid kad (g2/g3/g4).
  const block = [...css.matchAll(/@media\(max-width:820px\)\{[\s\S]*?\n\}/g)]
    .map((m) => m[0])
    .find((b) => b.includes("table.dt.teacher-table"));
  assert.ok(block, "blok jadual mudah alih (@media max-width:820px) hilang");
  assert.match(block, /#builderRoot table\.dt\.teacher-table\{min-width:980px\}/);
  assert.match(block, /#builderRoot table\.dt\.subject-table\{min-width:1050px\}/);
  assert.match(block, /#builderRoot table\.dt\.acara-table\{min-width:940px\}/, "jadual Slot Tetap hilang lebar minimum");
  assert.match(block, /#builderRoot table\.dt\.kelas-table\{min-width:760px\}/, "jadual Senarai Kelas hilang lebar minimum");
  assert.match(block, /table\.dt\.acara-table thead th[^{]*\{position:sticky/, "kepala jadual Slot Tetap tidak lagi melekat semasa meleret");
  assert.match(block, /table\.dt\.kelas-table thead th[^{]*\{position:sticky/, "kepala jadual Kelas tidak lagi melekat semasa meleret");
  assert.match(block, /\.tblwrap\{overflow-x:auto/, "pembalut jadual tidak lagi boleh meleret");
});

test("the Slot Tetap table carries its class and keeps every column header", () => {
  const js = read("builder.js");
  assert.match(js, /<table class="dt acara-table">/, "jadual Slot Tetap kehilangan kelas acara-table");
  assert.match(js, /<table class="dt kelas-table">/, "jadual Senarai Kelas kehilangan kelas kelas-table");
  // Lajur mesti sepadan dengan 8 sel dalam setiap baris; tajuk yang tercicir menjadikan nama
  // guru/aktiviti tidak lagi dipaparkan dengan betul.
  assert.match(
    js,
    /<th style="width:90px">Kod<\/th><th>Nama<\/th><th style="width:110px">Hari<\/th>\s*\n\s*<th style="width:90px">Waktu<\/th><th style="width:90px">Panjang<\/th>/,
    "tajuk lajur Slot Tetap tidak lengkap (Kod/Nama/Hari mesti ada)",
  );
});
