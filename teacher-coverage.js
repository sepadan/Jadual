// Permanent cover: a Personel MySTEP or Guru Praktikal takes over another teacher's lessons
// without a new timetable version. The link lives on the covering teacher's own profile
// (teachers.coversTeacherId + coversSubjects), because that is the card the admin edits.
//
// "coversSubjects" is an upper-case comma list; empty means the whole timetable.

export const COVER_POSITIONS = ["Personel MySTEP", "Guru Praktikal"];

export function canCover(teacher) {
  return COVER_POSITIONS.includes(String(teacher?.position || ""));
}

export function coverSubjects(teacher) {
  return String(teacher?.coversSubjects || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

export function coverLinks(teachers) {
  return (teachers || [])
    .filter((teacher) => teacher.active !== false && teacher.coversTeacherId)
    .map((teacher) => ({ coveringId: teacher.id, covering: teacher, coveredId: teacher.coversTeacherId, subjects: coverSubjects(teacher) }))
    .filter((link) => link.coveredId && link.coveredId !== link.coveringId);
}

function takes(link, row) {
  if (link.coveredId !== row.teacherId) return false;
  if (!link.subjects.length) return true;
  return link.subjects.includes(String(row.subject || "").trim().toUpperCase());
}

// Lessons taken over are filed under the covering teacher, so that teacher shows as busy at those
// times and is never suggested as relief elsewhere, and the covered teacher's lessons stop being
// offered for relief. Nothing is written back to Sheets: this is a read-time view.
export function coverageRows(rows, teachers) {
  const links = coverLinks(teachers);
  if (!links.length) return rows || [];
  return (rows || []).map((row) => {
    const link = links.find((item) => takes(item, row));
    return link ? { ...row, teacherId: link.coveringId, coveredFor: row.teacherId } : row;
  });
}

// A Personel MySTEP who takes every lesson of a teacher on the timetable replaces that teacher
// completely, and the original must not appear anywhere. A practical teacher keeps the original
// visible, because that teacher is still at the school.
export function fullyCoveredIds({ teachers, rows }) {
  const hidden = new Set();
  coverLinks(teachers)
    .filter((link) => String(link.covering.position || "") === "Personel MySTEP")
    .forEach((link) => {
      const own = (rows || []).filter((row) => row.teacherId === link.coveredId);
      if (!own.length) return;
      if (!own.some((row) => !takes(link, row))) hidden.add(link.coveredId);
    });
  return hidden;
}

// Subjects the covering teacher may take: the ones the covered teacher actually teaches.
export function coveredTeacherSubjects(rows, teacherId) {
  return [...new Set((rows || [])
    .filter((row) => row.teacherId === teacherId)
    .map((row) => String(row.subject || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ms"));
}

export function coverageLabel({ teachers, teacherId }) {
  const link = coverLinks(teachers).find((item) => item.coveringId === teacherId);
  if (!link) return "";
  const name = (teachers || []).find((item) => item.id === link.coveredId)?.name || "guru diganti";
  return link.subjects.length ? `${name} · ${link.subjects.join(", ")}` : `${name} · semua jadual`;
}
