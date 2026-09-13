import { DAY_CODES } from "./data.js?v=3.1.63";

// A Guru Pemulihan's own setting periods ("masa tetapan") belong to no class and no subject, so
// they are stored the same way as the builder's fixed activities and the duty cells read from an
// aSc PDF: duty rows in the active timetable version. That keeps one behaviour for the relief
// engine (a duty row marks the teacher busy — relief-engine.js) and for the timetable screen.
export const SETTING_SUBJECT = "PEMULIHAN";
export const SETTING_DAYS = DAY_CODES;

// Masa pemulihan hanya untuk SEBAHAGIAN murid, jadi kelas yang dicatat ialah kelas ASAL murid,
// bukan kelas yang diajar. Ia disimpan dalam medan `subject` sebagai "PEMULIHAN · BM · 3B"
// kerana medan `className` mesti kekal kosong: enjin relief menganggap setiap baris yang ada
// className sebagai waktu kelas yang perlu digantikan guru ganti (relief-engine.js).
export const SETTING_SEP = " · ";

export function settingSubjectValue(detail = {}) {
  const subjek = String(detail?.subjek || "").trim();
  const kelas = String(detail?.kelas || "").trim();
  const parts = [SETTING_SUBJECT];
  if (subjek) parts.push(subjek);
  if (kelas) parts.push(kelas);
  return parts.join(SETTING_SEP);
}

export function parseSettingSubject(subject) {
  const parts = String(subject || "").split(SETTING_SEP).map((part) => part.trim()).filter(Boolean);
  const subjek = parts.length > 1 ? parts[1] : "";
  const kelas = parts.length > 2 ? parts[2] : "";
  return { subjek, kelas, detail: [subjek, kelas].filter(Boolean).join(" ") };
}

export function isSettingRow(row) {
  const subject = String(row?.subject || "").toUpperCase();
  const marker = subject === SETTING_SUBJECT || subject.startsWith(SETTING_SUBJECT + SETTING_SEP);
  return Boolean(row?.isDuty) && marker;
}

export function settingDayName(day) {
  return { IS: "Isnin", SEL: "Selasa", RAB: "Rabu", KHA: "Khamis", JUM: "Jumaat" }[day] || day;
}

export function settingKey(day, period) {
  return `${String(day).toUpperCase()}-${Number(period)}`;
}

// Kelas + subjek bagi setiap waktu yang sudah ditanda, untuk membuka dialog dengan pilihan sedia ada.
export function settingDetailsFromRows({ rows, teacherId }) {
  const out = {};
  for (const row of rows || []) {
    if (row.teacherId !== teacherId || !isSettingRow(row)) continue;
    out[settingKey(row.day, row.period)] = parseSettingSubject(row.subject);
  }
  return out;
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
export function mergeSettingRows({ rows, teacherId, versionId, selected, periods, details = null, label = SETTING_SUBJECT }) {
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
    const detail = details?.get?.(settingKey(day, period)) || details?.[settingKey(day, period)] || null;
    added.push({
      versionId,
      teacherId,
      day,
      period,
      startTime: time.startTime,
      endTime: time.endTime,
      subject: detail ? settingSubjectValue(detail) : label,
      className: "",
      isDuty: true,
    });
  }
  added.sort((a, b) => SETTING_DAYS.indexOf(a.day) - SETTING_DAYS.indexOf(b.day) || a.period - b.period);
  return { rows: [...kept, ...added], added: added.length, removed: removed.length, skipped };
}
