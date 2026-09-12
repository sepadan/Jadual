/**
 * API Google Sheets untuk Sistem Jadual SKPR (modul Relief).
 * Jalankan setupSystem() sekali sebelum deploy sebagai Web App.
 */

var SHEETS = {
  Config: ["key", "value"],
  Teachers: ["id", "name", "shortName", "position", "reliefEligible", "priority", "active", "createdAt", "updatedAt", "coversTeacherId", "coversSubjects", "coversJson", "preschoolEndTime"],
  ScheduleVersions: ["id", "label", "effectiveDate", "sourceName", "status", "createdAt"],
  Schedule: ["versionId", "teacherId", "day", "period", "startTime", "endTime", "subject", "className", "isDuty"],
  Absences: ["id", "date", "teacherId", "reason", "allDay", "periods", "status", "createdAt", "updatedAt"],
  Reliefs: ["id", "date", "day", "period", "startTime", "endTime", "absentTeacherId", "replacementTeacherId", "className", "subject", "status", "note", "createdAt", "updatedAt"],
  Audit: ["timestamp", "action", "recordId", "details"],
  BuilderState: ["revision", "index", "chunk"]
};

// The audit log stays useful and small: once it passes the cap, the oldest block is dropped.
var AUDIT_MAX_ROWS_ = 5000;
var AUDIT_TRIM_ROWS_ = 1000;

var INITIAL_TEACHERS = [
  ["g-khairul-izam", "KHAIRUL IZAM BIN ABD SAMAT", "KHAIRUL IZAM", "Guru Besar", false, 9],
  ["g-faidzal", "MHD FAIDZAL BIN YUSOF", "FAIDZAL", "Guru Akademik", true, 3],
  ["g-salleh-azyze", "NUR SALLEH AZYZE BIN MOHD SHAARI AZYZE", "SALLEH AZYZE", "Guru Akademik", true, 3],
  ["g-fahmi", "ABDUL FAHMI BIN BEDOLAH@ABDULLAH", "FAHMI", "Guru Akademik", true, 3],
  ["g-yahya", "MUHAMMAD YAHYA BIN MOHD KADZRI", "YAHYA", "Guru Akademik", true, 3],
  ["g-kamil", "MOHD KAMIL BIN BEDOL", "KAMIL", "Guru Akademik", true, 3],
  ["g-anizan", "ANIZAN BIN AB AZIZ", "ANIZAN", "Guru Prasekolah", false, 6],
  ["g-asraf", "ASRAF MUBARAK BIN ATAN", "ASRAF", "Guru Akademik", true, 3],
  ["g-nora", "NORA MOHAINIM BINTI JAAMAT", "NORA", "Guru Akademik", true, 3],
  ["g-fatin", "SITI NURULFATIN ADLINA BINTI ZAINUDDIN", "FATIN", "Guru Akademik", true, 3],
  ["g-mazlina", "MAZLINA BINTI SHAFIE", "MAZLINA", "Guru Akademik", true, 3],
  ["g-azizi", "MOHAMAD AZIZI BIN BASRI", "AZIZI", "Guru Akademik", true, 3],
  ["g-azuan", "AZUAN BIN MOHD NOH", "AZUAN", "Guru Akademik", true, 3],
  ["g-zaleha", "SITI ZALEHA BINTI HAMZAH", "ZALEHA", "Guru Akademik", true, 3],
  ["g-wee", "WEE FHEI CHEN", "WEE", "Guru Akademik", true, 3],
  ["g-fazida", "FAZIDA BINTI MD MIFTAHUDDIN", "FAZIDA", "Guru Akademik", true, 3],
  ["g-sabrina", "NUR SABRINA SYASYA BINTI MOHD SULAIMAN", "SABRINA", "Guru Akademik", true, 3],
  ["g-sofea", "SOFEA BALQIS BINTI TAIB", "SOFEA", "Guru Akademik", true, 3],
  ["g-aizuddin", "MUHAMMAD AIZUDDIN BIN HADURI", "AIZUDDIN", "Guru Akademik", true, 3],
  ["g-wan-aziz", "WAN ABDUL AZIZ BIN WAN MOHD NOR", "WAN AZIZ", "Guru Akademik", true, 3],
  ["g-amirul", "AMIRUL QASIMI BIN ALI", "AMIRUL", "Guru Akademik", true, 3],
  ["g-amirah", "AMIRAH BINTI SHEIKH ISMAIL", "AMIRAH", "Guru Akademik", true, 3],
  ["g-syahidah", "NUR SYAHIDAH AMIRA BINTI MUHAMED", "SYAHIDAH", "Guru Akademik", true, 3]
];

