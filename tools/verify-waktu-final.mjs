// PENGESAHAN AKHIR (Claude) — pengesahan pelayar SEBENAR (Puppeteer/Chromium), bukan audit umum
// dan bukan skrip produksi/ujian rasmi. Menggunakan semula harness sedia ada
// (tools/verify-print.html, yang memuatkan builder.js/builder.css tulen tanpa app.js/rangkaian)
// mengikut corak tools/verify-print.mjs, pada dua viewport (desktop 1440x900, mobile 390x844).
//
// Menyemak SECARA VISUAL/DOM SEBENAR (bukan hanya panggilan fungsi), selepas pembetulan DeepSeek
// (provenance PER HARI melalui kelas.waktuHariAuto + label/tooltip per sel, bukan bendera seluruh
// kelas): lihat C:/Users/seman/work/deepseek-waktu-final-fix-out.txt.
//   1) Paparan label per SEL (kuning=inferens/auto, putih=disahkan manual) untuk Bilangan Waktu
//      Ikut Kelas selepas import automatik — SEMUA hari mula sebagai auto.
//   2) Mengedit SATU hari SATU kelas: hari itu bertukar "disahkan"; hari LAIN kelas yang sama
//      mesti KEKAL "auto" (bukan ikut disahkan secara senyap).
//   3) Keadaan per-hari (nilai + auto/manual) kekal selepas MUAT SEMULA (reload) pelayar sebenar.
//   4) KOKU tiada untuk Tahun 1–3 dalam paparan matriks "Lihat & Edit Jadual".
//   5) Sempadan waktu balik BERBEZA ikut kelas kelihatan pada cetak (sel tertutup #eee).
//
// Data SEPENUHNYA sintetik (nama sekolah/guru/kelas rekaan). Permintaan rangkaian ke
// script.google.com disekat (request interception) sebagai pertahanan tambahan — harness ini
// tidak sepatutnya memanggilnya langsung pun kerana hanya builder.js dimuatkan, bukan app.js.
//
// Jalankan: node tools/verify-waktu-final.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const PORT = Number(process.env.VERIFY_PORT || 8972);
const OUT = path.join(ROOT, '.pdf-verification', 'waktu-final');
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

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

function buildState() {
  const hari = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'];
  // waktuHariAuto SAMA dengan waktuHari pada mulanya — meniru keadaan sejurus selepas import aSc
  // (provenance per hari, bukan bendera seluruh kelas): setiap hari masih "auto" sehingga nilai
  // semasa (waktuHari[h]) menyimpang daripada nilai auto (waktuHariAuto[h]), iaitu hariManual().
  const waktuAwal = {
    k1: { ISNIN: 5, SELASA: 6, RABU: 5, KHAMIS: 6, JUMAAT: 4 },
    k3: { ISNIN: 7, SELASA: 7, RABU: 5, KHAMIS: 7, JUMAAT: 6 },
    k4: { ISNIN: 8, SELASA: 8, RABU: 8, KHAMIS: 8, JUMAAT: 8 },
  };
  const kelas = [
    { id: 'k1', nama: '1 CONTOH', tahap: 1, guruKelas: 'g1', waktuHari: { ...waktuAwal.k1 }, waktuHariAuto: { ...waktuAwal.k1 } },
    { id: 'k3', nama: '3 CONTOH', tahap: 3, guruKelas: 'g2', waktuHari: { ...waktuAwal.k3 }, waktuHariAuto: { ...waktuAwal.k3 } },
    { id: 'k4', nama: '4 CONTOH', tahap: 4, guruKelas: 'g3', waktuHari: { ...waktuAwal.k4 }, waktuHariAuto: { ...waktuAwal.k4 } },
  ];
  const guru = [
    { id: 'g1', nama: 'GURU CONTOH SATU', kod: 'G1', jawatan: 'Guru Akademik', maxHari: 10, tidakAda: [] },
    { id: 'g2', nama: 'GURU CONTOH DUA', kod: 'G2', jawatan: 'Guru Akademik', maxHari: 10, tidakAda: [] },
    { id: 'g3', nama: 'GURU CONTOH TIGA', kod: 'G3', jawatan: 'Guru Akademik', maxHari: 10, tidakAda: [] },
  ];
  const subjek = [{ id: 'bm', kod: 'BM', nama: 'BAHASA MELAYU', warna: '#ffd9d9', ganda: false }];
  // Satu slot pengajaran setiap kelas (RABU waktu 1) — hanya supaya bilJadual()>0 untuk buka
  // paparan "Lihat & Edit Jadual"; tidak relevan dengan sempadan waktu balik yang diuji.
  const slots = kelas.map((k, i) => ({ id: `s${i}`, kelasId: k.id, subjekId: 'bm', guruId: guru[i].id, hari: 'RABU', mula: 1, panjang: 1 }));
  // KOKU dikonfigurasi (sengaja) merangkumi Tahun 1, 3 DAN 4 — waktu 5 RABU, dalam sempadan
  // ketiga-tiga kelas (1 CONTOH RABU=5, 3 CONTOH RABU=5, 4 CONTOH RABU=8) supaya perbezaan
  // paparan ANTARA kelas semata-mata disebabkan sekatan tahap, bukan sempadan waktu balik.
  const acara = [{ id: 'e1', kod: 'KOKU', nama: 'Kokurikulum', warna: '#d9f0d1', hari: 'RABU', mula: 5, panjang: 1, skop: 'tahap', tahap: [1, 3, 4], guru: [], kelas: [] }];
  return {
    v: 3,
    sekolah: { nama: 'SK CONTOH PENGESAHAN AKHIR', tajukGuru: 'JADUAL WAKTU PERSENDIRIAN GURU', tajukKelas: 'JADUAL WAKTU KELAS', tahun: '2026', bermula: '', gb: '', gbGelaran: 'GURU BESAR', logo1: '', logo2: '' },
    masa: { mula: '07:30', tempoh: 30, waktu: { ISNIN: 8, SELASA: 8, RABU: 8, KHAMIS: 8, JUMAAT: 8 }, rehat: [], pra: { aktif: false, label: 'PENGURUSAN', mula: '07:20', tempoh: 10 } },
    hari, subjek, kelas, guru,
    peruntukan: {}, agihan: [], acara,
    kekangan: { maxHariGuru: 8, maxBerturut: 4, maxSubjekSehari: 3, terasPagi: true, elakLubang: true, elakAkhirTeras: true, sebarHari: true, kapasiti: {}, cubaan: 60 },
    jadual: { slots },
  };
}

