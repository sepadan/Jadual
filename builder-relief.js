import { normalizeName } from './pdf-import.js?v=3.1.5';

// Convert a validated builder timetable into the same per-period records as PDF import.
export function convertBuilderSchedule(state, teachers, times) {
  const days = {ISNIN:'IS',SELASA:'SEL',RABU:'RAB',KHAMIS:'KHA',JUMAAT:'JUM'};
  const teacherMap = new Map();
  const missing = new Set();
  for (const guru of state.guru) {
    const match = teachers.find(t => t.active && (t.id === guru.directoryId || normalizeName(t.name) === normalizeName(guru.nama)));
    if (match) teacherMap.set(guru.id, match.id);
  }
  const rows = [];
  function add(teacherId, hari, period, subject, className, isDuty) {
    const time = times.find(t => t.p === period);
    if (!days[hari] || !time || period < 1 || period > 12) throw new Error('Relief menyokong Isnin–Jumaat, waktu 1 hingga 12. Semak tetapan masa jadual.');
    rows.push({teacherId,day:days[hari],period,startTime:time.mula,endTime:time.tamat,subject,className,isDuty});
  }
  for (const slot of state.jadual?.slots || []) {
    const teacherId = teacherMap.get(slot.guruId);
    if (!teacherId) { missing.add(state.guru.find(g => g.id === slot.guruId)?.nama || 'Guru belum ditetapkan'); continue; }
    const subject = state.subjek.find(s => s.id === slot.subjekId);
    const kelas = state.kelas.find(k => k.id === slot.kelasId);
    if (!subject || !kelas) throw new Error('Terdapat slot tanpa kelas atau subjek yang sah. Semak jadual dahulu.');
    for (let n = 0; n < Number(slot.panjang || 1); n++) add(teacherId,slot.hari,Number(slot.mula)+n,subject.kod,kelas.nama,false);
  }
  // Fixed activities and teacher unavailable periods must also prevent relief selection.
  for (const guru of state.guru) {
    const teacherId = teacherMap.get(guru.id); if (!teacherId) continue;
    for (const event of state.acara || []) {
      if (!(event.skop === 'semua' || (event.skop === 'guru' && (event.guru || []).includes(guru.id)))) continue;
      for (let n=0; n<Number(event.panjang || 1); n++) add(teacherId,event.hari,Number(event.mula)+n,event.kod || 'AKTIVITI','',true);
    }
    for (const unavailable of guru.tidakAda || []) {
      const [day, period] = unavailable.split('-');
      add(teacherId, day, Number(period), 'TIDAK TERSEDIA', '', true);
    }
  }
  const seen = new Set();
  return {missing:[...missing], rows:rows.filter(row => {
    const key = `${row.teacherId}|${row.day}|${row.period}`;
    if (seen.has(key)) { if (!row.isDuty) throw new Error('Pertembungan guru dikesan. Semak jadual sebelum digunakan.'); return false; }
    seen.add(key); return true;
  })};
}
