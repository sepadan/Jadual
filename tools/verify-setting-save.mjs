// Repro hidup bagi aduan "tekan Simpan tetapan, tiada respons" dalam dialog Guru Pemulihan.
//
// Semua trafik ke Apps Script sekolah DIPINTAS dua lapis:
//   1. --host-resolver-rules memetakan script.google.com ke port mati, jadi walaupun satu permintaan
//      terlepas ia tidak akan sampai ke Google.
//   2. CDP Fetch.enable dipasang SEBELUM navigasi, jadi setiap permintaan dijawab di dalam skrip ini.
// Tiada data sekolah dibaca atau ditulis. Fail repo disaji oleh pelayan statik tempatan skrip ini.
//
// Usage: node uji-simpan-tetapan.mjs [senario]
//   senario: "gantung" (status tidak pernah menjawab) | "lambat" | "ok" | "semua" (lalai)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url)).replace(/\\+$/, "");
const OUT = "C:/Users/seman/work";
const SCENARIO = process.argv[2] || "semua";
const W = 430, H = 1000;
const PORT_HTTP = 8901;
const PORT_CDP = 9470 + (process.pid % 40);
const profile = path.join(os.tmpdir(), `uji-simpan-${Date.now()}`);
mkdirSync(profile, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(REPO, rel);
  if (!file.startsWith(path.resolve(REPO)) || !existsSync(file)) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT_HTTP, "127.0.0.1", r));

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${profile}`,
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  // Lapisan keselamatan kedua: nama hos sekolah tidak boleh diselesaikan langsung.
  '--host-resolver-rules=MAP script.google.com 127.0.0.1:9, MAP *.googleusercontent.com 127.0.0.1:9, MAP *.google.com 127.0.0.1:9',
  `--window-size=${W},${H}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(400);
  }
  throw new Error("no page target");
}
let id = 0;
const pending = new Map();
const written = [];
let statusMode = "ok";          // "ok" | "lambat" | "gantung"
let statusRevision = 7;
const held = [];                 // permintaan status yang sengaja ditahan
const ws = new WebSocket(await target());
await new Promise((res) => ws.addEventListener("open", res));
const send = (method, params = {}) => new Promise((res) => { const my = ++id; pending.set(my, res); ws.send(JSON.stringify({ id: my, method, params })); });

const fulfil = (requestId, payload) => send("Fetch.fulfillRequest", {
  requestId, responseCode: 200,
  responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }],
  body: Buffer.from(JSON.stringify(payload)).toString("base64"),
});

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === "Fetch.requestPaused") {
    const request = msg.params.request;
    const body = request.postData || "";
    if (request.url.includes("action=status")) {
      if (statusMode === "gantung") { held.push(msg.params.requestId); return; }   // tidak dijawab langsung
      if (statusMode === "lambat") { setTimeout(() => fulfil(msg.params.requestId, { ok: true, revision: statusRevision }), 6000); return; }
      fulfil(msg.params.requestId, { ok: true, revision: statusRevision });
      return;
    }
    if (body.includes('"importSchedule"')) { written.push(body); return void fulfil(msg.params.requestId, { ok: true, revision: statusRevision + 1, updatedAt: new Date().toISOString() }); }
    if (body.includes('"login"')) return void fulfil(msg.params.requestId, { ok: true, token: "uji-setempat", expiresAt: Date.now() + 3600000 });
    if (body.includes('"bootstrap"')) return void fulfil(msg.params.requestId, { ok: true, changed: false, revision: statusRevision });
    fulfil(msg.params.requestId, { ok: true, revision: statusRevision, changed: false });
    return;
  }
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});

const evaluate = async (expr) => {
  const res = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || "ralat JS");
  return res.result?.result?.value;
};
const shot = async (file) => {
  const res = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(OUT, file), Buffer.from(res.result.data, "base64"));
  console.log(`  gambar: ${file}`);
};
let gagal = 0;
const check = (ok, label) => { if (!ok) gagal += 1; console.log(`${ok ? "OK   " : "GAGAL"} ${label}`); };