// Kedua-dua fungsi di bawah scope kepada card "Bilangan Waktu Ikut Kelas" secara khusus —
// VIEWS.tetapan ada SATU LAGI table.dt tidak berkaitan ("Waktu & Rehat": Waktu/Mula/Tamat) pada
// halaman yang sama, jadi selector generik `table.dt` sahaja akan tersalah padan.
async function readTable(page) {
  return page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => {
      const h3 = c.querySelector('h3');
      return h3 && h3.textContent.trim() === 'Bilangan Waktu Ikut Kelas';
    });
    const table = card ? card.querySelector('table.dt') : null;
    const rows = table ? [...table.querySelectorAll('tbody tr')] : [];
    return rows.map((tr) => {
      const tds = [...tr.children];
      const nameTd = tds[0];
      return {
        nama: nameTd.textContent.trim(),
        // Label PER SEL selepas pembetulan DeepSeek: title="Disahkan (override manual)" (putih)
        // atau title="Inferens — sahkan" (kuning, background:#fef3c7 pada input). Tiada lagi
        // bendera .tag seluruh kelas.
        hari: tds.slice(1).map((td) => {
          const input = td.querySelector('input');
          const title = td.getAttribute('title') || '';
          return { nilai: input ? input.value : null, manual: title.startsWith('Disahkan'), title };
        }),
      };
    });
  });
}

async function editDayInput(page, className, dayIndex, newValue) {
  return page.evaluate((className, dayIndex, newValue) => {
    const card = [...document.querySelectorAll('.card')].find((c) => {
      const h3 = c.querySelector('h3');
      return h3 && h3.textContent.trim() === 'Bilangan Waktu Ikut Kelas';
    });
    const table = card ? card.querySelector('table.dt') : null;
    const rows = table ? [...table.querySelectorAll('tbody tr')] : [];
    const row = rows.find((tr) => tr.children[0].textContent.trim().startsWith(className));
    if (!row) return { ok: false, reason: 'row not found' };
    const input = row.children[dayIndex + 1].querySelector('input');
    if (!input) return { ok: false, reason: 'input not found' };
    input.value = String(newValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  }, className, dayIndex, newValue);
}

async function readKokuCell(page, dayIndex, period) {
  return page.evaluate((dayIndex, period) => {
    const rows = [...document.querySelectorAll('#content table.tt tbody tr')];
    const row = rows[dayIndex];
    if (!row) return { found: false, reason: 'row missing' };
    const td = row.children[period]; // td[0]=day label, td[period] = period column (pra/rehat tiada)
    if (!td) return { found: false, reason: 'td missing' };
    const cls = td.querySelector('.cls');
    return { found: true, text: cls ? cls.textContent.trim() : '', closed: /repeating-linear-gradient/.test(td.getAttribute('style') || '') };
  }, dayIndex, period);
}

async function selectLihatKelas(page, classId) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === 'Kelas');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 80));
  await page.evaluate((classId) => {
    const sel = document.querySelector('#content select');
    if (!sel) throw new Error('select entiti tidak ditemui');
    sel.value = classId;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, classId);
  await new Promise((r) => setTimeout(r, 80));
}

