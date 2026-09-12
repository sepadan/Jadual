import { DAY_CODES, PERIODS, slug } from "./data.js?v=3.1.33";

// Reference coordinate system from the original aSc export (792 x 612).
// The decimal column width matters near periods 9-12; rounding it to 36
// gradually shifts late-day lessons into the preceding period.
const GRID = { x0: 71.65, columnWidth: 35.58, top: 127, rowHeight: 91.35 };
const NO_CLASS_DURATION = { PER: 1, "B.ALQ": 1, "1M1S": 2, KOKU: 2 };
const TITLE_PREFIX = /^(TN\s+HJ|EN|PN\.?|CIK)\s+/i;

export function normalizeName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(TITLE_PREFIX, "")
    .replace(/@/g, " @ ")
    .replace(/\bFAIDSAL\b/g, "FAIDZAL")
    .replace(/^AZUAN\s+MOHD\s+NOH$/, "AZUAN BIN MOHD NOH")
    .replace(/^FAZIDA BINTI MIFTAHUDDIN$/, "FAZIDA BINTI MD MIFTAHUDDIN")
    .replace(/^SABRINA SYASYA BINTI/, "NUR SABRINA SYASYA BINTI")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsFromItems(items, pageHeight) {
  return items
    .map((item) => {
      const [a, b, c, d, e, f] = item.transform;
      const fontSize = Math.hypot(c, d) || Math.hypot(a, b);
      const angle = Math.atan2(b, a) * 180 / Math.PI;
      return {
        text: String(item.str || "").trim(),
        x: e,
        top: pageHeight - f - fontSize,
        width: Number(item.width || 0),
        height: fontSize,
        angle,
      };
    })
    .filter((item) => item.text);
}

function getHeaderName(words) {
  const header = words
    .filter((word) => word.top > 43 && word.top < 72 && word.x > 90 && word.x < 705 && Math.abs(word.angle) < 8)
    .sort((a, b) => a.x - b.x)
    .map((word) => word.text)
    .join(" ")
    .replace(/\s*GURU KELAS:.*$/i, "")
    .trim();
  return normalizeName(header);
}

function groupLargeLabels(words, rowTop, rowBottom) {
  const large = words
    .filter((word) => word.top > rowTop + 18 && word.top < rowBottom - 12)
    .filter((word) => word.x >= GRID.x0 && word.x < GRID.x0 + GRID.columnWidth * 14)
    .filter((word) => word.height >= 15 && word.height <= 28 && Math.abs(word.angle) < 8)
    .sort((a, b) => a.top - b.top || a.x - b.x);
  const groups = [];
  large.forEach((word) => {
    let group = groups.find((candidate) => !classNameFromLabel(candidate.words.join(' ')) && Math.abs(candidate.top - word.top) < 4 && word.x - candidate.right < 10);
    if (!group) {
      group = { top: word.top, left: word.x, right: word.x + word.width, words: [] };
      groups.push(group);
    }
    group.words.push(word.text);
    group.left = Math.min(group.left, word.x);
    group.right = Math.max(group.right, word.x + word.width);
  });
  return groups.map((group) => ({ ...group, text: group.words.join(" "), center: (group.left + group.right) / 2 }));
}

function classNameFromLabel(label) {
  const match = label.replace(/\s+/g, " ").match(/([1-6])\s*([BC])/i);
  if (!match) return "";
  return `${match[1]} ${match[2].toUpperCase() === "B" ? "BIJAK" : "CERDIK"}`;
}

function textLines(words) {
  const lines=[];
  words.slice().sort((a,b)=>a.top-b.top||a.x-b.x).forEach(word=>{
    let line=lines.find(item=>Math.abs(item.top-word.top)<2.5);
    if(!line){line={top:word.top,words:[]};lines.push(line);}
    line.words.push(word);
  });
  return lines.sort((a,b)=>a.top-b.top).map(line=>({top:line.top,text:line.words.sort((a,b)=>a.x-b.x).map(word=>word.text).join(' ').replace(/\s+/g,' ').trim()}));
}