await send("Page.enable");
await send("Runtime.enable");
// Dipasang sebelum navigasi: tiada permintaan sekolah boleh keluar walau sekali.
await send("Fetch.enable", { patterns: [{ urlPattern: "*script.google.com*" }, { urlPattern: "*googleusercontent.com*" }] });
await send("Page.navigate", { url: `http://127.0.0.1:${PORT_HTTP}/index.html` });
await sleep(4000);

const seeded = await evaluate(`(async () => {
  const m = await import('./data.js?v=3.1.78');
  const db = m.emptyDatabase();
  const now = new Date().toISOString();
  db.revision = 7;
  db.teachers = [{ id: "g-pemulihan", name: "GURU PEMULIHAN UJIAN", shortName: "PEMULIHAN UJIAN", position: "Guru Pemulihan", reliefEligible: true, priority: 5, active: true, createdAt: now, updatedAt: now }];
  db.scheduleVersions = [{ id: "v-uji", label: "Jadual ujian", effectiveDate: "2020-01-01", sourceName: "ujian-setempat", status: "active", createdAt: now }];
  db.schedule = [];
  localStorage.setItem("relief-skpr-db-v1", JSON.stringify(db));
  localStorage.setItem("sistem-jadual-data-admin-v1", JSON.stringify({ savedAt: Date.now(), data: db }));
  localStorage.setItem("jadual-admin-session", JSON.stringify({ token: "uji-setempat", expiresAt: Date.now() + 3600000 }));
  return "ok";
})()`);
console.log("seed:", seeded);
await send("Page.navigate", { url: `http://127.0.0.1:${PORT_HTTP}/index.html` });
await sleep(6000);

