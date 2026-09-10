import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../builder.js',import.meta.url),'utf8');

test('teacher allocation exposes manual class pairing controls',()=>{
  assert.match(source,/Kelas pairing/);
  assert.match(source,/pilihGuruPairing\(\$\{i\}\)/);
  assert.match(source,/pairGuruIds/);
  assert.match(source,/Guru yang dipilih akan dijadualkan bersama guru utama/);
});