function pageMetadata(words) {
  const lines=textLines(words);
  const schoolLine=lines.find(line=>line.top<25&&/^(?:SK|SMK|SEKOLAH)\b/i.test(line.text));
  const titleLine=lines.find(line=>line.top<50&&/JADUAL WAKTU PERSENDIRIAN GURU/i.test(line.text));
  const classLine=lines.find(line=>line.top>50&&line.top<82&&/GURU KELAS\s*:/i.test(line.text));
  const principalTitleIndex=lines.findIndex(line=>line.top>450&&/GURU BESAR|PENGETUA/i.test(line.text));
  const principalName=principalTitleIndex>0?lines.slice(0,principalTitleIndex).reverse().find(line=>line.top>450&&/^(?:TN|EN|PN|CIK|DR)\b/i.test(line.text))?.text||'':'';
  const generatedLine=lines.find(line=>/Jadual waktu terjana\s*:/i.test(line.text));
  const periods=[];
  words.filter(word=>word.top>108&&word.top<132&&/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(word.text)).forEach(word=>{
    const rawColumn=Math.floor((word.x-GRID.x0+2)/GRID.columnWidth);
    if(rawColumn<0||rawColumn>13||rawColumn===6) return;
    const period=rawColumn>6?rawColumn-1:rawColumn;
    const match=word.text.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if(match) periods.push({period,startTime:match[1].padStart(5,'0'),endTime:match[2].padStart(5,'0')});
  });
  const year=titleLine?.text.match(/\b(20\d{2})\b/)?.[1]||'';
  const generatedAt=generatedLine?.text.match(/:\s*([^ ]+)/)?.[1]||'';
  const classTeacherClass=classNameFromLabel((classLine?.text||'').replace(/^.*GURU KELAS\s*:\s*/i,''));
  return {schoolName:schoolLine?.text||'',teacherTitle:titleLine?.text||'',year,classTeacherClass,principalName,principalTitle:principalTitleIndex>=0?lines[principalTitleIndex].text:'',generatedAt,periods:periods.sort((a,b)=>a.period-b.period)};
}

function parsePageItems(items, pageView, teachers) {
  const pageHeight = Math.abs(pageView[3] - pageView[1]);
  const pageWidth = Math.abs(pageView[2] - pageView[0]);
  if (!Number.isFinite(pageWidth) || !Number.isFinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) {
    throw new Error("Ukuran halaman PDF tidak sah.");
  }
  // aSc stretches its table to the selected paper size. Normalize both axes,
  // including CropBox offsets, before applying the reference grid geometry.
  const sx = 792 / pageWidth;
  const sy = 612 / pageHeight;
  const words = wordsFromItems(items, pageView[3]).map((word) => ({
    ...word,
    x: (word.x - pageView[0]) * sx,
    top: word.top * sy,
    width: word.width * sx,
    height: word.height * sy,
  }));
  // A different paper size is allowed, a different table layout is not.
  const headerText = words.filter((word) => word.top < 75).map((word) => word.text).join(" ");
  const periodHeaders = Array.from({ length: 13 }, (_, period) => {
    const column = period >= 6 ? period + 1 : period;
    const center = GRID.x0 + (column + 0.5) * GRID.columnWidth;
    return words.some((word) => word.text === String(period) && word.top > 75 && word.top < 110
      && Math.abs(word.x + word.width / 2 - center) < 6);
  });
  if (!/PERSENDIRIAN\s+GURU/i.test(headerText) || periodHeaders.some((found) => !found)) {
    throw new Error("Susun atur PDF tidak dikenali. Pilih eksport aSc Jadual Waktu Persendirian Guru dengan waktu 0–12; PDF kelas atau imbasan gambar belum disokong.");
  }
  const rawName = getHeaderName(words);
  const normalized = normalizeName(rawName);
  const teacher = teachers.find((item) => normalizeName(item.name) === normalized);
  const metadata=pageMetadata(words);
  const totalLabel = words.find((word) => /^Jumlah(?:\s+Waktu)?$/i.test(word.text) && word.x > 600 && word.top > 300 && word.top < 470);
  const totalWord = totalLabel && words.find((word) => /^\d+$/.test(word.text) && word.x > 690 && Math.abs(word.top - totalLabel.top) < 8);
  const expectedSlotCount = totalWord ? Number(totalWord.text) : null;
  const rows = [];

  DAY_CODES.forEach((day, dayIndex) => {
    const rowTop = GRID.top + dayIndex * GRID.rowHeight;
    const rowBottom = rowTop + GRID.rowHeight;
    const subjectWords = words
      // Subject labels with a class sit near the top of a merged cell, while
      // duties such as PER/B.ALQ are vertically centred. Read the full day row.
      .filter((word) => word.top > rowTop + 2 && word.top < rowBottom - 2)
      .filter((word) => word.x >= GRID.x0 && word.x < GRID.x0 + GRID.columnWidth * 14)
      .filter((word) => word.height >= 5 && word.height <= 13 && Math.abs(word.angle) < 8)
      .filter((word) => /^[A-Z0-9.\/]+$/i.test(word.text))
      .sort((a, b) => a.x - b.x);
    const subjectGroups = new Map();
    subjectWords.forEach((word) => {
      const rawColumn = Math.floor((word.x - GRID.x0 + 2) / GRID.columnWidth);
      if (!subjectGroups.has(rawColumn)) subjectGroups.set(rawColumn, []);
      subjectGroups.get(rawColumn).push(word);
    });
    const subjects = [...subjectGroups.entries()].map(([rawColumn, group]) => {
      const ordered = group.sort((a, b) => a.top - b.top || a.x - b.x);
      let text = ordered.map((word) => word.text).join("/");
      text = text.replace(/\/z$/i, "z").replace(/\/{2,}/g, "/");
      return { ...ordered[0], x: Math.min(...ordered.map((word) => word.x)), text, rawColumn };
    }).sort((a, b) => a.x - b.x);
    const labels = groupLargeLabels(words, rowTop, rowBottom);

    subjects.forEach((subject, index) => {
      const rawColumn = subject.rawColumn;
      if (rawColumn < 0 || rawColumn > 13 || rawColumn === 6) return;
      const period = rawColumn > 6 ? rawColumn - 1 : rawColumn;
      const nextSubjectX = subjects[index + 1]?.x ?? GRID.x0 + GRID.columnWidth * 14;
      const label = labels.find((candidate) => candidate.center >= subject.x - 4 && candidate.center < nextSubjectX - 1);
      const startX = GRID.x0 + rawColumn * GRID.columnWidth;
      let duration = label ? Math.max(1, Math.round((2 * (label.center - startX)) / GRID.columnWidth)) : (NO_CLASS_DURATION[subject.text] || 1);
      if(subjects[index+1]) duration=Math.min(duration,subjects[index+1].rawColumn-rawColumn);
      if (rawColumn < 6 && rawColumn + duration > 6) duration = 6 - rawColumn;
      if (rawColumn > 6 && rawColumn + duration > 14) duration = 14 - rawColumn;
      duration = Math.max(1, Math.min(duration, 4));
      for (let offset = 0; offset < duration; offset += 1) {
        const actualPeriod = period + offset;
        const periodInfo = metadata.periods.find((item) => item.period === actualPeriod) || PERIODS.find((item) => item.period === actualPeriod);
        if (!periodInfo) continue;
        rows.push({
          day,
          period: actualPeriod,
          startTime: periodInfo.startTime,
          endTime: periodInfo.endTime,
          subject: subject.text,
          className: classNameFromLabel(label?.text || ""),
          isDuty: !label,
        });
      }
    });
  });

  return {
    rawName,
    normalizedName: normalized,
    teacherId: teacher?.id || "",
    suggestedTeacher: teacher || null,
    expectedSlotCount,
    pageTeacher: teacher ? null : {
      id: `g-${slug(normalized.split(" ").slice(0, 3).join("-"))}`,
      name: normalized,
      shortName: normalized.split(" ").filter((part) => !["BIN", "BINTI"].includes(part)).slice(0, 2).join(" "),
      position: "Guru Akademik Biasa",
      reliefEligible: true,
      priority: 3,
      active: true,
    },
    metadata,
    rows,
  };
}

