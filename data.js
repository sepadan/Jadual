export const APP_VERSION = "3.0.7";

export const PERIODS = [
  { period: 0, startTime: "07:20", endTime: "07:30" },
  { period: 1, startTime: "07:30", endTime: "08:00" },
  { period: 2, startTime: "08:00", endTime: "08:30" },
  { period: 3, startTime: "08:30", endTime: "09:00" },
  { period: 4, startTime: "09:00", endTime: "09:30" },
  { period: 5, startTime: "09:30", endTime: "10:00" },
  { period: 6, startTime: "10:20", endTime: "10:50" },
  { period: 7, startTime: "10:50", endTime: "11:20" },
  { period: 8, startTime: "11:20", endTime: "11:50" },
  { period: 9, startTime: "11:50", endTime: "12:20" },
  { period: 10, startTime: "12:20", endTime: "12:50" },
  { period: 11, startTime: "12:50", endTime: "13:20" },
  { period: 12, startTime: "13:20", endTime: "13:50" },
];

const teachers = [
  ["KHAIRUL IZAM BIN ABD SAMAT", "KHAIRUL IZAM", "Guru Besar", false, 9],
  ["MHD FAIDZAL BIN YUSOF", "FAIDZAL", "Guru Akademik", true, 3],
  ["NUR SALLEH AZYZE BIN MOHD SHAARI AZYZE", "SALLEH AZYZE", "Guru Akademik", true, 3],
  ["ABDUL FAHMI BIN BEDOLAH@ABDULLAH", "FAHMI", "Guru Akademik", true, 3],
  ["MUHAMMAD YAHYA BIN MOHD KADZRI", "YAHYA", "Guru Akademik", true, 3],
  ["MOHD KAMIL BIN BEDOL", "KAMIL", "Guru Akademik", true, 3],
  ["ANIZAN BIN AB AZIZ", "ANIZAN", "Guru Prasekolah", false, 6],
  ["ASRAF MUBARAK BIN ATAN", "ASRAF", "Guru Akademik", true, 3],
  ["NORA MOHAINIM BINTI JAAMAT", "NORA", "Guru Akademik", true, 3],
  ["SITI NURULFATIN ADLINA BINTI ZAINUDDIN", "FATIN", "Guru Akademik", true, 3],
  ["MAZLINA BINTI SHAFIE", "MAZLINA", "Guru Akademik", true, 3],
  ["MOHAMAD AZIZI BIN BASRI", "AZIZI", "Guru Akademik", true, 3],
  ["AZUAN BIN MOHD NOH", "AZUAN", "Guru Akademik", true, 3],
  ["SITI ZALEHA BINTI HAMZAH", "ZALEHA", "Guru Akademik", true, 3],
  ["WEE FHEI CHEN", "WEE", "Guru Akademik", true, 3],
  ["FAZIDA BINTI MD MIFTAHUDDIN", "FAZIDA", "Guru Akademik", true, 3],
  ["NUR SABRINA SYASYA BINTI MOHD SULAIMAN", "SABRINA", "Guru Akademik", true, 3],
  ["SOFEA BALQIS BINTI TAIB", "SOFEA", "Guru Akademik", true, 3],
  ["MUHAMMAD AIZUDDIN BIN HADURI", "AIZUDDIN", "Guru Akademik", true, 3],
  ["WAN ABDUL AZIZ BIN WAN MOHD NOR", "WAN AZIZ", "Guru Akademik", true, 3],
  ["AMIRUL QASIMI BIN ALI", "AMIRUL", "Guru Akademik", true, 3],
  ["AMIRAH BINTI SHEIKH ISMAIL", "AMIRAH", "Guru Akademik", true, 3],
  ["NUR SYAHIDAH AMIRA BINTI MUHAMED", "SYAHIDAH", "Guru Akademik", true, 3],
];

export function slug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export const INITIAL_TEACHERS = teachers.map(([name, shortName, position, reliefEligible, priority]) => ({
  id: `g-${slug(shortName)}`,
  name,
  shortName,
  position,
  reliefEligible,
  priority,
  active: true,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
}));

export const DAY_CODES = ["IS", "SEL", "RAB", "KHA", "JUM"];
export const DAY_NAMES = { IS: "Isnin", SEL: "Selasa", RAB: "Rabu", KHA: "Khamis", JUM: "Jumaat" };

export function emptyDatabase() {
  return {
    school: "SK Paya Redan, Muar",
    revision: 0,
    reliefSettings: {dailyLimit: 2,ignorePairingWhenCovered:false},
    updatedAt: new Date().toISOString(),
    teachers: structuredClone(INITIAL_TEACHERS),
    scheduleVersions: [],
    schedule: [],
    absences: [],
    reliefs: [],
  };
}
