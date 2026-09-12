import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('main schedule class picker sorts naturally from Year 1 through Year 6',()=>{
  const start=source.indexOf('function tahunKelas('),end=source.indexOf('function renderTeacherLists(');
  assert.ok(start>=0&&end>start,'main class comparator helper missing');
  const context={};
  vm.runInNewContext(source.slice(start,end),context);
  const input=['6 BIJAK','3 BIJAK','5 CERDIK','2 CERDIK','1 BIJAK','5 BIJAK','2 BIJAK'];
  assert.deepEqual(input.sort(context.bandingNamaKelas),['1 BIJAK','2 BIJAK','2 CERDIK','3 BIJAK','5 BIJAK','5 CERDIK','6 BIJAK']);
  const render=source.slice(end,source.indexOf('function initials(',end));
  assert.match(render,/\.sort\(bandingNamaKelas\)/);
});
