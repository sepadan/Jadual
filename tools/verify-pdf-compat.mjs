// Pengesahan hujung-ke-hujung: import PDF aSc pada telefon LAMA.
//
// Ralat pengguna di telefon: "PDF tidak dapat dibaca: undefined is not a function (near '...t of e...')"
// Punca: pdf.js 6.3.289 memanggil Promise.try / URL.parse / Math.sumPrecise tanpa pemeriksaan
// keupayaan - API 2025 yang tiada pada iOS sebelum 18.4.
//
// Skrip ini menjalankan DUA senario pada pelayar sebenar:
//   A. Salinan repo dengan lapisan keserasian "dimatikan" (API 2025 dibuang) -> ralat mesti muncul.
//   B. Repo sebenar (lapisan keserasian hidup)                            -> import mesti berjaya.
//
// Data: fail PDF aSc sebenar pengguna (laluan boleh diubah melalui PDF_AU).
// Tiada panggilan ke API sekolah - semua permintaan script.google.com disekat.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SALINAN = process.env.UJI_DIR || "C:/Users/seman/work/jadual-uji-lama";
const PDF_AU =
  process.env.PDF_AU || "C:/Users/seman/Downloads/JADUAL GURU 2026 14.09.2026 terkini.pdf";
const GAMBAR = process.env.UJI_GAMBAR || "C:/Users/seman/work/jadual-kerja-2026-09-13";
const PORT_REPO = 8973;
const PORT_LAMA = 8974;

const JENIS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

function pelayan(akar, port) {
  // path.resolve menyamakan pemisah (C:/... vs C:\...) - tanpa ini setiap permintaan 403.
  const akarAsal = path.resolve(akar);
  const s = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    const fail = path.join(akarAsal, rel === "" ? "index.html" : rel);
    if (!fail.startsWith(akarAsal)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const isi = readFileSync(fail);
      res.writeHead(200, { "content-type": JENIS[path.extname(fail)] || "application/octet-stream" });
      res.end(isi);
    } catch {
      res.writeHead(404).end("tidak dijumpai");
    }
  });
  return new Promise((selesai) => s.listen(port, "127.0.0.1", () => selesai(s)));
}

