import test from "node:test";
import assert from "node:assert/strict";
import { PERIODS, DAY_CODES } from "../data.js";
import { SETTING_SUBJECT, mergeSettingRows, settingKey } from "../setting-slots.js";
import { weekGrid, claimableCell } from "../week-view.js";

// What the remedial teacher's grid may offer a finger: an empty period, and a period already claimed
// as masa tetapan (so it can be released). Everything else is a real commitment.
const lesson = { versionId: "v1", teacherId: "t1", day: "JUM", period: 3, startTime: "08:30", endTime: "09:00", subject: "BA", className: "3 BIJAK" };
const claimed = { versionId: "v1", teacherId: "t1", day: "IS", period: 1, startTime: "07:30", endTime: "08:00", subject: SETTING_SUBJECT, className: "", isDuty: true };
const perhimpunan = { versionId: "v1", teacherId: "t1", day: "IS", period: 0, startTime: "07:20", endTime: "07:30", subject: "PERHIMPUNAN", className: "", isDuty: true };
const grid = weekGrid({ rows: [lesson, claimed, perhimpunan], days: DAY_CODES, periods: PERIODS });
const cellOf = (day, period) => grid.rows.find((line) => line.day === day)?.cells.find((cell) => cell.period === period);

test("an empty period and a claimed one can be touched; a lesson cannot", () => {
  assert.equal(claimableCell(cellOf("SEL", 4)), true, "an empty period cannot be claimed");
  assert.equal(claimableCell(cellOf("IS", 1)), true, "a claimed period cannot be released");
  assert.equal(claimableCell(cellOf("JUM", 3)), false, "a teaching period is offered for claiming");
});

test("a duty row imported from a PDF is out of reach too", () => {
  // mergeSettingRows skips a period that already holds any row for this teacher, so offering the
  // perhimpunan period for a tick would show a tick that silently disappears on save.
  assert.equal(claimableCell(cellOf("IS", 0)), false, "an imported duty row is offered for claiming");
  const result = mergeSettingRows({ rows: [perhimpunan], teacherId: "t1", versionId: "v1", selected: [settingKey("IS", 0)], periods: PERIODS });
  assert.equal(result.added, 0, "a tick on an occupied period was written after all");
  assert.equal(result.skipped, 1, "the skipped tick was not counted");
});

test("every period of every day is either claimable or visibly occupied", () => {
  for (const line of grid.rows) {
    for (const cell of line.cells) {
      if (claimableCell(cell)) continue;
      assert.notEqual(cell.state, "free", `${cell.day}-${cell.period} is locked but looks empty`);
      assert.notEqual(cell.subject, "", `${cell.day}-${cell.period} is locked with nothing written in it`);
    }
  }
});
