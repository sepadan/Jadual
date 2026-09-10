import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {exportTeachers,importTeachers} from '../teacher-transfer.js';
const teacher={id:'a',name:'ANIZAN BIN AB AZIZ',shortName:'ANIZAN',position:'Guru Prasekolah',priority:9,reliefEligible:false,active:true};
test('teacher backup round trips roles and eligibility, without internal IDs',()=>{
  const text=exportTeachers([teacher]);assert.ok(!text.includes('"id"'));
  const result=importTeachers(text,[]);
  assert.equal(result.teachers[0].position,teacher.position);
  assert.equal(result.teachers[0].reliefEligible,false);
});
test('existing names and repeated rows are skipped without overwriting',()=>{
  const text=exportTeachers([teacher,teacher]);
  assert.equal(importTeachers(text,[]).teachers.length,1);
  assert.equal(importTeachers(text,[teacher]).skipped,2);
});
test('invalid entries are rejected before any import',()=>{
  assert.throws(()=>importTeachers(exportTeachers([{...teacher,name:''}]),[]));
  assert.throws(()=>importTeachers('{"teachers":[]}',[]));
});
test('teacher cancel controls cannot submit or trigger required field validation',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const form=html.slice(html.indexOf('<form id="teacherForm"'),html.indexOf('</form>',html.indexOf('<form id="teacherForm"')));
  const close=form.match(/<button[^>]*data-close-teacher[^>]*>/g);
  assert.equal(close.length,2);close.forEach(tag=>assert.match(tag,/type="button"/));
  assert.match(form,/<button type="submit" id="saveTeacher"/);
});
