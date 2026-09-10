function clean(value) {
  return String(value || "").trim();
}

function uniquePush(list, value) {
  const text = clean(value);
  if (text && !list.includes(text)) list.push(text);
}

function teacherName(teachers, id, fallback) {
  const teacher = teachers.find((item) => item.id === id);
  return clean(teacher?.shortName || teacher?.name || fallback);
}

function numericDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : clean(value);
}

function dayName(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(value));
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return ["AHAD", "ISNIN", "SELASA", "RABU", "KHAMIS", "JUMAAT", "SABTU"][date.getDay()];
}

export function buildReliefPrintModel(db, date, standardPeriods) {
  const teachers = db.teachers || [];
  const reliefs = (db.reliefs || [])
    .filter((item) => item.date === date && item.status === "published")
    .sort((a, b) => Number(a.period) - Number(b.period) || clean(a.className).localeCompare(clean(b.className), "ms"));
  const maximum = Math.max(11, ...reliefs.map((item) => Number(item.period) || 0));
  const periods = (standardPeriods || [])
    .filter((item) => Number(item.period) >= 1 && Number(item.period) <= maximum)
    .map((item) => ({ period: Number(item.period), startTime: clean(item.startTime), endTime: clean(item.endTime) }));
  const grouped = new Map();

  reliefs.forEach((item) => {
    if (!grouped.has(item.absentTeacherId)) {
      grouped.set(item.absentTeacherId, {
        teacherId: item.absentTeacherId,
        teacherName: teacherName(teachers, item.absentTeacherId, "GURU"),
        slots: {},
      });
    }
    const group = grouped.get(item.absentTeacherId);
    const key = Number(item.period);
    const slot = group.slots[key] || (group.slots[key] = { classes: [], replacements: [] });
    uniquePush(slot.classes, item.className || item.subject || "Aktiviti sekolah");
    uniquePush(slot.replacements, teacherName(teachers, item.replacementTeacherId, "—"));
  });

  return {
    school: clean(db.school || "SK Paya Redan, Muar"),
    date,
    dateLabel: numericDate(date),
    dayLabel: dayName(date),
    periods,
    groups: [...grouped.values()].sort((a, b) => a.teacherName.localeCompare(b.teacherName, "ms")),
  };
}

function escapeHtml(value) {
  return clean(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function valuesCell(values) {
  return values?.length ? values.map(escapeHtml).join("<br>") : "";
}

export function reliefPrintHtml(model) {
  const heading = model.periods.map((period) => `<th><b>${period.period}</b><span>${escapeHtml(period.startTime)}<br>${escapeHtml(period.endTime)}</span></th>`).join("");
  const groups = model.groups.map((group) => {
    const cells = (field) => model.periods.map((period) => `<td>${valuesCell(group.slots[period.period]?.[field])}</td>`).join("");
    const signatures = model.periods.map(() => "<td></td>").join("");
    return `<tbody class="relief-print-group">
      <tr><th class="relief-print-name" rowspan="3"><span>NAMA GURU<br>TIDAK HADIR</span><strong>${escapeHtml(group.teacherName)}</strong></th><th class="relief-print-label">KELAS</th>${cells("classes")}</tr>
      <tr><th class="relief-print-label">GURU<br>GANTI</th>${cells("replacements")}</tr>
      <tr><th class="relief-print-label">T/TANGAN</th>${signatures}</tr>
    </tbody>`;
  }).join("");
  return `<div class="relief-print-heading">
      <div class="relief-print-title"><strong>${escapeHtml(model.school.toUpperCase())}</strong><span>JADUAL GURU GANTI</span></div>
      <div class="relief-print-meta"><span>TARIKH: <b>${escapeHtml(model.dateLabel)}</b></span><span>HARI: <b>${escapeHtml(model.dayLabel)}</b></span></div>
    </div>
    <table class="relief-print-table">
      <thead><tr><th colspan="2" class="relief-print-time">MASA</th>${heading}</tr></thead>
      ${groups}
    </table>
    <p class="relief-print-footer">Sistem Jadual · ${escapeHtml(model.school)}</p>`;
}
