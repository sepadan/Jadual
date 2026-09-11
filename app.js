import { APP_VERSION, DAY_NAMES, PERIODS, emptyDatabase, slug } from "./data.js?v=3.1.2";
import { ApiClient, loadConfig, saveConfig } from "./admin-api.js?v=3.1.2";
import { activeScheduleRows, buildReliefDrafts, cancelAbsenceAndReliefs, cancelReliefsAssignedToAbsence, dayCodeFromDate, reliefHasActiveAbsence, reliefMatchesAbsence, validateReliefs, dailyReliefLimit, selectedScheduleVersion, officialScheduleVersion } from "./relief-engine.js?v=3.1.2";
import { buildImportSelection, parseTeacherPdf } from "./pdf-import.js?v=3.1.2";
import { convertBuilderSchedule } from "./builder-relief.js?v=3.1.2";
import { draftFromPdf } from './pdf-builder.js?v=3.1.2';
import { exportTeachers, importTeachers } from './teacher-transfer.js?v=3.1.2';
import { buildReliefPrintModel, reliefPrintHtml } from './relief-print.js?v=3.1.2';
import { openReliefPdf, shouldUseDirectPdf } from './relief-pdf.js?v=3.1.2';

const DB_KEY = "relief-skpr-db-v1";
const PUBLIC_DAY_KEY = "sistem-jadual-public-day-v1";
const titleByView = { "hari-ini": "Jadual relief", ketiadaan: "Ketiadaan", jadual: "Jadual", guru: "Guru", import: "Import PDF", tetapan: "Tetapan" };
let config = loadConfig();
let api = new ApiClient(config);
let db = loadDb();
if (!db.revision) db.teachers = [];
let confirmedDb = structuredClone(db);
let admin = false, builderRevision = 0, builderDirty = false, restoringBuilder = false, builderSaving = false, builderCloudLoaded = false;
let pendingWrites = 0, failedWrites = 0, writeQueue = Promise.resolve(), syncPromise = null;
let sessionExpiry = 0;
let importResult = null;
let currentDrafts = [];
let generatedReliefKey = '';
function reliefInputKey() { return JSON.stringify([$('#reliefDate').value,db.teachers,db.scheduleVersions,db.schedule,db.absences,db.reliefs,db.reliefSettings]); }
let deferredInstallPrompt = null;
let toastTimer = null;
let scheduleMode = "relief";
let builderLoadPromise;

function $(selector, root = document) { return root.querySelector(selector); }
function $$(selector, root = document) { return [...root.querySelectorAll(selector)]; }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function uuid(prefix) { return `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`; }
function todayIso() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }); }
function formatDate(value, options = { day: "numeric", month: "short", year: "numeric" }) {
  const day = String(value ?? "").slice(0, 10);
  const date = new Date(`${day}T12:00:00`);
  // An unusable date must never blank the whole screen.
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ms-MY", options).format(date);
}
function teacherById(id) { return db.teachers.find((teacher) => teacher.id === id); }
function clockValue(value,period,field='startTime') {
  const raw=String(value??'').trim();
  const match=raw.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
  const official=PERIODS.find(item=>item.period===Number(period))?.[field]||'';
  // A date-only cell in a time column reads back as midnight; keep the official period clock
  // instead of showing "00:00" on a relief card or a timetable cell.
  const readable=match&&!(Number(match[1])===0&&Number(match[2])===0);
  return readable?`${match[1].padStart(2,'0')}:${match[2]}`:official;
}
function normalizeDatabaseTimes(data) {
  const normalize=row=>({...row,startTime:clockValue(row.startTime,row.period,'startTime'),endTime:clockValue(row.endTime,row.period,'endTime')});
  return {...data,schedule:(data.schedule||[]).map(normalize),reliefs:(data.reliefs||[]).map(normalize)};
}
function storedAdminSession() {
  try {
    const session=JSON.parse(localStorage.getItem('jadual-admin-session')||'null');
    return session?.token&&Number(session.expiresAt)>Date.now()?{token:session.token,expiresAt:Number(session.expiresAt)}:null;
  } catch { localStorage.removeItem('jadual-admin-session');return null; }
}
function restoreAdminShell(session) {
  if(!session||!api.isConfigured()) return false;
  api.token=session.token;admin=true;window.systemAdminActive=true;sessionExpiry=session.expiresAt;
  document.body.classList.remove('public-mode');$('#loginButton').classList.add('hidden');
  return true;
}

// Reads back the last published payload so a repeat visitor sees the timetable before the
// network answers. Only ever holds data the server already serves to the public.
function loadDb() {
  try {
    const stored = JSON.parse(localStorage.getItem(DB_KEY) || "null");
    if (!stored || !stored.revision) return emptyDatabase();
    return { ...emptyDatabase(), ...normalizeDatabaseTimes(stored), teachers: stored.teachers || [] };
  } catch {
    return emptyDatabase();
  }
}

// Public data only. Keeping the last published payload lets a repeat visitor paint the timetable
// immediately and ask the server for a one-line "unchanged" reply instead of 199 KB.
function cachePublicDb(data) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
    localStorage.setItem(PUBLIC_DAY_KEY, todayIso());
  } catch {}
}

function cachedPublicDay() {
  try { return localStorage.getItem(PUBLIC_DAY_KEY) || ""; } catch { return ""; }
}

// Only claim the revision when the cached timetable was fetched today, and only when the data it
// belongs to is actually still on the device. Otherwise the server would answer "unchanged" to a
// visitor who has nothing to show.
function cachedPublicRevision() {
  if (cachedPublicDay() !== todayIso()) return 0;
  return Number(db.revision) || 0;
}

function persist() {
  db.updatedAt = new Date().toISOString();
  // Private administration data stays in memory; Sheets is the source of truth.
  updateConnectionUi();
}

function toast(message, type = "info") {
  const node = $("#toast");
  node.textContent = message;
  node.style.background = type === "error" ? "#8f3038" : type === "success" ? "#0b6b5b" : "#1e3732";
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
}

function showView(name) {
  if (!admin && !["hari-ini","ketiadaan","jadual"].includes(name)) return openLogin();
  if (!titleByView[name]) name = "hari-ini";
  document.body.classList.toggle("print-builder", name === "jadual" && scheduleMode === "generator");
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  $("#viewTitle").textContent = titleByView[name] || "Sistem Jadual";
  localStorage.setItem("relief-skpr-view", name);
  if (name === "jadual") setScheduleMode(scheduleMode);
  renderAll();
}

