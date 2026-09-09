import { APP_VERSION, DAY_NAMES, INITIAL_TEACHERS, PERIODS, emptyDatabase, slug } from "./data.js";
import { ApiClient, loadConfig, saveConfig } from "./api.js";
import { buildReliefDrafts, dayCodeFromDate, validateReliefs } from "./relief-engine.js";
import { parseTeacherPdf } from "./pdf-import.js";
import { flushQueue, queueWrite } from "./storage.js";

const DB_KEY = "relief-skpr-db-v1";
const titleByView = { "hari-ini": "Hari ini", ketiadaan: "Ketiadaan", jadual: "Jadual", guru: "Guru", import: "Import PDF", tetapan: "Tetapan" };
let config = loadConfig();
let api = new ApiClient(config);
let db = loadDb();
let importResult = null;
let currentDrafts = [];
let deferredInstallPrompt = null;
let toastTimer = null;
let scheduleMode = localStorage.getItem("sistem-jadual-mode") || "generator";

function $(selector, root = document) { return root.querySelector(selector); }
function $$(selector, root = document) { return [...root.querySelectorAll(selector)]; }
function esc(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
function uuid(prefix) { return `${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`; }
function todayIso() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" }); }
function formatDate(value, options = { day: "numeric", month: "short", year: "numeric" }) { return new Intl.DateTimeFormat("ms-MY", options).format(new Date(`${value}T12:00:00`)); }
function teacherById(id) { return db.teachers.find((teacher) => teacher.id === id); }

function loadDb() {
  try {
    const stored = JSON.parse(localStorage.getItem(DB_KEY) || "null");
    if (!stored) return emptyDatabase();
    const known = new Map((stored.teachers || []).map((teacher) => [teacher.id, teacher]));
    INITIAL_TEACHERS.forEach((teacher) => { if (!known.has(teacher.id)) known.set(teacher.id, teacher); });
    return { ...emptyDatabase(), ...stored, teachers: [...known.values()] };
  } catch {
    return emptyDatabase();
  }
}

function persist() {
  db.updatedAt = new Date().toISOString();
  localStorage.setItem(DB_KEY, JSON.stringify(db));
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
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  $("#viewTitle").textContent = titleByView[name] || "Sistem Jadual";
  localStorage.setItem("relief-skpr-view", name);
  if (name === "jadual") setScheduleMode(scheduleMode);
  renderAll();
}

function setScheduleMode(mode) {
  scheduleMode = mode === "relief" ? "relief" : "generator";
  localStorage.setItem("sistem-jadual-mode", scheduleMode);
  $("#schedule-generator-pane")?.classList.toggle("hidden", scheduleMode !== "generator");
  $("#schedule-relief-pane")?.classList.toggle("hidden", scheduleMode !== "relief");
  $$('[data-schedule-mode]').forEach((button) => {
    const active = button.dataset.scheduleMode === scheduleMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (scheduleMode === "generator") {
    const frame = $("#scheduleGenerator");
    if (frame && !frame.getAttribute("src")) frame.src = frame.dataset.src;
  }
}

function updateConnectionUi() {
  const configured = api.isConfigured();
  $("#syncDot").classList.toggle("online", configured && navigator.onLine);
  $("#syncLabel").textContent = configured ? (navigator.onLine ? `Sheets · r${db.revision || 0}` : "Luar talian") : "Mod setempat";
  $("#revisionLabel").textContent = db.revision || 0;
  $("#lastUpdated").textContent = db.updatedAt ? new Intl.DateTimeFormat("ms-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(db.updatedAt)) : "—";
}

function renderAll() {
  renderDashboard();
  renderAbsences();
  renderTeacherLists();
  renderTeachers();
  renderSchedule();
  updateConnectionUi();
}

function renderDashboard() {
  const date = todayIso();
  const absences = db.absences.filter((item) => item.date === date && item.status !== "cancelled");
  const published = db.reliefs.filter((item) => item.date === date && item.status !== "cancelled");
  currentDrafts = buildReliefDrafts(db, date);
  const items = [...published.map((item) => ({ ...item, candidates: [] })), ...currentDrafts];
  $("#metricAbsent").textContent = new Set(absences.map((item) => item.teacherId)).size;
  $("#metricClasses").textContent = new Set(items.map((item) => item.className).filter(Boolean)).size;
  $("#metricOpen").textContent = currentDrafts.filter((item) => !item.replacementTeacherId).length;
  $("#metricDone").textContent = published.filter((item) => item.status === "published").length;
  const list = $("#reliefList");
  if (!items.length) {
    const hasSchedule = db.scheduleVersions.some((version) => version.status === "active");
    list.innerHTML = `<div class="empty-state"><strong>${hasSchedule ? "Tiada relief diperlukan hari ini" : "Import jadual untuk bermula"}</strong>${hasSchedule ? "Tambah rekod guru tiada untuk menjana cadangan." : "Sistem memerlukan Jadual Guru PDF yang aktif."}</div>`;
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

function reliefCard(item) {
  const absent = teacherById(item.absentTeacherId);
  const replacement = teacherById(item.replacementTeacherId);
  let candidateHtml;
  if (item.status === "published") {
    candidateHtml = `<span class="badge good">DITERBITKAN</span><strong>${esc(replacement?.shortName || replacement?.name || "—")}</strong>`;
  } else if (!item.candidates.length) {
    candidateHtml = `<select class="candidate-select" data-id="${esc(item.id)}"><option value="">Tiada guru tersedia</option></select><div class="candidate-note" style="color:#b83d45">Pilih atau ubah kelayakan guru</div>`;
  } else {
    candidateHtml = `<select class="candidate-select" data-id="${esc(item.id)}">${item.candidates.map((teacher) => `<option value="${esc(teacher.id)}" ${teacher.id === item.replacementTeacherId ? "selected" : ""}>${esc(teacher.shortName)} · ${teacher.todayReliefs} hari ini</option>`).join("")}</select><div class="candidate-note">Cadangan terbaik · agihan minggu ini diambil kira</div>`;
  }
  return `<article class="relief-card">
    <div class="time-chip"><span class="period-bubble">${item.period}</span><span><strong>${esc(item.startTime)}–${esc(item.endTime)}</strong><small>Waktu ${item.period}</small></span></div>
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
    return `<article class="absence-card"><div><h3>${esc(teacher?.name || "Guru tidak ditemui")}</h3><p>${esc(item.reason || "Tiada sebab dinyatakan")} · ${item.allDay ? "Sepanjang hari" : `Waktu ${(item.periods || []).join(", ")}`}</p></div><button class="mini-button delete" data-cancel-absence="${esc(item.id)}" title="Batalkan">×</button></article>`;
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
  schedule.innerHTML = `<option value="">Pilih guru</option>${teacherOptions(selectedSchedule)}`;
}

function initials(name) { return String(name).split(" ").filter((word) => !["BIN", "BINTI"].includes(word)).slice(0, 2).map((word) => word[0]).join(""); }

function renderTeachers() {
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
  const version = db.scheduleVersions.filter((item) => item.status === "active").sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  $("#activeVersion").textContent = version ? `${version.label} · ${formatDate(version.effectiveDate)}` : "Belum ada jadual";
  $("#activeVersion").className = `badge ${version ? "good" : "neutral"}`;
  const teacherId = $("#scheduleTeacher").value;
  const day = $("#scheduleDay").value;
  const rows = version ? db.schedule.filter((row) => row.versionId === version.id && row.teacherId === teacherId && row.day === day) : [];
  $("#scheduleGrid").innerHTML = PERIODS.map((period) => {
    const row = rows.find((item) => Number(item.period) === period.period);
    return `<div class="schedule-cell ${row ? "" : "free"}"><span class="period">${period.period} · ${period.startTime}</span>${row ? `<strong>${esc(row.subject)}</strong><span>${esc(row.className || "Aktiviti")}</span>` : `<span style="margin-top:28px;color:#91a09c">Lapangan</span>`}</div>`;
  }).join("");
}

function openAbsenceDialog() {
  $("#absenceDate").value = todayIso();
  $("#absenceTeacher").value = "";
  $("#absenceReason").value = "";
  $("#absenceAllDay").checked = true;
  $("#periodPicker").classList.add("hidden");
  $("#absenceDialog").showModal();
}

async function saveAbsenceRecord(event) {
  event.preventDefault();
  const teacherId = $("#absenceTeacher").value;
  const date = $("#absenceDate").value;
  if (!teacherId || !date) return toast("Pilih guru dan tarikh.", "error");
  const allDay = $("#absenceAllDay").checked;
  const periods = allDay ? [] : $$('#periodPicker input:checked').map((input) => Number(input.value));
  if (!allDay && !periods.length) return toast("Pilih sekurang-kurangnya satu waktu.", "error");
  const absence = { id: uuid("a"), date, teacherId, reason: $("#absenceReason").value.trim(), allDay, periods, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  db.absences.push(absence); persist(); $("#absenceDialog").close(); renderAll(); showView("hari-ini");
  await remoteWrite("saveAbsence", absence, "Ketiadaan disimpan.");
}

async function cancelAbsence(id) {
  const item = db.absences.find((absence) => absence.id === id);
  if (!item || !confirm("Batalkan rekod ketiadaan ini?")) return;
  item.status = "cancelled"; item.updatedAt = new Date().toISOString(); persist(); renderAll();
  await remoteWrite("saveAbsence", item, "Rekod dibatalkan.");
}

function openTeacherDialog(id = "") {
  const teacher = db.teachers.find((item) => item.id === id);
  $("#teacherDialogTitle").textContent = teacher ? "Ubah guru" : "Tambah guru";
  $("#teacherId").value = teacher?.id || "";
  $("#teacherName").value = teacher?.name || "";
  $("#teacherShortName").value = teacher?.shortName || "";
  $("#teacherPosition").value = teacher?.position || "Guru Akademik";
  $("#teacherPriority").value = String(teacher?.priority || 3);
  $("#teacherEligible").checked = teacher?.reliefEligible ?? true;
  $("#teacherDialog").showModal();
}

async function saveTeacherRecord(event) {
  event.preventDefault();
  const existingId = $("#teacherId").value;
  const name = $("#teacherName").value.trim().toUpperCase();
  const now = new Date().toISOString();
  if (!name) return toast("Nama guru diperlukan.", "error");
  if (db.teachers.some((teacher) => teacher.active && teacher.name === name && teacher.id !== existingId)) return toast("Nama guru ini sudah wujud.", "error");
  const teacher = {
    id: existingId || `g-${slug($("#teacherShortName").value)}-${Date.now().toString(36)}`,
    name,
    shortName: $("#teacherShortName").value.trim().toUpperCase(),
    position: $("#teacherPosition").value.trim(),
    priority: Number($("#teacherPriority").value),
    reliefEligible: $("#teacherEligible").checked,
    active: true,
    createdAt: db.teachers.find((item) => item.id === existingId)?.createdAt || now,
    updatedAt: now,
  };
  const index = db.teachers.findIndex((item) => item.id === teacher.id);
  if (index >= 0) db.teachers[index] = teacher; else db.teachers.push(teacher);
  persist(); $("#teacherDialog").close(); renderAll();
  await remoteWrite("saveTeacher", teacher, "Maklumat guru disimpan.");
}

async function archiveTeacher(id) {
  const teacher = teacherById(id);
  if (!teacher || !confirm(`Nyahaktifkan ${teacher.name}? Rekod sejarah tidak akan dipadam.`)) return;
  teacher.active = false; teacher.updatedAt = new Date().toISOString(); persist(); renderAll();
  await remoteWrite("saveTeacher", teacher, "Guru dinyahaktifkan.");
}

async function publishReliefs() {
  const errors = validateReliefs(db, currentDrafts);
  if (errors.length) return toast(errors[0], "error");
  const now = new Date().toISOString();
  const records = currentDrafts.map(({ candidates, ...item }) => ({ ...item, status: "published", createdAt: now, updatedAt: now }));
  db.reliefs.push(...records); persist(); renderAll();
  await remoteWrite("saveReliefs", records, `${records.length} relief diterbitkan.`);
}

async function parsePdf() {
  const file = $("#pdfFile").files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) return toast("Fail melebihi 25 MB.", "error");
  const progress = $("#importProgress"); progress.classList.remove("hidden");
  $("#parsePdf").disabled = true;
  try {
    const pdfjs = await import("./vendor/pdf.min.js");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.js", import.meta.url).href;
    importResult = await parseTeacherPdf(file, pdfjs, db.teachers, ({ current, total }) => progress.style.setProperty("--progress", `${Math.round(current / total * 100)}%`));
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
  $("#importSummary").innerHTML = `<div><strong>${importResult.pageCount}</strong><span>halaman guru</span></div><div><strong>${importResult.rows.length}</strong><span>slot jadual</span></div><div><strong>${importResult.warnings.length}</strong><span>amaran</span></div>`;
  $("#importWarnings").innerHTML = importResult.warnings.map((warning) => `<div class="alert">${esc(warning)}</div>`).join("") + (importResult.unmatchedPages.length ? `<button id="addImportedTeachers" class="button ghost wide">+ Tambah ${importResult.unmatchedPages.length} nama baharu ke direktori</button>` : "");
  $("#importRows").innerHTML = importResult.pages.map((page, index) => `<tr><td>${index + 1}</td><td>${esc(page.rawName)}</td><td><span class="badge ${page.teacherId ? "good" : "warn"}">${page.teacherId ? "Dipadan" : "Semak"}</span></td><td>${page.rows.length}</td></tr>`).join("");
  $("#addImportedTeachers")?.addEventListener("click", addImportedTeachers);
}

async function addImportedTeachers() {
  const additions = [];
  importResult.unmatchedPages.forEach((page) => {
    const teacher = { ...page.pageTeacher, id: `${page.pageTeacher.id}-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.teachers.push(teacher); additions.push(teacher); page.teacherId = teacher.id; page.suggestedTeacher = teacher;
  });
  importResult.rows = importResult.pages.flatMap((page) => page.rows.map((row) => ({ ...row, teacherId: page.teacherId })));
  importResult.unmatchedPages = [];
  importResult.warnings = importResult.warnings.filter((warning) => !warning.startsWith("Nama baharu/tidak sepadan"));
  persist(); renderAll(); renderImportReview();
  for (const teacher of additions) await remoteWrite("saveTeacher", teacher, `${teacher.shortName} ditambah.`);
}

async function saveImportedSchedule() {
  if (!importResult) return;
  const effectiveDate = $("#effectiveDate").value;
  const label = $("#versionLabel").value.trim();
  if (!effectiveDate || !label) return toast("Isi tarikh kuat kuasa dan nama versi.", "error");
  if (importResult.unmatchedPages.length) return toast("Terdapat halaman guru yang belum dipadankan.", "error");
  const version = { id: uuid("v"), label, effectiveDate, sourceName: $("#pdfFile").files[0]?.name || "PDF", status: $("#activateVersion").checked ? "active" : "draft", createdAt: new Date().toISOString() };
  if (version.status === "active") db.scheduleVersions.forEach((item) => { if (item.status === "active") item.status = "superseded"; });
  const rows = importResult.rows.map((row) => ({ ...row, versionId: version.id }));
  db.scheduleVersions.push(version); db.schedule.push(...rows); persist(); renderAll(); setScheduleMode("relief"); showView("jadual");
  await remoteWrite("importSchedule", { version, rows }, `${rows.length} slot jadual disimpan.`);
}

async function remoteWrite(action, data, successMessage) {
  if (!api.isConfigured()) {
    queueWrite(action, data);
    toast(`${successMessage} Data disimpan pada peranti.`, "success");
    return;
  }
  try {
    const result = await api.write(action, data);
    db.revision = result.revision ?? db.revision; db.updatedAt = result.updatedAt || db.updatedAt; persist();
    toast(successMessage, "success");
  } catch (error) {
    queueWrite(action, data);
    toast(`Disimpan pada peranti; Sheets belum dikemas kini. ${error.message}`, "error");
  }
}

async function syncData(showSuccess = true) {
  if (!api.isConfigured()) return showSuccess && toast("Tetapkan URL API di bahagian Tetapan.");
  $("#syncButton").disabled = true;
  try {
    const queued = await flushQueue(api);
    const result = await api.bootstrap(db.revision || -1);
    if (result.changed && result.data) db = { ...db, ...result.data };
    db.revision = result.revision ?? db.revision; db.updatedAt = result.updatedAt || new Date().toISOString(); persist(); renderAll();
    if (showSuccess) toast(queued.sent ? `${queued.sent} perubahan dihantar dan data disegerakkan.` : (result.changed ? "Data baharu diterima daripada Sheets." : "Data sudah terkini."), "success");
  } catch (error) {
    if (showSuccess) toast(error.message, "error");
  } finally { $("#syncButton").disabled = false; }
}

function populatePeriodPicker() {
  $("#periodPicker").innerHTML = `<legend>Pilih waktu</legend>${PERIODS.map((item) => `<label><input type="checkbox" value="${item.period}"><span>${item.period}</span></label>`).join("")}`;
}

function wireEvents() {
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $$('[data-schedule-mode]').forEach((button) => button.addEventListener("click", () => setScheduleMode(button.dataset.scheduleMode)));
  $$('[data-open-absence]').forEach((button) => button.addEventListener("click", openAbsenceDialog));
  $("#openAbsence").addEventListener("click", openAbsenceDialog);
  $("#mobileSettings").addEventListener("click", () => showView("tetapan"));
  $("#absenceFilterDate").addEventListener("change", renderAbsences);
  $("#absenceAllDay").addEventListener("change", (event) => $("#periodPicker").classList.toggle("hidden", event.target.checked));
  $("#saveAbsence").addEventListener("click", saveAbsenceRecord);
  $("#addTeacher").addEventListener("click", () => openTeacherDialog());
  $("#saveTeacher").addEventListener("click", saveTeacherRecord);
  $("#teacherSearch").addEventListener("input", renderTeachers);
  $("#scheduleTeacher").addEventListener("change", renderSchedule);
  $("#scheduleDay").addEventListener("change", renderSchedule);
  $("#publishRelief").addEventListener("click", publishReliefs);
  $("#printRelief").addEventListener("click", () => window.print());
  $("#pdfFile").addEventListener("change", (event) => {
    const file = event.target.files[0]; $("#fileName").textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "Maksimum 25 MB"; $("#parsePdf").disabled = !file;
    if (file) { const date = file.name.match(/(\d{2})[.\-_](\d{2})[.\-_](\d{4})/); if (date) { $("#effectiveDate").value = `${date[3]}-${date[2]}-${date[1]}`; $("#versionLabel").value = `Jadual ${date[1]}.${date[2]}.${date[3]}`; } }
  });
  $("#parsePdf").addEventListener("click", parsePdf);
  $("#saveImport").addEventListener("click", saveImportedSchedule);
  $("#syncButton").addEventListener("click", () => syncData(true));
  $("#testApi").addEventListener("click", async () => { try { const temp = new ApiClient({ ...config, apiUrl: $("#apiUrl").value.trim() }); const result = await temp.health(); toast(`${result.school || "API"} bersambung.`, "success"); } catch (error) { toast(error.message, "error"); } });
  $("#saveSettings").addEventListener("click", () => { config = { apiUrl: $("#apiUrl").value.trim(), adminPin: $("#adminPin").value.trim(), autoSync: $("#autoSync").checked }; saveConfig(config); api = new ApiClient(config); updateConnectionUi(); toast("Tetapan disimpan.", "success"); });
  $("#checkUpdate").addEventListener("click", async () => { const registration = await navigator.serviceWorker?.getRegistration(); await registration?.update(); toast("Semakan kemas kini selesai.", "success"); });
  $("#installButton").addEventListener("click", async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("#installButton").classList.add("hidden"); });
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; $("#installButton").classList.remove("hidden"); });
  window.addEventListener("online", () => { updateConnectionUi(); if (config.autoSync) syncData(false); });
  window.addEventListener("offline", updateConnectionUi);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !refreshing) { refreshing = true; location.reload(); }
    });
    const registration = await navigator.serviceWorker.register("./sw.js");
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) toast("Versi aplikasi baharu tersedia. Muat semula untuk menggunakannya."); });
    });
  } catch (error) { console.warn("Service worker gagal didaftarkan", error); }
}

function init() {
  const date = todayIso();
  $("#todayLabel").textContent = new Intl.DateTimeFormat("ms-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)).toUpperCase();
  $("#absenceFilterDate").value = date; $("#effectiveDate").value = date;
  $("#apiUrl").value = config.apiUrl || ""; $("#adminPin").value = config.adminPin || ""; $("#autoSync").checked = config.autoSync !== false;
  $("#appVersion").textContent = APP_VERSION;
  populatePeriodPicker(); wireEvents(); renderAll(); showView(localStorage.getItem("relief-skpr-view") || "hari-ini"); registerServiceWorker();
  if (config.autoSync && api.isConfigured() && navigator.onLine) syncData(false);
}

init();
