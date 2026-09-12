import { DAY_CODES } from "./data.js?v=3.1.46";

// A Guru Pemulihan's own setting periods ("masa tetapan") belong to no class and no subject, so
// they are stored the same way as the builder's fixed activities and the duty cells read from an
// aSc PDF: duty rows in the active timetable version. That keeps one behaviour for the relief
// engine (a duty row marks the teacher busy — relief-engine.js) and for the timetable screen.
export const SETTING_SUBJECT = "PEMULIHAN";
export const SETTING_DAYS = DAY_CODES;

export function settingDayName(day) {
  return { IS: "Isnin", SEL: "Selasa", RAB: "Rabu", KHA: "Khamis", JUM: "Jumaat" }[day] || day;
}

export function settingKey(day, period) {
  return `${String(day).toUpperCase()}-${Number(period)}`;
}

export function isSettingRow(row) {
  return Boolean(row?.isDuty) && String(row?.subject || "").toUpperCase() === SETTING_SUBJECT;
}

// The cells already claimed by this teacher, so the dialog opens with them ticked.
export function settingSelectionFromRows({ rows, teacherId }) {
  return (rows || []).filter((row) => row.teacherId === teacherId && isSettingRow(row)).map((row) => settingKey(row.day, row.period));
}

// A signature of one version's rows. Saving sends the whole version, so the admin must be told when
// someone else changed that version in the meantime instead of overwriting them in silence. The
// signature is order-independent and readable on purpose: it is compared, not stored anywhere.
export function settingSignature({ rows, versionId }) {
  const parts = (rows || [])
    .filter((row) => row.versionId === versionId)
    .map((row) => [
      String(row.day).toUpperCase(), Number(row.period), row.teacherId, row.subject || "",
      row.className || "", row.isDuty ? "duty" : "lesson", row.startTime || "", row.endTime || "",
    ].join("|"))
    .sort();
  return `${parts.length}~${parts.join(";")}`;
}

// Writes the touched cells back into the timetable: this teacher's previous setting rows in that
// version are replaced, every other row (lessons, other teachers, other versions) is preserved.
// A cell that already holds a lesson is skipped rather than overwritten.
export function mergeSettingRows({ rows, teacherId, versionId, selected, periods, label = SETTING_SUBJECT }) {
  const source = rows || [];
  const removed = source.filter((row) => row.versionId === versionId && row.teacherId === teacherId && isSettingRow(row));
  const kept = source.filter((row) => !(row.versionId === versionId && row.teacherId === teacherId && isSettingRow(row)));
  const taken = new Set(source
    .filter((row) => row.versionId === versionId && row.teacherId === teacherId && !isSettingRow(row))
    .map((row) => settingKey(row.day, row.period)));
  const clock = new Map((periods || []).map((period) => [Number(period.period), period]));
  const seen = new Set();
  const added = [];
  let skipped = 0;
  for (const choice of selected || []) {
    const [day, periodText] = String(choice).toUpperCase().split("-");
    const period = Number(periodText);
    const time = clock.get(period);
    if (!SETTING_DAYS.includes(day) || !time || seen.has(settingKey(day, period)) || taken.has(settingKey(day, period))) {
      skipped += 1;
      continue;
    }
    seen.add(settingKey(day, period));
    added.push({
      versionId,
      teacherId,
      day,
      period,
      startTime: time.startTime,
      endTime: time.endTime,
      subject: label,
      className: "",
      isDuty: true,
    });
  }
  added.sort((a, b) => SETTING_DAYS.indexOf(a.day) - SETTING_DAYS.indexOf(b.day) || a.period - b.period);
  return { rows: [...kept, ...added], added: added.length, removed: removed.length, skipped };
}
