import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {exportTeachers,importTeachers} from '../teacher-transfer.js';
const teacher={id:'a',name:'ANIZAN BIN AB AZIZ',shortName:'ANIZAN',position:'Guru Prasekolah',priority:9,reliefEligible:false,preschoolEndTime:'11:30',active:true};
test('teacher backup round trips roles and eligibility, without internal IDs',()=>{
  const text=exportTeachers([teacher]);assert.ok(!text.includes('"id"'));
  const result=importTeachers(text,[]);
  assert.equal(result.teachers[0].position,teacher.position);
  assert.equal(result.teachers[0].reliefEligible,false);
  assert.equal(result.teachers[0].preschoolEndTime,'11:30');
});
test('legacy preschool backup without a cutoff imports as excluded, never silently eligible',()=>{
  const legacy=JSON.parse(exportTeachers([teacher]));
  legacy.teachers[0].preschoolEndTime='';
  legacy.teachers[0].reliefEligible=true;
  const result=importTeachers(JSON.stringify(legacy),[]);
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
test('Apps Script teacher schema persists the preschool session cutoff privately',()=>{
  const server=fs.readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
  assert.match(server,/Teachers: \[[^\]]*"preschoolEndTime"/);
  assert.match(server,/function encodeTeacher_\(item\)[^\n]*text_\(item\.preschoolEndTime\)/);
  const mirror=fs.readFileSync(new URL('../apps-script/Builder.gs',import.meta.url),'utf8');
  assert.doesNotMatch(mirror,/preschoolEndTime/);
});

test('absence cancel controls cannot submit or trigger required field validation',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const form=html.slice(html.indexOf('<form id="absenceForm"'),html.indexOf('</form>',html.indexOf('<form id="absenceForm"')));
  const close=form.match(/<button[^>]*data-close-absence[^>]*>/g);
  assert.equal(close.length,2);close.forEach(tag=>assert.match(tag,/type="button"/));
  assert.match(form,/<button type="submit" id="saveAbsence"/);
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(app,/\$\("#absenceForm"\)\.addEventListener\("submit", saveAbsenceRecord\)/);
  assert.match(app,/\$\("#reliefDate"\)\.value = date/);
  assert.match(app,/currentDrafts = buildReliefDrafts\(db, date\)/);
});
