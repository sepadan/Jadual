// Turn reviewed aSc rows into an editable builder draft; unknown teachers stay omitted.
export function draftFromPdf(rows,teachers,base) {
  const state=structuredClone(base),days={IS:'ISNIN',SEL:'SELASA',RAB:'RABU',KHA:'KHAMIS',JUM:'JUMAAT'};
  state.subjek=[];state.kelas=[];state.guru=[];state.agihan=[];state.peruntukan={};state.acara=[];
  state.hari=Object.values(days);state.jadual={slots:[]};state.kekangan={...state.kekangan,maxHariGuru:12,maxSubjekSehari:12};
  const subjects=new Map(),classes=new Map(),allocations=new Map(),used=new Set();
  const id=(prefix,n)=>`${prefix}-pdf-${n}`;
  for(const row of rows) {
    const t=teachers.find(t=>t.active&&t.id===row.teacherId);if(!t||!days[row.day]||Number(row.period)<1) continue;
    let teacher=state.guru.find(g=>g.directoryId===t.id);
    if(!teacher) {teacher={id:id('g',state.guru.length),directoryId:t.id,nama:t.name,kod:t.shortName,jawatan:t.position,gelaran:'',maxHari:12,tidakAda:[]};state.guru.push(teacher);}
    if(row.isDuty||!row.className) {teacher.tidakAda.push(`${days[row.day]}-${row.period}`);continue;}
    if(!subjects.has(row.subject)) {const subject={id:id('s',subjects.size),kod:row.subject,nama:row.subject,warna:'#e0f2ec',teras:false,pagi:false,ganda:false,kemudahan:''};subjects.set(row.subject,subject);state.subjek.push(subject);}
    if(!classes.has(row.className)) {const kelas={id:id('k',classes.size),nama:row.className,tahap:Number(row.className.match(/^[1-6]/)?.[0]||1),guruKelas:''};classes.set(row.className,kelas);state.kelas.push(kelas);}
    const subject=subjects.get(row.subject),kelas=classes.get(row.className),key=`${teacher.id}|${row.day}|${row.period}`;
    if(used.has(key)) throw new Error('PDF mempunyai slot guru berulang. Semak padanan dahulu.');used.add(key);
    state.jadual.slots.push({id:id('slot',state.jadual.slots.length),kelasId:kelas.id,subjekId:subject.id,guruId:teacher.id,hari:days[row.day],mula:Number(row.period),panjang:1,kunci:false});
    const allocationKey=`${kelas.id}|${subject.id}`;
    if(!allocations.has(allocationKey)) allocations.set(allocationKey,{id:id('a',allocations.size),kelasId:kelas.id,subjekId:subject.id,guruId:teacher.id,waktu:0,ganda:0});
    allocations.get(allocationKey).waktu++;
  }
  state.agihan=[...allocations.values()];
  if(!state.jadual.slots.length) throw new Error('Tiada slot kelas dipadankan untuk membina draf.');
  // aSc parser normalizes the supplied school PDFs to these time boundaries.
  const waktu=Object.fromEntries(state.hari.map(h=>[h,Math.max(1,...rows.filter(r=>days[r.day]===h).map(r=>Number(r.period)))]));
  state.masa={mula:'07:30',tempoh:30,waktu,rehat:[{selepas:5,minit:20,label:'REHAT'}],pra:{aktif:true,label:'PENGURUSAN',mula:'07:20',tempoh:10}};
  return state;
}
