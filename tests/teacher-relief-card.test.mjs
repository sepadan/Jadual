import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('kad guru exposes a keyboard-accessible relief eligibility toggle without hijacking action buttons',()=>{
  assert.match(app,/<button type="button" class="teacher-card-toggle" data-toggle-relief="\$\{esc\(teacher\.id\)\}"/);
  assert.match(app,/teacherReliefReady\(teacher\) \? "relief-eligible" : "relief-excluded"/);
  const toggle=app.match(/<button type="button" class="teacher-card-toggle"[\s\S]*?<\/button>/)?.[0]||'';
  assert.doesNotMatch(toggle,/<(?:h[1-6]|p)\b/);
  assert.match(app,/toggleTeacherReliefEligibility/);
  assert.match(app,/remoteWrite\("saveTeacher", teacher/);
  assert.match(app,/teacher\.position === "Guru Prasekolah" && !validClockTime\(teacher\.preschoolEndTime\)/);
  assert.match(css,/\.teacher-card\.relief-eligible/);
  assert.match(css,/\.teacher-card\.relief-excluded/);
});

test('profil Guru Prasekolah has one required session-end time shown only for that position',()=>{
  assert.match(html,/id="teacherPreschoolEndWrap" class="hidden"/);
  assert.match(html,/id="teacherPreschoolEndTime" type="time"/);
  assert.match(app,/function togglePreschoolEndTime/);
  assert.match(app,/position === "Guru Prasekolah"/);
  assert.match(app,/\$\("#teacherPreschoolEndTime"\)\.required = preschool/);
  assert.match(app,/preschoolEndTime[,}]/);
});
