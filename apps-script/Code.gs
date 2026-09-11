/**
 * API Google Sheets untuk Sistem Jadual SKPR (modul Relief).
 * Jalankan setupSystem() sekali sebelum deploy sebagai Web App.
 */

var SHEETS = {
  Config: ["key", "value"],
  Teachers: ["id", "name", "shortName", "position", "reliefEligible", "priority", "active", "createdAt", "updatedAt"],
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
    teacherSheet.getRange(2, 1, INITIAL_TEACHERS.length, 9).setValues(INITIAL_TEACHERS.map(function(row) { return row.concat([true, now, now]); }));
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
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") return output_({ ok: true, school: configValue_("SCHOOL_NAME") || "SK Paya Redan, Muar", version: "3.1.7", auth: "session" });
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
      if(request.action==='bootstrap') {var snapshot=bootstrap_(-1);snapshot.builder=readBuilder_();return output_(snapshot);}
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
  // The school starts on admin/admin. Until it is changed, reads and login stay open but nothing
  // may be written, so a public repository URL cannot be used to alter the school's records.
  if(defaultPasswordInUse_()&&action!=='changePassword') throw new Error('Kata laluan awal admin masih digunakan. Tukar kata laluan dalam Tetapan dahulu.');
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

function bootstrap_(sinceRevision) {
  var revision = Number(configValue_("DATA_REVISION") || 0);
  var updatedAt = configValue_("UPDATED_AT") || new Date().toISOString();
  if (sinceRevision === revision) return { ok: true, changed: false, revision: revision, updatedAt: updatedAt };
  return {
    ok: true,
    changed: true,
    revision: revision,
    updatedAt: updatedAt,
    data: {
      school: configValue_("SCHOOL_NAME") || "SK Paya Redan, Muar",
      reliefSettings: {dailyLimit:reliefDailyLimit_(),ignorePairingWhenCovered:bool_(configValue_('RELIEF_IGNORE_PAIRING'))},
      revision: revision,
      updatedAt: updatedAt,
      teachers: readObjects_("Teachers"),
      scheduleVersions: readObjects_("ScheduleVersions"),
      schedule: readObjects_("Schedule"),
      absences: readObjects_("Absences").map(function(item) { item.periods = parseJson_(item.periods, []); return item; }),
      reliefs: readObjects_("Reliefs")
    }
  };
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
  var existing = readObjects_("Schedule");
  for (var index = existing.length - 1; index >= 0; index -= 1) {
    if (existing[index].versionId === payload.version.id) scheduleSheet.deleteRow(index + 2);
  }
  if (payload.rows.length) {
    var values = payload.rows.map(encodeSchedule_);
    scheduleSheet.getRange(scheduleSheet.getLastRow() + 1, 1, values.length, SHEETS.Schedule.length).setValues(values);
  }
  audit_("importSchedule", payload.version.id, payload.version.sourceName || "PDF");
  return { count: payload.rows.length, versionId: payload.version.id };
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
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
  var keyIndex = headers.indexOf(keyName);
  var data = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues() : [];
  var rowIndex = data.findIndex(function(existing) { return String(existing[keyIndex]) === String(row[keyIndex]); });
  if (rowIndex >= 0) sheet.getRange(rowIndex + 2, 1, 1, headers.length).setValues([row]);
  else sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
  audit_("upsert:" + sheetName, row[keyIndex], "");
  return { id: row[keyIndex] };
}

function encodeTeacher_(item) { return [item.id, text_(item.name), text_(item.shortName), text_(item.position), bool_(item.reliefEligible), Number(item.priority || 3), bool_(item.active), text_(item.createdAt), text_(item.updatedAt)]; }
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

function output_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
