import { DAY_CODES, PERIODS } from "./data.js?v=3.1.5";

export function dayCodeFromDate(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  const index = date.getDay();
  return { 1: "IS", 2: "SEL", 3: "RAB", 4: "KHA", 5: "JUM" }[index] || null;
}

// Any value the API can return, reduced to a calendar day (YYYY-MM-DD).
export function dayOnly(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function latestVersion(versions) {
  return versions.sort((a, b) => dayOnly(b.effectiveDate).localeCompare(dayOnly(a.effectiveDate)) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
}

// The official (active) version always wins for any date it covers, even when an older import
// carries a later effective date. Superseded versions only answer dates before the first
// official version took effect, so past timetables still resolve.
export function selectedScheduleVersion(db, dateText) {
  const target = dayOnly(dateText);
  if (!target) return null;
  const date = new Date(`${target}T12:00:00`);
  const eligible = (db.scheduleVersions || [])
    .filter((version) => ["active", "superseded"].includes(version.status) && dayOnly(version.effectiveDate) && new Date(`${dayOnly(version.effectiveDate)}T00:00:00`) <= date);
  return latestVersion(eligible.filter((version) => version.status === "active"))
    || latestVersion(eligible.filter((version) => version.status === "superseded"))
    || null;
}

// The newest official timetable, regardless of when it takes effect. Used for the timetable the
// admin is preparing; relief itself always follows selectedScheduleVersion().
export function officialScheduleVersion(db) {
  return latestVersion((db.scheduleVersions || []).filter((version) => version.status === "active")) || null;
}

export function activeScheduleRows(db, dateText) {
  const version = selectedScheduleVersion(db, dateText);
  return version ? db.schedule.filter((row) => row.versionId === version.id) : [];
}

export function absenceCovers(absence, period) {
  return absence.allDay || (absence.periods || []).map(Number).includes(Number(period));
}

export function teacherIsAbsent(db, teacherId, date, period) {
  if (!teacherId) return false;
  return (db.absences || []).some((absence) => absence.status !== "cancelled"
    && absence.teacherId === teacherId
    && absence.date === date
    && absenceCovers(absence, period));
}

export function reliefMatchesAbsence(relief, absence) {
  return !!relief && !!absence
    && relief.date === absence.date
    && relief.absentTeacherId === absence.teacherId;
}

export function reliefHasActiveAbsence(db, relief) {
  const sourceAbsenceIsActive = (db.absences || []).some((absence) => absence.status !== "cancelled"
    && reliefMatchesAbsence(relief, absence)
    && absenceCovers(absence, relief.period));
  return sourceAbsenceIsActive
    && !teacherIsAbsent(db, relief.replacementTeacherId, relief.date, relief.period);
}

export function cancelReliefsAssignedToAbsence(db, absence, updatedAt = new Date().toISOString()) {
  if (!absence) return [];
  const reliefs = (db.reliefs || []).filter((relief) => relief.status !== "cancelled"
    && relief.date === absence.date
    && relief.replacementTeacherId === absence.teacherId
    && absenceCovers(absence, relief.period));
  reliefs.forEach((relief) => {
    relief.status = "cancelled";
    relief.updatedAt = updatedAt;
  });
  return reliefs;
}

export function cancelAbsenceAndReliefs(db, absenceId, updatedAt = new Date().toISOString()) {
  const absence = (db.absences || []).find((item) => item.id === absenceId);
  if (!absence) return { absence: null, reliefs: [] };
  absence.status = "cancelled";
  absence.updatedAt = updatedAt;
  const reliefs = (db.reliefs || []).filter((relief) => relief.status !== "cancelled" && reliefMatchesAbsence(relief, absence));
  reliefs.forEach((relief) => {
    relief.status = "cancelled";
    relief.updatedAt = updatedAt;
  });
  return { absence, reliefs };
}

function mondayOf(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

export function rankCandidates({ db, date, day, period, absentTeacherId }) {
  const rows = activeScheduleRows(db, date);
  const absent = new Set((db.absences || [])
    .filter((item) => item.date === date && item.status !== "cancelled" && absenceCovers(item, period))
    .map((item) => item.teacherId));
  const busy = new Set(rows.filter((row) => row.day === day && Number(row.period) === Number(period)).map((row) => row.teacherId));
  const reliefBusy = new Set(
    (db.reliefs || [])
      .filter((item) => item.date === date && Number(item.period) === Number(period) && item.status !== "cancelled" && reliefHasActiveAbsence(db, item))
      .map((item) => item.replacementTeacherId),
  );
  const weekStart = mondayOf(date);
  const todayCounts = new Map();
  const weekCounts = new Map();
  const teachingCounts = new Map();

  (db.reliefs || []).filter((item) => item.status !== "cancelled" && reliefHasActiveAbsence(db, item)).forEach((item) => {
    if (item.date === date) todayCounts.set(item.replacementTeacherId, (todayCounts.get(item.replacementTeacherId) || 0) + 1);
    if (item.date >= weekStart && item.date <= date) weekCounts.set(item.replacementTeacherId, (weekCounts.get(item.replacementTeacherId) || 0) + 1);
  });
  rows.filter((row) => row.day === day).forEach((row) => teachingCounts.set(row.teacherId, (teachingCounts.get(row.teacherId) || 0) + 1));

  return (db.teachers || [])
    .filter((teacher) => teacher.active && teacher.reliefEligible && teacher.id !== absentTeacherId)
    .filter((teacher) => !absent.has(teacher.id) && !busy.has(teacher.id) && !reliefBusy.has(teacher.id))
    .map((teacher) => {
      const today = todayCounts.get(teacher.id) || 0;
      const week = weekCounts.get(teacher.id) || 0;
      const teaching = teachingCounts.get(teacher.id) || 0;
      const score = teaching + today;
      return { ...teacher, score, todayReliefs: today, weekReliefs: week, teachingToday: teaching };
    })
    .filter(teacher => teacher.todayReliefs < dailyReliefLimit(db))
    .sort((a, b) => a.score - b.score || a.weekReliefs - b.weekReliefs || a.name.localeCompare(b.name, "ms"));
}

export function dailyReliefLimit(db) {
  const value = Number(db.reliefSettings?.dailyLimit ?? 2);
  return Number.isInteger(value) && value >= 0 && value <= 13 ? value : 2;
}

export function buildReliefDrafts(db, date) {
  const day = dayCodeFromDate(date);
  if (!day || !DAY_CODES.includes(day)) return [];
  const rows = activeScheduleRows(db, date);
  const existingKeys = new Set(
    (db.reliefs || []).filter((item) => item.date === date && item.status !== "cancelled" && reliefHasActiveAbsence(db, item)).map((item) => `${item.absentTeacherId}|${item.period}`),
  );
  const drafts = [];
  (db.absences || [])
    .filter((absence) => absence.date === date && absence.status !== "cancelled")
    .forEach((absence) => {
      rows
        .filter((row) => row.teacherId === absence.teacherId && row.day === day && row.className && absenceCovers(absence, row.period))
        .forEach((row) => {
          const key = `${absence.teacherId}|${row.period}`;
          if (existingKeys.has(key)) return;
          if(db.reliefSettings?.ignorePairingWhenCovered && hasPresentPair(db,date,row,rows)) return;
          const candidates = rankCandidates({ db: {...db, reliefs:[...db.reliefs,...drafts]}, date, day, period: row.period, absentTeacherId: absence.teacherId });
          drafts.push({
            id: `r-${date}-${absence.teacherId}-${row.period}`,
            date,
            day,
            period: Number(row.period),
            startTime: row.startTime || PERIODS.find((p) => p.period === Number(row.period))?.startTime || "",
            endTime: row.endTime || PERIODS.find((p) => p.period === Number(row.period))?.endTime || "",
            absentTeacherId: absence.teacherId,
            replacementTeacherId: candidates[0]?.id || "",
            className: row.className || "",
            subject: row.subject || "",
            status: "draft",
            note: "",
            candidates,
          });
          existingKeys.add(key);
        });
    });
  return drafts.sort((a, b) => a.period - b.period || a.className.localeCompare(b.className, "ms"));
}

export function hasPresentPair(db,date,row,rows=activeScheduleRows(db,date)) {
  const normalize=value=>String(value||'').trim().replace(/\s+/g,' ').toUpperCase();
  return !!row.className && rows.some(other=>other.teacherId!==row.teacherId && !other.isDuty
    && other.day===row.day && Number(other.period)===Number(row.period)
    && normalize(other.className)===normalize(row.className)
    && db.teachers.some(t=>t.id===other.teacherId&&t.active)
    && !db.absences.some(a=>a.teacherId===other.teacherId&&a.date===date&&a.status!=='cancelled'&&absenceCovers(a,row.period))
    && !db.reliefs.some(r=>r.date===date&&Number(r.period)===Number(row.period)&&r.status!=='cancelled'&&reliefHasActiveAbsence(db,r)&&r.replacementTeacherId===other.teacherId));
}

export function validateReliefs(db, reliefs) {
  const errors = [];
  const slotTeacher = new Set();
  reliefs.forEach((item) => {
    if (!item.replacementTeacherId) errors.push(`Tiada guru ganti untuk waktu ${item.period} (${item.className || item.subject}).`);
    const key = `${item.date}|${item.period}|${item.replacementTeacherId}`;
    if (item.replacementTeacherId && slotTeacher.has(key)) errors.push(`Guru yang sama dipilih dua kali pada waktu ${item.period}.`);
    slotTeacher.add(key);
    const eligible = rankCandidates({
      db: {...db, reliefs: [...db.reliefs.filter(row => !reliefs.some(draft => draft.id === row.id)), ...reliefs.filter(row => row !== item && row.status !== 'cancelled')]},
      date: item.date,
      day: item.day,
      period: item.period,
      absentTeacherId: item.absentTeacherId,
    }).some((teacher) => teacher.id === item.replacementTeacherId);
    if (item.replacementTeacherId && !eligible) errors.push(`Pilihan guru ganti bagi waktu ${item.period} sudah tidak tersedia.`);
  });
  return [...new Set(errors)];
}
