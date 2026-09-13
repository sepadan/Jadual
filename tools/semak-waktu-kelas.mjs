// Semak WAKTU SEBENAR setiap kelas daripada fail aSc pengguna: waktu mana yang berisi bagi
// setiap kelas pada setiap hari (bukan hanya maksimum). Tujuan: jawab sama ada kelas Tahap 1
// (Tahun 1-3) benar-benar ada waktu 11/12 pada mana-mana hari.
// Jalankan: node tools/semak-waktu-kelas.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const PORT = Number(process.env.SEMAK_PORT || 8981);
const SOURCE_PDF_URL = '/.pdf-verification/waktu-final/source-asc.pdf';
const SOURCE_PDF_PATH = path.join(ROOT, '.pdf-verification', 'waktu-final', 'source-asc.pdf');
if (!fs.existsSync(SOURCE_PDF_PATH)) { console.error('BLOCKER: fail sumber tiada:', SOURCE_PDF_PATH); process.exit(1); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf' };

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

async function diDalamPelayar(pdfUrl) {
  const pdfjs = await import('/vendor/pdf.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  const mod = await import('/pdf-import.js');
  const bytes = new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer());
  const dry = await mod.parseTeacherPdf(bytes.slice(), pdfjs, [], () => {});
  const teachers = dry.pages.map((p) => p.pageTeacher).filter(Boolean);
  const parsed = await mod.parseTeacherPdf(bytes.slice(), pdfjs, teachers, () => {});
  const per = {};
  const per2 = {};
  const baris = {};
  const dup = {};
  parsed.rows.forEach((r) => {
    if (r.isDuty || !r.className) return;
    const k = r.className;
    per[k] = per[k] || {};
    baris[k] = (baris[k] || 0) + 1;
    (per[k][r.day] = per[k][r.day] || []).push(Number(r.period));
    (per2[k] = per2[k] || {});
    (per2[k][r.day] = per2[k][r.day] || []).push({ period: Number(r.period), subject: r.subject, teacherId: r.teacherId });
  });
  const dupDetail = {};
  Object.keys(per).forEach((k) => {
    dupDetail[k] = {};
    Object.keys(per[k]).forEach((h) => {
      const kump = {};
      per2[k][h].forEach((r) => { const key = String(r.period); kump[key] = kump[key] || []; kump[key].push(`${r.subject || '?'}@${String(r.teacherId).slice(0, 3)}`); });
      const ganda = Object.entries(kump).filter(([, v]) => v.length > 1);
      if (ganda.length) dupDetail[k][h] = ganda.map(([peri, v]) => `${peri}: ${v.join(' + ')}`);
    });
  });
  Object.keys(per).forEach((k) => {
    dup[k] = {};
    Object.keys(per[k]).forEach((h) => {
      const c = {};
      per[k][h].forEach((x) => { c[x] = (c[x] || 0) + 1; });
      const ganda = Object.entries(c).filter(([, n]) => n > 1).map(([peri, n]) => `${peri}x${n}`);
      if (ganda.length) dup[k][h] = ganda;
    });
  });
  const out = {};
  Object.keys(per).sort().forEach((k) => {
    out[k] = {};
    Object.keys(per[k]).forEach((h) => { out[k][h] = [...new Set(per[k][h])].sort((a, b) => a - b); });
  });
  return { rows: parsed.rows.length, kelas: out, baris, dup, dupDetail };
}

async function main() {
  const server = await startServer();
  const browser = await puppeteer.launch({ headless: true });
  let hasil;
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (req.url().includes('script.google.com')) { req.abort(); return; } req.continue(); });
    await page.goto(`http://127.0.0.1:${PORT}/tools/verify-print.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.jadualBuilder));
    hasil = await page.evaluate(diDalamPelayar, `http://127.0.0.1:${PORT}${SOURCE_PDF_URL}`);
  } finally { await browser.close(); server.close(); }

  console.log('baris subjek dibaca:', hasil.rows);
  const URUT = { IS: 0, ISNIN: 0, SEL: 1, SELASA: 1, RAB: 2, RABU: 2, KHA: 3, KHAMIS: 3, JUM: 4, JUMAAT: 4 };
  Object.keys(hasil.kelas).forEach((k) => {
    const g = hasil.kelas[k];
    const bhg = Object.keys(g).sort((a, b) => (URUT[a] ?? 9) - (URUT[b] ?? 9))
      .map((h) => `${h}[${g[h].join(',')}]`).join(' ');
    console.log(k.padEnd(10), bhg);
  });
  const tinggi = {};
  Object.keys(hasil.kelas).forEach((k) => {
    const semua = Object.values(hasil.kelas[k]).flat();
    tinggi[k] = Math.max(0, ...semua);
  });
  console.log('\nwaktu tertinggi per kelas:', JSON.stringify(tinggi));
  console.log('\nbaris subjek per kelas (mentah, ada pendua):', JSON.stringify(hasil.baris));
  const bersih = {};
  Object.keys(hasil.kelas).forEach((k) => {
    bersih[k] = Object.values(hasil.kelas[k]).reduce((s, a) => s + a.length, 0);
  });
  console.log('waktu subjek UNIK per kelas:', JSON.stringify(bersih));
  console.log('\npendua (kelas-hari: waktu x bilangan):', JSON.stringify(hasil.dup));
  console.log('\nDETAIL pendua 3 BIJAK / 6 BIJAK / 1 BIJAK:', JSON.stringify({ '3 BIJAK': hasil.dupDetail['3 BIJAK'], '6 BIJAK': hasil.dupDetail['6 BIJAK'], '1 BIJAK': hasil.dupDetail['1 BIJAK'] }, null, 1));
  console.log('failsafe: ', JSON.stringify(hasil).length, 'bytes');
}
main().catch((e) => { console.error('BLOCKER:', e); process.exit(1); });
