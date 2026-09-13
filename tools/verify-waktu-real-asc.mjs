// PENGESAHAN AKHIR (Claude) — bahagian yang masih tertangguh daripada acceptance asal: import
// SEBENAR satu PDF aSc tempatan (bukan data sintetik) melalui parser produksi sebenar
// (parseTeacherPdf daripada pdf-import.js + draftFromPdf daripada pdf-builder.js), dijalankan
// dalam Chromium tulen (Puppeteer) supaya vendor/pdf.min.js + vendor/pdf.worker.min.js sebenar
// dipakai — bukan simulasi/mock. Menggunakan semula corak pelayan statik + sekatan rangkaian
// daripada tools/verify-waktu-final.mjs.
//
// PII: nama guru SEBENAR diekstrak oleh parser (rawName/pageTeacher) SEMASA proses padanan, tetapi
// tidak pernah meninggalkan konteks pelayar (page.evaluate) sebagai teks — ia terus digantikan
// dengan label tanpa nama ("GURU 1", "GURU 2", ...) SEBELUM apa-apa dipulangkan ke Node, disimpan
// ke cakera, atau dicetak ke konsol. draftFromPdf() sendiri dipanggil dengan direktori guru yang
// SUDAH dianonimkan (nama/id sintetik), supaya draf (state.guru) dan PDF cetak yang dijana juga
// tidak mengandungi nama sebenar. Nama Guru Besar (principalName) turut digugurkan. Nama sekolah
// dikekalkan (sudah sedia ada dalam fail repo yang dikomit, cth. SETUP-SEKOLAH.md/panduan).
//
// Tiada rangkaian ke script.google.com (disekat, sama seperti verify-waktu-final.mjs). Tiada
// tulisan ke data sekolah — fail sumber dan semua output kekal tempatan (.pdf-verification/,
// digitignore). Jika parser gagal atau data nampak tidak masuk akal, skrip melaporkan RALAT SEBENAR
// dan BERHENTI — ia tidak mengubah/mengabaikan data supaya "lulus".
//
// Jalankan: node tools/verify-waktu-real-asc.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const PORT = Number(process.env.VERIFY_PORT || 8973);
const OUT = path.join(ROOT, '.pdf-verification', 'waktu-final');
const SOURCE_PDF_URL = '/.pdf-verification/waktu-final/source-asc.pdf';
const SOURCE_PDF_PATH = path.join(ROOT, '.pdf-verification', 'waktu-final', 'source-asc.pdf');
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(SOURCE_PDF_PATH)) {
  console.error(`BLOCKER: fail sumber tidak ditemui: ${SOURCE_PDF_PATH}`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/tools/verify-print.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found: ' + p); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

// Semua kod di bawah dijalankan DI DALAM pelayar (page.evaluate). String ini sengaja ditulis
// sebagai fungsi biasa (bukan dipanggil terus daripada Node) supaya jelas ia adalah kod sisi
// pelayar — dipanggil melalui page.evaluate(runImportInBrowser, pdfUrl).
async function runImportInBrowser(pdfUrl) {
  const pdfjs = await import('/vendor/pdf.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  const pdfImportMod = await import('/pdf-import.js');
  const pdfBuilderMod = await import('/pdf-builder.js');

  const res = await fetch(pdfUrl);
  if (!res.ok) return { ok: false, stage: 'fetch', error: `HTTP ${res.status}` };
  const bytes = new Uint8Array(await res.arrayBuffer());

  // pdf.js memindahkan (transfer) ArrayBuffer data ke worker pada setiap getDocument() — buffer
  // asal jadi "detached" selepas panggilan pertama. Perlu salinan BAHARU bagi setiap panggilan
  // parseTeacherPdf (dua kali: cubaan kering untuk cadangan guru, kemudian cubaan padanan sebenar).
  let dry;
  try {
    dry = await pdfImportMod.parseTeacherPdf(bytes.slice(), pdfjs, [], () => {});
  } catch (e) {
    return { ok: false, stage: 'parse-dry-run', error: String((e && e.message) || e) };
  }

  // Padanan guru dibina DARIPADA halaman PDF itu sendiri (setiap halaman yang tiada padanan
  // direktori menyediakan pageTeacher — cadangan rekod guru baharu terus daripada nama tajuk
  // halaman). Ini membolehkan draftFromPdf berjalan PENUH tanpa memerlukan direktori guru sekolah
  // sebenar (yang tidak dibaca/disentuh di sini).
  const realTeachers = dry.pages.map((p) => p.pageTeacher).filter(Boolean);
  if (!realTeachers.length) return { ok: false, stage: 'match', error: 'Tiada satu pun halaman menghasilkan cadangan guru (pageTeacher kosong untuk semua halaman).' };

  let parsed;
  try {
    parsed = await pdfImportMod.parseTeacherPdf(bytes.slice(), pdfjs, realTeachers, () => {});
  } catch (e) {
    return { ok: false, stage: 'parse-matched-run', error: String((e && e.message) || e) };
  }

  // ---- ANONIMKAN SEBELUM APA-APA LAGI: nama sebenar tidak melepasi titik ini ----
  const idMap = new Map();
  realTeachers.forEach((t, i) => idMap.set(t.id, `t${i + 1}`));
  const anonTeachers = realTeachers.map((t, i) => ({
    id: `t${i + 1}`, name: `GURU ${i + 1}`, shortName: `G${i + 1}`,
    position: t.position, reliefEligible: t.reliefEligible, priority: t.priority, active: true,
  }));
  const anonRows = parsed.rows.map((r) => ({ ...r, teacherId: idMap.get(r.teacherId) || r.teacherId }));
  const anonMetadata = {
    ...parsed.metadata,
    principalName: '', principalTitle: parsed.metadata.principalTitle || '',
    pages: (parsed.metadata.pages || []).map((p) => ({ teacherId: idMap.get(p.teacherId) || '', classTeacherClass: p.classTeacherClass || '' })),
  };

  let state;
  try {
    state = pdfBuilderMod.draftFromPdf(anonRows, anonTeachers, {}, anonMetadata);
  } catch (e) {
    return { ok: false, stage: 'draftFromPdf', error: String((e && e.message) || e), anonRowCount: anonRows.length, teacherCount: anonTeachers.length };
  }

  // Amaran struktur (jumlah waktu PDF vs jumlah baris dibaca) DIBINA SEMULA sendiri daripada
  // medan mentah (page.expectedSlotCount / page.rows.length) — BUKAN daripada
  // dry.structuralWarnings, kerana mesej terbina library itu memetik page.rawName (nama sebenar).
  const structuralWarnings = dry.pages
    .map((p, i) => ({ halaman: i + 1, expectedSlotCount: p.expectedSlotCount, actualRows: p.rows.length }))
    .filter((w) => w.expectedSlotCount != null && w.expectedSlotCount !== w.actualRows);

  const aggregate = {
    parse: {
      pageCount: parsed.pageCount,
      teacherCount: anonTeachers.length,
      unmatchedPageCount: parsed.unmatchedPages.length,
      missingTeacherCount: parsed.missingTeachers.length,
      matchedRowCount: parsed.rows.length,
    },
    structuralWarnings,
    school: { nama: state.sekolah.nama, tahun: state.sekolah.tahun, bermula: state.sekolah.bermula },
    masa: state.masa,
    hari: state.hari,
    subjek: state.subjek.map((s) => s.kod),
    classes: state.kelas.map((k) => ({ nama: k.nama, tahap: k.tahap, waktuHari: k.waktuHari, waktuHariAuto: k.waktuHariAuto })),
    acara: state.acara.map((a) => ({
      kod: a.kod, skop: a.skop, hari: a.hari, mula: a.mula, panjang: a.panjang,
      tahap: a.tahap || [],
      // Nama kelas (bukan nama guru) — supaya boleh disemak sama ada Tahun 1–3 termasuk dalam skop
      // KOKU pada IMPORT (lapisan builder.js/kelasTerkenaAcara yang mengecualikan Tahun 1–3
      // daripada KOKU beroperasi PADA ATAS draf ini semasa dijana/dipaparkan, bukan semasa import).
      kelasTerlibat: (a.kelas || []).map((kid) => state.kelas.find((k) => k.id === kid)?.nama).filter(Boolean),
      guruCount: (a.guru || []).length,
    })),
    totals: {
      classCount: state.kelas.length,
      teacherCount: state.guru.length,
      subjectCount: state.subjek.length,
      lessonSlotCount: state.jadual.slots.length,
      dutyActivityCount: state.acara.length,
    },
  };

  // state disimpan pada window untuk langkah eksport cetak seterusnya (masih dalam page yang
  // sama) — sudah dianonimkan sepenuhnya (nama guru = "GURU N"), jadi PDF cetak yang dijana pun
  // tidak mengandungi nama sebenar.
  window.__anonState = state;
  return { ok: true, aggregate };
}

async function main() {
  const server = await startServer();
  const browser = await puppeteer.launch({ headless: true });
  const blockedHosts = [];
  let outcome;
  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().includes('script.google.com')) { blockedHosts.push(req.url()); req.abort(); return; }
      req.continue();
    });
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`http://127.0.0.1:${PORT}/tools/verify-print.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.jadualBuilder));
    await page.evaluate(() => localStorage.clear());

    outcome = await page.evaluate(runImportInBrowser, `http://127.0.0.1:${PORT}${SOURCE_PDF_URL}`);

    if (outcome.ok) {
      // ---- Satu PDF Cetak SEBENAR daripada draf import (Chromium printToPDF, bukan mock) ----
      await page.evaluate(() => window.jadualBuilder.setState(window.__anonState));
      await page.evaluate(() => window.jadualBuilder.go('cetak'));
      await new Promise((r) => setTimeout(r, 80));
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('.print-type-tabs button')].find((b) => b.textContent.trim() === 'Jadual Kelas');
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 80));
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pilih semua');
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      const printPath = path.join(OUT, 'real-asc-cetak.pdf');
      await page.pdf({ path: printPath, printBackground: true, preferCSSPageSize: true });
      const printBuf = fs.readFileSync(printPath);
      const sheetCount = await page.evaluate(() => document.querySelectorAll('#cetakArea .sheet').length);
      outcome.printExport = { path: printPath, bytes: printBuf.length, sheetCountRendered: sheetCount };
    }
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile: SOURCE_PDF_PATH,
    script_google_com_requests_blocked: blockedHosts,
    ...outcome,
  };
  fs.writeFileSync(path.join(OUT, 'real-asc.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log('\n=== SELESAI. Bukti penuh:', path.join(OUT, 'real-asc.json'), '===');
  console.log('Permintaan script.google.com disekat:', blockedHosts.length);
  process.exitCode = outcome.ok ? 0 : 1;
}

main().catch((e) => { console.error('BLOCKER (tidak dijangka):', e); process.exit(1); });
