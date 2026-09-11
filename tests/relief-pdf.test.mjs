import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReliefPdf,openReliefPdf,shouldUseDirectPdf} from '../relief-pdf.js';

const periods=Array.from({length:11},(_,index)=>({period:index+1,startTime:`${String(index+7).padStart(2,'0')}:30`,endTime:`${String(index+8).padStart(2,'0')}:00`}));
const group=index=>({
  teacherName:`GURU TIADA ${index}`,
  slots:{1:{classes:['6 BIJAK\nBM'],replacements:['CIKGU WEE']},7:{classes:['3 BIJAK\nSN'],replacements:['CIKGU AMIRAH']}},
});
const model={school:'SK Paya Redan, Muar',date:'2026-09-11',dateLabel:'11/09/2026',dayLabel:'JUMAAT',periods,groups:[group(1)]};
const decode=bytes=>new TextDecoder().decode(bytes);

test('mobile relief PDF is a real A4 landscape PDF with the official table',()=>{
  const pdf=decode(buildReliefPdf(model));
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.match(pdf,/\/MediaBox \[0 0 841\.89 595\.28\]/);
  assert.match(pdf,/\/Count 1/);
  assert.match(pdf,/JADUAL GURU GANTI/);
  assert.match(pdf,/GURU TIADA 1/);
  assert.match(pdf,/6 BIJAK/);
  assert.match(pdf,/CIKGU WEE/);
});

test('relief PDF paginates groups without changing landscape page size',()=>{
  const pdf=decode(buildReliefPdf({...model,groups:Array.from({length:7},(_,index)=>group(index+1))}));
  assert.match(pdf,/\/Count 2/);
  assert.equal((pdf.match(/\/MediaBox \[0 0 841\.89 595\.28\]/g)||[]).length,2);
});

test('PDF cross-reference offsets point to their objects',()=>{
  const pdf=decode(buildReliefPdf(model));
  const rows=[...pdf.matchAll(/^(\d{10}) 00000 n $/gm)];
  assert.ok(rows.length>=6);
  rows.forEach((match,index)=>{
    const marker=`${index+1} 0 obj`;
    assert.equal(pdf.slice(Number(match[1]),Number(match[1])+marker.length),marker);
  });
});

test('direct PDF is limited to phones and tablets',()=>{
  assert.equal(shouldUseDirectPdf({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',platform:'iPhone',maxTouchPoints:5}),true);
  assert.equal(shouldUseDirectPdf({userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel)',platform:'Linux armv8l'}),true);
  assert.equal(shouldUseDirectPdf({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',platform:'MacIntel',maxTouchPoints:5}),true);
  assert.equal(shouldUseDirectPdf({userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32',maxTouchPoints:0}),false);
});

test('mobile PDF presenter opens the generated file and revokes its URL later',()=>{
  const calls=[];
  class FakeBlob { constructor(parts,options){this.parts=parts;this.type=options.type;} }
  const environment={
    Blob:FakeBlob,
    URL:{createObjectURL(blob){calls.push(['create',blob.type]);return 'blob:relief';},revokeObjectURL(url){calls.push(['revoke',url]);}},
    open(url,target){calls.push(['open',url,target]);return {};},
    setTimeout(callback,delay){calls.push(['timeout',delay]);callback();},
  };
  const result=openReliefPdf(model,'Jadual.pdf',environment);
  assert.ok(result.bytes instanceof Uint8Array);
  assert.deepEqual(calls,[['create','application/pdf'],['open','blob:relief','_blank'],['timeout',120000],['revoke','blob:relief']]);
});