function setupSystem() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Jalankan setupSystem daripada editor yang terikat pada fail Sistem Jadual.');
  PropertiesService.getScriptProperties().setProperty('DATABASE_ID', ss.getId());
  Object.keys(SHEETS).forEach(function(name) { ensureSheet_(ss, name, SHEETS[name]); });
  var configSheet = ss.getSheetByName("Config");
  if (configSheet.getLastRow() === 1) {
    configSheet.getRange(2, 1, 4, 2).setValues([
      ["SCHOOL_NAME", "SK Paya Redan, Muar"],
      ["DATA_REVISION", "1"],
      ["UPDATED_AT", new Date().toISOString()],
      ["SCHEMA_VERSION", "1"]
    ]);
  }
  initializeAdmin_();
  var teacherSheet = ss.getSheetByName("Teachers");
  if (teacherSheet.getLastRow() === 1) {
    var now = new Date().toISOString();
    teacherSheet.getRange(2, 1, INITIAL_TEACHERS.length, 13).setValues(INITIAL_TEACHERS.map(function(row) { return row.concat([true, now, now, "", "", "", ""]); }));
  }
  formatSheets_(ss);
  audit_("setupSystem", "database", "Pangkalan data dimulakan");
  return "Sistem sedia. Login awal admin / admin. Tukar kata laluan dalam Tetapan aplikasi.";
}

// The handle is reused for the whole execution. Re-opening the file on every read cost ~11
// round trips per request, which is what made the public payload take ten seconds.
var DATABASE_HANDLE_ = null;
// Request-scoped caches are cleared at the start of every call, so a warm container can never
// answer from another request's data.
function resetRequestCache_() {
  DATABASE_HANDLE_ = null;
  CONFIG_MAP_ = null;
}

function database_() {
  if (DATABASE_HANDLE_) return DATABASE_HANDLE_;
  var id = PropertiesService.getScriptProperties().getProperty('DATABASE_ID');
  if (!id) throw new Error('Jalankan setupSystem dahulu.');
  DATABASE_HANDLE_ = SpreadsheetApp.openById(id);
  return DATABASE_HANDLE_;
}

function doGet(e) {
  resetRequestCache_();
  GZIP_REQUEST_ = wantsGzip_(e && e.parameter);
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") return output_({ ok: true, school: configValue_("SCHOOL_NAME") || "SK Paya Redan, Muar", version: "3.1.53", auth: "session" });
    if (action === "status") return output_({ok:true,revision:Number(configValue_("DATA_REVISION")||0),updatedAt:configValue_("UPDATED_AT")||""});
    // Read-only, and the payload is cached per revision, so anonymous readers must never
    // queue on the exclusive script lock (it blocked admin writes during peak hours).
    if (action === "public") return output_(publicBootstrapCached_(e));
    return output_({ ok: false, error: "Tindakan GET tidak dikenali." });
  } catch (error) {
    return output_({ ok: false, error: String(error && error.message || error) });
  }
}

function doPost(e) {
  resetRequestCache_();
  try {
    var request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    GZIP_REQUEST_ = wantsGzip_(request);
    if(request.action==='login') {
      var login=login_(request.data||{});
      if(request.data&&request.data.includeBootstrap) {
        var loginLock=LockService.getScriptLock();loginLock.waitLock(20000);
        try {login.snapshot=bootstrap_(-1);} finally {loginLock.releaseLock();}
      }
      return output_(login);
    }
    requireSession_(request.token);
    if(request.action==='logout') return output_(logout_(request.token));
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // The draft is ~1 MB, so it is no longer part of the login payload: it is fetched only when the
      // timetable screen asks for it (action=builder), where the builder cache makes it cheap.
      if(request.action==='bootstrap') {var snapshot=bootstrap_(-1);return output_(snapshot);}
      if(request.action==='builder') return output_({ok:true,builder:readBuilder_()});
      var result = routeWrite_(request.action, request.data || {});
      var revision = bumpRevision_();
      return output_({ ok: true, revision: revision, updatedAt: configValue_("UPDATED_AT"), result: result });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    var message=String(error && error.message || error);
    return output_({ ok: false, code:message==='AUTH_REQUIRED'?'AUTH_REQUIRED':undefined,error:message==='AUTH_REQUIRED'?'Sesi tamat. Sila login semula.':message });
  }
}

