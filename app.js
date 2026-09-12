import { APP_VERSION, DAY_NAMES, PERIODS, emptyDatabase, slug } from "./data.js?v=3.1.37";
import { ApiClient, loadConfig, saveConfig } from "./admin-api.js?v=3.1.37";
import { activeScheduleRows, buildReliefDrafts, cancelAbsenceAndReliefs, cancelReliefsAssignedToAbsence, coverageHiddenIds, dayCodeFromDate, effectiveScheduleRows, reliefHasActiveAbsence, reliefMatchesAbsence, validateReliefs, dailyReliefLimit, selectedScheduleVersion, officialScheduleVersion } from "./relief-engine.js?v=3.1.37";
import { canCover, coverList, coverLinks, coverageLabel, coveredTeacherSubjects } from "./teacher-coverage.js?v=3.1.37";
import { buildImportSelection, parseTeacherPdf } from "./pdf-import.js?v=3.1.37";
import { convertBuilderSchedule } from "./builder-relief.js?v=3.1.37";
import { draftFromPdf } from './pdf-builder.js?v=3.1.37';
import { exportTeachers, importTeachers } from './teacher-transfer.js?v=3.1.37';
import { buildReliefPrintModel, reliefPrintHtml } from './relief-print.js?v=3.1.37';
import { openReliefPdf } from './relief-pdf.js?v=3.1.37';
import { SETTING_SUBJECT, mergeSettingRows, settingDayName, settingGridModel, settingKey, settingSelectionFromRows, settingSignature } from './setting-slots.js?v=3.1.37';

const DB_KEY = "relief-skpr-db-v1";
const PUBLIC_DAY_KEY = "sistem-jadual-public-day-v1";
const WRITE_OUTBOX_KEY = "sistem-jadual-write-outbox-v1";
const titleByView = { "hari-ini": "Jadual relief", jadual: "Jadual", guru: "Guru", import: "Import PDF", tetapan: "Tetapan" };
let config = loadConfig();
let api = new ApiClient(config);
let db = loadDb();
if (!db.revision) db.teachers = [];
let confirmedDb = structuredClone(db);
let admin = false, builderRevision = 0, builderDirty = false, restoringBuilder = false, builderSaving = false, builderCloudLoaded = false;
let pendingWrites = 0, failedWrites = 0, writeQueue = Promise.resolve(), syncPromise = null;
let writeOutbox = loadWriteOutbox();
failedWrites = writeOutbox.length;
let sessionExpiry = 0;
let importResult = null;
let currentDrafts = [];
let generatedReliefKey = '';
function reliefInputKey() { return JSON.stringify([$('#reliefDate').value,db.teachers,db.scheduleVersions,db.schedule,db.absences,db.reliefs,db.reliefSettings]); }
let deferredInstallPrompt = null;
let toastTimer = null;
let scheduleMode = "relief";
let reliefPanel = "senarai";
let reliefTab = "ketiadaan";
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

// Generated relief drafts are kept on the device: losing a whole day's relief work because the
// page was reloaded (or the tablet slept) is the one thing an admin cannot be asked to redo.
const DRAFT_KEY = "sistem-jadual-draf-relief-v1";
function saveDrafts() {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: $("#reliefDate").value, key: generatedReliefKey, drafts: currentDrafts })); } catch {}
}
// Drafts belong to one date: restoring them also puts the date picker back, otherwise the reload
// lands on today and the stored drafts look like they belong to the wrong data.
function restoreDrafts() {
  try {
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!stored || !Array.isArray(stored.drafts) || !stored.drafts.length) return;
    if (stored.date && dayCodeFromDate(stored.date)) {
      $("#reliefDate").value = stored.date;
      renderAbsences();
    }
    if (stored.key !== reliefInputKey()) {
      // Data moved on since (another admin, a fresh import). Keep the work on the device and say so
      // instead of deleting it: the admin decides whether to regenerate.
      toast(`Draf relief ${stored.date || ""} tidak dimuatkan kerana data telah berubah. Tekan Jana untuk jana semula.`, "info");
      return;
    }
    currentDrafts = stored.drafts;
    generatedReliefKey = stored.key;
    renderAll();
    toast(`${currentDrafts.length} draf relief dipulihkan. Semak sebelum terbitkan.`, "info");
  } catch {}
}

// The private records the admin last saw are kept on the device as well, so a refresh paints the
// real data at once instead of showing an empty timetable while six sheet reads happen. The copy is
// only ever used as a starting point: the server still decides what is current, and a revision check
// (one config read, no sheet reads) is what keeps it honest.
const ADMIN_DB_KEY = "sistem-jadual-data-admin-v1";
function loadWriteOutbox() {
  try {
    const entries = JSON.parse(localStorage.getItem(WRITE_OUTBOX_KEY) || "[]");
    return Array.isArray(entries)
      ? entries.filter((item) => item && item.id && item.action && item.data !== undefined)
      : [];
  } catch { localStorage.removeItem(WRITE_OUTBOX_KEY); return []; }
}
function saveWriteOutbox() {
  try {
    if (writeOutbox.length) localStorage.setItem(WRITE_OUTBOX_KEY, JSON.stringify(writeOutbox));
    else localStorage.removeItem(WRITE_OUTBOX_KEY);
  } catch {}
}
function cacheAdminDb() {
  try { localStorage.setItem(ADMIN_DB_KEY, JSON.stringify({ savedAt: Date.now(), data: db })); } catch {}
}
function cachedAdminDb() {
  try {
    const stored = JSON.parse(localStorage.getItem(ADMIN_DB_KEY) || "null");
    return stored && stored.data && stored.data.revision ? stored : null;
  } catch { return null; }
}

function persist() {
  db.updatedAt = new Date().toISOString();
  // Optimistic changes are durable on this device before the slower Sheets request starts.
  cacheAdminDb();
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
  if (!admin && !["hari-ini","jadual"].includes(name)) return openLogin();
  if (!titleByView[name]) name = "hari-ini";
  document.body.classList.toggle("print-builder", name === "jadual" && scheduleMode === "generator");
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  $("#viewTitle").textContent = titleByView[name] || "Sistem Jadual";
  localStorage.setItem("relief-skpr-view", name);
  if (name === "jadual") setScheduleMode(scheduleMode);
  // The builder tab lives on this screen, so its download starts as the screen is shown.
  if (name === "jadual") warmBuilder();
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

// The builder tab used to change nothing until builder.js had downloaded and Google Sheets had
// answered, which reads as a dead button. The pane now switches on the press itself and reports
// what it is waiting for.
let builderOpening = false;
function setBuilderBusy(busy, button = null) {
  builderOpening = busy;
  const tab = button || $('[data-schedule-mode="generator"]');
  if (tab) {
    tab.classList.toggle("is-busy", busy);
    tab.setAttribute("aria-busy", String(busy));
    // aria-disabled instead of disabled: a disabled control drops keyboard focus, so a keyboard
    // user would lose their place while the pane they asked for is still opening.
    tab.setAttribute("aria-disabled", String(busy));
  }
  $("#builderLoading")?.classList.toggle("hidden", !busy);
  const status = $("#builderCloudStatus");
  if (!status) return;
  if (busy) { status.dataset.resting = status.textContent; status.textContent = "Menyediakan pembina jadual…"; return; }
  // A failed open must not leave a line that reads like a fresh draft is ready to edit.
  if (status.textContent === "Menyediakan pembina jadual…") {
    status.textContent = builderReadyPromise ? (status.dataset.resting || "Draf baharu — simpan ke Sheets apabila siap") : "Pembina tidak dimuatkan — tekan tab sekali lagi untuk cuba semula";
  }
}

// One failure path for every way into the builder: the screen the press opened stays, and the reason
// it is empty is written where the missing content would be.
function showBuilderFailure(error) {
  const notice = $("#builderNotice");
  if (notice) { notice.textContent = `${error.message} Tekan sekali lagi untuk cuba semula.`; notice.classList.remove("hidden"); }
  toast(error.message, "error");
}

// Fetching builder.js and the Sheets draft takes seconds on a school connection. Starting that when
// the timetable screen is opened means the press only has to show the pane — while the login path
// still loads no builder at all, which the login UI test pins down.
function warmBuilder() {
  if (!admin || window.jadualBuilder || builderReadyPromise) return;
  if (navigator.connection?.saveData) return;
  // iOS Safari has no saveData, so the slower networks are checked directly when they are reported.
  const type = navigator.connection?.effectiveType;
  if (type === "slow-2g" || type === "2g") return;
  const start = () => Promise.resolve(ensureBuilder()).catch(() => {});
  // Both are armed: an idle callback keeps the download off the first paint, and the timer is the
  // guarantee, because a browser without a frame loop (headless, some embedded webviews) never
  // runs an idle callback at all. ensureBuilder() is shared, so the second call is free.
  if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 4000 });
  setTimeout(start, 2500);
}

