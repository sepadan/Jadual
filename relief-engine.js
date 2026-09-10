import { DAY_CODES, PERIODS } from "./data.js?v=3.0.2";

export function dayCodeFromDate(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  const index = date.getDay();
  return { 1: "IS", 2: "SEL", 3: "RAB", 4: "KHA", 5: "JUM" }[index] || null;
}

export function activeScheduleRows(db, dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  const active = db.scheduleVersions
    .filter((version) => ["active", "superseded"].includes(version.status) && new Date(`${version.effectiveDate}T00:00:00`) <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  return active ? db.schedule.filter((row) => row.versionId === active.id) : [];
}

export function absenceCovers(absence, period) {
  return absence.allDay || (absence.periods || []).map(Number).includes(Number(period));
}

function mondayOf(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

export function rankCandidates({ db, date, day, period, absentTeacherId }) {
  const rows = activeScheduleRows(db, date);
  const absent = new Set(
    db.absences
      .filter((item) => item.date === date && item.status !== "cancelled" && absenceCovers(item, period))
      .map((item) => item.teacherId),
  );
  const busy = new Set(rows.filter((row) => row.day === day && Number(row.period) === Number(period)).map((row) => row.teacherId));
  const reliefBusy = new Set(
    db.reliefs
      .filter((item) => item.date === date && Number(item.period) === Number(period) && item.status !== "cancelled")
      .map((item) => item.replacementTeacherId),
  );
  const weekStart = mondayOf(date);
  const todayCounts = new Map();
  const weekCounts = new Map();
  const teachingCounts = new Map();

  db.reliefs.filter((item) => item.status !== "cancelled").forEach((item) => {
    if (item.date === date) todayCounts.set(item.replacementTeacherId, (todayCounts.get(item.replacementTeacherId) || 0) + 1);
    if (item.date >= weekStart && item.date <= date) weekCounts.set(item.replacementTeacherId, (weekCounts.get(item.replacementTeacherId) || 0) + 1);
  });
  rows.filter((row) => row.day === day).forEach((row) => teachingCounts.set(row.teacherId, (teachingCounts.get(row.teacherId) || 0) + 1));

  return db.teachers
    .filter((teacher) => teacher.active && teacher.reliefEligible && teacher.id !== absentTeacherId)
    .filter((teacher) => !absent.has(teacher.id) && !busy.has(teacher.id) && !reliefBusy.has(teacher.id))
    .map((teacher) => {
      const today = todayCounts.get(teacher.id) || 0;
      const week = weekCounts.get(teacher.id) || 0;
      const teaching = teachingCounts.get(teacher.id) || 0;
      const score = Number(teacher.priority || 3) * 10 + today * 35 + week * 8 + teaching * 1.5;
      return { ...teacher, score, todayReliefs: today, weekReliefs: week, teachingToday: teaching };
    })
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, "ms"));
}

export function buildReliefDrafts(db, date) {
  const day = dayCodeFromDate(date);
  if (!day || !DAY_CODES.includes(day)) return [];
  const rows = activeScheduleRows(db, date);
  const existingKeys = new Set(
    db.reliefs.filter((item) => item.date === date && item.status !== "cancelled").map((item) => `${item.absentTeacherId}|${item.period}`),
  );
  const drafts = [];
  db.absences
    .filter((absence) => absence.date === date && absence.status !== "cancelled")
    .forEach((absence) => {
      rows
        .filter((row) => row.teacherId === absence.teacherId && row.day === day && row.className && absenceCovers(absence, row.period))
        .forEach((row) => {
          const key = `${absence.teacherId}|${row.period}`;
          if (existingKeys.has(key)) return;
          const candidates = rankCandidates({ db, date, day, period: row.period, absentTeacherId: absence.teacherId });
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
        });
    });
  return drafts.sort((a, b) => a.period - b.period || a.className.localeCompare(b.className, "ms"));
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
      db,
      date: item.date,
      day: item.day,
      period: item.period,
      absentTeacherId: item.absentTeacherId,
    }).some((teacher) => teacher.id === item.replacementTeacherId);
    if (item.replacementTeacherId && !eligible) errors.push(`Pilihan guru ganti bagi waktu ${item.period} sudah tidak tersedia.`);
  });
  return [...new Set(errors)];
}