function routeWrite_(action, data) {
  // A valid seven-day admin session is sufficient for writes. The initial password remains
  // changeable in Settings but does not block a school that intentionally keeps it.
  if(action==='saveReliefSettings') {
    var limit=Number(data.dailyLimit);
    if(!Number.isInteger(limit)||limit<0||limit>13) throw new Error('Had relief mesti 0 hingga 13 waktu.');
    setConfig_('RELIEF_DAILY_LIMIT',String(limit));
    setConfig_('RELIEF_IGNORE_PAIRING',String(data.ignorePairingWhenCovered===true));
    return {dailyLimit:limit};
  }
  if(action==='saveBuilder') return saveBuilder_(data);
  if(action==='changePassword') return changePassword_(data);
  if (action === "saveTeacher") return upsert_("Teachers", "id", encodeTeacher_(data));
  if (action === "saveAbsence") return saveAbsence_(data);
  if (action === "cancelAbsence") return cancelAbsence_(data);
  if (action === "deleteAbsence") return deleteAbsence_(data);
  if (action === "deleteTeacher") return deleteTeacher_(data);
  if (action === "archiveVersions") return archiveVersions_(data);
  if (action === "resetData") return resetData_(data);
  if (action === "restoreTeachers") return restoreTeachers_(data);
  if (action === "saveReliefs") {
    if (!Array.isArray(data)) throw new Error("Format relief tidak sah.");
    var activeAbsences=readObjects_("Absences").filter(function(item){return item.status!=="cancelled";});
    function hasLinkedAbsence_(item){
      return activeAbsences.some(function(absence){
        var periods=Array.isArray(absence.periods)?absence.periods:parseJson_(absence.periods,[]);
        return absence.date===item.date && absence.teacherId===item.absentTeacherId
          && (bool_(absence.allDay)||periods.map(Number).indexOf(Number(item.period))>=0);
      });
    }
    data.filter(function(item){return item.status!=="cancelled";}).forEach(function(item){
      if(!hasLinkedAbsence_(item)) throw new Error("Rekod ketiadaan telah dipadam atau tidak lagi meliputi waktu relief ini.");
      if(teacherAbsentAt_(activeAbsences,item.replacementTeacherId,item.date,item.period)) throw new Error("Guru ganti yang dipilih tidak hadir pada waktu ini. Jana semula relief.");
    });
    var merged=readObjects_('Reliefs').filter(function(row){return !data.some(function(item){return item.id===row.id;});}).concat(data);
    var limit=reliefDailyLimit_();
    data.filter(function(item){return item.status!=='cancelled'&&item.replacementTeacherId;}).forEach(function(item){
      var periods={};
      merged.filter(function(row){return row.status!=='cancelled'&&hasLinkedAbsence_(row)&&row.date===item.date&&row.replacementTeacherId===item.replacementTeacherId;}).forEach(function(row){periods[row.period]=true;});
      if(Object.keys(periods).length>limit) throw new Error('Had relief harian '+limit+' waktu dilepasi. Semak semula pilihan guru.');
    });
    data.forEach(function(item) { upsert_("Reliefs", "id", encodeRelief_(item)); });
    audit_(action, data.length + " records", "Relief diterbitkan");
    return { count: data.length };
  }
  if (action === "importSchedule") return importSchedule_(data);
  throw new Error("Tindakan tulis tidak dikenali.");
}

// ===== Padam sebenar, arkib dan reset =====
// What the admin deletes in the app must be gone from Sheets too. A deleted absence takes its relief
// rows with it: a relief that points at a record that no longer exists is worse than no record.

function ensureSpareRowsForDelete_(sheet, count) {
  if (!sheet || !count) return;
  var frozen = sheet.getFrozenRows();
  var maxRows = sheet.getMaxRows();
  var available = Math.max(0, maxRows - frozen);
  var needed = count - available + 1;
  if (needed > 0) sheet.insertRowsAfter(maxRows, needed);
}

