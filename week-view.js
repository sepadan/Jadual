// The teacher's timetable as one grid, the same shape the builder's "Lihat & Edit" screen uses:
// days down the side, periods across the top, a REHAT column where the school clock has a break,
// and a colour per subject. Both the relief timetable and the remedial teacher's setting grid are
// built from here, so the school sees one shape everywhere.
//
// The model is pure: the callers pass the rows they want shown (already filtered to one teacher or
// one class) and get columns, rows and legend back, which keeps the browser out of the tests.
import { SETTING_SUBJECT, isSettingRow, parseSettingSubject } from "./setting-slots.js";

const PALETTE = [
  "#dbeafe", "#dcfce7", "#fef3c7", "#fae8ff", "#e0e7ff",
  "#ffe4e6", "#cffafe", "#f3e8ff", "#ecfccb", "#ffedd5",
];

// A subject code always gets the same colour on every device and in every view. A colour the school
// chose in the builder wins when it exists.
export function subjectColour(code, colours = {}) {
  const key = String(code || "").trim().toUpperCase();
  if (key && colours[key]) return colours[key];
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) % 997;
  return PALETTE[hash % PALETTE.length];
}

function minutes(value) {
  const [hours, mins] = String(value || "").split(":");
  const number = Number(hours) * 60 + Number(mins);
  return Number.isFinite(number) ? number : null;
}

// The clock of each period: the version's own times when it has them, the school defaults otherwise.
export function effectivePeriods(rows = [], periods = []) {
  const stored = new Map();
  for (const row of rows) {
    const number = Number(row.period);
    if (!stored.has(number) && row.startTime) stored.set(number, row);
  }
  return periods.map((period) => {
    const number = Number(period.period);
    const row = stored.get(number);
    return {
      period: number,
      startTime: row?.startTime || period.startTime || "",
      endTime: row?.endTime || period.endTime || "",
    };
  });
}

// A break is a gap between the end of one period and the start of the next. The school clock has a
// 20 minute gap between period 5 and 6, which is the REHAT column on the printed timetables.
export function restColumns(periods = [], minimumMinutes = 10) {
  const rests = [];
  for (let index = 0; index < periods.length - 1; index += 1) {
    const end = minutes(periods[index].endTime);
    const next = minutes(periods[index + 1].startTime);
    if (end === null || next === null || next - end < minimumMinutes) continue;
    rests.push({
      after: Number(periods[index].period),
      label: "REHAT",
      minutes: next - end,
      from: periods[index].endTime,
      to: periods[index + 1].startTime,
    });
  }
  return rests;
}

// A period claimed as masa tetapan (Guru Pemulihan) can be unticked again; an occupied period — a
// lesson or any other duty row — can never be ticked, because the write would skip it and the tick
// would silently vanish. The setting grid and its tests share this one rule.
export function claimableCell(cell) {
  return Boolean(cell) && (cell.state === "free" || cell.state === "setting");
}

// One cell per day and period. state: "free" (nothing there), "lesson" (a real class), "duty" (a
// non-teaching row such as perhimpunan) or "setting" (the remedial teacher's masa tetapan).
export function weekGrid({ rows = [], days = [], periods = [], colours = {}, restAfter = null, todayCode = "", teacherId = "" } = {}) {
  const byKey = new Map();
  for (const row of rows) {
    // A grid is always one teacher's (or one class's) week. Filtering here rather than at the call
    // site is what stops another teacher's lesson at the same slot from locking the cell.
    if (teacherId && row.teacherId !== teacherId) continue;
    const key = `${String(row.day).toUpperCase()}-${Number(row.period)}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  const clock = effectivePeriods(byKey.size ? [...byKey.values()] : rows.filter((row) => !teacherId || row.teacherId === teacherId), periods);
  const rests = restAfter === null ? restColumns(clock) : restAfter;
  const columns = [{ kind: "label", label: "Hari" }];
  for (const period of clock) {
    columns.push({ kind: "period", period: period.period, startTime: period.startTime, endTime: period.endTime });
    const rest = rests.find((item) => Number(item.after) === Number(period.period));
    if (rest) columns.push({ kind: "rest", label: rest.label || "REHAT", after: period.period, from: rest.from || "", to: rest.to || "" });
  }
  const grid = days.map((day) => {
    const code = String(day).toUpperCase();
    const cells = clock.map((period) => {
      const row = byKey.get(`${code}-${period.period}`);
      const state = !row ? "free" : row.isDuty ? (isSettingRow(row) ? "setting" : "duty") : "lesson";
      // Masa pemulihan: tajuknya kekal "Pemulihan" dan baris kedua menunjukkan subjek + kelas asal murid.
      const setting = state === "setting" ? parseSettingSubject(row.subject) : null;
      const subject = state === "free" ? "" : setting ? SETTING_SUBJECT : String(row.subject || "");
      return {
        day: code,
        period: period.period,
        state,
        subject,
        label: state === "free" ? "" : setting ? setting.detail : String(row.className || "Aktiviti"),
        colour: state === "free" ? "" : subjectColour(subject, colours),
        locked: state === "lesson",
      };
    });
    return { day: code, today: code === String(todayCode).toUpperCase(), cells };
  });
  const seen = new Set();
  const legend = [];
  for (const line of grid) {
    for (const cell of line.cells) {
      const code = cell.subject.trim().toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      legend.push({ code: cell.subject, colour: cell.colour });
    }
  }
  const total = grid.reduce((sum, line) => sum + line.cells.filter((cell) => cell.state !== "free").length, 0);
  return { columns, rows: grid, legend, rests, total };
}