async function readClosedCountOnPrint(page, className, dayShort) {
  return page.evaluate((className, dayShort) => {
    const sheets = [...document.querySelectorAll('#cetakArea .sheet')];
    const sheet = sheets.find((s) => s.textContent.includes(className));
    if (!sheet) return { found: false };
    const rows = [...sheet.querySelectorAll('table.pt tbody tr')];
    const row = rows.find((tr) => tr.children[0] && tr.children[0].textContent.trim() === dayShort);
    if (!row) return { found: false, reason: 'row not found' };
    const periodTds = [...row.children].slice(1); // buang lajur label hari
    // Chrome menyerikan semula "background:#eee" sebagai "background: rgb(238, 238, 238)" dalam
    // getAttribute('style'), bukan hex asal — semak kedua-dua bentuk untuk keteguhan.
    const isClosed = (td) => { const s = td.getAttribute('style') || ''; return s.includes('#eee') || s.includes('rgb(238, 238, 238)'); };
    const closed = periodTds.filter(isClosed).length;
    return { found: true, totalCols: periodTds.length, closed, open: periodTds.length - closed };
  }, className, dayShort);
}

async function runForViewport(browser, vp, blockedHosts) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('script.google.com')) { blockedHosts.push(req.url()); req.abort(); return; }
    req.continue();
  });
  page.on('pageerror', (e) => console.error(`[pageerror ${vp.name}]`, e.message));
  await page.setViewport({ width: vp.width, height: vp.height });
  await page.goto(`http://127.0.0.1:${PORT}/tools/verify-print.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.jadualBuilder));
  await page.evaluate(() => localStorage.clear());
  const state = buildState();
  await page.evaluate((st) => window.jadualBuilder.setState(st), state);

  const result = { viewport: vp.name, assertions: [] };

  // ---- 1) Paparan "Bilangan Waktu Ikut Kelas" per SEL (sebelum sunting) — SEMUA hari auto ----
  await page.evaluate(() => window.jadualBuilder.go('tetapan'));
  await new Promise((r) => setTimeout(r, 50));
  result.sebelumSunting = await readTable(page);
  assertHariState(result.assertions, 'sebelum sunting', result.sebelumSunting, '1 CONTOH',
    { ISNIN: false, SELASA: false, RABU: false, KHAMIS: false, JUMAAT: false });
  await page.screenshot({ path: path.join(OUT, `1-tetapan-sebelum-${vp.name}.png`), fullPage: true });

  // ---- 2) Sunting SATU hari (ISNIN, indeks 0) bagi kelas "1 CONTOH" sahaja ----
  const editRes = await editDayInput(page, '1 CONTOH', 0, 6);
  result.suntingBerjaya = editRes.ok;
  await page.evaluate(() => window.jadualBuilder.go('tetapan')); // ubah() tidak render semula sendiri
  await new Promise((r) => setTimeout(r, 50));
  result.selepasSunting = await readTable(page);
  // ISNIN (diedit) mesti jadi "disahkan"; SELASA/RABU/KHAMIS/JUMAAT (tidak disentuh) mesti KEKAL auto.
  assertHariState(result.assertions, 'selepas sunting', result.selepasSunting, '1 CONTOH',
    { ISNIN: true, SELASA: false, RABU: false, KHAMIS: false, JUMAAT: false });
  // Kelas LAIN (tidak disentuh langsung) mesti kekal auto sepenuhnya juga.
  assertHariState(result.assertions, 'selepas sunting', result.selepasSunting, '3 CONTOH',
    { ISNIN: false, SELASA: false, RABU: false, KHAMIS: false, JUMAAT: false });
  await page.screenshot({ path: path.join(OUT, `2-tetapan-selepas-sunting-${vp.name}.png`), fullPage: true });

  // ---- 3) Muat semula (reload) pelayar SEBENAR — kekalkah keadaan per-hari? ----
  await page.evaluate(() => window.jadualBuilder.flush());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.jadualBuilder));
  await page.evaluate(() => window.jadualBuilder.go('tetapan'));
  await new Promise((r) => setTimeout(r, 50));
  result.selepasReload = await readTable(page);
  assertHariState(result.assertions, 'selepas reload', result.selepasReload, '1 CONTOH',
    { ISNIN: true, SELASA: false, RABU: false, KHAMIS: false, JUMAAT: false });
  await page.screenshot({ path: path.join(OUT, `3-tetapan-selepas-reload-${vp.name}.png`), fullPage: true });

  // ---- 4) KOKU tiada untuk Tahun 1–3 (paparan "Lihat & Edit Jadual", RABU waktu 5) ----
  await page.evaluate(() => window.jadualBuilder.go('lihat'));
  await new Promise((r) => setTimeout(r, 50));
  const dayIndexRabu = 2; // hari=['ISNIN','SELASA','RABU','KHAMIS','JUMAAT']
  result.koku = {};
  for (const [label, id] of [['1 CONTOH (Tahun 1)', 'k1'], ['3 CONTOH (Tahun 3)', 'k3'], ['4 CONTOH (Tahun 4)', 'k4']]) {
    await selectLihatKelas(page, id);
    result.koku[label] = await readKokuCell(page, dayIndexRabu, 5);
  }
  await page.screenshot({ path: path.join(OUT, `4-lihat-tahun4-${vp.name}.png`), fullPage: true });

  // ---- 5) Cetak: sempadan waktu balik berbeza ikut kelas (sel tertutup #eee) ----
  await page.evaluate(() => window.jadualBuilder.go('cetak'));
  await new Promise((r) => setTimeout(r, 50));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.print-type-tabs button')].find((b) => b.textContent.trim() === 'Jadual Kelas');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 50));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pilih semua');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  result.cetak = {
    '1 CONTOH (RABU, balik waktu 5)': await readClosedCountOnPrint(page, '1 CONTOH', 'RAB'),
    '4 CONTOH (RABU, balik waktu 8)': await readClosedCountOnPrint(page, '4 CONTOH', 'RAB'),
  };
  await page.screenshot({ path: path.join(OUT, `5-cetak-${vp.name}.png`), fullPage: true });

  await context.close();
  return result;
}

// ---- Assert per-hari: SATU hari diedit mesti kekal "manual", hari LAIN kelas yang sama mesti
// KEKAL "auto" (bukan ikut disahkan secara senyap). Digunakan pada dua titik: sejurus selepas
// sunting (dalam sesi yang sama), dan sejurus selepas muat semula (reload) pelayar sebenar.
function assertHariState(assertions, label, rows, className, expectedManualByDay) {
  const row = rows.find((r) => r.nama === className);
  if (!row) { assertions.push({ name: `${label}: baris ${className} ditemui`, pass: false, detail: 'baris tidak ditemui' }); return; }
  const hariNama = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'];
  hariNama.forEach((h, i) => {
    const cell = row.hari[i];
    const expected = expectedManualByDay[h];
    const pass = !!cell && cell.manual === expected;
    assertions.push({
      name: `${label}: ${className} ${h} mesti ${expected ? 'DISAHKAN (manual)' : 'AUTO (belum disahkan)'}`,
      pass, detail: cell ? { nilai: cell.nilai, manual: cell.manual, title: cell.title } : 'sel tiada',
    });
  });
}

async function main() {
  const server = await startServer();
  const browser = await puppeteer.launch({ headless: true });
  const blockedHosts = [];
  const report = { generatedAt: new Date().toISOString(), viewports: [] };
  try {
    const viewports = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }];
    for (const vp of viewports) {
      console.log('== viewport', vp.name, '==');
      const r = await runForViewport(browser, vp, blockedHosts);
      report.viewports.push(r);
      console.log(JSON.stringify(r, null, 2));
    }
  } finally {
    await browser.close();
    server.close();
  }
  report.script_google_com_requests_blocked = blockedHosts;
  const allAssertions = report.viewports.flatMap((v) => v.assertions.map((a) => ({ viewport: v.viewport, ...a })));
  const failed = allAssertions.filter((a) => !a.pass);
  report.assertionSummary = { total: allAssertions.length, pass: allAssertions.length - failed.length, fail: failed.length };
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
  console.log('\n=== ASSERT ===');
  allAssertions.forEach((a) => console.log(`${a.pass ? 'LULUS' : 'GAGAL'} [${a.viewport}] ${a.name}`));
  console.log(`\n${report.assertionSummary.pass}/${report.assertionSummary.total} assert lulus`);
  console.log('=== SELESAI. Bukti penuh:', path.join(OUT, 'results.json'), '===');
  console.log('Permintaan script.google.com disekat:', blockedHosts.length);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
