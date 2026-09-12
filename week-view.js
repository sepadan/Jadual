// The teacher's week as data, so the timetable pane can be checked without a browser: a teacher
// reads the whole week at once (periods down the side, the five school days across the top), and the
// grid has to name every one of the 13 periods on every day, empty or not.
export const WEEK_FREE_LABEL = "Lapangan";

export function weekTableModel({ rows = [], days = [], periods = [], timeFor, todayCode = "" } = {}) {
  const placed = new Map();
  for (const row of rows) {
    const day = String(row.day || "");
    if (!days.includes(day)) continue;
    const period = Number(row.period);
    // One cell per day and period: a duplicate row must not silently replace the lesson shown.
    if (!Number.isFinite(period) || placed.has(`${day}-${period}`)) continue;
    placed.set(`${day}-${period}`, row);
  }
  return {
    todayCode,
    columns: days.map((code) => ({ code, today: code === todayCode })),
    rows: periods.map((entry) => {
      const period = Number(entry.period ?? entry);
      return {
        period,
        time: typeof timeFor === "function" ? String(timeFor(period) || "") : "",
        cells: days.map((code) => {
          const row = placed.get(`${code}-${period}`);
          if (!row) return { day: code, period, state: "free", subject: "", label: WEEK_FREE_LABEL };
          return {
            day: code,
            period,
            state: row.isDuty ? "setting" : "lesson",
            subject: String(row.subject || ""),
            label: String(row.className || "Aktiviti"),
          };
        }),
      };
    }),
  };
}

export function weekLessonCount(model) {
  return (model?.rows || []).reduce((total, row) => total + row.cells.filter((cell) => cell.state !== "free").length, 0);
}
