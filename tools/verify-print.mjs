// Harness pengesahan pelayar SEBENAR untuk cetakan/PDF (bukan bahagian rasmi `npm test`):
// apa yang diuji ialah cetak (printToPDF) lawan eksport (html2canvas+jsPDF) pada 8 senario.
// Jalankan: npm i -D puppeteer && npm run verify:print
// Menjalankan builder.js/builder.css sebenar (repo semasa) dalam Chromium tulen melalui Puppeteer:
// html2canvas + jsPDF benar untuk laluan Eksport PDF, dan Chromium printToPDF (preferCSSPageSize)
// untuk laluan Cetak (window.print). Data adalah data sintetik tempatan sahaja - tiada rangkaian,
// tiada Apps Script. Jalankan: node _verify-run.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const ROOT = process.cwd();
const PORT = Number(process.env.VERIFY_PORT || 8971);
const OUT = process.env.VERIFY_OUT || path.join(ROOT, '.pdf-verification');
fs.mkdirSync(OUT, { recursive: true });

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

function buildState() {
  const subjects = [
    { kod: 'BM', nama: 'BAHASA MELAYU', warna: '#ffd9d9' },
    { kod: 'BI', nama: 'BAHASA INGGERIS', warna: '#ffe7c7' },
    { kod: 'MT', nama: 'MATEMATIK', warna: '#fff6bf' },
    { kod: 'SN', nama: 'SAINS', warna: '#e2f7c4' },
    { kod: 'PJ', nama: 'PENDIDIKAN JASMANI', warna: '#c9f2e3' },
    { kod: 'PSV', nama: 'PENDIDIKAN SENI VISUAL', warna: '#c9ecff' },
    { kod: 'PM', nama: 'PENDIDIKAN MORAL', warna: '#d7dcff' },
  ].map((s, i) => ({ id: 'sub' + i, ...s }));

  const guru = [];
  for (let i = 0; i < 23; i++) {
    guru.push({
      id: 'g' + i,
      nama: `GURU CONTOH BILANGAN ${String(i + 1).padStart(2, '0')} BIN CONTOH VERIFIKASI`,
      kod: 'G' + String(i + 1).padStart(2, '0'), jawatan: 'Guru Akademik', maxHari: 8, tidakAda: [],
    });
  }
  // Kelas sengaja tidak tersusun untuk uji semula susunKelas() Tahun1-6 hujung ke hujung.
  const kelasDef = [
    { tahap: 3, nama: '3 CEKAP' }, { tahap: 1, nama: '1 BIJAK' }, { tahap: 6, nama: '6 GEMILANG' },
    { tahap: 2, nama: '2 BIJAK' }, { tahap: 5, nama: '5 CEKAP' }, { tahap: 4, nama: '4 BIJAK' },
  ];
  const kelas = kelasDef.map((k, i) => ({ id: 'k' + i, nama: k.nama, tahap: k.tahap, guruKelas: guru[i].id }));

  const hari = ['ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT'];
  const N = 13;
  const peruntukan = {};
  subjects.forEach((s) => { peruntukan[s.id] = { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4 }; });

  const slots = [];
  hari.forEach((h, d) => {
    kelas.forEach((k, ci) => {
      // Satu guru TETAP bagi setiap pasangan kelas+subjek sepanjang minggu (bukan guru berbeza
      // setiap waktu seperti dahulu, yang menghasilkan 66 pasangan per kelas dan memampatkan
      // ringkasan ke fon 6px). Setiap subjek diajar oleh satu guru yang sama pada semua hari,
      // menjadikan ringkasan ~7-9 baris seperti sekolah sebenar dan metrik harness bermakna.
      const guruSubjek = {};
      subjects.forEach((s, si) => { guruSubjek[s.id] = guru[(ci * subjects.length + si) % guru.length]; });
      for (let p = 1; p <= N; p++) {
        const subj = subjects[(ci + p) % subjects.length];
        slots.push({ id: `s${d}_${ci}_${p}`, hari: h, kelasId: k.id, subjekId: subj.id, guruId: guruSubjek[subj.id].id, mula: p, panjang: 1 });
      }
    });
  });

  return {
    v: 3,
    sekolah: {
      nama: 'SK CONTOH VERIFIKASI', tajukGuru: 'JADUAL WAKTU PERSENDIRIAN GURU', tajukKelas: 'JADUAL WAKTU KELAS',
      tahun: '2026', bermula: '01/01/2026', gb: 'ENCIK CONTOH BIN VERIFIKASI', gbGelaran: 'GURU BESAR', logo1: '', logo2: '',
    },
    masa: {
      mula: '07:30', tempoh: 30,
      waktu: { ISNIN: N, SELASA: N, RABU: N, KHAMIS: N, JUMAAT: N },
      rehat: [{ selepas: 4, minit: 20, label: 'REHAT' }, { selepas: 9, minit: 15, label: 'REHAT 2' }],
      pra: { aktif: true, label: 'PENGURUSAN', mula: '07:20', tempoh: 10 },
    },
    hari, subjek: subjects, kelas, guru,
    peruntukan, agihan: [], acara: [],
    kekangan: { maxHariGuru: 8, maxBerturut: 4, maxSubjekSehari: 3, terasPagi: true, elakLubang: true, elakAkhirTeras: true, sebarHari: true, kapasiti: {}, cubaan: 60 },
    jadual: { slots, dijana: new Date().toISOString(), kos: 0 },
  };
}