export async function parseTeacherPdf(file, pdfjsLib, teachers, onProgress = () => {}) {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  const task = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, disableFontFace: true });
  const pdf = await task.promise;
  const pageCount = pdf.numPages;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ disableNormalization: false });
    pages.push(parsePageItems(content.items, page.view, teachers));
    onProgress({ current: pageNumber, total: pageCount });
    page.cleanup();
  }
  await task.destroy();

  const structuralWarnings = [];
  pages.filter((page) => page.expectedSlotCount != null && page.rows.length !== page.expectedSlotCount).forEach((page) => {
    structuralWarnings.push(`Semak ${page.rawName}: PDF menyatakan ${page.expectedSlotCount} waktu tetapi pembaca mengesan ${page.rows.length}.`);
  });
  const firstMetadata=pages.map(page=>page.metadata).find(item=>item?.schoolName)||pages[0]?.metadata||{};
  const timing=pages.map(page=>page.metadata?.periods||[]).sort((a,b)=>b.length-a.length)[0]||[];
  const metadata={...firstMetadata,periods:timing,pages:pages.map(page=>({teacherId:page.teacherId,rawName:page.rawName,classTeacherClass:page.metadata?.classTeacherClass||''}))};
  return { pageCount, pages, metadata, structuralWarnings, ...buildImportSelection(pages, teachers, structuralWarnings) };
}

export function buildImportSelection(pages, teachers, structuralWarnings = []) {
  const matchedPages = pages.filter((page) => page.teacherId);
  const unmatchedPages = pages.filter((page) => !page.teacherId);
  const matchedIds = new Set(matchedPages.map((page) => page.teacherId));
  const missingTeachers = teachers.filter((teacher) => teacher.active && !matchedIds.has(teacher.id));
  const warnings = [
    ...unmatchedPages.map((page) => `Diabaikan kerana tiada padanan guru: ${page.normalizedName}.`),
    ...missingTeachers.map((teacher) => `Tiada halaman jadual untuk ${teacher.name}.`),
    ...structuralWarnings,
  ];
  const rows = matchedPages.flatMap((page) => page.rows.map((row) => ({ ...row, teacherId: page.teacherId })));
  return { rows, warnings, unmatchedPages, missingTeachers };
}