function deleteRows_(sheetName, match) {
  var sheet = database_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var rows = readObjects_(sheetName);
  var targets = [];
  for (var index = rows.length - 1; index >= 0; index -= 1) {
    if (match(rows[index])) targets.push(index + 2);
  }
  ensureSpareRowsForDelete_(sheet, targets.length);
  targets.forEach(function(row) { sheet.deleteRow(row); });
  return targets.length;
}

function deleteAbsence_(data) {
  var id = text_(data && data.id);
  if (!id) throw new Error("Rekod ketiadaan tidak dikenal pasti.");
  var target = readObjects_("Absences").filter(function(item) { return String(item.id) === id; })[0];
  if (!target) return { ok: true, deleted: 0, reliefs: 0 };
  var reliefs = deleteRows_("Reliefs", function(relief) {
    return String(relief.date) === String(target.date) && String(relief.absentTeacherId) === String(target.teacherId);
  });
  var deleted = deleteRows_("Absences", function(item) { return String(item.id) === id; });
  bumpRevision_();
  audit_("deleteAbsence", id, "Rekod ketiadaan dipadam" + (reliefs ? " bersama " + reliefs + " relief" : ""));
  return { ok: true, deleted: deleted, reliefs: reliefs };
}

// A teacher may only be removed outright when nothing else refers to them; otherwise the records
// would point at a teacher the app can no longer name.
function deleteTeacher_(data) {
  var id = text_(data && data.id);
  if (!id) throw new Error("Guru tidak dikenal pasti.");
  var schedule = readObjects_("Schedule").filter(function(row) { return String(row.teacherId) === id; }).length;
  if (schedule) throw new Error("Guru ini masih ada " + schedule + " waktu dalam jadual. Buang waktu itu dahulu (atau guna Nyahaktif).");
  var absences = readObjects_("Absences").filter(function(row) { return String(row.teacherId) === id; }).length;
  if (absences) throw new Error("Guru ini masih ada " + absences + " rekod ketiadaan. Padam rekod itu dahulu.");
  var reliefs = readObjects_("Reliefs").filter(function(row) {
    return String(row.absentTeacherId) === id || String(row.replacementTeacherId) === id;
  }).length;
  if (reliefs) throw new Error("Guru ini disebut dalam " + reliefs + " rekod relief. Guna Nyahaktif supaya sejarah kekal.");
  var deleted = deleteRows_("Teachers", function(item) { return String(item.id) === id; });
  bumpRevision_();
  audit_("deleteTeacher", id, "Profil guru dipadam");
  return { ok: true, deleted: deleted };
}

// Old timetables are archived, not deleted: the school keeps last year's timetable to look back at,
// while relief only ever follows the versions still in force.
function archiveVersions_(data) {
  var ids = (data && Array.isArray(data.ids)) ? data.ids.map(String) : null;
  var sheet = database_().getSheetByName("ScheduleVersions");
  var versions = readObjects_("ScheduleVersions");
  // Deleting is only ever allowed for versions already archived, and never for the timetable in
  // force: the school's current timetable cannot be removed by a stray click.
  if (data && data.remove === true && ids && ids.length) {
    var removable = versions.filter(function(version) {
      return String(version.status) === "archived" && ids.indexOf(String(version.id)) >= 0;
    }).map(function(version) { return String(version.id); });
    if (!removable.length) throw new Error("Tiada jadual yang diarkib untuk dipadam.");
    var rows = 0;
    removable.forEach(function(id) { rows += deleteRows_("Schedule", function(row) { return String(row.versionId) === id; }); });
    var removed = deleteRows_("ScheduleVersions", function(version) { return removable.indexOf(String(version.id)) >= 0; });
    bumpRevision_();
    audit_("deleteArchived", removable.join(","), removed + " jadual, " + rows + " baris waktu");
    return { ok: true, removed: removed, rows: rows };
  }
  var archived = 0;
  versions.forEach(function(version, index) {
    if (version.status === "active") return;
    if (ids && ids.indexOf(String(version.id)) < 0) return;
    if (version.status === "archived") return;
    sheet.getRange(index + 2, 5).setValue("archived");
    archived += 1;
  });
  if (archived) { bumpRevision_(); audit_("archiveVersions", String(archived), "Jadual lama diarkibkan"); }
  return { ok: true, archived: archived };
}