function countPdfPages(buf) {
  const text = buf.toString('latin1');
  const m = text.match(/\/Type\s*\/Page(?!s)/g);
  return m ? m.length : 0;
}
function firstPdfMediaBoxMm(buf) {
  const text = buf.toString('latin1');
  const m = text.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!m) return null;
  const pt = (n) => Math.round(parseFloat(n) * 0.352778 * 10) / 10;
  return { wMm: pt(m[3]) - pt(m[1]), hMm: pt(m[4]) - pt(m[2]) };
}

const jenisLabel = { guru: 'Jadual Guru', kelas: 'Jadual Kelas', 'induk-kelas': 'Jadual Induk Kelas', 'induk-guru': 'Jadual Induk Guru' };

async function preparePrintView(browser, vp, jenis, state) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`  [pageerror ${jenis}/${vp.name}]`, e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') console.error(`  [console ${jenis}/${vp.name}]`, msg.text()); });
  await page.setViewport({ width: vp.width, height: vp.height });
  await page.goto(`http://127.0.0.1:${PORT}/tools/verify-print.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.jadualBuilder));
  await page.evaluate((st) => { localStorage.clear(); window.jadualBuilder.setState(st); }, state);
  await page.evaluate(() => window.jadualBuilder.go('cetak'));
  await page.evaluate((label) => {
    const btn = [...document.querySelectorAll('.print-type-tabs button')].find((b) => b.textContent.trim() === label);
    if (!btn) throw new Error('tab not found: ' + label);
    btn.click();
  }, jenisLabel[jenis]);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pilih semua');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 200));
  return { context, page };
}

// Eksport sebenar SEKALI: pintas jsPDF.API.save supaya ia menulis byte PDF SEBENAR (daripada
// this.output('arraybuffer'), output binari jsPDF yang sama seperti yang akan disimpan) ke
// window.__pdfBytes dan Node terus menulisnya ke cakera. Muat turun blob sebenar disekat/dibatalkan
// oleh Chromium headless walau selepas browserContext.setDownloadBehavior({policy:'allow'})
// (downloadProgress mencapai 100% penuh lalu "canceled" - disahkan berasingan), jadi laluan muat
// turun OS dielakkan; laluan html2canvas+jsPDF sebenar (tiada mock) tidak disentuh.
async function captureExportOnce(page, exportPath) {
  await page.evaluate(() => {
    window.__pdfBytes = null;
    window.__pdfSaveErr = null;
    if (!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API)) {
      throw new Error('jspdf.jsPDF.API not available to hook save()');
    }
    window.jspdf.jsPDF.API.save = function () {
      try { window.__pdfBytes = Array.from(new Uint8Array(this.output('arraybuffer'))); }
      catch (e) { window.__pdfSaveErr = String(e && e.message || e); }
      return this;
    };
  });
  const exportResult = await page.evaluate(async () => {
    const btn = document.querySelector('#btnExportBuilderPdf');
    try {
      await window.jadualBuilder.eksportPdf();
    } catch (e) {
      return { ok: false, err: String(e && e.message || e) };
    }
    return {
      ok: true,
      hasBytes: Array.isArray(window.__pdfBytes),
      byteLen: Array.isArray(window.__pdfBytes) ? window.__pdfBytes.length : 0,
      saveErr: window.__pdfSaveErr,
      btnText: btn ? btn.textContent : null,
      btnDisabled: btn ? btn.disabled : null,
      toastText: [...document.querySelectorAll('#toastBox div')].map((d) => d.textContent).join(' | '),
    };
  });
  if (!exportResult.ok || !exportResult.hasBytes) {
    throw new Error(`eksportPdf did not reach save(): ${JSON.stringify(exportResult)}`);
  }
  const bytesArr = await page.evaluate(() => window.__pdfBytes);
  fs.writeFileSync(exportPath, Buffer.from(bytesArr));
  return exportResult;
}

// Idempotency SEBENAR (bukan navigasi baharu setiap kali): satu DOM/page dikekalkan, eksport
// dipanggil N kali BERTURUT-TURUT (setiap panggilan eksportPdfJadual memanggil semula
// kemasSelCetak_ pada DOM yang SAMA - itulah senario pepijat 19->9.5->4.75 asal). Bait PDF (SHA256,
// bukan sekadar panjang) dan fon terkira (computed font-size) sel sampel diukur selepas SETIAP
// panggilan untuk sahkan tiada pengecilan berganda dan tiada perubahan bait antara larian.
async function sameDomRepeatedExport(browser, vp, jenis, state, times) {
  const { context, page } = await preparePrintView(browser, vp, jenis, state);
  const runs = [];
  try {
    for (let i = 1; i <= times; i++) {
      const exportPath = path.join(OUT, `export-${jenis}-${vp.name}-samedom${i}.pdf`);
      await captureExportOnce(page, exportPath);
      const buf = fs.readFileSync(exportPath);
      const metrics = await measureSheets(page);
      runs.push({
        run: i, path: exportPath, bytes: buf.length, sha256: sha256(buf),
        sampleCellFontPx: metrics[0] ? metrics[0].sampleCellFontPx : null,
        sampleSumFontPx: metrics[0] ? metrics[0].sampleSumFontPx : null,
        sheet0TableHeight: metrics[0] ? metrics[0].tableHeight : null,
        sheet0SumTableHeight: metrics[0] ? metrics[0].sumTableHeight : null,
        sheet0OverflowY: metrics[0] ? metrics[0].sheetOverflowY : null,
      });
    }
  } finally {
    await context.close();
  }
  const allSameHash = runs.every((r) => r.sha256 === runs[0].sha256);
  const allSameFont = runs.every((r) => r.sampleCellFontPx === runs[0].sampleCellFontPx);
  return { jenis, viewport: vp.name, times, runs, allSameHash, allSameFont };
}

async function measureSheets(page) {
  return page.evaluate(() => {
    const sheets = [...document.querySelectorAll('#cetakArea .sheet')];
    return sheets.map((s, i) => {
      const r = s.getBoundingClientRect();
      const tbl = s.querySelector('table.pt,table.pt-master');
      const tblRect = tbl ? tbl.getBoundingClientRect() : null;
      const rows = tbl && tbl.tBodies[0] ? [...tbl.tBodies[0].rows].map((tr) => Math.round(tr.getBoundingClientRect().height * 100) / 100) : [];
      const clippedPcs = [...s.querySelectorAll('td.cellv .pc, td.pt-master-cell .pc')]
        .filter((pc) => pc.scrollHeight > pc.clientHeight + 1 || pc.scrollWidth > pc.clientWidth + 1);
      const clippedCells = clippedPcs.map((pc) => pc.closest('td').textContent.trim().slice(0, 24));
      const dump = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName, cls: el.className, text: el.textContent.trim().slice(0, 20),
          rect: { w: Math.round(rect.width * 100) / 100, h: Math.round(rect.height * 100) / 100, top: Math.round(rect.top * 100) / 100, left: Math.round(rect.left * 100) / 100 },
          scrollW: el.scrollWidth, scrollH: el.scrollHeight, clientW: el.clientWidth, clientH: el.clientHeight, offsetH: el.offsetHeight,
          cs: {
            position: cs.position, inset: `${cs.top}/${cs.right}/${cs.bottom}/${cs.left}`,
            display: cs.display, flexDirection: cs.flexDirection, justifyContent: cs.justifyContent, alignItems: cs.alignItems,
            width: cs.width, height: cs.height, minHeight: cs.minHeight, maxHeight: cs.maxHeight,
            minWidth: cs.minWidth, boxSizing: cs.boxSizing,
            padding: `${cs.paddingTop}/${cs.paddingRight}/${cs.paddingBottom}/${cs.paddingLeft}`,
            margin: `${cs.marginTop}/${cs.marginRight}/${cs.marginBottom}/${cs.marginLeft}`,
            border: cs.border,
            fontSize: cs.fontSize, lineHeight: cs.lineHeight, whiteSpace: cs.whiteSpace,
            overflow: cs.overflow, overflowWrap: cs.overflowWrap, wordBreak: cs.wordBreak,
            flexShrink: cs.flexShrink, flexGrow: cs.flexGrow, flexBasis: cs.flexBasis,
            verticalAlign: cs.verticalAlign,
          },
        };
      };
      const deepClipDump = clippedPcs.slice(0, 1).map((pc) => {
        const td = pc.closest('td');
        const tr = td ? td.closest('tr') : null;
        return {
          td: dump(td), tr: tr ? { rect: tr.getBoundingClientRect(), styleHeight: tr.style.height, cells: tr.cells.length } : null,
          pc: dump(pc),
          children: [...pc.children].map(dump),
        };
      });
      const sumHeaders = [...s.querySelectorAll('table.sum thead th')].map((th) => ({
        text: th.textContent.trim(), h: Math.round(th.getBoundingClientRect().height * 100) / 100,
        lineHeight: Math.round((parseFloat(getComputedStyle(th).lineHeight) || 0) * 100) / 100,
      }));
      const sumTbl = s.querySelector('table.sum');
      const sumTblRect = sumTbl ? sumTbl.getBoundingClientRect() : null;
      const sumRowCount = sumTbl && sumTbl.tBodies[0] ? sumTbl.tBodies[0].rows.length : 0;
      const pclsEl = s.querySelector('td.cellv .pcls, td.pt-master-cell .pcls');
      const pgrEl = s.querySelector('td.cellv .pgr, td.pt-master-cell .pgr');
      const sumTdEl = s.querySelector('table.sum tbody td');
      // Metrik ringkasan: fon ringkasan (min/max merentasi semua td tbody) dan bilangan td JUMLAH
      // (td.c) yang teksnya kosong - mesti 0, membuktikan nombor JUMLAH benar-benar ada dan tidak
      // "hilang" apabila jadual dimampatkan.
      const sumTds = [...s.querySelectorAll('table.sum tbody td')];
      const sumFonts = sumTds.map((td) => parseFloat(getComputedStyle(td).fontSize) || 0);
      const sumJumlahTds = [...s.querySelectorAll('table.sum tbody td.c')];
      const sumEmptyJumlahTdCount = sumJumlahTds.filter((td) => td.textContent.trim() === '').length;
      return {
        index: i,
        sheetW: Math.round(r.width), sheetH: Math.round(r.height),
        sheetOverflowX: Math.round(s.scrollWidth - s.clientWidth),
        sheetOverflowY: Math.round(s.scrollHeight - s.clientHeight),
        tableHeight: tblRect ? Math.round(tblRect.height * 100) / 100 : null,
        rowCount: rows.length, rowHeights: rows,
        sumTableHeight: sumTblRect ? Math.round(sumTblRect.height * 100) / 100 : null,
        sumRowCount,
        clippedCellCount: clippedCells.length, clippedCellSamples: clippedCells.slice(0, 5),
        deepClipDump,
        sumHeaders,
        sampleCellFontPx: pclsEl ? Math.round((parseFloat(getComputedStyle(pclsEl).fontSize) || 0) * 100) / 100 : null,
        samplePgrFontPx: pgrEl ? Math.round((parseFloat(getComputedStyle(pgrEl).fontSize) || 0) * 100) / 100 : null,
        sampleSumFontPx: sumTdEl ? Math.round((parseFloat(getComputedStyle(sumTdEl).fontSize) || 0) * 100) / 100 : null,
        sumFontMinPx: sumFonts.length ? Math.round(Math.min(...sumFonts) * 100) / 100 : null,
        sumFontMaxPx: sumFonts.length ? Math.round(Math.max(...sumFonts) * 100) / 100 : null,
        sumEmptyJumlahTdCount,
      };
    });
  });
}

async function scenario(browser, vp, jenis, state, opts = {}) {
  const label = `${jenis}/${vp.name}`;
  console.log('== scenario', label, opts.tag || '');
  const { context, page } = await preparePrintView(browser, vp, jenis, state);
  try {
    const metricsBefore = await measureSheets(page);

    // ---- Laluan 1: Cetak (window.print) sebenar melalui Chromium printToPDF, preferCSSPageSize ----
    const printPath = path.join(OUT, `print-${jenis}-${vp.name}${opts.suffix || ''}.pdf`);
    await page.pdf({ path: printPath, printBackground: true, preferCSSPageSize: true });
    const printBuf = fs.readFileSync(printPath);
    const printPages = countPdfPages(printBuf);
    const printBox = firstPdfMediaBoxMm(printBuf);

    // ---- Laluan 2: Eksport PDF sebenar (html2canvas + jsPDF asal, tiada mock) ----
    const exportPath = path.join(OUT, `export-${jenis}-${vp.name}${opts.suffix || ''}.pdf`);
    await captureExportOnce(page, exportPath);
    const exportBuf = fs.readFileSync(exportPath);
    const exportPages = countPdfPages(exportBuf);
    const exportBox = firstPdfMediaBoxMm(exportBuf);

    const metricsAfter = await measureSheets(page);

    // screenshot of the first rendered sheet for visual spot-checking
    const shotPath = path.join(OUT, `preview-${jenis}-${vp.name}${opts.suffix || ''}.png`);
    const firstSheet = await page.$('#cetakArea .sheet');
    if (firstSheet) await firstSheet.screenshot({ path: shotPath });

    return {
      jenis, viewport: vp.name, tag: opts.tag || null,
      sheetCount: metricsBefore.length,
      printPdf: { path: printPath, pages: printPages, mediaBoxMm: printBox, bytes: printBuf.length, sha256: sha256(printBuf) },
      exportPdf: { path: exportPath, pages: exportPages, mediaBoxMm: exportBox, bytes: exportBuf.length, sha256: sha256(exportBuf) },
      pageCountMatchesSheetCount: { print: printPages === metricsBefore.length, export: exportPages === metricsBefore.length },
      metricsBefore, metricsAfter,
      screenshot: shotPath,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const server = await startServer();
  console.log('serving', ROOT, 'on port', PORT);
  const browser = await puppeteer.launch({ headless: true });
  const state = buildState();
  const report = { generatedAt: new Date().toISOString(), node: process.version, scenarios: [] };
  try {
    const viewports = [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ];
    const jenisList = ['guru', 'kelas', 'induk-kelas', 'induk-guru'];
    for (const vp of viewports) {
      for (const jenis of jenisList) {
        const r = await scenario(browser, vp, jenis, state);
        report.scenarios.push(r);
      }
    }
    // Eksport berulang 3x PADA DOM/HALAMAN YANG SAMA (bukan navigasi baharu) pada kes paling
    // berisiko (induk 23 guru) - ini ialah senario pepijat asal (19->9.5->4.75 setiap panggilan
    // kemasSelCetak_ berulang). Bait PDF dibandingkan SHA256 penuh (bukan sekadar panjang bait) dan
    // fon terkira sel sampel diukur selepas setiap panggilan.
    report.repeatedExportSameDom = {
      desktop: await sameDomRepeatedExport(browser, { name: 'desktop', width: 1440, height: 900 }, 'induk-guru', state, 3),
      mobile: await sameDomRepeatedExport(browser, { name: 'mobile', width: 390, height: 844 }, 'induk-guru', state, 3),
    };
  } finally {
    await browser.close();
    server.close();
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(report, null, 2));
  console.log('\n=== SELESAI. Metrik penuh:', path.join(OUT, 'metrics.json'), '===');
  return report;
}

main().catch((e) => { console.error(e); process.exit(1); });