// Buka dialog dan tanda 27 waktu pemulihan, sama seperti keadaan dalam laporan pengguna.
const openAndMark = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!document.querySelector("#settingDialog")?.open) {
    document.querySelector('[data-view="guru"]')?.click();
    await wait(600);
    const card = [...document.querySelectorAll(".teacher-card, .teacher")].find((el) => el.textContent.includes("GURU PEMULIHAN UJIAN"));
    card?.querySelector("[data-edit-teacher]")?.click();
    await wait(600);
    const button = document.querySelector("#teacherSettingSlots");
    if (!button || button.classList.contains("hidden")) return JSON.stringify({ ok: false, sebab: "butang Tetapan Jadual tersembunyi" });
    button.click();
    await wait(800);
  }
  const cells = [...document.querySelectorAll('#settingGrid [data-setting-cell]')];
  let marked = document.querySelectorAll('#settingGrid td.chosen').length;
  for (const cell of cells) {
    if (marked >= 27) break;
    if (cell.classList.contains("chosen")) continue;
    cell.click();
    await wait(30);
    document.querySelector("#settingCellSubject").value = "BM";
    document.querySelector("#settingCellApply").click();
    await wait(30);
    marked = document.querySelectorAll('#settingGrid td.chosen').length;
  }
  return JSON.stringify({ ok: true, ditanda: document.querySelectorAll('#settingGrid td.chosen').length, kiraan: document.querySelector("#settingCount")?.textContent });
})()`;

const snap = `(() => {
  const b = document.querySelector("#saveSettingSlots");
  const note = document.querySelector("#settingStatus");
  return JSON.stringify({
    teksButang: b?.textContent.trim(),
    disabled: !!b?.disabled,
    ariaBusy: b?.getAttribute("aria-busy"),
    spinner: !!b?.classList.contains("is-busy"),
    dialogBusy: document.querySelector("#settingDialog")?.getAttribute("aria-busy"),
    nota: note && !note.classList.contains("hidden") ? note.textContent.trim() : "",
    dialogTerbuka: !!document.querySelector("#settingDialog")?.open,
    ditanda: document.querySelectorAll('#settingGrid td.chosen').length,
    toast: document.querySelector("#toast")?.classList.contains("show") ? document.querySelector("#toast").textContent.trim() : "",
  });
})()`;

async function scenarioHang() {
  console.log("\n=== SENARIO: status Apps Script tergantung (tidak pernah menjawab) ===");
  statusMode = "gantung";
  console.log("sedia:", await evaluate(openAndMark));
  await evaluate(`document.querySelector("#saveSettingSlots").click()`);
  await sleep(400);
  const semasa = JSON.parse(await evaluate(snap));
  console.log("400ms selepas tekan:", JSON.stringify(semasa));
  await shot("simpan-tetapan-menunggu.png");
  check(semasa.disabled === true, "butang tidak boleh ditekan dua kali semasa menunggu");
  check(/[Mm]enyemak|[Mm]emuat/.test(semasa.teksButang || ""), "butang memberitahu ia sedang bekerja (teks Melayu)");
  check(semasa.ariaBusy === "true", "butang mengumumkan aria-busy kepada pembaca skrin");
  check(semasa.spinner === true, "butang memaparkan spinner");
  check(semasa.nota !== "", "dialog memaparkan baris status semasa menunggu");

  console.log("  menunggu had masa…");
  await sleep(16000);
  const selepas = JSON.parse(await evaluate(snap));
  console.log("selepas had masa:", JSON.stringify(selepas));
  await shot("simpan-tetapan-tamat-masa.png");
  check(selepas.disabled === false, "butang aktif semula selepas tamat masa");
  check(selepas.teksButang === "Simpan tetapan", "label butang kembali normal");
  check(selepas.ariaBusy === "false", "aria-busy dimatikan semula");
  check(/tidak menjawab|tamat|tidak dapat mengesahkan/i.test(selepas.nota), `mesej kegagalan jelas kekal dalam dialog: ${selepas.nota || "(tiada)"}`);
  check(selepas.dialogTerbuka === true, "dialog kekal terbuka");
  check(selepas.ditanda === 27, `semua 27 tanda kekal (dapat ${selepas.ditanda})`);
  check(written.length === 0, "tiada apa-apa ditulis ke Sheets apabila semakan gagal");
  // Permintaan yang ditahan dilepaskan supaya pelayar tidak menyimpan sambungan terbuka.
  for (const requestId of held.splice(0)) await fulfil(requestId, { ok: true, revision: statusRevision }).catch(() => {});
}

async function scenarioSlow() {
  console.log("\n=== SENARIO: status lambat 6 saat, kemudian berjaya ===");
  statusMode = "lambat";
  console.log("sedia:", await evaluate(openAndMark));
  await evaluate(`document.querySelector("#saveSettingSlots").click()`);
  await sleep(400);
  const semasa = JSON.parse(await evaluate(snap));
  console.log("semasa menunggu:", JSON.stringify(semasa));
  check(semasa.ariaBusy === "true" && semasa.disabled === true, "keadaan sibuk kelihatan semasa status lambat");
  await sleep(8000);
  const selepas = JSON.parse(await evaluate(snap));
  console.log("selepas jawapan:", JSON.stringify(selepas));
  check(selepas.dialogTerbuka === false, "dialog ditutup selepas simpanan berjaya");
  check(selepas.teksButang === "Simpan tetapan" && selepas.disabled === false, "butang dipulihkan selepas berjaya");
  const payload = written.map((body) => JSON.parse(body)).find((item) => item.action === "importSchedule");
  const rows = (payload?.data?.rows || []).filter((row) => String(row.subject || "").startsWith("PEMULIHAN"));
  check(rows.length === 27, `27 baris pemulihan dihantar ke Sheets (dapat ${rows.length})`);
  check(rows.every((row) => row.className === ""), "className kekal kosong (relief tidak terjejas)");
}

if (SCENARIO === "gantung" || SCENARIO === "semua") await scenarioHang();
if (SCENARIO === "lambat" || SCENARIO === "ok" || SCENARIO === "semua") await scenarioSlow();

console.log(`\n${gagal ? `${gagal} SEMAKAN GAGAL` : "SEMUA SEMAKAN LULUS"}`);
ws.close(); chrome.kill(); server.close();
process.exit(gagal ? 1 : 0);