// Wipes the selected tables. The client must send the confirmation word, so a stray request cannot
// empty the school's database.
var RESET_TABLES_ = {
  teachers: ["Teachers"],
  absences: ["Absences"],
  reliefs: ["Reliefs"],
  timetable: ["Schedule", "ScheduleVersions"],
  builder: ["BuilderState"]
};
function resetData_(data) {
  if (text_(data && data.confirm) !== "PADAM") throw new Error("Taip PADAM untuk mengesahkan reset data.");
  var targets = (data && data.targets) || {};
  var chosen = Object.keys(RESET_TABLES_).filter(function(key) { return targets[key] === true; });
  if (!chosen.length) throw new Error("Pilih sekurang-kurangnya satu jenis data untuk direset.");
  var cleared = {};
  chosen.forEach(function(key) {
    var total = 0;
    RESET_TABLES_[key].forEach(function(name) { total += deleteRows_(name, function() { return true; }); });
    cleared[key] = total;
  });
  // Set semula yang membuang draf pembina mesti menaikkan BUILDER_REVISION juga: cache draf dikunci
  // pada revisi itu, jadi tanpanya draf yang baru dipadam akan terus dilayan sehingga 6 jam.
  if (cleared.builder) {
    builderCacheClear_(configValue_("BUILDER_REVISION"));
    setConfig_("BUILDER_REVISION", String(Number(configValue_("BUILDER_REVISION") || 0) + 1));
  }
  bumpRevision_();
  audit_("resetData", chosen.join(","), JSON.stringify(cleared));
  return { ok: true, cleared: cleared };
}

// A reset can empty the Teachers sheet while the timetable survives, and then the timetable points
// at ids nothing can name: PDF import matches no page and the builder has no one to place. The
// built-in roster is the school's own list, so it is the only safe source — and an id that still
// has a profile is never touched, because the school may have edited it by hand.
function restoreTeachers_(data) {
  if (text_(data && data.confirm) !== "PULIH") throw new Error("Taip PULIH untuk mengesahkan pemulihan senarai guru.");
  var sheet = database_().getSheetByName("Teachers");
  if (!sheet) throw new Error("Helaian Teachers tidak ditemui.");
  // A sheet that lost its header row would take the roster as its header, so the header comes first.
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, SHEETS.Teachers.length).setValues([SHEETS.Teachers]);
  var existing = {};
  readObjects_("Teachers").forEach(function(teacher) { existing[String(teacher.id)] = true; });
  var now = new Date().toISOString();
  var missing = INITIAL_TEACHERS.filter(function(row) { return !existing[String(row[0])]; });
  if (!missing.length) return { ok: true, added: [], skipped: INITIAL_TEACHERS.length };
  var values = missing.map(function(row) { return row.concat([true, now, now, "", "", "", ""]); });
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, SHEETS.Teachers.length).setValues(values);
  audit_("restoreTeachers", String(missing.length), "Profil guru asal dipulihkan");
  return { ok: true, skipped: INITIAL_TEACHERS.length - missing.length, added: missing.map(function(row) {
    return { id: row[0], name: row[1], shortName: row[2], position: row[3], reliefEligible: row[4], priority: row[5],
      active: true, createdAt: now, updatedAt: now, coversTeacherId: "", coversSubjects: "", coversJson: "", preschoolEndTime: "" };
  }) };
}

function absenceCoversPeriod_(absence, period) {
  var periods=Array.isArray(absence.periods)?absence.periods:parseJson_(absence.periods,[]);
  return bool_(absence.allDay)||periods.map(Number).indexOf(Number(period))>=0;
}

function teacherAbsentAt_(absences, teacherId, date, period) {
  if(!teacherId) return false;
  return (absences||[]).some(function(absence){
    return absence.status!=="cancelled"&&absence.teacherId===teacherId&&absence.date===date&&absenceCoversPeriod_(absence,period);
  });
}

function saveAbsence_(data) {
  upsert_("Absences", "id", encodeAbsence_(data));
  var updatedAt=text_(data.updatedAt||new Date().toISOString());
  var reliefs=readObjects_("Reliefs").filter(function(item){
    return item.status!=="cancelled"&&item.date===data.date&&item.replacementTeacherId===data.teacherId&&absenceCoversPeriod_(data,item.period);
  });
  reliefs.forEach(function(item){
    item.status="cancelled";
    item.updatedAt=updatedAt;
    upsert_("Reliefs", "id", encodeRelief_(item));
  });
  audit_("saveAbsence",data.id,reliefs.length+" tugasan relief guru ganti dibatalkan");
  return {id:data.id,reliefCount:reliefs.length};
}