/** Salinan repo dengan lapisan keserasian diganti versi "enjin lama" (API 2025 dibuang). */
function sediaSalinanLama() {
  const LANGKAU = new Set([".git", "node_modules", "panduan", ".pdf-verification", "claude-pdf-results", "docx-panduan"]);
  // Direktori salinan mungkin masih dipegang proses lain (cth shell yang cd ke dalamnya):
  // kalau tidak boleh dipadam, guna nama baharu sahaja daripada gagal.
  let sasaran = SALINAN;
  try {
    rmSync(sasaran, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    sasaran = `${SALINAN}-${Date.now().toString(36)}`;
  }
  mkdirSync(sasaran, { recursive: true });
  let bilangan = 0;
  const salin = (dari, ke) => {
    for (const masuk of readdirSync(dari, { withFileTypes: true })) {
      if (LANGKAU.has(masuk.name)) continue;
      const asal = path.join(dari, masuk.name);
      const tujuan = path.join(ke, masuk.name);
      if (masuk.isDirectory()) {
        mkdirSync(tujuan, { recursive: true });
        salin(asal, tujuan);
      } else if (!masuk.name.endsWith(".pdf")) {
        cpSync(asal, tujuan);
        bilangan++;
      }
    }
  };
  salin(REPO, sasaran);
  writeFileSync(
    path.join(sasaran, "vendor", "pdf-compat.js"),
    `/* Ujian simulasi enjin lama: buang API 2025 supaya tingkah laku iOS lama dapat ditiru. */
(function () {
  delete Promise.withResolvers;
  delete Promise.try;
  delete URL.parse;
  delete Math.sumPrecise;
  delete Uint8Array.prototype.toHex;
  delete Uint8Array.prototype.toBase64;
})();
`,
    "utf8",
  );
  return { bilangan, sasaran };
}

async function jalankan({ nama, akar, port }) {
  const pelayanUji = await pelayan(akar, port);
  const pelayar = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const halaman = await pelayar.newPage();
  await halaman.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const ralatKonsol = [];
  halaman.on("console", (m) => {
    if (m.type() === "error") ralatKonsol.push(m.text());
  });
  halaman.on("pageerror", (e) => ralatKonsol.push("pageerror: " + e.message));

  // Sekat semua panggilan ke API sekolah - ujian tiada kena-mengena dengan data sebenar.
  await halaman.setRequestInterception(true);
  halaman.on("request", (req) => {
    const u = req.url();
    if (u.includes("script.google.com") || u.includes("script.googleusercontent.com")) return req.abort();
    return req.continue();
  });

  // Sesi pentadbir tiruan supaya skrin Import boleh dibuka tanpa kata laluan.
  await halaman.evaluateOnNewDocument(() => {
    localStorage.setItem(
      "jadual-admin-session",
      JSON.stringify({ token: "token-ujian-tempatan", expiresAt: Date.now() + 3600e3 }),
    );
  });

  await halaman.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  try {
    await halaman.waitForSelector("#pdfFile", { timeout: 45000, visible: false });
  } catch (e) {
    const maklumat = await halaman.evaluate(() => ({
      url: location.href,
      tajuk: document.title,
      panjangHtml: document.body?.innerHTML.length ?? -1,
      adaAppJs: Boolean(document.querySelector('script[src*="app.js"]')),
      petikan: (document.body?.innerText || "").slice(0, 220),
    }));
    console.log(`  [nyahpepijat ${nama}] ${JSON.stringify(maklumat)}`);
    console.log(`  [konsol ${nama}] ${ralatKonsol.slice(0, 4).join(" | ") || "(tiada ralat konsol)"}`);
    throw e;
  }

  // Skrin import ialah bahagian pentadbir; API sekolah sengaja disekat dalam ujian ini,
  // jadi paparan itu dibuka terus. Pendengar peristiwa (#pdfFile, #parsePdf) dipasang
  // semasa boot tanpa mengira status pentadbir.
  await halaman.evaluate(() => {
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.remove("hidden"));
    document.querySelector("#view-import")?.classList.remove("hidden");
  });

  const input = await halaman.$("#pdfFile");
  await input.uploadFile(PDF_AU);
  await halaman.waitForFunction(() => document.querySelector("#parsePdf") && !document.querySelector("#parsePdf").disabled, {
    timeout: 20000,
  });
  await halaman.evaluate(() => document.querySelector("#parsePdf").click());

  // Selesai apabila butang dibuka semula oleh blok finally aplikasi.
  await halaman.waitForFunction(
    () => {
      const b = document.querySelector("#parsePdf");
      return b && !b.disabled;
    },
    { timeout: 120000 },
  );
  await new Promise((r) => setTimeout(r, 700));

  const hasil = await halaman.evaluate(() => ({
    toast: (document.querySelector("#toast")?.textContent || "").trim(),
    baris: document.querySelectorAll("#importRows tr").length,
    semakanKelihatan: !document.querySelector("#importReview")?.classList.contains("hidden"),
  }));

  const gambar = path.join(GAMBAR, `pdf-uji-${nama}.png`);
  await halaman.screenshot({ path: gambar, fullPage: true });

  await pelayar.close();
  await new Promise((r) => pelayanUji.close(r));

  return { nama, ...hasil, gambar, ralatKonsol };
}

const salinanLama = sediaSalinanLama();
console.log(`Salinan enjin lama disediakan: ${salinanLama.sasaran} (${salinanLama.bilangan} fail)`);
console.log(`PDF diuji: ${PDF_AU}`);

const lama = await jalankan({ nama: "enjin-lama", akar: salinanLama.sasaran, port: PORT_LAMA });
console.log("\n== A. ENJIN LAMA (API 2025 dibuang) ==");
console.log(`  toast        : ${lama.toast || "(kosong)"}`);
console.log(`  baris dibaca : ${lama.baris}`);
console.log(`  tangkapan    : ${lama.gambar}`);

const baharu = await jalankan({ nama: "keserasian", akar: REPO, port: PORT_REPO });
console.log("\n== B. LAPISAN KESERASIAN HIDUP ==");
console.log(`  toast        : ${baharu.toast || "(kosong)"}`);
console.log(`  baris dibaca : ${baharu.baris}`);
console.log(`  tangkapan    : ${baharu.gambar}`);

const lulusReproduksi = /is not a function/.test(lama.toast) && lama.baris === 0;
const lulusPembetulan = /selesai dibaca/i.test(baharu.toast) && baharu.baris > 0;
console.log("\n== KESIMPULAN ==");
console.log(`  A. ralat pengguna dapat dihasilkan semula : ${lulusReproduksi ? "YA" : "TIDAK"}`);
console.log(`  B. import berjaya dengan keserasian      : ${lulusPembetulan ? "YA" : "TIDAK"} (${baharu.baris} baris)`);
if (baharu.ralatKonsol.length) console.log(`  ralat konsol senario B: ${baharu.ralatKonsol.slice(0, 3).join(" | ")}`);
process.exitCode = lulusReproduksi && lulusPembetulan ? 0 : 1;
