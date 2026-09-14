import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('pengisian guru tiada menggunakan dropdown sebab yang diwajibkan', () => {
  const match = html.match(/<select\s+id="absenceReason"([^>]*)>([\s\S]*?)<\/select>/);
  assert.ok(match, 'Sebab ringkas mesti menggunakan elemen select');
  assert.match(match[1], /\brequired\b/, 'Pilihan sebab mesti diwajibkan');

  const options = [...match[2].matchAll(/<option(?:\s+value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)]
    .map(([, value, label]) => ({ value: value ?? label.trim(), label: label.trim() }));

  assert.deepEqual(options, [
    { value: '', label: 'Pilih sebab' },
    { value: 'CRK', label: 'CRK' },
    { value: 'CTR', label: 'CTR' },
    { value: 'Mesyuarat/Kursus/Bengkel/Seminar', label: 'Mesyuarat/Kursus/Bengkel/Seminar' },
    { value: 'Urusan Sekolah', label: 'Urusan Sekolah' },
    { value: 'Urusan Keluarga', label: 'Urusan Keluarga' },
  ]);
});