function cancelAbsence_(data) {
  var absence = readObjects_("Absences").filter(function(item) { return String(item.id) === String(data.id); })[0];
  if (!absence) throw new Error("Rekod ketiadaan tidak ditemui.");
  var updatedAt = text_(data.updatedAt || new Date().toISOString());
  absence.status = "cancelled";
  absence.updatedAt = updatedAt;
  upsert_("Absences", "id", encodeAbsence_(absence));
  var reliefs = readObjects_("Reliefs").filter(function(item) {
    return item.status !== "cancelled" && item.date === absence.date && item.absentTeacherId === absence.teacherId;
  });
  reliefs.forEach(function(item) {
    item.status = "cancelled";
    item.updatedAt = updatedAt;
    upsert_("Reliefs", "id", encodeRelief_(item));
  });
  audit_("cancelAbsence", absence.id, reliefs.length + " relief dibatalkan");
  return { id: absence.id, reliefCount: reliefs.length };
}

// Reading the whole database costs six sheet reads. The result is cached under the data revision, so
// a repeat login (or a second device) answers from cache: one light round trip instead of six sheet
// reads. A new write bumps the revision, which points at a fresh key, so nothing stale can be served.
// Values over CacheService's 100 KB per-key limit are split into ordered chunks.
var BOOT_CACHE_TTL_ = 21600;
var BOOT_CHUNK_SIZE_ = 90000;
function bootCacheKeys_(revision) {
  return {
    count: "boot-" + revision + "-n",
    chunk: function(index) { return "boot-" + revision + "-" + index; }
  };
}
function readBootCache_(revision) {
  try {
    var keys = bootCacheKeys_(revision);
    var cache = CacheService.getScriptCache();
    var stored = cache.get(keys.count);
    if (!stored) return null;
    var count = Number(stored) || 0;
    if (count < 1 || count > 40) return null;
    var wanted = [];
    for (var index = 0; index < count; index += 1) wanted.push(keys.chunk(index));
    var found = cache.getAll(wanted);
    var text = "";
    for (var index = 0; index < count; index += 1) {
      var part = found[keys.chunk(index)];
      if (part == null) return null;
      text += part;
    }
    return JSON.parse(text);
  } catch (error) { return null; }
}
function writeBootCache_(revision, data) {
  try {
    var text = JSON.stringify(data);
    var keys = bootCacheKeys_(revision);
    var count = Math.ceil(text.length / BOOT_CHUNK_SIZE_);
    if (count < 1 || count > 40) return;
    var map = {};
    for (var index = 0; index < count; index += 1) map[keys.chunk(index)] = text.substr(index * BOOT_CHUNK_SIZE_, BOOT_CHUNK_SIZE_);
    map[keys.count] = String(count);
    CacheService.getScriptCache().putAll(map, BOOT_CACHE_TTL_);
  } catch (error) {}
}

function bootstrap_(sinceRevision) {
  var revision = Number(configValue_("DATA_REVISION") || 0);
  var updatedAt = configValue_("UPDATED_AT") || new Date().toISOString();
  if (sinceRevision === revision) return { ok: true, changed: false, revision: revision, updatedAt: updatedAt };
  var cached = readBootCache_(revision);
  if (cached) return { ok: true, changed: true, revision: revision, updatedAt: updatedAt, data: cached };
  var data = {
      school: configValue_("SCHOOL_NAME") || "SK Paya Redan, Muar",
      reliefSettings: {dailyLimit:reliefDailyLimit_(),ignorePairingWhenCovered:bool_(configValue_('RELIEF_IGNORE_PAIRING'))},
      revision: revision,
      updatedAt: updatedAt,
      teachers: readObjects_("Teachers"),
      scheduleVersions: readObjects_("ScheduleVersions"),
      schedule: readObjects_("Schedule"),
      absences: readObjects_("Absences").map(function(item) { item.periods = parseJson_(item.periods, []); return item; }),
      reliefs: readObjects_("Reliefs")
  };
  writeBootCache_(revision, data);
  return { ok: true, changed: true, revision: revision, updatedAt: updatedAt, data: data };
}

