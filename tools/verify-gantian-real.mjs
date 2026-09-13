// Sahkan gantian (MySTEP/Praktikal) pada fail aSc SEBENAR: import dua kali — sekali tanpa pautan
// gantian, sekali dengan seorang guru MySTEP menggantikan seorang guru lain — dan bandingkan
// bilangan slot kelas (mesti SAMA) serta pemilik slot (mesti BERPINDAH).
// Jalankan: node tools/verify-gantian-real.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const PORT = Number(process.env.VERIFY_PORT || 8975);
const PDF_URL = '/.pdf-verification/waktu-final/source-asc.pdf';
const PDF_PATH = path.join(ROOT, '.pdf-verification', 'waktu-final', 'source-asc.pdf');
if (!fs.existsSync(PDF_PATH)) { console.error('BLOCKER: PDF sumber tiada:', PDF_PATH); process.exit(1); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.pdf': 'application/pdf' };
const startServer = () => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/tools/verify-print.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  server.listen(PORT, '127.0.0.1', () => resolve(server));
});

async function runInBrowser(pdfUrl) {
  const pdfjs = await import('/vendor/pdf.min.js');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  const imp = await import('/pdf-import.js');
  const build = await import('/pdf-builder.js');
  const bytes = new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer());
  const dry = await imp.parseTeacherPdf(bytes.slice(), pdfjs, [], () => {});
  const asli = dry.pages.map((p) => p.pageTeacher).filter(Boolean);
  const parsed = await imp.parseTeacherPdf(bytes.slice(), pdfjs, asli, () => {});
  const idMap = new Map(asli.map((t, i) => [t.id, `t${i + 1}`]));
  const baris = parsed.rows.map((r) => ({ ...r, teacherId: idMap.get(r.teacherId) || r.teacherId }));
  const meta = { ...parsed.metadata, principalName: '', pages: [] };

  const buatGuru = (withCover) => asli.map((t, i) => {
    const id = `t${i + 1}`;
    const guru = { id, name: `GURU ${i + 1}`, shortName: `G${i + 1}`, position: 'Guru Akademik Biasa', reliefEligible: true, priority: 3, active: true };
    if (withCover && i === 1) { guru.position = 'Personel MySTEP'; guru.coversJson = JSON.stringify([{ teacherId: 't1', subjects: [] }]); }
    return guru;
  });

  const kira = (state) => {
    const kelas = {}, guru = {};
    (state.jadual?.slots || []).forEach((s) => {
      const k = state.kelas.find((x) => x.id === s.kelasId);
      const n = Math.max(1, Number(s.panjang) || 1);
      for (let o = 0; o < n; o++) {
        const sel = `${s.hari}|${Number(s.mula) + o}`;
        if (k) { (kelas[k.nama] = kelas[k.nama] || new Set()).add(sel); }
      }
      guru[s.guruId] = (guru[s.guruId] || 0) + n;
    });
    const unik = {}; Object.keys(kelas).forEach((n) => { unik[n] = kelas[n].size; });
    const nama = {}; (state.guru || []).forEach((g) => { nama[g.id] = g.nama || g.name || ''; });
    return { unikKelas: unik, slotGuru: guru, namaGuru: nama, jumlahWaktu: Object.values(guru).reduce((a, b) => a + b, 0) };
  };

  const tanpa = build.draftFromPdf(baris, buatGuru(false), {}, meta);
  const dengan = build.draftFromPdf(baris, buatGuru(true), {}, meta);
  return { tanpa: kira(tanpa), dengan: kira(dengan), namaGuru: dengan.guru.map((g) => ({ id: g.id, jawatan: g.jawatan || g.position || '' })) };
}

const server = await startServer();
const browser = await puppeteer.launch({ headless: true });
let hasil;
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/tools/verify-print.html`, { waitUntil: 'load' });
  hasil = await page.evaluate(runInBrowser, `http://127.0.0.1:${PORT}${PDF_URL}`);
} finally { await browser.close(); server.close(); }

const A = hasil.tanpa, B = hasil.dengan;
const namaA = A.namaGuru || {}, namaB = B.namaGuru || {};
const cariNama = (peta, awalan) => Object.keys(peta).find((id) => String(peta[id]).startsWith(awalan));
let gagal = 0;
const sama = JSON.stringify(A.unikKelas) === JSON.stringify(B.unikKelas);
console.log('slot unik kelas tanpa pautan :', JSON.stringify(A.unikKelas));
console.log('slot unik kelas dengan gantian:', JSON.stringify(B.unikKelas));
console.log(sama ? 'OK  - slot unik kelas TIDAK berubah selepas gantian' : 'GAGAL - slot unik kelas berubah selepas gantian'); if (!sama) gagal++;
const id1 = cariNama(namaB, 'GURU 1') || 't1', id2 = cariNama(namaB, 'GURU 2') || 't2';
const t1a = A.slotGuru[id1] || 0, t1b = B.slotGuru[id1] || 0, t2a = A.slotGuru[id2] || 0, t2b = B.slotGuru[id2] || 0;
console.log(`guru 1 (diganti): ${t1a} -> ${t1b} waktu | guru 2 (MySTEP): ${t2a} -> ${t2b} waktu`);
const pindah = t1b === 0 && t2b === t2a + t1a && t1a > 0;
console.log(pindah ? 'OK  - pemilikan waktu berpindah sepenuhnya kepada MySTEP' : 'GAGAL - pemilikan waktu tidak berpindah dengan betul'); if (!pindah) gagal++;
console.log('jumlah waktu semua guru:', A.jumlahWaktu, '->', B.jumlahWaktu);
if (A.jumlahWaktu !== B.jumlahWaktu) { console.log('GAGAL - jumlah waktu keseluruhan berubah'); gagal++; }
console.log('KESIMPULAN:', gagal ? 'GAGAL' : 'LULUS');
process.exitCode = gagal ? 1 : 0;