function updateConnectionUi() {
  const configured = api.isConfigured();
  $("#syncDot").classList.toggle("online", configured && navigator.onLine && !failedWrites);
  $("#syncLabel").textContent = pendingWrites ? `Disimpan di peranti · segerak ${pendingWrites}` : failedWrites ? "Tersimpan di peranti · menunggu Sheets" : configured ? (navigator.onLine ? "Google Sheets · masa nyata" : "Luar talian") : "Belum disambungkan";
  $("#systemNotice").textContent = !configured
    ? "Sambungan sekolah belum disediakan. Login admin memerlukan pelayan sekolah."
    : admin
      ? failedWrites
        ? `${failedWrites} perubahan sudah selamat pada peranti dan akan dihantar semula ke Google Sheets apabila sambungan pulih.`
        : pendingWrites
          ? "Perubahan sudah disimpan pada peranti · sedang dihantar ke Google Sheets di belakang"
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
  renderTeacherRestoreNotices();
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
  if(!admin || generatedReliefKey!==reliefInputKey()) {if(currentDrafts.length||generatedReliefKey){currentDrafts=[];generatedReliefKey='';saveDrafts();}}
  $('#reliefGuide').textContent=admin ? (generatedReliefKey ? `Draf dijana: ${currentDrafts.length} slot baharu. Semak guru ganti, kemudian Terbitkan.` : 'Buka Rekod guru tiada untuk menambah guru yang tidak hadir, kemudian tekan Jana. Perubahan data memerlukan jana semula.') : 'Jadual relief yang telah diterbitkan oleh admin.';
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
  const html=reliefPrintHtml(model);
  $('#reliefPrintSheet').innerHTML=html;
  $('#reliefPrintSheet').setAttribute('aria-hidden',model.groups.length?'false':'true');
  renderReliefPreview(date);
}

// The Preview tab shows the same official table as the printed sheet, but with the drafts still
// being reviewed included, so the admin can read the day before publishing it.
function renderReliefPreview(date) {
  const box=$('#reliefPreview');
  if(!box) return;
  const model=buildReliefPrintModel(db,date,PERIODS,{includeDrafts:true});
  box.innerHTML=model.groups.length
    ?reliefPrintHtml(model)
    :'<div class="empty-state"><strong>Tiada relief untuk dipaparkan</strong>Jadual guru ganti muncul di sini selepas relief dijana atau diterbitkan.</div>';
}