function importSchedule_(payload) {
  if (!payload.version || !payload.version.id || !Array.isArray(payload.rows)) throw new Error("Data import tidak lengkap.");
  var ss = database_();
  if (payload.version.status === "active") {
    var versionSheet = ss.getSheetByName("ScheduleVersions");
    var versions = readObjects_("ScheduleVersions");
    versions.forEach(function(version, index) {
      if (version.status === "active" && version.id !== payload.version.id) versionSheet.getRange(index + 2, 5).setValue("superseded");
    });
  }
  upsert_("ScheduleVersions", "id", encodeVersion_(payload.version));
  var scheduleSheet = ss.getSheetByName("Schedule");
  deleteRows_("Schedule", function(row) { return row.versionId === payload.version.id; });
  if (payload.rows.length) {
    var values = payload.rows.map(encodeSchedule_);
    scheduleSheet.getRange(scheduleSheet.getLastRow() + 1, 1, values.length, SHEETS.Schedule.length).setValues(values);
  }
  audit_("importSchedule", payload.version.id, payload.version.sourceName || "PDF");
  return { count: payload.rows.length, versionId: payload.version.id };
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) { sheet.getRange(1, 1, 1, headers.length).setValues([headers]); return sheet; }
  // A sheet made by an older version is extended on the right for columns it does not have yet, so
  // existing columns are never renamed or moved and existing rows stay valid.
  var width = Math.max(sheet.getLastColumn(), 1);
  var current = sheet.getRange(1, 1, 1, width).getValues()[0].map(function(value) { return String(value == null ? "" : value).trim(); });
  var missing = headers.filter(function(header) { return current.indexOf(header) < 0; });
  if (missing.length) sheet.getRange(1, width + 1, 1, missing.length).setValues([missing]);
  return sheet;
}

function formatSheets_(ss) {
  Object.keys(SHEETS).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SHEETS[name].length).setFontWeight("bold").setBackground("#0b6b5b").setFontColor("#ffffff");
    sheet.autoResizeColumns(1, SHEETS[name].length);
  });
  ss.getSheetByName("Config").hideSheet();
}

function readObjects_(sheetName) {
  var sheet = database_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values.shift();
  return values.filter(function(row) { return row.some(function(value) { return value !== ""; }); }).map(function(row) {
    var object = {};
    headers.forEach(function(header, index) {
      var value = row[index];
      if (value instanceof Date) value = Utilities.formatDate(value, Session.getScriptTimeZone() || "Asia/Kuala_Lumpur", /Time$/i.test(header) ? "HH:mm" : "yyyy-MM-dd");
      object[header] = value;
    });
    return object;
  });
}

