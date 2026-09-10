import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTeacherPdf} from '../pdf-import.js';

function documentAt(width, height, dx = 0, dy = 0, invalid = false) {
  const sx = width / 792, sy = height / 612;
  const items = [];
  const add = (str, x, top, size = 10, w = 10) => items.push({str,
    width: w * sx, transform: [size * sx, 0, 0, size * sy, x * sx + dx, height + dy - (top + size) * sy]});
  add('JADUAL WAKTU PERSENDIRIAN GURU', 200, 30);
  add('GURU A', 200, 55);
  for (let p = 0; p <= 12; p++) add(String(p), 71.65 + ((p >= 6 ? p + 1 : p) + .5) * 35.58 - 5 + (invalid ? 40 : 0), 90);
  add('BM', 110, 132);
  add('1 B', 71.65 + 2 * 35.58 - 12, 165, 20, 24);
  add('Jumlah Waktu', 640, 400);
  add('2', 715, 400);
  return {getDocument: () => ({promise: Promise.resolve({numPages: 1,
    getPage: async () => ({view: [dx,dy,width+dx,height+dy],getTextContent: async () => ({items}),cleanup() {}})}),destroy: async () => {}})};
}
const teachers = [{id: 'a',name: 'GURU A',active: true}];
test('A4, enlarged paper and CropBox retain identical slots', async () => {
  const original = await parseTeacherPdf(new Uint8Array(),documentAt(792,612),teachers);
  assert.equal(original.rows.length,2);
  assert.equal(original.pages[0].expectedSlotCount,2);
  for (const args of [[841.92,595.32],[1584,1224],[841.92,595.32,20,30]]) {
    const result = await parseTeacherPdf(new Uint8Array(),documentAt(...args),teachers);
    assert.deepEqual(result.rows,original.rows);
    assert.deepEqual(result.structuralWarnings,[]);
  }
});
test('unrecognized table is rejected even on valid paper', async () => {
  await assert.rejects(parseTeacherPdf(new Uint8Array(),documentAt(842,595,0,0,true),teachers),/Susun atur/);
});
