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
  Audit: ["timestamp", "action", "recordId", "details"]
};

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
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("ADMIN_PIN")) props.setProperty("ADMIN_PIN", "2468");
  var teacherSheet = ss.getSheetByName("Teachers");
  if (teacherSheet.getLastRow() === 1) {
    var now = new Date().toISOString();
    teacherSheet.getRange(2, 1, INITIAL_TEACHERS.length, 9).setValues(INITIAL_TEACHERS.map(function(row) { return row.concat([true, now, now]); }));
  }
  formatSheets_(ss);
  audit_("setupSystem", "database", "Pangkalan data dimulakan");
  return "Sistem sedia. PIN awal: 2468. Tukar ADMIN_PIN dalam Script Properties sebelum digunakan.";
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "health";
    if (action === "health") return output_({ ok: true, school: configValue_("SCHOOL_NAME") || "SK Paya Redan, Muar", version: "1.1.1" });
    if (action === "bootstrap") return output_(bootstrap_(Number(e.parameter.sinceRevision || -1)));
    return output_({ ok: false, error: "Tindakan GET tidak dikenali." });
  } catch (error) {
    return output_({ ok: false, error: String(error && error.message || error) });
  }
}

function doPost(e) {
  try {
    var request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    requirePin_(request.pin);
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var result = routeWrite_(request.action, request.data || {});
      var revision = bumpRevision_();
      return output_({ ok: true, revision: revision, updatedAt: configValue_("UPDATED_AT"), result: result });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return output_({ ok: false, error: String(error && error.message || error) });
  }
}

function routeWrite_(action, data) {
  if (action === "saveTeacher") return upsert_("Teachers", "id", encodeTeacher_(data));
  if (action === "saveAbsence") return upsert_("Absences", "id", encodeAbsence_(data));
  if (action === "saveReliefs") {
    if (!Array.isArray(data)) throw new Error("Format relief tidak sah.");
    data.forEach(function(item) { upsert_("Reliefs", "id", encodeRelief_(item)); });
    audit_(action, data.length + " records", "Relief diterbitkan");
    return { count: data.length };
  }
  if (action === "importSchedule") return importSchedule_(data);
  throw new Error("Tindakan tulis tidak dikenali.");
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values.shift();
  return values.filter(function(row) { return row.some(function(value) { return value !== ""; }); }).map(function(row) {
    var object = {};
    headers.forEach(function(header, index) {
      var value = row[index];
      if (value instanceof Date) value = Utilities.formatDate(value, Session.getScriptTimeZone() || "Asia/Kuala_Lumpur", "yyyy-MM-dd");
      object[header] = value;
    });
    return object;
  });
}

function upsert_(sheetName, keyName, row) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
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
function encodeSchedule_(item) { return [item.versionId, item.teacherId, item.day, Number(item.period), text_(item.startTime), text_(item.endTime), text_(item.subject), text_(item.className), bool_(item.isDuty)]; }
function encodeAbsence_(item) { return [item.id, item.date, item.teacherId, text_(item.reason), bool_(item.allDay), JSON.stringify(item.periods || []), text_(item.status), text_(item.createdAt), text_(item.updatedAt)]; }
function encodeRelief_(item) { return [item.id, item.date, item.day, Number(item.period), text_(item.startTime), text_(item.endTime), item.absentTeacherId, item.replacementTeacherId, text_(item.className), text_(item.subject), text_(item.status), text_(item.note), text_(item.createdAt), text_(item.updatedAt)]; }
function text_(value) { return value == null ? "" : String(value); }
function bool_(value) { return value === true || value === "true"; }
function parseJson_(value, fallback) { try { return JSON.parse(value); } catch (error) { return fallback; } }

function requirePin_(pin) {
  var expected = PropertiesService.getScriptProperties().getProperty("ADMIN_PIN") || "2468";
  if (!pin || String(pin) !== String(expected)) throw new Error("PIN pentadbir tidak sah.");
}

function configValue_(key) {
  var rows = readObjects_("Config");
  var record = rows.find(function(item) { return item.key === key; });
  return record ? record.value : "";
}

function setConfig_(key, value) {
  upsert_("Config", "key", [key, value]);
}

function bumpRevision_() {
  var revision = Number(configValue_("DATA_REVISION") || 0) + 1;
  setConfig_("DATA_REVISION", String(revision));
  setConfig_("UPDATED_AT", new Date().toISOString());
  return revision;
}

function audit_(action, recordId, details) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Audit");
  if (sheet) sheet.appendRow([new Date().toISOString(), action, recordId, details]);
}

function output_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
