import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImportSelection } from "../pdf-import.js";

const teachers = [
  { id: "g-a", name: "GURU A", active: true },
  { id: "g-b", name: "GURU B", active: true },
];

function pages() {
  return [
    { rawName: "GURU A", normalizedName: "GURU A", teacherId: "g-a", rows: [{ day: "IS", period: 1 }] },
    { rawName: "GURU PRAKTIKAL", normalizedName: "GURU PRAKTIKAL", teacherId: "", rows: [{ day: "IS", period: 2 }] },
  ];
}

test("halaman tanpa padanan diabaikan daripada slot import", () => {
  const result = buildImportSelection(pages(), teachers);
  assert.equal(result.unmatchedPages.length, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].teacherId, "g-a");
  assert.match(result.warnings[0], /Diabaikan/);
});

test("halaman yang dipadankan manual dimasukkan semula", () => {
  const input = pages();
  input[1].teacherId = "g-b";
  const result = buildImportSelection(input, teachers);
  assert.equal(result.unmatchedPages.length, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].teacherId, "g-b");
});
