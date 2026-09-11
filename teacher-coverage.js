// Permanent cover links: a Personel MySTEP or Guru Praktikal takes over another teacher's lessons
// without a new timetable version. The links live on the covering teacher's own profile.
//
//  - Personel MySTEP replaces: the covered teacher's lessons move to the MySTEP teacher, and a
//    teacher whose lessons are all taken over disappears from the app (they are no longer at school).
//  - Guru Praktikal shares: the lesson is added to the practical teacher's timetable while the
//    original teacher keeps it, because that teacher can still walk into the class.
//
// Stored as JSON in teachers.coversJson: [{"teacherId":"t-x","subjects":["BA"]}] — an empty subject
// list means the whole timetable. teachers.coversTeacherId/coversSubjects is the older single-link
// shape and is still read.

export const COVER_POSITIONS = ["Personel MySTEP", "Guru Praktikal"];
export const REPLACE_POSITION = "Personel MySTEP";

export function canCover(teacher) {
  return COVER_POSITIONS.includes(String(teacher?.position || ""));
}

function subjectsFrom(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

// Every (teacher, subjects) pair the record asks for, newest shape first.
export function coverList(teacher) {
  if (!teacher) return [];
  const raw = teacher.coversJson;
  if (raw) {
    let parsed = raw;
    if (typeof raw === "string") {
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
    }
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => ({ teacherId: String(entry?.teacherId || ""), subjects: (Array.isArray(entry?.subjects) ? entry.subjects : subjectsFrom(entry?.subjects)).map((item) => String(item).trim().toUpperCase()).filter(Boolean) }))
        .filter((entry) => entry.teacherId);
    }
  }
  if (teacher.coversTeacherId) return [{ teacherId: String(teacher.coversTeacherId), subjects: subjectsFrom(teacher.coversSubjects) }];
  return [];
}

// Kept for the older single-link callers.
export function coverSubjects(teacher) {
  return coverList(teacher)[0]?.subjects || [];
}

export function coverLinks(teachers) {
  return (teachers || [])
    .filter((teacher) => teacher.active !== false)
    .flatMap((teacher) => coverList(teacher).map((entry) => ({
      coveringId: teacher.id,
      covering: teacher,
      coveredId: entry.teacherId,
      subjects: entry.subjects,
      replace: String(teacher.position || "") === REPLACE_POSITION,
    })))
    .filter((link) => link.coveredId && link.coveredId !== link.coveringId);
}

function takes(link, row) {
  if (link.coveredId !== row.teacherId) return false;
  if (!link.subjects.length) return true;
  return link.subjects.includes(String(row.subject || "").trim().toUpperCase());
}

// The timetable as the school runs it:
//  - a replaced lesson is filed under the MySTEP teacher (so they read as busy there),
//  - a shared lesson is kept by the original teacher AND added to the practical teacher.
export function coverageRows(rows, teachers) {
  const links = coverLinks(teachers);
  if (!links.length) return rows || [];
  const out = [];
  (rows || []).forEach((row) => {
    const link = links.find((item) => takes(item, row));
    if (!link) { out.push(row); return; }
    if (link.replace) { out.push({ ...row, teacherId: link.coveringId, coveredFor: row.teacherId }); return; }
    out.push(row);
    out.push({ ...row, teacherId: link.coveringId, coveredFor: row.teacherId, sharedWith: row.teacherId });
  });
  return out;
}

// Lessons taught together: key -> the teachers sharing that class period.
export function sharedPairs(rows, teachers) {
  const links = coverLinks(teachers).filter((link) => !link.replace);
  const pairs = new Map();
  links.forEach((link) => {
    (rows || []).filter((row) => takes(link, row)).forEach((row) => {
      const key = `${row.versionId || ""}|${row.day}|${Number(row.period)}|${row.className || ""}`;
      const set = pairs.get(key) || new Set();
      set.add(link.coveredId);
      set.add(link.coveringId);
      pairs.set(key, set);
    });
  });
  return pairs;
}

export function sharedPairKey(row) {
  return `${row.versionId || ""}|${row.day}|${Number(row.period)}|${row.className || ""}`;
}

// A Personel MySTEP who takes every lesson of a teacher on the timetable replaces that teacher
// completely, and the original must not appear anywhere. A practical teacher never hides anyone.
export function fullyCoveredIds({ teachers, rows }) {
  const hidden = new Set();
  coverLinks(teachers)
    .filter((link) => link.replace)
    .forEach((link) => {
      const own = (rows || []).filter((row) => row.teacherId === link.coveredId);
      if (!own.length) return;
      if (!own.some((row) => !takes(link, row))) hidden.add(link.coveredId);
    });
  return hidden;
}

// Subjects a covering teacher may take: the ones the covered teacher actually teaches.
export function coveredTeacherSubjects(rows, teacherId) {
  return [...new Set((rows || [])
    .filter((row) => row.teacherId === teacherId)
    .map((row) => String(row.subject || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ms"));
}

function describe(link, teachers) {
  const name = (teachers || []).find((item) => item.id === link.coveredId)?.name || "guru diganti";
  return link.subjects.length ? `${name} · ${link.subjects.join(", ")}` : `${name} · semua jadual`;
}

export function coverageLabel({ teachers, teacherId }) {
  const links = coverLinks(teachers).filter((link) => link.coveringId === teacherId);
  return links.map((link) => describe(link, teachers)).join(" + ");
}
