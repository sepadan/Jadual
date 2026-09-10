// Turn reviewed aSc rows into a complete, editable builder draft.
// Unknown PDF teachers remain omitted; values not present in aSc are preserved from the current draft.
const DAYS={IS:'ISNIN',SEL:'SELASA',RAB:'RABU',KHA:'KHAMIS',JUM:'JUMAAT'};
const DAY_ORDER=Object.values(DAYS);
const PALETTE=['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#ede9fe','#cffafe','#ffedd5','#e2e8f0'];

const clean=value=>String(value||'').trim();
const upper=value=>clean(value).toUpperCase();
const key=value=>upper(value).replace(/\s+/g,' ');
const makeId=(prefix,index)=>`${prefix}-pdf-${index}`;
const toMinutes=value=>{const match=/^(\d{1,2}):(\d{2})$/.exec(clean(value));return match?Number(match[1])*60+Number(match[2]):NaN;};

function mostCommon(values,fallback=0) {
  const counts=new Map();
  values.filter(Number.isFinite).forEach(value=>counts.set(value,(counts.get(value)||0)+1));
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0]?.[0]??fallback;
}

function uniqueRows(rows) {
  const seen=new Set();
  rows.forEach(row=>{
    const slot=`${row.teacherId}|${row.day}|${Number(row.period)}`;
    if(seen.has(slot)) throw new Error('PDF mempunyai slot guru berulang. Semak padanan dahulu.');
    seen.add(slot);
  });
}

function titleFromRawName(rawName) {
  return upper(rawName).match(/^(TN HJ|PN HJH|EN|PN|CIK|DR)\b/)?.[1]||'';
}

function sameTeacherSet(a,b) {
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}

function deriveBreaks(periods,baseBreaks) {
  if(!periods?.length) return structuredClone(baseBreaks||[{selepas:5,minit:20,label:'REHAT'}]);
  const breaks=[];
  periods.filter(item=>item.period>=1).sort((a,b)=>a.period-b.period).forEach((period,index,list)=>{
    const next=list[index+1];
    if(!next||next.period!==period.period+1) return;
    const gap=toMinutes(next.startTime)-toMinutes(period.endTime);
    if(gap>0) breaks.push({selepas:period.period,minit:gap,label:'REHAT'});
  });
  return breaks.length?breaks:structuredClone(baseBreaks||[]);
}

function inferConstraints(rows,base) {
  const teacherDays=new Map(),subjectDays=new Map(),runs=new Map();
  rows.forEach(row=>{
    const teacherDay=`${row.teacherId}|${row.day}`;
    const subjectDay=`${row.className}|${row.subject}|${row.day}`;
    if(!teacherDays.has(teacherDay)) teacherDays.set(teacherDay,new Set());
    if(!subjectDays.has(subjectDay)) subjectDays.set(subjectDay,new Set());
    if(!runs.has(teacherDay)) runs.set(teacherDay,[]);
    teacherDays.get(teacherDay).add(Number(row.period));
    subjectDays.get(subjectDay).add(Number(row.period));
    runs.get(teacherDay).push(row);
  });
  let maxRun=1;
  runs.forEach(list=>{
    list.sort((a,b)=>Number(a.period)-Number(b.period));let current=1;
    for(let index=1;index<list.length;index++) {
      const contiguous=Number(list[index].period)===Number(list[index-1].period)+1&&(!list[index-1].endTime||!list[index].startTime||list[index-1].endTime===list[index].startTime);
      current=contiguous?current+1:1;maxRun=Math.max(maxRun,current);
    }
  });
  const maxDaily=Math.max(1,...[...teacherDays.values()].map(set=>set.size));
  const maxSubject=Math.max(1,...[...subjectDays.values()].map(set=>set.size));
  return {...base,maxHariGuru:Math.max(Number(base?.maxHariGuru||8),maxDaily),maxBerturut:Math.max(Number(base?.maxBerturut||4),maxRun),maxSubjekSehari:Math.max(Number(base?.maxSubjekSehari||3),maxSubject)};
}

