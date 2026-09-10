// Portable directory backup; deliberately excludes schedules and credentials.
export function exportTeachers(teachers) {
  return JSON.stringify({format:'sistem-jadual-teachers',version:1,teachers:teachers.filter(t=>t.active).map(({name,shortName,position,priority,reliefEligible})=>({name,shortName,position,priority,reliefEligible}))},null,2);
}
export function importTeachers(text,existing) {
  const data=JSON.parse(text);
  if(data.format!=='sistem-jadual-teachers'||data.version!==1||!Array.isArray(data.teachers)||data.teachers.length>500) throw new Error('Gunakan fail senarai guru JSON yang dimuat turun daripada Sistem Jadual (maksimum 500 guru).');
  const normalize=s=>s.trim().replace(/\s+/g,' ').toUpperCase();
  const names=new Set(existing.map(t=>normalize(t.name)));
  let skipped=0;const teachers=[];
  for(const [index,t] of data.teachers.entries()) {
    if(!t||typeof t.name!=='string'||!t.name.trim()||t.name.length>200||typeof t.shortName!=='string'||!t.shortName.trim()||t.shortName.length>24||typeof t.position!=='string'||!t.position.trim()||t.position.length>100||![1,2,3,4,5,6,9].includes(t.priority)||typeof t.reliefEligible!=='boolean') throw new Error(`Maklumat guru pada baris ${index+1} tidak sah. Tiada data diimport.`);
    const name=normalize(t.name);
    if(names.has(name)) {skipped++;continue;}
    names.add(name);teachers.push({name,shortName:normalize(t.shortName),position:t.position.trim(),priority:t.priority,reliefEligible:t.reliefEligible,active:true});
  }
  return {teachers,skipped};
}