function upsert_(sheetName, keyName, row) {
  var sheet = database_().getSheetByName(sheetName);
  var headers = SHEETS[sheetName];
  // Self-healing schema: a sheet from an older version gets any new columns appended on the next
  // write, so no manual setup run is needed and no existing column is moved.
  var width = Math.max(sheet.getLastColumn(), 1);
  var headerRow = sheet.getRange(1, 1, 1, width).getValues()[0].map(function(value) { return String(value == null ? "" : value).trim(); });
  var missing = headers.filter(function(header) { return headerRow.indexOf(header) < 0; });
  if (missing.length) sheet.getRange(1, width + 1, 1, missing.length).setValues([missing]);
  var keyIndex = headers.indexOf(keyName);
  var data = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  var rowIndex = data.findIndex(function(existing) { return String(existing[keyIndex]) === String(row[keyIndex]); });
  if (rowIndex >= 0) sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([row]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  audit_("upsert:" + sheetName, row[keyIndex], "");
  return { id: row[keyIndex] };
}

// coversTeacherId/coversSubjects carry a Personel MySTEP or Guru Praktikal who takes over another
// teacher's lessons: the covered teacher id, and the subjects taken ("" means the whole timetable).
function encodeTeacher_(item) { return [item.id, text_(item.name), text_(item.shortName), text_(item.position), bool_(item.reliefEligible), Number(item.priority || 3), bool_(item.active), text_(item.createdAt), text_(item.updatedAt), text_(item.coversTeacherId), text_(item.coversSubjects), text_(item.coversJson), text_(item.preschoolEndTime)]; }
function encodeVersion_(item) { return [item.id, text_(item.label), text_(item.effectiveDate), text_(item.sourceName), text_(item.status), text_(item.createdAt)]; }
function encodeSchedule_(item) { return [item.versionId, item.teacherId, item.day, Number(item.period), clockText_(item.startTime), clockText_(item.endTime), text_(item.subject), text_(item.className), bool_(item.isDuty)]; }
function encodeAbsence_(item) { return [item.id, item.date, item.teacherId, text_(item.reason), bool_(item.allDay), JSON.stringify(item.periods || []), text_(item.status), text_(item.createdAt), text_(item.updatedAt)]; }
function encodeRelief_(item) { return [item.id, item.date, item.day, Number(item.period), clockText_(item.startTime), clockText_(item.endTime), item.absentTeacherId, item.replacementTeacherId, text_(item.className), text_(item.subject), text_(item.status), text_(item.note), text_(item.createdAt), text_(item.updatedAt)]; }
function text_(value) { return value == null ? "" : String(value); }
// Any date-ish value the sheet or an ISO payload can hold, reduced to a calendar day.
function dayOnly_(value) {
  if (!value) return "";
  if (value instanceof Date) return Utilities.formatDate(value, (typeof Session !== 'undefined' && Session.getScriptTimeZone()) || 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  var text = String(value).trim();
  var iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  var local = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (local) return local[3] + '-' + ('0' + local[2]).slice(-2) + '-' + ('0' + local[1]).slice(-2);
  return "";
}

// A date-only cell in a time column comes back as midnight (or as the 1899 epoch). Storing an
// empty clock lets every reader fall back to the official period clock instead of "00:00".
function clockText_(value) {
  var match = String(value == null ? "" : value).match(/(\d{1,2}):(\d{2})/);
  if (!match || (Number(match[1]) === 0 && Number(match[2]) === 0)) return "";
  return String(Number(match[1])).length === 1 ? "0" + Number(match[1]) + ":" + match[2] : Number(match[1]) + ":" + match[2];
}
function bool_(value) { return value === true || value === "true"; }
function parseJson_(value, fallback) { try { return JSON.parse(value); } catch (error) { return fallback; } }

// One read of Config per execution instead of one read per key lookup.
var CONFIG_MAP_ = null;
function readConfigMap_() {
  if (!CONFIG_MAP_) {
    CONFIG_MAP_ = {};
    readObjects_("Config").forEach(function(row) { CONFIG_MAP_[String(row.key)] = row.value; });
  }
  return CONFIG_MAP_;
}

function configValue_(key) {
  var map = readConfigMap_();
  return map[key] === undefined || map[key] === null ? "" : map[key];
}

function reliefDailyLimit_() {
  var raw=configValue_('RELIEF_DAILY_LIMIT');
  var value=raw===''?2:Number(raw);
  return Number.isInteger(value)&&value>=0&&value<=13?value:2;
}

function setConfig_(key, value) {
  upsert_("Config", "key", [key, value]);
  if (CONFIG_MAP_) CONFIG_MAP_[String(key)] = value;
}

function bumpRevision_() {
  var revision = Number(configValue_("DATA_REVISION") || 0) + 1;
  setConfig_("DATA_REVISION", String(revision));
  setConfig_("UPDATED_AT", new Date().toISOString());
  // Every write invalidates the cached public payload, so visitors never wait for it to expire.
  publicCacheClear_();
  return revision;
}

function audit_(action, recordId, details) {
  var sheet = database_().getSheetByName("Audit");
  if (!sheet) return;
  sheet.appendRow([new Date().toISOString(), action, recordId, details]);
  // Trim in blocks instead of on every write: the log only needs to stay bounded.
  if (sheet.getLastRow() > AUDIT_MAX_ROWS_ + 1) sheet.deleteRows(2, AUDIT_TRIM_ROWS_);
}

// Badan ~1 MB mengambil beberapa saat untuk dihantar pada sambungan sekolah, jadi klien yang
// menyatakan sokongan (gz:1) menerima gzip base64; klien lama terus menerima JSON biasa.
var GZIP_REQUEST_ = false;
function wantsGzip_(source) {
  var raw = source && source.gz;
  return raw === 1 || raw === '1' || raw === true || raw === 'true';
}
function output_(payload) {
  var json = JSON.stringify(payload);
  if (GZIP_REQUEST_) {
    try {
      var bytes = Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes();
      return ContentService.createTextOutput(JSON.stringify({ gz: Utilities.base64Encode(bytes) })).setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      // Pemampatan gagal: hantar JSON biasa supaya pelanggan tidak menerima muka surat kosong.
    }
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