export function draftFromPdf(rows,teachers,base={},metadata={}) {
  const state=structuredClone(base||{});
  const validRows=(rows||[]).filter(row=>teachers.some(teacher=>teacher.active&&teacher.id===row.teacherId)&&DAYS[row.day]&&Number(row.period)>=1);
  uniqueRows(validRows);
  const teachingRows=validRows.filter(row=>!row.isDuty&&row.className);
  if(!teachingRows.length) throw new Error('Tiada slot kelas dipadankan untuk membina draf.');

  const baseSchool=state.sekolah||{};
  state.v=3;
  state.sekolah={...baseSchool,nama:metadata.schoolName||baseSchool.nama||'',tajukGuru:metadata.teacherTitle||baseSchool.tajukGuru||'JADUAL WAKTU PERSENDIRIAN GURU',tajukKelas:baseSchool.tajukKelas||'JADUAL WAKTU KELAS',tahun:metadata.year||baseSchool.tahun||String(new Date().getFullYear()),gb:metadata.principalName||baseSchool.gb||'',gbGelaran:metadata.principalTitle||baseSchool.gbGelaran||'GURU BESAR'};
  state.hari=DAY_ORDER.slice();state.subjek=[];state.kelas=[];state.guru=[];state.peruntukan={};state.agihan=[];state.acara=[];state.jadual={slots:[],sumber:'PDF aSc',diimport:new Date().toISOString()};

  const pageByTeacher=new Map((metadata.pages||[]).filter(page=>page.teacherId).map(page=>[page.teacherId,page]));
  const teacherMap=new Map();
  [...new Set(validRows.map(row=>row.teacherId))].forEach(teacherId=>{
    const directory=teachers.find(teacher=>teacher.active&&teacher.id===teacherId);if(!directory) return;
    const existing=(base.guru||[]).find(guru=>guru.directoryId===directory.id||key(guru.nama)===key(directory.name));
    const guru={...existing,id:existing?.id||makeId('g',teacherMap.size),directoryId:directory.id,nama:directory.name,kod:directory.shortName||existing?.kod||'',jawatan:directory.position||existing?.jawatan||'',gelaran:existing?.gelaran||titleFromRawName(pageByTeacher.get(teacherId)?.rawName),maxHari:Number(existing?.maxHari||8),tidakAda:structuredClone(existing?.tidakAda||[])};
    teacherMap.set(teacherId,guru);state.guru.push(guru);
  });

  const subjectMap=new Map(),classMap=new Map();
  teachingRows.forEach(row=>{
    const subjectKey=key(row.subject||'SUBJEK');
    if(!subjectMap.has(subjectKey)) {
      const existing=(base.subjek||[]).find(subject=>key(subject.kod)===subjectKey);
      const subject={...existing,id:existing?.id||makeId('s',subjectMap.size),kod:upper(row.subject||'SUBJEK'),nama:existing?.nama||upper(row.subject||'SUBJEK'),warna:existing?.warna||PALETTE[subjectMap.size%PALETTE.length],teras:existing?.teras||false,pagi:existing?.pagi||false,ganda:false,kemudahan:existing?.kemudahan||''};
      subjectMap.set(subjectKey,subject);state.subjek.push(subject);
    }
    const classKey=key(row.className);
    if(!classMap.has(classKey)) {
      const existing=(base.kelas||[]).find(kelas=>key(kelas.nama)===classKey);
      const kelas={...existing,id:existing?.id||makeId('k',classMap.size),nama:upper(row.className),tahap:Number(clean(row.className).match(/^[1-6]/)?.[0]||existing?.tahap||1),guruKelas:existing?.guruKelas||''};
      classMap.set(classKey,kelas);state.kelas.push(kelas);
    }
  });

  (metadata.pages||[]).forEach(page=>{
    if(!page.teacherId||!page.classTeacherClass) return;
    const kelas=classMap.get(key(page.classTeacherClass)),guru=teacherMap.get(page.teacherId);
    if(kelas&&guru) kelas.guruKelas=guru.id;
  });

  const mapped=teachingRows.map(row=>({...row,hari:DAYS[row.day],period:Number(row.period),guruId:teacherMap.get(row.teacherId)?.id,kelasId:classMap.get(key(row.className))?.id,subjekId:subjectMap.get(key(row.subject||'SUBJEK'))?.id})).filter(row=>row.guruId&&row.kelasId&&row.subjekId).sort((a,b)=>a.guruId.localeCompare(b.guruId)||DAY_ORDER.indexOf(a.hari)-DAY_ORDER.indexOf(b.hari)||a.period-b.period||a.kelasId.localeCompare(b.kelasId));
  mapped.forEach(row=>{
    const previous=state.jadual.slots.at(-1);
    const canJoin=previous&&previous.guruId===row.guruId&&previous.kelasId===row.kelasId&&previous.subjekId===row.subjekId&&previous.hari===row.hari&&previous.mula+previous.panjang===row.period&&(!previous.endTime||!row.startTime||previous.endTime===row.startTime);
    if(canJoin){previous.panjang+=1;previous.endTime=row.endTime||previous.endTime;}
    else state.jadual.slots.push({id:makeId('slot',state.jadual.slots.length),kelasId:row.kelasId,subjekId:row.subjekId,guruId:row.guruId,hari:row.hari,mula:row.period,panjang:1,kunci:true,sumber:'aSc',startTime:row.startTime||'',endTime:row.endTime||''});
  });

  const occupancy=new Map();
  state.jadual.slots.forEach(slot=>{for(let offset=0;offset<slot.panjang;offset++){const slotKey=`${slot.kelasId}|${slot.hari}|${slot.mula+offset}`;if(!occupancy.has(slotKey)) occupancy.set(slotKey,[]);occupancy.get(slotKey).push(slot);}});
  occupancy.forEach(slots=>{if(new Set(slots.map(slot=>slot.guruId)).size>1) slots.forEach(slot=>slot.pairing=true);});

  const allocations=new Map();
  mapped.forEach(row=>{
    const allocationKey=`${row.kelasId}|${row.subjekId}`;
    if(!allocations.has(allocationKey)) allocations.set(allocationKey,{kelasId:row.kelasId,subjekId:row.subjekId,periods:new Set(),teachers:new Map()});
    const allocation=allocations.get(allocationKey);allocation.periods.add(`${row.hari}|${row.period}`);
    if(!allocation.teachers.has(row.guruId)) allocation.teachers.set(row.guruId,new Set());
    allocation.teachers.get(row.guruId).add(`${row.hari}|${row.period}`);
  });
  allocations.forEach((allocation,index)=>{
    const primary=[...allocation.teachers.entries()].sort((a,b)=>b[1].size-a[1].size||a[0].localeCompare(b[0]))[0]?.[0]||'';
    const blocks=state.jadual.slots.filter(slot=>slot.kelasId===allocation.kelasId&&slot.subjekId===allocation.subjekId&&slot.guruId===primary);
    const pairGuruIds=[...allocation.teachers.entries()].filter(([guruId,periods])=>guruId!==primary&&periods.size===allocation.periods.size&&[...periods].every(period=>allocation.periods.has(period))).map(([guruId])=>guruId);
    const ganda=blocks.reduce((total,slot)=>total+Math.floor(slot.panjang/2),0);
    const waktu=allocation.periods.size;
    state.agihan.push({id:makeId('a',index),kelasId:allocation.kelasId,subjekId:allocation.subjekId,guruId:primary,pairGuruIds,waktu,ganda});
    const subject=state.subjek.find(item=>item.id===allocation.subjekId);if(subject&&ganda) subject.ganda=true;
  });

  state.subjek.forEach(subject=>{
    const byStage=new Map();
    state.agihan.filter(item=>item.subjekId===subject.id).forEach(item=>{const kelas=state.kelas.find(value=>value.id===item.kelasId);if(!kelas)return;if(!byStage.has(kelas.tahap))byStage.set(kelas.tahap,[]);byStage.get(kelas.tahap).push(Number(item.waktu));});
    const allocation={};byStage.forEach((values,stage)=>allocation[stage]=mostCommon(values));if(Object.keys(allocation).length)state.peruntukan[subject.id]=allocation;
  });

  const dutySlots=new Map();
  validRows.filter(row=>row.isDuty||!row.className).forEach(row=>{
    const dutyKey=`${upper(row.subject||'AKTIVITI')}|${DAYS[row.day]}|${Number(row.period)}`;
    if(!dutySlots.has(dutyKey)) dutySlots.set(dutyKey,{kod:upper(row.subject||'AKTIVITI'),hari:DAYS[row.day],period:Number(row.period),teachers:[]});
    const guruId=teacherMap.get(row.teacherId)?.id;if(guruId&&!dutySlots.get(dutyKey).teachers.includes(guruId))dutySlots.get(dutyKey).teachers.push(guruId);
  });
  const duties=[...dutySlots.values()].map(item=>({...item,teachers:item.teachers.sort()})).sort((a,b)=>a.kod.localeCompare(b.kod)||DAY_ORDER.indexOf(a.hari)-DAY_ORDER.indexOf(b.hari)||a.period-b.period);
  duties.forEach(item=>{
    const previous=state.acara.at(-1),canJoin=previous&&previous.kod===item.kod&&previous.hari===item.hari&&previous.mula+previous.panjang===item.period&&sameTeacherSet(previous.guru||[],item.teachers);
    if(canJoin) previous.panjang+=1;
    else {const allTeachers=item.teachers.length===state.guru.length;state.acara.push({id:makeId('event',state.acara.length),nama:item.kod,kod:item.kod,warna:'#e2e8f0',hari:item.hari,mula:item.period,panjang:1,skop:allTeachers?'semua':'guru',guru:allTeachers?[]:item.teachers,kelas:[]});}
  });

  const timing=(metadata.periods||[]).length?metadata.periods:validRows.map(row=>({period:Number(row.period),startTime:row.startTime,endTime:row.endTime})).filter(item=>item.startTime&&item.endTime);
  const periodOne=timing.find(item=>Number(item.period)===1),periodZero=timing.find(item=>Number(item.period)===0);
  const durations=timing.filter(item=>Number(item.period)>=1).map(item=>toMinutes(item.endTime)-toMinutes(item.startTime)).filter(value=>value>0);
  const maximum=Math.max(1,...timing.map(item=>Number(item.period)||0),...validRows.map(row=>Number(row.period)||0));
  const baseTime=base.masa||{};
  const observedByDay=Object.fromEntries(DAY_ORDER.map(day=>[day,Math.max(0,...validRows.filter(row=>DAYS[row.day]===day).map(row=>Number(row.period)||0))]));
  state.masa={...baseTime,mula:periodOne?.startTime||baseTime.mula||'07:30',tempoh:mostCommon(durations,Number(baseTime.tempoh||30)),waktu:Object.fromEntries(DAY_ORDER.map(day=>[day,Math.max(observedByDay[day],Math.min(Number(baseTime.waktu?.[day]||maximum),maximum))])),rehat:deriveBreaks(timing,baseTime.rehat),pra:periodZero?{aktif:true,label:baseTime.pra?.label||'PENGURUSAN',mula:periodZero.startTime,tempoh:toMinutes(periodZero.endTime)-toMinutes(periodZero.startTime)}:structuredClone(baseTime.pra||{aktif:false,label:'PENGURUSAN',mula:'07:20',tempoh:10})};
  state.kekangan=inferConstraints(teachingRows,base.kekangan||{});

  state.guru.forEach(guru=>{
    const loads=new Map();teachingRows.filter(row=>row.teacherId===guru.directoryId).forEach(row=>{if(!loads.has(row.day))loads.set(row.day,new Set());loads.get(row.day).add(Number(row.period));});
    guru.maxHari=Math.max(Number(guru.maxHari||8),...([...loads.values()].map(set=>set.size)),1);
  });
  return state;
}