function setScheduleMode(mode) {
  scheduleMode = admin && mode === "generator" ? "generator" : "relief";
  localStorage.setItem("sistem-jadual-mode", scheduleMode);
  $("#schedule-generator-pane")?.classList.toggle("hidden", scheduleMode !== "generator");
  $("#schedule-relief-pane")?.classList.toggle("hidden", scheduleMode !== "relief");
  $$('[data-schedule-mode]').forEach((button) => {
    const active = button.dataset.scheduleMode === scheduleMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.body.classList.toggle("print-builder", $("#view-jadual").classList.contains("active") && scheduleMode === "generator");
}

function updateConnectionUi() {
  const configured = api.isConfigured();
  $("#syncDot").classList.toggle("online", configured && navigator.onLine && !failedWrites);
  $("#syncLabel").textContent = pendingWrites ? `Menyimpan ${pendingWrites}…` : failedWrites ? "Belum tersimpan" : configured ? (navigator.onLine ? "Google Sheets · masa nyata" : "Luar talian") : "Belum disambungkan";
  $("#systemNotice").textContent = !configured
    ? "Sambungan sekolah belum disediakan. Login admin memerlukan pelayan sekolah."
    : admin
      ? failedWrites
        ? `${failedWrites} perubahan belum sampai ke Google Sheets. Tekan segar semula untuk mendapatkan keadaan pelayan.`
        : pendingWrites
          ? "Perubahan sudah dipaparkan · sedang disimpan di belakang"
          : "Admin · perubahan dipaparkan serta-merta dan disegerakkan ke Google Sheets"
      : "Paparan umum · jadual dikemas kini hampir masa nyata";
  $("#revisionLabel").textContent = db.revision || 0;
  $("#lastUpdated").textContent = db.updatedAt ? new Intl.DateTimeFormat("ms-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(db.updatedAt)) : "—";
}

function renderAll() {
  renderDashboard();
  renderAbsences();
  renderTeacherLists();
  renderTeachers();
  renderSchedule();
  if (importResult) renderImportReview();
  updateConnectionUi();
}

function renderDashboard() {
  $('#dailyReliefLimit').value=String(dailyReliefLimit(db));
  $('#ignorePairingWhenCovered').checked=db.reliefSettings?.ignorePairingWhenCovered===true;
  const date = $("#reliefDate").value || todayIso();
  const absences = db.absences.filter((item) => item.date === date && item.status !== "cancelled");
  const published = db.reliefs.filter((item) => item.date === date && item.status !== "cancelled" && reliefHasActiveAbsence(db, item));
  renderReliefPrint(date);
  if(!admin || generatedReliefKey!==reliefInputKey()) {currentDrafts=[];generatedReliefKey='';}
  $('#reliefGuide').textContent=admin ? (generatedReliefKey ? `Draf dijana: ${currentDrafts.length} slot baharu. Semak guru ganti, kemudian Terbitkan.` : '1. Rekod guru tiada → 2. Jana relief → 3. Semak dan terbitkan. Perubahan data memerlukan jana semula.') : 'Jadual relief yang telah diterbitkan oleh admin.';
  const items = [...published.map((item) => ({ ...item, candidates: [] })), ...currentDrafts];
  $("#metricAbsent").textContent = new Set(absences.map((item) => item.teacherId)).size;
  $("#metricClasses").textContent = new Set(items.map((item) => item.className).filter(Boolean)).size;
  $("#metricOpen").textContent = currentDrafts.filter((item) => !item.replacementTeacherId).length;
  $("#metricDone").textContent = published.filter((item) => item.status === "published").length;
  const list = $("#reliefList");
  if (!items.length) {
    const hasSchedule = db.scheduleVersions.some((version) => version.status === "active");
    list.innerHTML = `<div class="empty-state"><strong>${hasSchedule ? "Tiada relief diperlukan hari ini" : "Tiada relief diterbitkan"}</strong>${hasSchedule ? "Tambah rekod guru tiada untuk menjana cadangan." : "Jadual relief akan dipaparkan selepas diterbitkan oleh admin."}</div>`;
  } else {
    list.innerHTML = items.map((item) => reliefCard(item)).join("");
    $$(".candidate-select", list).forEach((select) => select.addEventListener("change", () => {
      const draft = currentDrafts.find((item) => item.id === select.dataset.id);
      if (draft) draft.replacementTeacherId = select.value;
      updateDraftActions();
    }));
  }
  updateDraftActions();
}

function renderReliefPrint(date) {
  const model=buildReliefPrintModel(db,date,PERIODS);
  $('#reliefPrintSheet').innerHTML=reliefPrintHtml(model);
  $('#reliefPrintSheet').setAttribute('aria-hidden',model.groups.length?'false':'true');
}

function printReliefSheet() {
  const date=$('#reliefDate').value||todayIso();
  const published=db.reliefs.some(item=>item.date===date&&item.status==='published'&&reliefHasActiveAbsence(db,item));
  if(!published) return toast('Tiada relief diterbitkan untuk dicetak pada tarikh ini.','error');
  const model=buildReliefPrintModel(db,date,PERIODS);
  $('#reliefPrintSheet').innerHTML=reliefPrintHtml(model);
  $('#reliefPrintSheet').setAttribute('aria-hidden','false');
  if(shouldUseDirectPdf()) {
    try {
      openReliefPdf(model,`Jadual-Relief-${date}.pdf`);
      toast('PDF A4 landskap dibuka. Gunakan Kongsi untuk simpan atau cetak.','success');
    } catch(error) { toast(error.message||'PDF tidak dapat dijana.','error'); }
    return;
  }
  document.body.classList.remove('print-builder');
  document.body.classList.add('print-relief');
  window.print();
}

function reliefCard(item) {
  const absent = teacherById(item.absentTeacherId);
  const replacement = teacherById(item.replacementTeacherId);
  let candidateHtml;
  if (item.status === "published") {
    candidateHtml = `<span class="badge good">DITERBITKAN</span><strong>${esc(replacement?.shortName || replacement?.name || "—")}</strong>`;
  } else if (!item.candidates.length) {
    candidateHtml = `<select class="candidate-select" data-id="${esc(item.id)}"><option value="">Tiada guru tersedia</option></select><div class="candidate-note" style="color:#b83d45">Pilih atau ubah kelayakan guru</div>`;
  } else {
    candidateHtml = `<select class="candidate-select" data-id="${esc(item.id)}">${item.candidates.map((teacher) => `<option value="${esc(teacher.id)}" ${teacher.id === item.replacementTeacherId ? "selected" : ""}>${esc(teacher.shortName)} · ${teacher.teachingToday} jadual + ${teacher.todayReliefs} relief</option>`).join("")}</select><div class="candidate-note">Jumlah waktu hari ini paling sedikit · had ${dailyReliefLimit(db)} relief sehari</div>`;
  }
  return `<article class="relief-card">
    <div class="time-chip"><span class="period-bubble">${item.period}</span><span><strong>${esc(clockValue(item.startTime,item.period,'startTime'))}–${esc(clockValue(item.endTime,item.period,'endTime'))}</strong><small>Waktu ${item.period}</small></span></div>
    <div class="lesson"><strong>${esc(item.className || "Aktiviti sekolah")} · ${esc(item.subject)}</strong><small class="teacher-away">Tiada: ${esc(absent?.shortName || absent?.name || "Guru")}</small></div>
    <div class="candidate">${candidateHtml}</div>
  </article>`;
}

function updateDraftActions() {
  $("#reliefActions").classList.toggle("hidden", !currentDrafts.length);
  const filled = currentDrafts.filter((item) => item.replacementTeacherId).length;
  $("#draftCount").textContent = `${filled}/${currentDrafts.length} relief ditetapkan`;
}

function renderAbsences() {
  const date = $("#absenceFilterDate").value || todayIso();
  $("#absenceFilterDate").value = date;
  const list = db.absences.filter((item) => item.date === date && item.status !== "cancelled");
  $("#absenceList").innerHTML = list.length ? list.map((item) => {
    const teacher = teacherById(item.teacherId);
    return `<article class="absence-card"><div><h3>${esc(teacher?.name || "Guru tidak ditemui")}</h3><p>${admin ? esc(item.reason || "Tiada sebab dinyatakan") + " · " : ""}${item.allDay ? "Sepanjang hari" : `Waktu ${(item.periods || []).join(", ")}`}</p></div><button class="mini-button delete admin-only" data-cancel-absence="${esc(item.id)}" title="Batalkan">×</button></article>`;
  }).join("") : `<div class="empty-state"><strong>Tiada rekod</strong>Tiada guru direkodkan tidak hadir pada ${formatDate(date)}.</div>`;
  $$('[data-cancel-absence]').forEach((button) => button.addEventListener("click", () => cancelAbsence(button.dataset.cancelAbsence)));
}

function activeTeachers() { return db.teachers.filter((teacher) => teacher.active).sort((a, b) => a.name.localeCompare(b.name, "ms")); }
function teacherOptions(selected = "") { return activeTeachers().map((teacher) => `<option value="${esc(teacher.id)}" ${teacher.id === selected ? "selected" : ""}>${esc(teacher.name)}</option>`).join(""); }

function renderTeacherLists() {
  const absence = $("#absenceTeacher");
  const schedule = $("#scheduleTeacher");
  const selectedAbsence = absence.value;
  const selectedSchedule = schedule.value;
  absence.innerHTML = `<option value="">Pilih guru</option>${teacherOptions(selectedAbsence)}`;
  const byClass = admin && $("#scheduleType").value === "class";
  $("#scheduleEntityLabel").textContent = byClass ? "Kelas" : "Guru";
  schedule.innerHTML = byClass ? `<option value="">Pilih kelas</option>${[...new Set(db.schedule.map(r=>r.className).filter(Boolean))].sort().map(name=>`<option value="${esc(name)}" ${selectedSchedule===name?'selected':''}>${esc(name)}</option>`).join('')}` : `<option value="">Pilih guru</option>${teacherOptions(selectedSchedule)}`;
}

function initials(name) { return String(name).split(" ").filter((word) => !["BIN", "BINTI"].includes(word)).slice(0, 2).map((word) => word[0]).join(""); }

function renderTeachers() {
  if (!admin) {$("#teacherList").innerHTML="";return;}
  const query = $("#teacherSearch").value.trim().toUpperCase();
  const teachers = activeTeachers().filter((teacher) => !query || `${teacher.name} ${teacher.position}`.includes(query));
  $("#teacherList").innerHTML = teachers.map((teacher) => `<article class="teacher-card">
    <span class="avatar">${esc(initials(teacher.name))}</span><div><h3>${esc(teacher.name)}</h3><p>${esc(teacher.position)} · ${teacher.reliefEligible ? "Layak relief" : "Dikecualikan"}</p></div>
    <div class="teacher-actions"><button class="mini-button" data-edit-teacher="${esc(teacher.id)}" title="Ubah">✎</button><button class="mini-button delete" data-delete-teacher="${esc(teacher.id)}" title="Nyahaktif">×</button></div>
  </article>`).join("");
  $$('[data-edit-teacher]').forEach((button) => button.addEventListener("click", () => openTeacherDialog(button.dataset.editTeacher)));
  $$('[data-delete-teacher]').forEach((button) => button.addEventListener("click", () => archiveTeacher(button.dataset.deleteTeacher)));
}

function renderSchedule() {
  // The grid shows the official timetable being prepared; relief for a date always follows
  // selectedScheduleVersion(), which respects the effective date.
  const version = officialScheduleVersion(db) || selectedScheduleVersion(db, todayIso());
  $("#activeVersion").textContent = version ? `${version.label} · ${formatDate(version.effectiveDate)}` : "Belum ada jadual";
  $("#activeVersion").className = `badge ${version ? "good" : "neutral"}`;
  const teacherId = $("#scheduleTeacher").value;
  const day = $("#scheduleDay").value;
  const byClass = admin && $("#scheduleType").value === "class";
  const matches = row => byClass ? row.className === teacherId : row.teacherId === teacherId;
  const rows = version ? db.schedule.filter(row => row.versionId === version.id && matches(row) && row.day === day) : [];
  if (!version || !teacherId || !db.schedule.some(row => row.versionId === version.id && matches(row))) {
    $("#scheduleGrid").innerHTML = `<div class="empty-state"><strong>${!version ? "Belum ada jadual aktif" : !teacherId ? "Pilih guru atau kelas untuk melihat jadual" : "Tiada rekod jadual untuk pilihan ini"}</strong>${admin ? 'Bina jadual atau import PDF aSc untuk bermula.' : 'Jadual akan tersedia selepas diterbitkan oleh admin.'}</div>`;
    return;
  }
  $("#scheduleGrid").innerHTML = PERIODS.map((period) => {
    const row = rows.find((item) => Number(item.period) === period.period);
    const storedTime = row?.startTime || db.schedule.find(r => r.versionId === version.id && r.day === day && Number(r.period) === period.period)?.startTime;
    const time = clockValue(storedTime,period.period,'startTime');
    return `<div class="schedule-cell ${row ? "" : "free"}"><span class="period">${period.period} · ${esc(time)}</span>${row ? `<strong>${esc(row.subject)}</strong><span>${esc(row.className || "Aktiviti")}</span>` : `<span style="margin-top:28px;color:#91a09c">Lapangan</span>`}</div>`;
  }).join("");
}

function openAbsenceDialog() {
  if (!requireAdmin()) return;
  $("#absenceDate").value = todayIso();
  $("#absenceTeacher").value = "";
  $("#absenceReason").value = "";
  $("#absenceAllDay").checked = true;
  $("#periodPicker").classList.add("hidden");
  $("#absenceDialog").showModal();
}

function saveAbsenceRecord(event) {
  event.preventDefault();
  if (!requireAdmin()) return;
  const teacherId = $("#absenceTeacher").value;
  const date = $("#absenceDate").value;
  if (!teacherId || !date) return toast("Pilih guru dan tarikh.", "error");
  const allDay = $("#absenceAllDay").checked;
  const periods = allDay ? [] : $$('#periodPicker input:checked').map((input) => Number(input.value));
  if (!allDay && !periods.length) return toast("Pilih sekurang-kurangnya satu waktu.", "error");
  if (db.absences.some((item) => item.teacherId === teacherId && item.date === date && item.status !== "cancelled")) {
    return toast("Guru ini sudah direkodkan tidak hadir pada tarikh tersebut.", "error");
  }
  const absence = { id: uuid("a"), date, teacherId, reason: $("#absenceReason").value.trim(), allDay, periods, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.absences.push(absence);
  const invalidatedReliefs = cancelReliefsAssignedToAbsence(db, absence, absence.updatedAt);
  $("#reliefDate").value = date;
  $("#absenceFilterDate").value = date;
  currentDrafts = buildReliefDrafts(db, date);
  generatedReliefKey = reliefInputKey();
  persist(); $("#absenceDialog").close(); renderAll();
  showView(currentDrafts.length ? "hari-ini" : "ketiadaan");
  const message = currentDrafts.length
    ? `Ketiadaan disimpan. ${invalidatedReliefs.length ? `${invalidatedReliefs.length} tugasan lama dibatalkan dan ` : ""}${currentDrafts.length} slot relief dijana untuk semakan.`
    : reliefEmptyMessage(date, true);
  remoteWrite("saveAbsence", absence, message);
}

function reliefEmptyMessage(date, saved = false) {
  const prefix = saved ? "Ketiadaan disimpan, tetapi " : "";
  const rows = activeScheduleRows(db, date);
  if (!rows.length) {
    const next = db.scheduleVersions
      .filter((version) => ["active", "superseded"].includes(version.status) && version.effectiveDate > date)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0];
    return next
      ? `${prefix}tiada jadual yang berkuat kuasa pada ${formatDate(date)}. Jadual ${next.label || "seterusnya"} bermula ${formatDate(next.effectiveDate)}.`
      : `${prefix}tiada jadual aktif untuk ${formatDate(date)}.`;
  }
  const absences = db.absences.filter((item) => item.date === date && item.status !== "cancelled");
  if (!absences.length) return `Tiada rekod guru tiada pada ${formatDate(date)}.`;
  const day = dayCodeFromDate(date);
  const hasTeachingSlot = rows.some((row) => row.day === day && row.className && absences.some((absence) => absence.teacherId === row.teacherId && (absence.allDay || (absence.periods || []).map(Number).includes(Number(row.period)))));
  if (!hasTeachingSlot) return `${prefix}guru berkenaan tiada kelas yang memerlukan relief pada ${formatDate(date)}.`;
  return `${prefix}tiada slot relief baharu. Slot mungkin dilindungi guru pairing atau reliefnya sudah diterbitkan.`;
}

function cancelAbsence(id) {
  if (!requireAdmin()) return;
  const item = db.absences.find((absence) => absence.id === id);
  if (!item || !confirm("Batalkan rekod ketiadaan ini?")) return;
  const updatedAt = new Date().toISOString();
  const result = cancelAbsenceAndReliefs(db, id, updatedAt);
  currentDrafts = currentDrafts.filter((draft) => !reliefMatchesAbsence(draft, result.absence));
  generatedReliefKey = "";
  persist(); renderAll();
  const message = result.reliefs.length
    ? `Rekod dibatalkan bersama ${result.reliefs.length} relief berkaitan.`
    : "Rekod ketiadaan dibatalkan.";
  remoteWrite("cancelAbsence", { id, updatedAt }, message);
}

function openTeacherDialog(id = "") {
  if (!requireAdmin()) return;
  const teacher = db.teachers.find((item) => item.id === id);
  $("#teacherDialogTitle").textContent = teacher ? "Ubah guru" : "Tambah guru";
  $("#teacherId").value = teacher?.id || "";
  $("#teacherName").value = teacher?.name || "";
  $("#teacherShortName").value = teacher?.shortName || "";
  const position=teacher?.position==='Guru Akademik'?'Guru Akademik Biasa':teacher?.position||'Guru Akademik Biasa';
  const positionSelect=$('#teacherPosition');
  const standard=[...positionSelect.options].some(option=>option.value===position);
  positionSelect.value=standard?position:'__other__';
  $('#teacherPositionOther').value=standard?'':position;
  toggleTeacherPositionOther();
  $("#teacherEligible").checked = teacher?.reliefEligible ?? true;
  $("#teacherDialog").showModal();
}

function saveTeacherRecord(event) {
  event.preventDefault();
  if (!requireAdmin()) return;
  const existingId = $("#teacherId").value;
  const name = $("#teacherName").value.trim().toUpperCase();
  const position=$('#teacherPosition').value==='__other__'?$('#teacherPositionOther').value.trim():$('#teacherPosition').value;
  const now = new Date().toISOString();
  if (!name) return toast("Nama guru diperlukan.", "error");
  if (!position) return toast("Jawatan guru diperlukan.", "error");
  if (db.teachers.some((teacher) => teacher.active && teacher.name === name && teacher.id !== existingId)) return toast("Nama guru ini sudah wujud.", "error");
  const teacher = {
    id: existingId || `g-${slug($("#teacherShortName").value)}-${Date.now().toString(36)}`,
    name,
    shortName: $("#teacherShortName").value.trim().toUpperCase(),
    position,
    priority: db.teachers.find(item=>item.id===existingId)?.priority || 3,
    reliefEligible: $("#teacherEligible").checked,
    active: true,
    createdAt: db.teachers.find((item) => item.id === existingId)?.createdAt || now,
    updatedAt: now,
  };
  const index = db.teachers.findIndex((item) => item.id === teacher.id);
  if (index >= 0) db.teachers[index] = teacher; else db.teachers.push(teacher);
  persist(); $("#teacherDialog").close(); renderAll();
  remoteWrite("saveTeacher", teacher, "Maklumat guru disimpan.");
}

function toggleTeacherPositionOther() {
  const custom=$('#teacherPosition').value==='__other__';
  $('#teacherPositionOtherWrap').classList.toggle('hidden',!custom);
  $('#teacherPositionOther').required=custom;
}

async function uploadTeacherDirectory(event) {
  const file=event.target.files[0];event.target.value='';
  if(!file||!requireAdmin()) return;
  const status=$('#teacherTransferStatus');let total=0;
  try {
    if(file.size>2*1024*1024) throw new Error('Fail terlalu besar. Maksimum 2 MB.');
    const preview=importTeachers(await file.text(),db.teachers);
    total=preview.teachers.length;
    if(!total) {status.textContent=`Tiada guru baharu. ${preview.skipped} nama sedia ada atau berulang diabaikan.`;return;}
    if(!confirm(`Tambah ${total} guru baharu ke Sheets? ${preview.skipped} nama sedia ada/berulang diabaikan. Rekod sedia ada tidak diubah.`)) return;
    if(!requireAdmin()) return;
    const writes=preview.teachers.map(entry=>{
      const now=new Date().toISOString();
      const teacher={...entry,id:`g-${crypto.randomUUID()}`,createdAt:now,updatedAt:now};
      db.teachers.push(teacher);
      return remoteWrite('saveTeacher',teacher,"");
    });
    persist();renderAll();
    status.textContent=`${total} guru ditambah pada paparan. Penyimpanan ke Sheets berjalan di belakang…`;
    Promise.all(writes).then(results=>{
      const saved=results.filter(Boolean).length;
      status.textContent=saved===total
        ? `Selesai: ${saved} guru disimpan; ${preview.skipped} nama diabaikan.`
        : `${saved} daripada ${total} guru disimpan. Semak status Google Sheets di bawah menu.`;
    });
  } catch(error) {
    status.textContent=`Import tidak dapat dimulakan. ${error.message}`;
  }
}

function archiveTeacher(id) {
  if (!requireAdmin()) return;
  const teacher = teacherById(id);
  if (!teacher || !confirm(`Nyahaktifkan ${teacher.name}? Rekod sejarah tidak akan dipadam.`)) return;
  teacher.active = false; teacher.updatedAt = new Date().toISOString(); persist(); renderAll();
  remoteWrite("saveTeacher", teacher, "Guru dinyahaktifkan.");
}

function publishReliefs() {
  if (!requireAdmin()) return;
  const errors = validateReliefs(db, currentDrafts);
  if (errors.length) return toast(errors[0], "error");
  const now = new Date().toISOString();
  const records = currentDrafts.map(({ candidates, ...item }) => ({ ...item, status: "published", createdAt: now, updatedAt: now }));
  db.reliefs.push(...records); persist(); renderAll();
  remoteWrite("saveReliefs", records, `${records.length} relief diterbitkan. Tekan Cetak / simpan PDF untuk jadual rasmi.`);
}

async function parsePdf() {
  if (!requireAdmin()) return;
  const file = $("#pdfFile").files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return toast("Fail melebihi 25 MB.", "error");
  const progress = $("#importProgress"); progress.classList.remove("hidden");
  $("#parsePdf").disabled = true;
  try {
    const pdfjs = await import("./vendor/pdf.min.js");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.js", import.meta.url).href;
    importResult = await parseTeacherPdf(file, pdfjs, activeTeachers(), ({ current, total }) => progress.style.setProperty("--progress", `${Math.round(current / total * 100)}%`));
    renderImportReview();
    toast("PDF selesai dibaca.", "success");
  } catch (error) {
    console.error(error); toast(`PDF tidak dapat dibaca: ${error.message}`, "error");
  } finally {
    progress.classList.add("hidden"); $("#parsePdf").disabled = false;
  }
}

function renderImportReview() {
  const review = $("#importReview"); review.classList.remove("hidden");
  $("#importSummary").innerHTML = `<div><strong>${importResult.pageCount}</strong><span>halaman guru</span></div><div><strong>${importResult.rows.length}</strong><span>slot digunakan</span></div><div><strong>${importResult.unmatchedPages.length}</strong><span>diabaikan</span></div><div><strong>${importResult.warnings.length}</strong><span>makluman</span></div>`;
  $("#importWarnings").innerHTML = importResult.unmatchedPages.length
    ? `<div class="alert">${importResult.unmatchedPages.length} halaman tanpa padanan akan diabaikan. Jika perlu, pilih guru secara manual dalam jadual semakan di bawah.</div>`
    : "";
  $("#importRows").innerHTML = importResult.pages.map((page, index) => `<tr><td>${index + 1}</td><td>${esc(page.rawName)}</td><td><select class="import-teacher-match" data-page-index="${index}" aria-label="Padanan untuk ${esc(page.rawName)}"><option value="">Abaikan halaman ini</option>${activeTeachers().map((teacher) => `<option value="${esc(teacher.id)}" ${teacher.id === page.teacherId ? "selected" : ""}>${esc(teacher.name)}</option>`).join("")}</select></td><td>${page.teacherId ? page.rows.length : 0}</td></tr>`).join("");
  $$(".import-teacher-match", $("#importRows")).forEach((select) => select.addEventListener("change", () => updateImportTeacherMatch(Number(select.dataset.pageIndex), select.value)));
}

function updateImportTeacherMatch(pageIndex, teacherId) {
  const page = importResult?.pages[pageIndex];
  if (!page) return;
  if (teacherId && importResult.pages.some((item, index) => index !== pageIndex && item.teacherId === teacherId)) {
    toast("Guru itu sudah dipadankan dengan halaman lain.", "error");
    renderImportReview();
    return;
  }
  page.teacherId = teacherId;
  page.suggestedTeacher = teacherById(teacherId) || null;
  Object.assign(importResult, buildImportSelection(importResult.pages, db.teachers, importResult.structuralWarnings || []));
  renderImportReview();
}

async function saveImportedSchedule() {
  if (!requireAdmin()) return;
  if (!importResult) return;
  const effectiveDate = $("#effectiveDate").value;
  const label = $("#versionLabel").value.trim();
  if (!effectiveDate || !label) return toast("Isi tarikh kuat kuasa dan nama versi.", "error");
  if (!importResult.rows.length) return toast("Tiada halaman guru yang dipadankan. Pilih sekurang-kurangnya seorang guru secara manual.", "error");
  const version = { id: uuid("v"), label, effectiveDate, sourceName: $("#pdfFile").files[0]?.name || "PDF", status: $("#activateVersion").checked ? "active" : "draft", createdAt: new Date().toISOString() };
  if (version.status === "active") db.scheduleVersions.forEach((item) => { if (item.status === "active") item.status = "superseded"; });
  const rows = importResult.rows.map((row) => ({ ...row, versionId: version.id }));
  db.scheduleVersions.push(version); db.schedule.push(...rows); persist(); renderAll(); setScheduleMode("relief"); showView("jadual");
  remoteWrite("importSchedule", { version, rows }, `${rows.length} slot jadual disimpan.`);
}

function remoteWrite(action, data, successMessage) {
  if (!admin) return Promise.resolve(false);
  const client=new ApiClient({...config});client.token=api.token;
  const payload=structuredClone(data);
  const queuedToken=api.token;
  pendingWrites+=1;updateConnectionUi();
  const run=async()=>{
    try {
      const result=await client.write(action,payload);
      if(admin&&api.token===queuedToken) {
        db.revision=Math.max(Number(db.revision||0),Number(result.revision||0));
        db.updatedAt=result.updatedAt||db.updatedAt;confirmedDb=structuredClone(db);persist();
      }
      if(successMessage) toast(successMessage,"success");
      return true;
    } catch(error) {
      failedWrites+=1;
      toast(`Perubahan kekal pada paparan tetapi belum tersimpan. ${error.message}`,"error");
      if(error.code==='AUTH_REQUIRED'&&admin&&api.token===queuedToken) setTimeout(()=>leaveAdmin(),0);
      return false;
    } finally {pendingWrites-=1;updateConnectionUi();}
  };
  const operation=writeQueue.then(run,run);
  writeQueue=operation.then(()=>undefined,()=>undefined);
  return operation;
}

async function syncData(showSuccess = true) {
  if (!api.isConfigured()) return showSuccess && toast("Tetapkan URL API di bahagian Tetapan.");
  if(syncPromise) return syncPromise;
  if(pendingWrites) return showSuccess&&toast("Simpanan sedang berjalan di belakang.");
  if(failedWrites&&showSuccess&&!confirm("Ada perubahan yang belum sampai ke Sheets. Segerakkan semula dan gunakan data pelayan?")) return;
  $("#syncButton").disabled = true;
  syncPromise=(async()=>{try {
    const wasAdmin=admin;
    const result = wasAdmin ? await api.bootstrap() : await api.publicData(cachedPublicRevision(), todayIso());
    if (wasAdmin !== admin) return;
    if (result.data) { db = { ...emptyDatabase(), ...normalizeDatabaseTimes(result.data) }; if(!wasAdmin) cachePublicDb(db); }
    confirmedDb=structuredClone(db);failedWrites=0;renderAll();
    if (showSuccess) toast(result.changed===false ? "Data sudah terkini — tiada perubahan." : "Data Google Sheets telah dikemas kini.", "success");
  } catch (error) {
    if (showSuccess) toast(error.message, "error");
    if(error.code==='AUTH_REQUIRED') await leaveAdmin();
  } finally { $("#syncButton").disabled = false;syncPromise=null; }})();
  return syncPromise;
}

async function syncIfChanged() {
  if(document.hidden||!navigator.onLine||!api.isConfigured()||pendingWrites||failedWrites||syncPromise) return;
  try {
    // A timetable version can take effect at midnight, so a cached public timetable stops being
    // current the moment the calendar day changes even when no admin has written anything.
    if(!admin&&cachedPublicDay()&&cachedPublicDay()!==todayIso()) return syncData(false);
    const status=await api.status();
    if(Number(status.revision||0)>Number(db.revision||0)) await syncData(false);
  } catch {}
}

function populatePeriodPicker() {
  $("#periodPicker").innerHTML = `<legend>Pilih waktu</legend>${PERIODS.map((item) => `<label><input type="checkbox" value="${item.period}"><span>${item.period}</span></label>`).join("")}`;
}

function wireEvents() {
  $('#saveReliefSettings').addEventListener('click',()=>{
    if(!requireAdmin()) return;
    const input=$('#dailyReliefLimit');
    if(!input.reportValidity()) return;
    db.reliefSettings={dailyLimit:Number(input.value),ignorePairingWhenCovered:$('#ignorePairingWhenCovered').checked};
    remoteWrite('saveReliefSettings',db.reliefSettings,'Had relief harian disimpan ke Sheets.');
    renderAll();
  });
  $('#generateRelief').addEventListener('click',()=>{
    if(!requireAdmin()) return;
    if(currentDrafts.length&&!confirm('Jana semula dan gantikan pilihan draf yang belum diterbitkan?')) return;
    const date=$('#reliefDate').value;
    if(!date||!dayCodeFromDate(date)) return toast('Pilih tarikh persekolahan Isnin hingga Jumaat.','error');
    currentDrafts=buildReliefDrafts(db,date);generatedReliefKey=reliefInputKey();renderDashboard();
    toast(currentDrafts.length?`${currentDrafts.length} slot relief dijana. Semak sebelum terbitkan.`:reliefEmptyMessage(date));
  });
  wireAdminEvents();
  $("#reliefDate").addEventListener("change",renderDashboard);
  $("#scheduleType").addEventListener("change",()=>{renderTeacherLists();renderSchedule();});
  $("#builderSection").addEventListener("change", event => window.jadualBuilder.go(event.target.value));
  document.addEventListener("builder-view", event => { $("#builderSection").value = event.detail; });
  $$('[data-builder-open]').forEach(button => button.addEventListener("click", async () => { if (!requireAdmin()) return; await ensureBuilder(); setScheduleMode("generator"); showView("jadual"); window.jadualBuilder.go(button.dataset.builderOpen); }));
  $("#syncBuilderTeachers").addEventListener("click", () => { const count = window.jadualBuilder.mergeTeachers(db.teachers); toast(`${count} profil guru diselaraskan. Semak agihan guru sebelum menjana.`, "success"); });
  $("#useBuilderSchedule").addEventListener("click", previewBuilderSchedule);
  $("#confirmBuilderPublish").addEventListener("click", publishBuilderSchedule);
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $$('[data-schedule-mode]').forEach((button) => button.addEventListener("click", async () => {
    if(button.dataset.scheduleMode==='generator') {
      if(!requireAdmin()) return;
      try {await ensureBuilder();} catch(error) {return toast(error.message,'error');}
    }
    setScheduleMode(button.dataset.scheduleMode);
  }));
  $$('[data-open-absence]').forEach((button) => button.addEventListener("click", openAbsenceDialog));
  $("#openAbsence").addEventListener("click", openAbsenceDialog);
  $("#mobileSettings").addEventListener("click", () => showView("tetapan"));
  $("#absenceFilterDate").addEventListener("change", renderAbsences);
  $("#absenceAllDay").addEventListener("change", (event) => $("#periodPicker").classList.toggle("hidden", event.target.checked));
  $("#absenceForm").addEventListener("submit", saveAbsenceRecord);
  $$('[data-close-absence]').forEach(button=>button.addEventListener('click',()=>$('#absenceDialog').close()));
  $("#addTeacher").addEventListener("click", () => openTeacherDialog());
  $("#teacherForm").addEventListener("submit", saveTeacherRecord);
  $('#teacherPosition').addEventListener('change',toggleTeacherPositionOther);
  $$('[data-close-teacher]').forEach(button=>button.addEventListener('click',()=>$('#teacherDialog').close()));
  $('#downloadTeachers').addEventListener('click',()=>{
    if(!requireAdmin()) return;
    const url=URL.createObjectURL(new Blob([exportTeachers(db.teachers)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`Senarai-Guru-${todayIso()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('#uploadTeachers').addEventListener('click',()=>{if(requireAdmin()) $('#teacherFile').click();});
  $('#teacherFile').addEventListener('change',uploadTeacherDirectory);
  $("#teacherSearch").addEventListener("input", renderTeachers);
  $("#scheduleTeacher").addEventListener("change", renderSchedule);
  $("#scheduleDay").addEventListener("change", renderSchedule);
  $("#publishRelief").addEventListener("click", publishReliefs);
  $("#printRelief").addEventListener("click", printReliefSheet);
  $("#pdfFile").addEventListener("change", (event) => {
    const file = event.target.files[0]; $("#fileName").textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "Maksimum 25 MB"; $("#parsePdf").disabled = !file;
    if (file) { const date = file.name.match(/(\d{2})[.\-_](\d{2})[.\-_](\d{4})/); if (date) { $("#effectiveDate").value = `${date[3]}-${date[2]}-${date[1]}`; $("#versionLabel").value = `Jadual ${date[1]}.${date[2]}.${date[3]}`; } }
  });
  $("#parsePdf").addEventListener("click", parsePdf);
  $("#saveImport").addEventListener("click", saveImportedSchedule);
  $("#syncButton").addEventListener("click", () => syncData(true));
  $("#testApi").addEventListener("click", async () => { try { const temp = new ApiClient({ ...config, apiUrl: $("#apiUrl").value.trim() }); const result = await temp.health(); toast(`${result.school || "API"} bersambung.`, "success"); } catch (error) { toast(error.message, "error"); } });
  $("#saveSettings").addEventListener("click", async () => {if(!requireAdmin()) return; const next={apiUrl:$("#apiUrl").value.trim(),autoSync:true};if(!new ApiClient(next).isConfigured()) return toast('URL Apps Script tidak sah.','error');const changed=next.apiUrl!==config.apiUrl;config=next;saveConfig(config);if(changed) await leaveAdmin();else api.config=config;updateConnectionUi();toast(changed?'Sambungan diubah. Login semula.':'Tetapan disimpan.','success');});
  $("#checkUpdate").addEventListener("click", async () => { const registration = await navigator.serviceWorker?.getRegistration(); await registration?.update(); toast("Semakan kemas kini selesai.", "success"); });
  $("#installButton").addEventListener("click", async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("#installButton").classList.add("hidden"); });
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; $("#installButton").classList.remove("hidden"); });
  window.addEventListener("online", () => { updateConnectionUi(); if (config.autoSync) syncData(false); });
  window.addEventListener("offline", updateConnectionUi);
  window.addEventListener('afterprint',()=>document.body.classList.remove('print-relief'));
  window.addEventListener("focus",syncIfChanged);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden) syncIfChanged();});
  setInterval(syncIfChanged,8000);
}

function init() {
  const savedSession=storedAdminSession();
  restoreAdminShell(savedSession);
  const date = todayIso();
  $("#reliefDate").value = date;
  $("#todayLabel").textContent = new Intl.DateTimeFormat("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)).toUpperCase();
  $("#absenceFilterDate").value = date; $("#effectiveDate").value = date;
  $("#apiUrl").value = config.apiUrl || ""; $("#autoSync").checked = config.autoSync !== false;
  $("#appVersion").textContent = APP_VERSION;
  populatePeriodPicker(); wireEvents(); renderAll(); showView("jadual");
  resumeSession(savedSession);
}

init();

async function resumeSession(session=storedAdminSession()) {
  if(!session||!api.isConfigured()) {
    if(api.isConfigured()&&navigator.onLine) syncData(false);
    return;
  }
  restoreAdminShell(session);
  $('#systemNotice').textContent='Sesi admin dipulihkan · memuatkan data Google Sheets…';
  try {
    const snapshot=await api.bootstrap();
    await enterAdmin({...session,snapshot});
  } catch(error) {
    if(error.code==='AUTH_REQUIRED') {
      await leaveAdmin(false);
      toast('Sesi tujuh hari telah tamat atau dibatalkan. Sila login semula.','error');
    } else {
      restoreAdminShell(session);updateConnectionUi();
      toast('Sesi admin masih disimpan. Data Google Sheets akan dicuba semula apabila sambungan pulih.','error');
    }
  }
}

function requireAdmin() {
  if(!admin || Date.now()>=sessionExpiry) {openLogin();return false;}
  return true;
}
function openLogin() {
  $('#loginError').textContent='';$('#loginSetup').classList.toggle('hidden',api.isConfigured());
  $('#loginApiUrl').value=config.apiUrl;$('#loginDialog').showModal();
  $('#loginPassword').focus();
}
async function ensureBuilder() {
  if (!window.jadualBuilder&&!builderLoadPromise) builderLoadPromise = new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`./builder.js?v=${APP_VERSION}`;script.onload=resolve;script.onerror=()=>{script.remove();builderLoadPromise=null;reject(new Error('Pembina gagal dimuatkan. Cuba lagi.'));};document.body.appendChild(script);});
  await builderLoadPromise;
  if(!admin||builderCloudLoaded) return;
  let cloud;
  try {cloud=await api.builderData();}
  catch(error) {
    if(error.code==='AUTH_REQUIRED') throw error;
    const snapshot=await api.bootstrap();cloud={builder:snapshot.builder};
  }
  restoringBuilder=true;
  if(cloud.builder?.state) window.jadualBuilder.setState(cloud.builder.state);
  builderRevision=cloud.builder?.revision||0;
  if(!window.jadualBuilder.getState().guru.length) window.jadualBuilder.mergeTeachers(db.teachers);
  restoringBuilder=false;builderDirty=false;builderCloudLoaded=true;
  $('#builderCloudStatus').textContent=cloud.builder?.state?'Draf Sheets telah dimuatkan':'Draf baharu — simpan ke Sheets apabila siap';
}
async function enterAdmin(result) {
  const snapshot=result.snapshot||await api.bootstrap();
  db={...emptyDatabase(),...normalizeDatabaseTimes(snapshot.data)};confirmedDb=structuredClone(db);
  builderCloudLoaded=false;builderDirty=false;
  admin=true;window.systemAdminActive=true;sessionExpiry=result.expiresAt;
  localStorage.setItem('jadual-admin-session',JSON.stringify({token:api.token,expiresAt:sessionExpiry}));
  document.body.classList.remove('public-mode');$('#loginButton').classList.add('hidden');
  $('#builderCloudStatus').textContent='Pembina akan dimuatkan apabila dibuka';
  $('#passwordNotice').textContent=result.mustChangePassword?'Kata laluan awal masih digunakan. Tukar kepada kata laluan yang lebih kuat.':'';
  $('#loginDialog').close();$('#loginPassword').value='';renderAll();
}
async function leaveAdmin(remoteLogout=true) {
  const previous=api,finalWrites=writeQueue;admin=false;window.systemAdminActive=false;sessionExpiry=0;localStorage.removeItem('jadual-admin-session');
  document.body.classList.add('public-mode');$('#loginButton').classList.remove('hidden');
  restoringBuilder=true;window.jadualBuilder?.clear();restoringBuilder=false;builderDirty=false;builderCloudLoaded=false;
  importResult=null;$('#importReview').classList.add('hidden');$('#importRows').innerHTML='';$('#pdfFile').value='';
  $$('dialog').forEach(d=>{d.close();d.querySelector('form')?.reset();});
  db=loadDb();if(!db.revision) db.teachers=[];confirmedDb=structuredClone(db);$('#scheduleType').value='teacher';setScheduleMode('relief');showView('jadual');
  api=new ApiClient(config);await finalWrites;if(remoteLogout) await previous.logout().catch(()=>{});await syncData(false);
}
async function saveBuilderCloud() {
  if(!admin||restoringBuilder) return;
  if(builderSaving) {$('#builderCloudStatus').textContent='Simpanan sedang berjalan · perubahan baharu boleh diteruskan';return;}
  builderSaving=true;const state=window.jadualBuilder.getState();const fingerprint=JSON.stringify(state);
  $('#builderCloudStatus').textContent='Menyimpan draf ke Sheets…';
  try {
    const result=await api.write('saveBuilder',{baseRevision:builderRevision,state});
    if(!admin) return;
    builderRevision=result.result.builderRevision;builderDirty=JSON.stringify(window.jadualBuilder.getState())!==fingerprint;
    $('#builderCloudStatus').textContent=builderDirty?'Ada perubahan baharu — tekan Simpan draf':'Semua perubahan draf disimpan di Sheets';
  } catch(error) {builderDirty=true;$('#builderCloudStatus').textContent=`Belum disimpan: ${error.message}`;if(error.code==='AUTH_REQUIRED') await leaveAdmin();}
  finally {builderSaving=false;}
}
function wireAdminEvents() {
  $('#pdfToBuilder').addEventListener('click',async()=>{
    if(!requireAdmin()||!importResult?.rows.length) return;
    try {
      await ensureBuilder();
      if(!confirm('Gantikan draf pembina semasa dengan jadual PDF yang dipadankan? Jadual aktif tidak berubah sehingga anda mengaktifkannya.')) return;
      const metadata={
        ...(importResult.metadata||{}),
        schoolName:importResult.metadata?.schoolName||db.school||'',
        effectiveDate:$('#effectiveDate').value||'',
        pages:(importResult.pages||[]).map(page=>({
          teacherId:page.teacherId,
          rawName:page.rawName,
          classTeacherClass:page.metadata?.classTeacherClass||'',
        })),
      };
      const draft=draftFromPdf(importResult.rows,db.teachers,window.jadualBuilder.getState(),metadata);
      window.jadualBuilder.setState(draft);builderDirty=true;$('#builderCloudStatus').textContent='Draf PDF lengkap — sekolah, masa, guru, kelas, subjek, agihan dan slot sedia untuk disemak';setScheduleMode('generator');showView('jadual');window.jadualBuilder.go('lihat');
    } catch(error) {toast(error.message,'error');}
  });
  $('#loginButton').addEventListener('click',openLogin);$('#closeLogin').addEventListener('click',()=>$('#loginDialog').close());
  $('#logoutButton').addEventListener('click',()=>{if(builderDirty&&!confirm('Draf belum disimpan. Log keluar tanpa menyimpannya?')) return;leaveAdmin();});
  $('#loginForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if ($('#submitLogin').disabled) return;
    $('#submitLogin').disabled=true;$('#submitLogin').textContent='Sedang login…';
    $('#loginForm').setAttribute('aria-busy','true');$('#loginError').textContent='';
    try {
      if(!api.isConfigured()) {config={apiUrl:$('#loginApiUrl').value.trim(),autoSync:true};api=new ApiClient(config);saveConfig(config);}
      const result=await api.login($('#loginUsername').value.trim(),$('#loginPassword').value);
      $('#submitLogin').textContent='Memuatkan data sekolah…';await enterAdmin(result);
    } catch(error) {api.token='';$('#loginError').textContent=error.message;}
    finally {$('#submitLogin').disabled=false;$('#submitLogin').textContent='Login';$('#loginForm').removeAttribute('aria-busy');$('#loginPassword').value='';}
  });
  $('#loginPassword').addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.isComposing) {
      event.preventDefault();
      if(!$('#submitLogin').disabled) $('#loginForm').requestSubmit($('#submitLogin'));
    }
  });
  $('#saveBuilderCloud').addEventListener('click',saveBuilderCloud);
  $('#loadBuilderCloud').addEventListener('click',async()=>{
    if(!requireAdmin()||(builderDirty&&!confirm('Gantikan draf belum disimpan dengan draf Sheets?'))) return;
    try {const result=await api.bootstrap();if(!result.builder?.state) return toast('Belum ada draf di Sheets.');restoringBuilder=true;window.jadualBuilder.setState(result.builder.state);builderRevision=result.builder.revision;builderDirty=false;$('#builderCloudStatus').textContent='Draf Sheets dimuatkan';}
    catch(error){toast(error.message,'error');}finally{restoringBuilder=false;}
  });
  document.addEventListener('builder-saved',()=>{if(admin&&!restoringBuilder){builderDirty=true;$('#builderCloudStatus').textContent='Draf berubah — tekan Simpan draf ke Sheets';}});
  $('#changePassword').addEventListener('click',async()=>{
    if(!requireAdmin()) return;
    try {await api.write('changePassword',{currentPassword:$('#currentPassword').value,newPassword:$('#newPassword').value});$('#currentPassword').value='';$('#newPassword').value='';await leaveAdmin();toast('Kata laluan ditukar. Login semula.','success');}catch(error){toast(error.message,'error');}
  });
  window.addEventListener('beforeunload',event=>{if(admin&&builderDirty){event.preventDefault();event.returnValue='';}});
  setInterval(()=>{if(admin&&Date.now()>=sessionExpiry) leaveAdmin();},30000);
}

function checkedBuilderSchedule() {
  const builder = window.jadualBuilder;
  const state = builder.getState();
  if (!state.jadual?.slots?.length) throw new Error("Belum ada jadual dijana. Lengkapkan data dan buka Jana Jadual dahulu.");
  const issues = builder.validate();
  if (issues.length) throw new Error(`Selesaikan ${issues.length} isu dalam Lihat & Edit sebelum mengaktifkan jadual. ${issues[0].m}`.replace(/<[^>]+>/g, ""));
  const result = convertBuilderSchedule(state, db.teachers, builder.times());
  if (!result.rows.some(row => !row.isDuty)) throw new Error("Tiada slot mengajar dengan guru yang dipadankan. Semak nama dalam tab Guru.");
  return result;
}

function previewBuilderSchedule() {
  if (!requireAdmin()) return;
  $("#builderNotice").classList.add("hidden");
  try {
    const result = checkedBuilderSchedule();
    $("#builderEffectiveDate").value = todayIso();
    $("#builderVersionLabel").value = `Jadual binaan ${formatDate(todayIso())}`;
    $("#builderPublishSummary").textContent = `${result.rows.length} slot • ${new Set(result.rows.map(r => r.teacherId)).size} guru. Jadual ini akan menjadi versi aktif mengikut tarikh kuat kuasa.`;
    $("#builderPublishMissing").textContent = result.missing.length ? `Guru tanpa padanan akan diabaikan: ${result.missing.join(", ")}. Tambah atau betulkan profil guru jika diperlukan.` : "Semua guru dalam jadual berjaya dipadankan.";
    $("#builderPublishDialog").showModal();
  } catch (error) { $("#builderNotice").textContent = error.message; $("#builderNotice").classList.remove("hidden"); }
}

async function publishBuilderSchedule(event) {
  if (!requireAdmin()) return;
  event.preventDefault();
  if (!$("#builderPublishForm").reportValidity()) return;
  try {
    const { rows: converted } = checkedBuilderSchedule();
    const version = {id:uuid("v"),label:$("#builderVersionLabel").value.trim(),effectiveDate:$("#builderEffectiveDate").value,sourceName:"Penjana Jadual terbina",status:"active",createdAt:new Date().toISOString()};
    if (!version.label) throw new Error("Isi nama versi jadual.");
    const rows = converted.map(row => ({...row,versionId:version.id}));
    db.scheduleVersions.forEach(v => {if(v.status === "active") v.status = "superseded";});
    db.scheduleVersions.push(version); db.schedule.push(...rows); persist();
    $("#builderPublishDialog").close(); setScheduleMode("relief"); renderAll();
    remoteWrite("importSchedule", {version,rows}, "Jadual binaan diaktifkan untuk relief.");
  } catch (error) { toast(error.message, "error"); }
}
