/**
 * Penyelenggaraan sekali sahaja untuk Sistem Jadual SKPR.
 *
 * Jalankan repairClockTimes() dari editor Apps Script (bukan dari aplikasi web) apabila lajur masa
 * dalam helaian Reliefs atau Schedule mengandungi 00:00. Ini berlaku apabila sel masa pernah ditulis
 * sebagai tarikh sahaja; Sheets membacanya balik sebagai tengah malam.
 *
 * Fungsi ini hanya menulis apabila nilai masa benar-benar berubah, dan merekodkan hasilnya dalam
 * helaian Audit.
 */
function dominantScheduleTimes_() {
  var fallback = {1:'07:30',2:'08:00',3:'08:30',4:'09:00',5:'09:30',6:'10:20',7:'10:50',8:'11:20',9:'11:50',10:'12:20',11:'12:50',12:'13:20'};
  var ends = {1:'08:00',2:'08:30',3:'09:00',4:'09:30',5:'10:00',6:'10:50',7:'11:20',8:'11:50',9:'12:20',10:'12:50',11:'13:20',12:'13:50'};
  var table = {};
  Object.keys(fallback).forEach(function(period) { table[period] = {startTime: fallback[period], endTime: ends[period], votes: 0}; });
  var sheet = database_().getSheetByName('Schedule');
  if (!sheet || sheet.getLastRow() < 2) return table;
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values.shift().map(String);
  var periodIndex = headers.indexOf('period'), startIndex = headers.indexOf('startTime'), endIndex = headers.indexOf('endTime');
  var versionIndex = headers.indexOf('versionId');
  if (periodIndex < 0 || startIndex < 0 || endIndex < 0) return table;
  var activeIds = {};
  readObjects_('ScheduleVersions').forEach(function(version) { if (version.status === 'active') activeIds[String(version.id)] = true; });
  var counts = {};
  values.forEach(function(row) {
    var period = Number(row[periodIndex]);
    if (!(period >= 1 && period <= 12)) return;
    if (versionIndex >= 0 && Object.keys(activeIds).length && !activeIds[String(row[versionIndex])]) return;
    var start = clockText_(row[startIndex]), end = clockText_(row[endIndex]);
    if (!start || !end) return;
    counts[period] = counts[period] || {};
    var pair = start + '-' + end;
    counts[period][pair] = (counts[period][pair] || 0) + 1;
  });
  Object.keys(counts).forEach(function(period) {
    var best = Object.keys(counts[period]).sort(function(a, b) { return counts[period][b] - counts[period][a]; })[0];
    if (!best || counts[period][best] < 3) return;
    table[period] = {startTime: best.split('-')[0], endTime: best.split('-')[1], votes: counts[period][best]};
  });
  return table;
}

function repairSheetClocks_(sheetName, times) {
  var sheet = database_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  var headers = values.shift().map(String);
  var startIndex = headers.indexOf('startTime'), endIndex = headers.indexOf('endTime'), periodIndex = headers.indexOf('period');
  if (startIndex < 0 || endIndex < 0 || periodIndex < 0) return 0;
  var changed = 0;
  values.forEach(function(row) {
    var period = Number(row[periodIndex]);
    var official = times[period];
    if (!official) return;
    var start = clockText_(row[startIndex]), end = clockText_(row[endIndex]);
    // Only a missing or corrupted clock (a date-only cell reads back as 00:00) is repaired. A
    // legitimate non-standard time — a Friday that ends earlier, a staggered recess — is left
    // exactly as the school set it.
    if (start && end) return;
    row[startIndex] = official.startTime;
    row[endIndex] = official.endTime;
    changed += 1;
  });
  if (changed) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  return changed;
}

function repairClockTimes() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    resetRequestCache_();
    var times = dominantScheduleTimes_();
    var reliefs = repairSheetClocks_('Reliefs', times);
    var schedule = repairSheetClocks_('Schedule', times);
    // A revision bump tells every device (and the public cache) that the data changed.
    if (reliefs || schedule) bumpRevision_();
    audit_('repairClockTimes', 'database', reliefs + ' relief, ' + schedule + ' baris jadual dibaiki');
    return 'Baris relief dibaiki: ' + reliefs + '. Baris jadual dibaiki: ' + schedule + '. Jalankan semula jika 00:00 masih kelihatan.';
  } finally {
    lock.releaseLock();
  }
}
