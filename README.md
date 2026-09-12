# Sistem Jadual — SePadan

Web app/PWA khusus SK Paya Redan, dengan tiga paparan umum: jadual guru, ketiadaan dan relief diterbitkan. Admin mengurus guru/jawatan, import PDF aSc, pembina jadual guru/kelas dan tugasan relief.

## Persediaan

Ikuti [SETUP-SEKOLAH.md](./SETUP-SEKOLAH.md). Semua data operasi dan draf pembina menggunakan satu fail Google Sheets **Sistem Jadual** dalam My Drive sekolah. Kata laluan dan sesi berada pada pelayan Apps Script terikat pada fail itu.

`site-config.js` mesti mengandungi URL deployment Apps Script sebenar sebelum aplikasi boleh digunakan pada semua peranti. Tanpa API, login dan simpanan kekal disekat. Tiada login palsu berdasarkan kod frontend atau PIN localStorage.

## Aliran kerja

1. Login admin.
2. Bina jadual daripada data asas, atau import PDF Jadual Guru aSc dan pilih **Buka sebagai draf pembina**.
3. Semak peruntukan, agihan guru, ketersediaan dan pertembungan.
4. **Simpan draf ke Sheets**, kemudian **Gunakan untuk relief** mengikut tarikh kuat kuasa.
5. Rekod guru tiada, semak cadangan dan terbitkan relief.

ANIZAN dan SYAHIDAH kekal dua profil berbeza. ANIZAN ialah guru prasekolah dan dikecualikan daripada relief secara lalai. Guru tanpa padanan PDF diabaikan, dengan pilihan padanan manual.

Import menyokong PDF teks aSc berdasarkan format sekolah yang disertakan, bukan OCR foto/imbasan. Pengaktifan relief menyokong Isnin–Jumaat, waktu 1–12. Draf dan jadual aktif ialah dua rekod berasingan: sunting draf tidak mengubah jadual relief sehingga diterbitkan semula.

## Perlindungan akses

- Login awal `admin / admin`, seperti diminta pemilik. Selagi kata laluan itu belum ditukar, bacaan dan login tetap terbuka tetapi **semua tindakan tulis ditolak dengan mesej** supaya URL repo awam tidak boleh mengubah rekod sekolah.
- Kata laluan disahkan di Apps Script. Sesi tujuh hari (`Auth.gs` mengeluarkan `expiresAt` 7×24 jam), logout/revokasi, sekatan percubaan berulang (5 percubaan gagal → sekatan 15 minit) dan penukaran kata laluan disediakan.
- API umum tidak memulangkan sebab ketiadaan, catatan dalaman, draf relief, hak guru atau draf pembina.
- Semua tindakan tulis dan bootstrap dalaman memerlukan sesi sah. Laluan PIN lama tidak diterima.
- Draf menggunakan semakan versi untuk mengelakkan penindihan silang peranti. Simpanan tidak disahkan tidak dilaporkan berjaya.

## Penyederhanaan

Sambungan Drive berasingan, menu eksport laman HTML, data contoh pada menu utama dan pembina standalone lama telah dikeluarkan daripada aliran aplikasi. `jadual-app.html` kini mengarah ke aplikasi utama. Salinan lama boleh dipulihkan daripada sejarah Git; data pelayar lama tidak dipadam secara automatik. Sandaran JSON pembina kekal untuk pemindahan data lama.

## PWA dan ujian

Jalankan `npm test`. Semua import JS, pautan CSS/HTML dan senarai cache mesti menggunakan versi keluaran sama. Pendaftaran service worker bermula sebelum modul aplikasi supaya cache lama tidak menyekat pemulihan. Sambungan internet diperlukan untuk login dan menyimpan data Sheets.

Naikkan versi dengan `npm run release 3.1.0`. Skrip itu menulis semula semua tempat yang mengulangi versi: import modul, pautan HTML, senarai cache service worker dan `version` dalam `Code.gs`. GitHub Actions menjalankan `npm test` pada setiap push dan pull request.

## Paparan awam

Paparan awam hanya menerima jadual **versi rasmi (active)** yang berkuat kuasa hari ini; import lama tidak lagi dihantar, jadi muatan turun kira-kira separuh. Peranti pengunjung menyimpan helaian awam terakhir, dan pengunjung yang sudah memegang revisi semasa hanya menerima jawapan `changed: false` (kira-kira 80 bait) — bukan keseluruhan jadual. Pelayan menyimpan salinan termampat selama enam jam; setiap penulisan membatalkannya serta-merta, dan hari baharu membatalkannya sendiri. Admin yang login tetap menerima semua data melalui `bootstrap`.

## Penyelenggaraan

`apps-script/Maintenance.gs` mengandungi `repairClockTimes()`. Jalankan sekali dari editor Apps Script jika lajur masa dalam helaian pernah menunjukkan 00:00 (sel tarikh dibaca balik sebagai tengah malam). Fungsi itu menulis semula masa mengikut jadual rasmi dan merekodkan hasilnya dalam helaian Audit.

Laman: https://sepadan.github.io/Jadual/
