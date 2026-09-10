import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('teacher position is a complete selectable list with custom fallback',()=>{
  ['Guru Besar','Guru Penolong Kanan 1','Guru Penolong Kanan HEM','Guru Penolong Kanan Kokurikulum','Guru Akademik Biasa','Guru Prasekolah','Guru Ganti','Guru Praktikal','Personel MySTEP'].forEach(position=>assert.match(html,new RegExp(`<option>${position}</option>`)));
  assert.match(html,/value="__other__">Jawatan lain/);
  assert.match(app,/teacher\?\.position==='Guru Akademik'\?'Guru Akademik Biasa'/);
});