function setReliefPanel(name) {
  reliefPanel = ["senarai","preview"].includes(name) ? name : "senarai";
  $('#reliefPanelSenarai')?.classList.toggle('hidden', reliefPanel !== 'senarai');
  $('#reliefPanelPreview')?.classList.toggle('hidden', reliefPanel !== 'preview');
  $$('[data-relief-panel]').forEach((button) => {
    const active = button.dataset.reliefPanel === reliefPanel;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
}

// Both the printed sheet and the exported PDF are the official document: published relief only.
function publishedReliefModel(date) {
  const published=db.reliefs.some(item=>item.date===date&&item.status==='published'&&reliefHasActiveAbsence(db,item));
  if(!published) { toast('Tiada relief diterbitkan untuk tarikh ini.','error'); return null; }
  return buildReliefPrintModel(db,date,PERIODS);
}

function printReliefSheet() {
  const date=$('#reliefDate').value||todayIso();
  const model=publishedReliefModel(date);
  if(!model) return;
  $('#reliefPrintSheet').innerHTML=reliefPrintHtml(model);
  $('#reliefPrintSheet').setAttribute('aria-hidden','false');
  document.body.classList.remove('print-builder');
  document.body.classList.add('print-relief');
  window.print();
}

function exportReliefPdf() {
  const date=$('#reliefDate').value||todayIso();
  const model=publishedReliefModel(date);
  if(!model) return;
  try {
    openReliefPdf(model,`Jadual-Relief-${date}.pdf`);
    toast('Fail PDF A4 landskap telah dijana. Simpan atau kongsi daripada pemapar PDF.','success');
  } catch(error) {
    toast(error.message||'PDF tidak dapat dijana.','error');
  }
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

// Moves within one tablist only: arrow keys on the sub tabs must not also move the view switch
// inside them. Focus is moved explicitly because a programmatic click does not.
function moveTabFocus(list, direction) {
  const tabs = $$('[role="tab"]', list);
  const index = tabs.indexOf(document.activeElement);
  if (tabs.length < 2 || index < 0) return null;
  const next = tabs[(index + (direction === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
  next.focus();
  next.click();
  return next;
}

function updateDraftActions() {
  // The publish bar belongs to the relief sub tab: on the absence sub tab it would offer to
  // publish a list the admin is not looking at.
  $("#reliefActions").classList.toggle("hidden", !currentDrafts.length || reliefTab !== "relief");
  const filled = currentDrafts.filter((item) => item.replacementTeacherId).length;
  $("#draftCount").textContent = `${filled}/${currentDrafts.length} relief ditetapkan`;
}

// Parent sub tab of the relief screen: "ketiadaan" (who is away) or "relief" (the cover plan).
function setReliefTab(name) {
  reliefTab = ["ketiadaan","relief"].includes(name) ? name : "ketiadaan";
  $("#absenceBlock")?.classList.toggle("hidden", reliefTab !== "ketiadaan");
  $("#reliefBlock")?.classList.toggle("hidden", reliefTab !== "relief");
  $$("[data-relief-tab]").forEach((button) => {
    const active = button.dataset.reliefTab === reliefTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  updateDraftActions();
}

function renderAbsences() {
  // One date for the whole screen: the relief list and the absence list always describe the day
  // selected in the header.
  const date = $("#reliefDate").value || todayIso();
  $("#reliefDate").value = date;
  const list = db.absences.filter((item) => item.date === date && item.status !== "cancelled");
  $("#absenceList").innerHTML = list.length ? list.map((item) => {
    const teacher = teacherById(item.teacherId);
    return `<article class="absence-card"><div><h3>${esc(teacher?.name || "Guru tidak ditemui")}</h3><p>${admin ? esc(item.reason || "Tiada sebab dinyatakan") + " · " : ""}${item.allDay ? "Sepanjang hari" : `Waktu ${(item.periods || []).join(", ")}`}</p></div><button class="mini-button delete admin-only" data-cancel-absence="${esc(item.id)}" title="Padam rekod ini">🗑</button>>×</button></article>`;
  }).join("") : `<div class="empty-state"><strong>Tiada rekod</strong>Tiada guru direkodkan tidak hadir pada ${formatDate(date)}.</div>`;
  $$('[data-cancel-absence]').forEach((button) => button.addEventListener("click", () => deleteAbsenceRecord(button.dataset.cancelAbsence)));
}

// A teacher a Personel MySTEP has taken over completely is hidden everywhere.
function activeTeachers() { const hidden = coverageHiddenIds(db); return db.teachers.filter((teacher) => teacher.active && !hidden.has(teacher.id)).sort((a, b) => a.name.localeCompare(b.name, "ms")); }
function teacherOptions(selected = "") { return activeTeachers().map((teacher) => `<option value="${esc(teacher.id)}" ${teacher.id === selected ? "selected" : ""}>${esc(teacher.name)}</option>`).join(""); }

function tahunKelas(nama) {
  const padan = String(nama || "").match(/\d+/);
  const tahun = padan ? Number(padan[0]) : 99;
  return tahun >= 1 && tahun <= 6 ? tahun : 99;
}
function bandingNamaKelas(a, b) {
  return tahunKelas(a) - tahunKelas(b) || String(a).localeCompare(String(b), "ms", {numeric:true, sensitivity:"base"});
}
function renderTeacherLists() {
  const absence = $("#absenceTeacher");
  const schedule = $("#scheduleTeacher");
  const selectedAbsence = absence.value;
  const selectedSchedule = schedule.value;
  absence.innerHTML = `<option value="">Pilih guru</option>${teacherOptions(selectedAbsence)}`;
  const byClass = admin && $("#scheduleType").value === "class";
  $("#scheduleEntityLabel").textContent = byClass ? "Kelas" : "Guru";
  schedule.innerHTML = byClass ? `<option value="">Pilih kelas</option>${[...new Set(db.schedule.map(r=>r.className).filter(Boolean))].sort(bandingNamaKelas).map(name=>`<option value="${esc(name)}" ${selectedSchedule===name?'selected':''}>${esc(name)}</option>`).join('')}` : `<option value="">Pilih guru</option>${teacherOptions(selectedSchedule)}`;
}

function initials(name) { return String(name).split(" ").filter((word) => !["BIN", "BINTI"].includes(word)).slice(0, 2).map((word) => word[0]).join(""); }

function renderTeachers() {
  if (!admin) {$("#teacherList").innerHTML="";return;}
  const query = $("#teacherSearch").value.trim().toUpperCase();
  const teachers = activeTeachers().filter((teacher) => !query || `${teacher.name} ${teacher.position}`.includes(query));
  $("#teacherList").innerHTML = teachers.map((teacher) => `<article class="teacher-card ${teacherReliefReady(teacher) ? "relief-eligible" : "relief-excluded"}">
    <button type="button" class="teacher-card-toggle" data-toggle-relief="${esc(teacher.id)}" aria-pressed="${teacherReliefReady(teacher)}" title="Tukar kelayakan relief ${esc(teacher.name)}">
      <span class="avatar">${esc(initials(teacher.name))}</span><span class="teacher-card-copy"><span class="teacher-name">${esc(teacher.name)}</span><span class="teacher-status">${esc(teacher.position)} · ${esc(teacherReliefStatus(teacher))}</span>${coverLine(teacher)}</span>
    </button>
    <div class="teacher-actions"><button class="mini-button" data-edit-teacher="${esc(teacher.id)}" title="Ubah">✎</button><button class="mini-button delete" data-delete-teacher="${esc(teacher.id)}" title="Padam">×</button></div>
  </article>`).join("");
  $$('[data-toggle-relief]').forEach((button) => button.addEventListener("click", () => toggleTeacherReliefEligibility(button.dataset.toggleRelief)));
  $$('[data-edit-teacher]').forEach((button) => button.addEventListener("click", () => openTeacherDialog(button.dataset.editTeacher)));
  $$('[data-delete-teacher]').forEach((button) => button.addEventListener("click", () => removeTeacherRecord(button.dataset.deleteTeacher)));
}

// A reset can empty the directory while the timetable survives, and then nothing can be matched:
// the notice carries the way out, so an empty list never looks like a broken import.
function renderTeacherRestoreNotices() {
  const empty = admin && !db.teachers.length;
  $$('.teacher-restore-notice').forEach((notice) => notice.classList.toggle('hidden', !empty));
}

async function restoreTeacherProfiles() {
  if (!requireAdmin()) return;
  if (!confirm('Pulihkan senarai guru asal sekolah? Guru yang masih ada tidak akan diubah dan jadual sedia ada tidak disentuh.')) return;
  const saved = await remoteWrite("restoreTeachers", { confirm: "PULIH" }, "");
  if (!saved) return;
  await syncData(false);
  toast(`Senarai guru dipulihkan: ${db.teachers.length} guru. Import PDF kini boleh memadankan nama.`, "success");
}

// ===== Tetapan jadual Guru Pemulihan =====
// A remedial teacher's week is blocked by "masa tetapan" periods that belong to no class. The card
// opens that teacher's own week and the admin touches the empty spaces; each touched cell becomes a
// duty row in the active version, which is exactly how the builder's fixed activities block relief.
let settingTeacherId = "";
let settingSelection = new Set();
// Saving a version rewrites all of its rows, so the dialog remembers what the version looked like
// when it opened. Anything else changing that version means the admin must look again first.
let settingGuard = null;

function settingVersion() {
  return officialScheduleVersion(db) || selectedScheduleVersion(db, todayIso());
}

function settingVersionRows(version) {
  return (db.schedule || []).filter((row) => row.versionId === version?.id);
}

function settingVersionSignature(version) {
  return version ? settingSignature({ rows: db.schedule, versionId: version.id }) : "";
}

function openSettingDialog(id) {
  if (!requireAdmin()) return;
  const teacher = teacherById(id);
  if (!teacher) return;
  const version = settingVersion();
  if (!version) return toast("Belum ada jadual aktif. Import atau aktifkan jadual dahulu.", "error");
  settingTeacherId = id;
  settingSelection = new Set(settingSelectionFromRows({ rows: settingVersionRows(version), teacherId: id }));
  settingGuard = { revision: Number(db.revision || 0), versionId: version.id, signature: settingVersionSignature(version) };
  $("#settingDialogTitle").textContent = `Tetapan jadual · ${teacher.name}`;
  renderSettingGrid();
  $("#settingDialog").showModal();
}

function renderSettingGrid() {
  const version = settingVersion();
  const model = settingGridModel({ rows: settingVersionRows(version), teacherId: settingTeacherId, periods: PERIODS });
  // A period that has become a lesson cannot stay claimed: the claim could never be honoured.
  for (const key of [...settingSelection]) {
    const cell = model.cells.find((item) => settingKey(item.day, item.period) === key);
    if (!cell || cell.state === "lesson") settingSelection.delete(key);
  }
  const label = SETTING_SUBJECT.charAt(0) + SETTING_SUBJECT.slice(1).toLowerCase();
  const head = `<tr><th scope="col">Hari</th>${model.periods.map((number) => {
    const time = PERIODS.find((period) => Number(period.period) === number);
    return `<th scope="col"><span>${number}</span><small>${esc(time?.startTime || "")}</small></th>`;
  }).join("")}</tr>`;
  const body = model.cells.length ? model.days.map((day) => `<tr><th scope="row">${esc(settingDayName(day))}</th>${model.periods.map((number) => {
    const cell = model.cells.find((item) => item.day === day && item.period === number);
    const key = settingKey(day, number);
    if (cell.state === "lesson") return `<td class="setting-cell lesson" title="${esc(`${cell.subject} ${cell.className}`.trim())}"><strong>${esc(cell.subject)}</strong><small>${esc(cell.className || "Kelas")}</small></td>`;
    const chosen = cell.state === "setting" || settingSelection.has(key);
    return `<td class="setting-cell ${chosen ? "chosen" : "free"}" data-setting-cell="${key}" role="button" tabindex="0" aria-pressed="${chosen}" title="${chosen ? "Buang tanda" : "Tanda sebagai masa pemulihan"}">${chosen ? `<strong>${esc(label)}</strong><small>tekan untuk buang</small>` : "<small>kosong</small>"}</td>`;
  }).join("")}</tr>`).join("") : "";
  $("#settingGrid").innerHTML = `<table class="setting-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  $$("#settingGrid [data-setting-cell]").forEach((cell) => {
    cell.addEventListener("click", () => toggleSettingCell(cell.dataset.settingCell));
    cell.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleSettingCell(cell.dataset.settingCell);
    });
  });
  $("#settingCount").textContent = settingSelection.size
    ? `${settingSelection.size} waktu ${label.toLowerCase()} ditanda.`
    : `Belum ada waktu ${label.toLowerCase()} ditanda.`;
}

function toggleSettingCell(key) {
  if (settingSelection.has(key)) settingSelection.delete(key);
  else settingSelection.add(key);
  renderSettingGrid();
}

function clearSettingSlots() {
  settingSelection = new Set();
  renderSettingGrid();
}

// Saving rewrites every row of the version in Sheets, so a stale dialog must never win: the school
// revision is checked first and, when it moved, the version this dialog saw is compared with the
// fresh one before anything is written.
async function settingDriftCheck(version) {
  if (!api.isConfigured()) return { ok: true };
  const expected = settingGuard || { revision: Number(db.revision || 0), versionId: version.id, signature: settingVersionSignature(version) };
  try {
    const status = await api.status();
    if (Number(status.revision || 0) === Number(expected.revision)) return { ok: true };
    await syncData(false);
    const fresh = settingVersion();
    const freshSignature = settingVersionSignature(fresh);
    settingGuard = { revision: Number(db.revision || 0), versionId: fresh?.id || "", signature: freshSignature };
    if (fresh && fresh.id === version.id && freshSignature === expected.signature) return { ok: true };
    renderSettingGrid();
    return { ok: false, reason: `Jadual ini sudah berubah pada pentadbir atau peranti lain. Data terkini sudah dimuatkan — semak ${settingSelection.size} tanda tuan, kemudian tekan Simpan sekali lagi.` };
  } catch (error) {
    return { ok: false, reason: `Tidak dapat mengesahkan jadual terkini (${error.message}). Simpanan tidak dibuat supaya perubahan pentadbir lain tidak hilang.` };
  }
}

async function saveSettingSlots() {
  if (!requireAdmin()) return;
  const version = settingVersion();
  if (!version) return toast("Belum ada jadual aktif. Import atau aktifkan jadual dahulu.", "error");
  const button = $("#saveSettingSlots");
  if (button.disabled) return;
  button.disabled = true;
  try {
    const check = await settingDriftCheck(version);
    if (!check.ok) return toast(check.reason, "error");
    const active = settingVersion();
    if (!active) return toast("Belum ada jadual aktif. Import atau aktifkan jadual dahulu.", "error");
    const teacher = teacherById(settingTeacherId);
    const result = mergeSettingRows({ rows: db.schedule, teacherId: settingTeacherId, versionId: active.id, selected: [...settingSelection], periods: PERIODS });
    db.schedule = result.rows;
    settingGuard = { revision: Number(db.revision || 0), versionId: active.id, signature: settingVersionSignature(active) };
    persist();
    renderAll();
    $("#settingDialog").close();
    // The Sheets handler rewrites every row of the version, so the whole version travels with it.
    const versionRows = db.schedule.filter((row) => row.versionId === active.id);
    remoteWrite("importSchedule", { version: active, rows: versionRows },
      `${result.added} waktu tetapan disimpan untuk ${teacher?.name || "guru ini"}.`);
  } finally { button.disabled = false; }
}

function validClockTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

function teacherReliefReady(teacher) {
  return !!teacher.reliefEligible && (teacher.position !== "Guru Prasekolah" || validClockTime(teacher.preschoolEndTime));
}

function teacherReliefStatus(teacher) {
  if (!teacher.reliefEligible) return "Dikecualikan";
  if (teacher.position === "Guru Prasekolah" && !validClockTime(teacher.preschoolEndTime)) return "Dikecualikan · tetapkan masa tamat";
  return teacher.position === "Guru Prasekolah" ? `Layak relief selepas ${teacher.preschoolEndTime}` : "Layak relief";
}

function toggleTeacherReliefEligibility(id) {
  if (!requireAdmin()) return;
  const teacher = teacherById(id);
  if (!teacher) return;
  if (teacher.position === "Guru Prasekolah" && !validClockTime(teacher.preschoolEndTime)) {
    openTeacherDialog(id);
    $("#teacherEligible").checked = true;
    toast("Tetapkan masa tamat sesi prasekolah sebelum melayakkan guru ini.", "info");
    return;
  }
  teacher.reliefEligible = !teacher.reliefEligible;
  teacher.updatedAt = new Date().toISOString();
  persist();
  renderAll();
  remoteWrite("saveTeacher", teacher, teacher.reliefEligible ? "Guru layak menerima relief." : "Guru dikecualikan daripada relief.");
}

// The covering teacher's card names who they replace, so the link is visible without opening the dialog.
function coverLine(teacher) {
  const label = coverageLabel({ teachers: db.teachers, teacherId: teacher.id });
  return label ? `<span class="cover-line">Menggantikan ${esc(label)}</span>` : "";
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
  // Lessons taken over by a Personel MySTEP/practical teacher are shown under that teacher.
  const versionRows = version ? effectiveScheduleRows(db).filter(row => row.versionId === version.id) : [];
  const rows = versionRows.filter(row => matches(row) && row.day === day);
  if (!version || !teacherId || !versionRows.some(row => matches(row))) {
    $("#scheduleGrid").innerHTML = `<div class="empty-state"><strong>${!version ? "Belum ada jadual aktif" : !teacherId ? "Pilih guru atau kelas untuk melihat jadual" : "Tiada rekod jadual untuk pilihan ini"}</strong>${admin ? 'Bina jadual atau import PDF aSc untuk bermula.' : 'Jadual akan tersedia selepas diterbitkan oleh admin.'}</div>`;
    return;
  }
  $("#scheduleGrid").innerHTML = PERIODS.map((period) => {
    const row = rows.find((item) => Number(item.period) === period.period);
    const storedTime = row?.startTime || versionRows.find(r => r.day === day && Number(r.period) === period.period)?.startTime;
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
  currentDrafts = buildReliefDrafts(db, date);saveDrafts();
  generatedReliefKey = reliefInputKey();
  persist(); $("#absenceDialog").close(); renderAll();
  showView("hari-ini");
  document.getElementById("absenceBlock")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  currentDrafts = currentDrafts.filter((draft) => !reliefMatchesAbsence(draft, result.absence));saveDrafts();
  generatedReliefKey = "";
  persist(); renderAll();
  const message = result.reliefs.length
    ? `Rekod dibatalkan bersama ${result.reliefs.length} relief berkaitan.`
    : "Rekod ketiadaan dibatalkan.";
  remoteWrite("cancelAbsence", { id, updatedAt }, message);
}

function populatePreschoolReliefTimes(selected = "") {
  const select = $("#teacherPreschoolEndTime");
  const version = officialScheduleVersion(db) || selectedScheduleVersion(db, todayIso());
  const rows = version ? db.schedule.filter((row) => row.versionId === version.id) : [];
  const times = PERIODS.filter((period) => period.period > 0).map((period) => {
    const stored = rows.find((row) => Number(row.period) === period.period && row.startTime)?.startTime;
    return { period: period.period, startTime: clockValue(stored, period.period, "startTime") };
  }).filter((item, index, all) => item.startTime && all.findIndex((other) => other.startTime === item.startTime) === index);
  select.innerHTML = `<option value="">Pilih waktu mula relief</option>${times.map((item) => `<option value="${esc(item.startTime)}">Waktu ${item.period} · ${esc(item.startTime)}</option>`).join("")}`;
  const chosen = times.some((item) => item.startTime === selected)
    ? selected
    : times.find((item) => validClockTime(selected) && item.startTime >= selected)?.startTime || "";
  select.value = chosen;
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
  toggleTeacherSettingButton();
  populatePreschoolReliefTimes(teacher?.preschoolEndTime || "");
  togglePreschoolEndTime();
  coverDraft = coverList(teacher || {}).map((entry) => ({ teacherId: entry.teacherId, all: !entry.subjects.length, subjects: entry.subjects }));
  renderTeacherCover();
  $("#teacherEligible").checked = teacher?.reliefEligible ?? true;
  $("#teacherDialog").showModal();
}

// The remedial teacher's week is set up from the profile dialog, not from the card face: only a
// saved teacher whose jawatan is "Guru Pemulihan" can claim setting periods.
function toggleTeacherSettingButton() {
  const teacher = db.teachers.find((item) => item.id === $("#teacherId").value);
  $("#teacherSettingSlots").classList.toggle("hidden", !teacher || currentTeacherPosition() !== "Guru Pemulihan");
}

function currentTeacherPosition() {
  return $('#teacherPosition').value === '__other__' ? $('#teacherPositionOther').value.trim() : $('#teacherPosition').value;
}

// The replace-a-teacher controls apply to Personel MySTEP and Guru Praktikal. A practical teacher
// may share the lessons of more than one teacher, so the dialog works on a list of rows.
let coverDraft = [];

function renderTeacherCover() {
  const wrap = $('#teacherCoverWrap');
  if (!canCover({ position: currentTeacherPosition() })) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  renderCoverRows();
}

function coverRowsHtml() {
  const selfId = $('#teacherId').value;
  const takenByOthers = new Set(coverLinks(db.teachers).filter((link) => link.coveringId !== selfId).map((link) => link.coveredId));
  if (!coverDraft.length) coverDraft.push({ teacherId: "", all: true, subjects: [] });
  return coverDraft.map((entry, index) => {
    // The teacher being replaced is hidden from the rest of the app but must stay selectable here.
    const options = db.teachers.filter((teacher) => teacher.active && teacher.id !== selfId && (!takenByOthers.has(teacher.id) || teacher.id === entry.teacherId));
    const subjects = entry.teacherId ? coveredTeacherSubjects(db.schedule, entry.teacherId) : [];
    return `<div class="cover-row" data-index="${index}">
      <select class="cover-teacher" aria-label="Guru diganti">${`<option value="">— pilih guru diganti —</option>`}${options.map((teacher) => `<option value="${esc(teacher.id)}" ${teacher.id === entry.teacherId ? "selected" : ""}>${esc(teacher.name)}</option>`).join("")}</select>
      <button type="button" class="mini-button delete cover-remove" title="Buang baris ini">×</button>
      ${entry.teacherId ? `<label class="check-row"><input type="checkbox" class="cover-all" ${entry.all ? "checked" : ""}> Semua jadual</label>
      <div class="chip-row">${subjects.length
        ? subjects.map((subject) => `<label class="chip"><input type="checkbox" class="cover-subject" value="${esc(subject)}" ${entry.all || entry.subjects.includes(subject.toUpperCase()) ? "checked" : ""} ${entry.all ? "disabled" : ""}> ${esc(subject)}</label>`).join("")
        : `<small>Guru ini belum ada subjek dalam jadual.</small>`}</div>` : ""}
    </div>`;
  }).join("");
}

function renderCoverRows() {
  $('#teacherCoverRows').innerHTML = coverRowsHtml();
  $$('#teacherCoverRows .cover-teacher').forEach((select) => select.addEventListener('change', () => {
    syncCoverDraft();
    const index = Number(select.closest('.cover-row').dataset.index);
    const coveredId = select.value;
    // A fresh choice starts from the whole timetable of that teacher.
    const subjects = coveredTeacherSubjects(db.schedule, coveredId);
    coverDraft[index] = { teacherId: coveredId, all: true, subjects };
    renderCoverRows();
  }));
  $$('#teacherCoverRows .cover-all').forEach((box) => box.addEventListener('change', () => { syncCoverDraft(); renderCoverRows(); }));
  $$('#teacherCoverRows .cover-subject').forEach((box) => box.addEventListener('change', syncCoverDraft));
  $$('#teacherCoverRows .cover-remove').forEach((button) => button.addEventListener('click', () => {
    syncCoverDraft();
    coverDraft.splice(Number(button.closest('.cover-row').dataset.index), 1);
    if (!coverDraft.length) coverDraft.push({ teacherId: "", all: true, subjects: [] });
    renderCoverRows();
  }));
}

// Reads the rendered rows back into the draft, so adding or removing a row never loses typing.
function syncCoverDraft() {
  const rows = $$('#teacherCoverRows .cover-row');
  if (!rows.length) return;
  coverDraft = rows.map((row) => {
    const all = row.querySelector('.cover-all')?.checked ?? true;
    const subjects = $$('.cover-subject', row).filter((box) => box.checked).map((box) => box.value.toUpperCase());
    return { teacherId: row.querySelector('.cover-teacher').value, all, subjects };
  });
}

function coverDraftEntries() {
  return coverDraft
    .filter((entry) => entry.teacherId)
    .map((entry) => ({ teacherId: entry.teacherId, subjects: entry.all ? [] : entry.subjects }));
}

// ===== Padam sebenar: apa yang dibuang di paparan mesti hilang dari Sheets =====
// A record the admin deletes is removed here and on the server, so the next refresh never brings it
// back. A deleted absence takes its relief rows with it: a relief that points at a record which no
// longer exists is worse than no record at all.
function deleteAbsenceRecord(id) {
  if (!requireAdmin()) return;
  const item = db.absences.find((absence) => absence.id === id);
  if (!item) return;
  const name = teacherById(item.teacherId)?.name || "guru";
  const related = db.reliefs.filter((relief) => String(relief.date) === String(item.date) && String(relief.absentTeacherId) === String(item.teacherId));
  if (!confirm(`Padam rekod ketiadaan ${name} pada ${formatDate(item.date)}?\n\nRekod ini akan dibuang dari Google Sheets juga${related.length ? `, bersama ${related.length} relief berkaitan` : ""}.`)) return;
  db.reliefs = db.reliefs.filter((relief) => !(String(relief.date) === String(item.date) && String(relief.absentTeacherId) === String(item.teacherId)));
  db.absences = db.absences.filter((absence) => absence.id !== id);
  currentDrafts = currentDrafts.filter((draft) => !(String(draft.date) === String(item.date) && String(draft.absentTeacherId) === String(item.teacherId)));
  generatedReliefKey = "";
  saveDrafts(); cacheAdminDb(); persist(); renderAll();
  remoteWrite("deleteAbsence", { id }, `Rekod dipadam dari Sheets${related.length ? ` bersama ${related.length} relief` : ""}.`);
}

// A teacher with timetable rows, absences or relief history cannot vanish without leaving records
// that point at nobody, so those are archived instead and the reason is spelled out.
function removeTeacherRecord(id) {
  if (!requireAdmin()) return;
  const teacher = db.teachers.find((item) => item.id === id);
  if (!teacher) return;
  const rows = db.schedule.filter((row) => row.teacherId === id).length;
  const absences = db.absences.filter((row) => row.teacherId === id).length;
  const reliefs = db.reliefs.filter((row) => row.absentTeacherId === id || row.replacementTeacherId === id).length;
  if (rows || absences || reliefs) {
    toast(`Guru ini masih ada ${rows} waktu jadual, ${absences} rekod ketiadaan dan ${reliefs} rekod relief — dinyahaktifkan supaya sejarah tidak rosak.`, "info");
    return archiveTeacher(id);
  }
  if (!confirm(`Padam profil ${teacher.name}? Profil ini akan hilang dari Google Sheets.`)) return;
  db.teachers = db.teachers.filter((item) => item.id !== id);
  cacheAdminDb(); persist(); renderAll();
  remoteWrite("deleteTeacher", { id }, "Profil guru dipadam dari Sheets.");
}

function wireDataTools() {
  $("#archiveTimetables").addEventListener("click", () => {
    if (!requireAdmin()) return;
    const old = db.scheduleVersions.filter((version) => version.status !== "active" && version.status !== "archived");
    if (!old.length) return toast("Tiada jadual lama untuk diarkibkan.", "info");
    if (!confirm(`Arkibkan ${old.length} versi jadual lama? Ia tidak lagi digunakan untuk relief tetapi kekal di Sheets.`)) return;
    old.forEach((version) => { version.status = "archived"; });
    cacheAdminDb(); persist(); renderAll();
    remoteWrite("archiveVersions", { ids: old.map((version) => version.id) }, `${old.length} jadual lama diarkibkan.`);
  });
  $("#deleteArchived").addEventListener("click", async () => {
    if (!requireAdmin()) return;
    const archived = db.scheduleVersions.filter((version) => version.status === "archived");
    if (!archived.length) return toast("Tiada jadual diarkib untuk dipadam.", "info");
    if (!confirm(`Padam ${archived.length} jadual yang diarkib? Ini membuang barisnya dari Sheets dan tidak boleh dibatalkan.`)) return;
    await remoteWrite("archiveVersions", { ids: archived.map((version) => version.id), remove: true }, "Jadual yang diarkib dipadam.");
    await syncData(false);
  });
  $("#resetData").addEventListener("click", async () => {
    if (!requireAdmin()) return;
    const targets = {};
    $$(".reset-target").forEach((box) => { if (box.checked) targets[box.value] = true; });
    const chosen = Object.keys(targets);
    if (!chosen.length) return toast("Tandakan sekurang-kurangnya satu jenis data.", "error");
    if ($("#resetConfirm").value.trim() !== "PADAM") return toast("Taip PADAM dalam kotak pengesahan.", "error");
    const label = { teachers: "profil guru", absences: "rekod ketiadaan", reliefs: "rekod relief", timetable: "jadual waktu", builder: "draf pembina" };
    if (!confirm(`Reset ${chosen.map((key) => label[key]).join(", ")}?\n\nData ini dibuang dari Google Sheets dan dari aplikasi ini. Tidak boleh dibatalkan.`)) return;
    $("#resetNotice").textContent = "Mereset…";
    const ok = await remoteWrite("resetData", { targets, confirm: "PADAM" }, "Data terpilih telah dibuang dari Sheets.");
    if (ok) { $("#resetConfirm").value = ""; $$(".reset-target").forEach((box) => { box.checked = false; }); await syncData(false); $("#resetNotice").textContent = "Selesai. Susunan data dikemas kini."; }
    else $("#resetNotice").textContent = "Reset gagal — data tidak berubah.";
  });
}

function saveTeacherRecord(event) {
  event.preventDefault();
  if (!requireAdmin()) return;
  const existingId = $("#teacherId").value;
  const name = $("#teacherName").value.trim().toUpperCase();
  const position=$('#teacherPosition').value==='__other__'?$('#teacherPositionOther').value.trim():$('#teacherPosition').value;
  const now = new Date().toISOString();
  const preschoolEndTime = position === "Guru Prasekolah" ? $("#teacherPreschoolEndTime").value : "";
  if (!name) return toast("Nama guru diperlukan.", "error");
  if (!position) return toast("Jawatan guru diperlukan.", "error");
  if (position === "Guru Prasekolah" && !validClockTime(preschoolEndTime)) return toast("Tetapkan masa tamat sesi prasekolah.", "error");
  if (db.teachers.some((teacher) => teacher.active && teacher.name === name && teacher.id !== existingId)) return toast("Nama guru ini sudah wujud.", "error");
  if (canCover({ position })) {
    syncCoverDraft();
    if (coverDraft.some((entry) => entry.teacherId && !entry.all && !entry.subjects.length)) return toast("Pilih sekurang-kurangnya satu subjek, atau tandakan “Semua jadual”.", "error");
  }
  const covers = canCover({ position }) ? coverDraftEntries() : [];
  const teacher = {
    id: existingId || `g-${slug($("#teacherShortName").value)}-${Date.now().toString(36)}`,
    name,
    shortName: $("#teacherShortName").value.trim().toUpperCase(),
    position,
    priority: db.teachers.find(item=>item.id===existingId)?.priority || 3,
    reliefEligible: $("#teacherEligible").checked,
    preschoolEndTime,
    coversJson: covers.length ? JSON.stringify(covers) : "",
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

function togglePreschoolEndTime() {
  const position = currentTeacherPosition();
  const preschool = position === "Guru Prasekolah";
  $("#teacherPreschoolEndWrap").classList.toggle("hidden", !preschool);
  $("#teacherPreschoolEndTime").required = preschool;
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
  db.reliefs.push(...records); currentDrafts=[]; generatedReliefKey=''; saveDrafts(); persist(); renderAll();
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
  if (!importResult.rows.length) return toast(db.teachers.length
    ? "Tiada halaman guru yang dipadankan. Pilih sekurang-kurangnya seorang guru secara manual."
    : "Tiada profil guru dalam sistem. Buka menu Guru, tekan “Pulihkan senarai guru asal”, kemudian baca PDF ini semula.", "error");
  const version = { id: uuid("v"), label, effectiveDate, sourceName: $("#pdfFile").files[0]?.name || "PDF", status: $("#activateVersion").checked ? "active" : "draft", createdAt: new Date().toISOString() };
  if (version.status === "active") db.scheduleVersions.forEach((item) => { if (item.status === "active") item.status = "superseded"; });
  const rows = importResult.rows.map((row) => ({ ...row, versionId: version.id }));
  db.scheduleVersions.push(version); db.schedule.push(...rows); persist(); renderAll(); setScheduleMode("relief"); showView("jadual");
  remoteWrite("importSchedule", { version, rows }, `${rows.length} slot jadual disimpan.`);
}

function remoteWrite(action, data, successMessage) {
  if (!admin) return Promise.resolve(false);
  const entry={id:uuid("w"),action,data:structuredClone(data),queuedAt:new Date().toISOString()};
  writeOutbox.push(entry);
  // Save both the command and the optimistic database before starting the slow network request.
  saveWriteOutbox();cacheAdminDb();
  return sendStoredWrite(entry,successMessage);
}

function sendStoredWrite(entry, successMessage = "") {
  const client=new ApiClient({...config});client.token=api.token;
  const action=entry.action,payload=structuredClone(entry.data);
  const queuedToken=api.token;
  pendingWrites+=1;updateConnectionUi();
  const run=async()=>{
    try {
      const result=await client.write(action,payload);
      writeOutbox=writeOutbox.filter((item) => item.id !== entry.id);saveWriteOutbox();
      if(admin&&api.token===queuedToken) {
        db.revision=Math.max(Number(db.revision||0),Number(result.revision||0));
        db.updatedAt=result.updatedAt||db.updatedAt;confirmedDb=structuredClone(db);persist();
      }
      if(successMessage) toast(successMessage,"success");
      return true;
    } catch(error) {
      failedWrites=Math.max(failedWrites,1);
      toast(`Perubahan sudah disimpan pada peranti tetapi belum sampai ke Sheets. Akan dicuba semula. ${error.message}`,"error");
      if(error.code==='AUTH_REQUIRED'&&admin&&api.token===queuedToken) setTimeout(()=>leaveAdmin(),0);
      return false;
    } finally {
      pendingWrites-=1;
      if(!pendingWrites) failedWrites=writeOutbox.length;
      updateConnectionUi();
    }
  };
  const operation=writeQueue.then(run,run);
  writeQueue=operation.then(()=>undefined,()=>undefined);
  return operation;
}

function retryStoredWrites() {
  if(!admin||!navigator.onLine||!writeOutbox.length) return Promise.resolve(!writeOutbox.length);
  failedWrites=0;updateConnectionUi();
  return Promise.all([...writeOutbox].map((entry) => sendStoredWrite(entry))).then((results) => results.every(Boolean));
}

async function syncData(showSuccess = true) {
  if (!api.isConfigured()) return showSuccess && toast("Sambungan Apps Script belum tersedia. Log keluar dan login semula.");
  if(syncPromise) return syncPromise;
  if(pendingWrites) return showSuccess&&toast("Penghantaran ke Sheets sedang berjalan di belakang.");
  if(admin&&writeOutbox.length) {
    const saved=await retryStoredWrites();
    if(!saved) return showSuccess&&toast("Perubahan masih selamat pada peranti dan akan dicuba semula.","error");
  }
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
  if(document.hidden||!navigator.onLine||!api.isConfigured()||pendingWrites||syncPromise) return;
  if(admin&&writeOutbox.length) {
    const saved=await retryStoredWrites();
    if(!saved) return;
  }
  if(failedWrites) return;
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
    currentDrafts=buildReliefDrafts(db,date);generatedReliefKey=reliefInputKey();saveDrafts();renderDashboard();
    toast(currentDrafts.length?`${currentDrafts.length} slot relief dijana. Semak sebelum terbitkan.`:reliefEmptyMessage(date));
  });
  wireAdminEvents();wireDataTools();
  $("#reliefDate").addEventListener("change",()=>{renderDashboard();renderAbsences();});
  $("#scheduleType").addEventListener("change",()=>{renderTeacherLists();renderSchedule();});
  $("#builderSection").addEventListener("change", event => window.jadualBuilder.go(event.target.value));
  document.addEventListener("builder-view", event => { $("#builderSection").value = event.detail; });
  $$('[data-builder-open]').forEach(button => button.addEventListener("click", async () => {
    if (!requireAdmin() || builderOpening) return;
    // Same rule as the tab: answer the press by switching, then load, and report while waiting.
    setScheduleMode("generator"); showView("jadual"); setBuilderBusy(true, button);
    try { await ensureBuilder(); window.jadualBuilder.go(button.dataset.builderOpen); }
    catch (error) { showBuilderFailure(error); }
    finally { setBuilderBusy(false, button); }
  }));
  $("#syncBuilderTeachers").addEventListener("click", () => { const count = window.jadualBuilder.mergeTeachers(db.teachers); toast(`${count} profil guru diselaraskan. Semak agihan guru sebelum menjana.`, "success"); });
  $("#useBuilderSchedule").addEventListener("click", previewBuilderSchedule);
  $("#confirmBuilderPublish").addEventListener("click", publishBuilderSchedule);
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $$('[data-schedule-mode]').forEach((button) => button.addEventListener("click", async () => {
    const mode = button.dataset.scheduleMode;
    if (mode !== "generator") { setScheduleMode(mode); return; }
    if (!requireAdmin() || builderOpening) return;
    // The pane answers the press before the builder script and the Sheets round trip start.
    setScheduleMode(mode);
    setBuilderBusy(true, button);
    try { await ensureBuilder(); }
    catch (error) {
      // The builder is what was asked for, so the pane stays and says why it is empty: switching
      // the tab back would pull the screen out from under the press.
      showBuilderFailure(error);
    }
    finally { setBuilderBusy(false, button); }
  }));
  $$('[data-open-absence]').forEach((button) => button.addEventListener("click", openAbsenceDialog));
  $("#mobileSettings").addEventListener("click", () => showView("tetapan"));

  $("#absenceAllDay").addEventListener("change", (event) => $("#periodPicker").classList.toggle("hidden", event.target.checked));
  $("#absenceForm").addEventListener("submit", saveAbsenceRecord);
  $$('[data-close-absence]').forEach(button=>button.addEventListener('click',()=>$('#absenceDialog').close()));
  $("#addTeacher").addEventListener("click", () => openTeacherDialog());
  $("#teacherForm").addEventListener("submit", saveTeacherRecord);
  $('#teacherPosition').addEventListener('change',()=>{toggleTeacherPositionOther();togglePreschoolEndTime();renderTeacherCover();toggleTeacherSettingButton();});
  $('#teacherPositionOther').addEventListener('input',()=>{renderTeacherCover();toggleTeacherSettingButton();});
  $('#teacherCoverAdd').addEventListener('click',()=>{ syncCoverDraft(); coverDraft.push({ teacherId:'', all:true, subjects:[] }); renderCoverRows(); });
  $$('[data-close-teacher]').forEach(button=>button.addEventListener('click',()=>$('#teacherDialog').close()));
  // The setting grid is opened from the profile, so the profile closes first instead of stacking dialogs.
  $('#teacherSettingSlots').addEventListener('click',()=>{
    const id=$('#teacherId').value;
    if(!id) return;
    $('#teacherDialog').close();
    openSettingDialog(id);
  });
  $('#downloadTeachers').addEventListener('click',()=>{
    if(!requireAdmin()) return;
    const url=URL.createObjectURL(new Blob([exportTeachers(db.teachers)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`Senarai-Guru-${todayIso()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('#uploadTeachers').addEventListener('click',()=>{if(requireAdmin()) $('#teacherFile').click();});
  $('#teacherFile').addEventListener('change',uploadTeacherDirectory);
  $$('[data-restore-teachers]').forEach((button) => button.addEventListener('click', restoreTeacherProfiles));
  $("#teacherSearch").addEventListener("input", renderTeachers);
  $("#scheduleTeacher").addEventListener("change", renderSchedule);
  $("#scheduleDay").addEventListener("change", renderSchedule);
  $("#publishRelief").addEventListener("click", publishReliefs);
  $("#printRelief").addEventListener("click", printReliefSheet);
  $("#exportReliefPdf").addEventListener("click", exportReliefPdf);
  $$('[data-relief-panel]').forEach((button) => button.addEventListener("click", () => setReliefPanel(button.dataset.reliefPanel)));
  $$('[data-close-setting]').forEach((button) => button.addEventListener("click", () => $("#settingDialog").close()));
  $("#saveSettingSlots").addEventListener("click", saveSettingSlots);
  $("#clearSettingSlots").addEventListener("click", clearSettingSlots);
  setReliefPanel(reliefPanel);
  $$('[data-relief-tab]').forEach((button) => button.addEventListener("click", () => setReliefTab(button.dataset.reliefTab)));
  // One arrow-key handler serves every tablist in the app (relief sub tabs, the view switch
  // inside Relief, and the timetable switch); each moves only its own tabs.
  $$('[role="tablist"]').forEach((list) => list.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    if (moveTabFocus(list, event.key)) event.preventDefault();
  }));
  setReliefTab(reliefTab);
  $("#pdfFile").addEventListener("change", (event) => {
    const file = event.target.files[0]; $("#fileName").textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "Maksimum 25 MB"; $("#parsePdf").disabled = !file;
    if (file) { const date = file.name.match(/(\d{2})[.\-_](\d{2})[.\-_](\d{4})/); if (date) { $("#effectiveDate").value = `${date[3]}-${date[2]}-${date[1]}`; $("#versionLabel").value = `Jadual ${date[1]}.${date[2]}.${date[3]}`; } }
  });
  $("#parsePdf").addEventListener("click", parsePdf);
  $("#saveImport").addEventListener("click", saveImportedSchedule);
  $("#syncButton").addEventListener("click", () => syncData(true));


  $("#checkUpdate").addEventListener("click", async () => { const registration = await navigator.serviceWorker?.getRegistration(); await registration?.update(); toast("Semakan kemas kini selesai.", "success"); });
  $("#installButton").addEventListener("click", async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("#installButton").classList.add("hidden"); });
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; $("#installButton").classList.remove("hidden"); });
  window.addEventListener("online", () => { updateConnectionUi(); if (config.autoSync) syncIfChanged(); });
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
  $("#effectiveDate").value = date;

  $("#appVersion").textContent = APP_VERSION;
  populatePeriodPicker(); wireEvents(); renderAll(); showView("hari-ini");
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
    await enterAdmin({...session});
  } catch(error) {
    if(error.code==='AUTH_REQUIRED') {
      await leaveAdmin(false);
      toast('Sesi tujuh hari telah tamat atau dibatalkan. Sila login semula.','error');
    } else {
      restoreAdminShell(session);updateConnectionUi();restoreDrafts();
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
// One promise for the whole open, shared by the warm-up and the press: two callers must never
// fetch the Sheets draft twice, and a failure must leave the next attempt free to try again.
let builderReadyPromise = null;
function ensureBuilder() {
  if (!builderReadyPromise) {
    builderReadyPromise = loadBuilder().catch((error) => { builderReadyPromise = null; throw error; });
  }
  return builderReadyPromise;
}
async function loadBuilder() {
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
  const stored = cachedAdminDb();
  const cached = stored && stored.data.revision ? stored.data : (db && db.revision ? db : null);
  admin=true;window.systemAdminActive=true;sessionExpiry=result.expiresAt;
  localStorage.setItem('jadual-admin-session',JSON.stringify({token:api.token,expiresAt:sessionExpiry}));
  document.body.classList.remove('public-mode');$('#loginButton').classList.add('hidden');
  $('#builderCloudStatus').textContent='Pembina akan dimuatkan apabila dibuka';
  $('#passwordNotice').textContent=result.mustChangePassword?'Kata laluan lalai sedang digunakan dan dibenarkan.':'';
  $('#loginDialog').close();$('#loginPassword').value='';
  // Show the admin screens straight away from what this device already has, then ask the server only
  // what changed: a matching revision comes back as a tiny "no change" answer, so a refresh no longer
  // waits on the whole database.
  if(cached) { db={...emptyDatabase(),...normalizeDatabaseTimes(cached)};confirmedDb=structuredClone(db);renderAll(); }
  if(writeOutbox.length && cached) {
    // Preserve the optimistic snapshot, replay its durable commands, then reconcile with Sheets.
    cacheAdminDb();restoreDrafts();builderCloudLoaded=false;builderDirty=false;
    retryStoredWrites().then((saved) => { if (saved) syncData(false); });
    return;
  }
  const since=Number(cached?.revision||0);
  const snapshot=result.snapshot||await api.bootstrap(since);
  if(snapshot.changed===false && cached) {
    db.revision=Number(snapshot.revision||db.revision);db.updatedAt=snapshot.updatedAt||db.updatedAt;confirmedDb=structuredClone(db);
  } else {
    db={...emptyDatabase(),...normalizeDatabaseTimes(snapshot.data)};confirmedDb=structuredClone(db);
  }
  cacheAdminDb();renderAll();
  restoreDrafts();
  builderCloudLoaded=false;builderDirty=false;
  if(writeOutbox.length) retryStoredWrites().then((saved) => { if (saved) syncData(false); });
}
async function leaveAdmin(remoteLogout=true) {
  const previous=api,finalWrites=writeQueue;admin=false;window.systemAdminActive=false;sessionExpiry=0;localStorage.removeItem('jadual-admin-session');localStorage.removeItem(ADMIN_DB_KEY);localStorage.removeItem(DRAFT_KEY);currentDrafts=[];generatedReliefKey='';
  document.body.classList.add('public-mode');$('#loginButton').classList.remove('hidden');
  restoringBuilder=true;window.jadualBuilder?.clear();restoringBuilder=false;builderDirty=false;builderCloudLoaded=false;
  importResult=null;$('#importReview').classList.add('hidden');$('#importRows').innerHTML='';$('#pdfFile').value='';
  $$('dialog').forEach(d=>{d.close();d.querySelector('form')?.reset();});
  db=loadDb();if(!db.revision) db.teachers=[];confirmedDb=structuredClone(db);$('#scheduleType').value='teacher';setScheduleMode('relief');showView('hari-ini');
  api=new ApiClient(config);await finalWrites;writeOutbox=[];failedWrites=0;saveWriteOutbox();if(remoteLogout) await previous.logout().catch(()=>{});await syncData(false);
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
    if(!requireAdmin()||!importResult?.rows.length||builderOpening) return;
    const pdfButton=$('#pdfToBuilder');
    setBuilderBusy(true,pdfButton);
    try {
      await ensureBuilder();
    } catch(error) { setBuilderBusy(false,pdfButton); showBuilderFailure(error); return; }
    setBuilderBusy(false,pdfButton);
    try {
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
  $('#logoutButton').addEventListener('click',()=>{if(builderDirty&&!confirm('Draf belum disimpan. Log keluar tanpa menyimpannya?')) return;if((pendingWrites||failedWrites)&&!confirm('Ada perubahan yang masih menunggu Google Sheets. Log keluar akan membuang salinan simpanan peranti itu. Teruskan?')) return;leaveAdmin();});
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
  if (!result.rows.some(row => !row.isDuty)) throw new Error(db.teachers.length
    ? "Tiada slot mengajar dengan guru yang dipadankan. Semak nama dalam tab Guru."
    : "Tiada profil guru dalam sistem. Buka menu Guru dan pulihkan senarai guru asal dahulu.");
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
