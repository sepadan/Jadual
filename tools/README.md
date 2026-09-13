# Alat pengesahan cetakan/PDF

`verify-print.mjs` memuatkan `builder.js`/`builder.css` repository ini dalam Chromium sebenar
(Puppeteer), membina jadual dengan data sintetik tempatan (tiada rangkaian, tiada Apps Script,
tiada data sekolah sebenar), kemudian menukur:

- bilangan kepingan helaian berbanding bilangan halaman **cetak** (printToPDF) dan **eksport PDF**
  (html2canvas + jsPDF sebenar) - ketiga-tiganya mesti sama;
- limpahan helaian mendatar/menegak dan bilangan sel yang teksnya terpotong;
- kestabilan eksport berulang pada DOM yang sama (fon tidak mengecil berganda).

Guna:

    npm install --no-save puppeteer
    npm run verify:print

Hasil (PDF, PNG, `metrics.json`) pergi ke `.pdf-verification/` secara lalai; tetapkan
`VERIFY_OUT` untuk menulis ke tempat lain. Alat ini **bukan** sebahagian daripada `npm test` -
ia perlahan (beberapa minit) dan memerlukan Chromium.
