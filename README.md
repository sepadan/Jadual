# Sistem Jadual SK Paya Redan

PWA mesra desktop dan telefon yang menggabungkan penjana jadual sekolah dengan pengurusan guru relief.

## Pautan aplikasi

https://sepadan.github.io/Jadual/

## Modul

- **Hari ini** — cadangan guru relief berdasarkan guru yang lapang dan agihan yang adil.
- **Ketiadaan** — rekod guru tiada sepanjang hari atau mengikut waktu.
- **Jadual** — pembina penuh terbina terus, tanpa iframe: tetapan sekolah dan masa, subjek, kelas, guru, peruntukan, agihan, slot tetap, kekangan, penjana automatik, suntingan dan cetakan.
- **Guru** — tambah, ubah atau nyahaktif guru, jawatan, keutamaan dan kelayakan relief.
- **Import PDF** — membaca fail Jadual Waktu Persendirian Guru keluaran aSc pada peranti.
- **Tetapan** — sambungkan aplikasi kepada Google Sheets melalui Google Apps Script.

ANIZAN dan SYAHIDAH ialah dua guru berlainan. ANIZAN ditetapkan sebagai Guru Prasekolah dan tidak menerima relief secara lalai; tetapan ini boleh diubah dalam modul Guru.

Semasa import PDF, halaman yang tidak sepadan dengan direktori guru akan diabaikan secara automatik. Ini sesuai untuk guru prasekolah, guru praktikal atau MySTEP. Penyelaras masih boleh memilih padanan guru secara manual pada skrin semakan sebelum menyimpan.

## Google Sheets

Direktori guru, versi jadual aktif, ketiadaan dan relief menggunakan sambungan Sheets di bawah. Draf kerja pembina (termasuk subjek, peruntukan dan kekangan) masih disimpan pada peranti dalam `janajadual.v3`; gunakan **Data & Sandaran** untuk eksport/import JSON atau sambungan Google Drive pilihan pembina. Sambungan Sheets sebenar memerlukan pemilik menyediakan dan deploy Apps Script; ia tidak terhasil hanya dengan menerbitkan GitHub Pages.

1. Cipta satu Google Sheet kosong.
2. Buka **Extensions → Apps Script**.
3. Salin kandungan `apps-script/Code.gs` dan `apps-script/appsscript.json`.
4. Jalankan `setupSystem()` sekali dan beri kebenaran yang diminta.
5. Tukar PIN lalai `2468` dalam **Project Settings → Script properties → ADMIN_PIN**.
6. Deploy sebagai **Web app**, jalankan sebagai pemilik dan pilih akses **Anyone** supaya PWA GitHub Pages boleh berhubung. Google Sheet asal kekal tidak dikongsi secara terus.
7. Tampal URL Web App dan PIN dalam tab **Tetapan** aplikasi.

## Kemas kini PWA

GitHub Pages menerbitkan fail daripada branch `main`. Selepas perubahan dipush, PWA memeriksa `sw.js`, memasang cache versi baharu dan memuat semula aplikasi apabila versi baharu mengambil alih. Naikkan nombor `APP_VERSION` dalam `data.js` dan `VERSION` dalam `sw.js` untuk setiap keluaran.

Data Google Sheets disegerakkan berasingan, jadi kemas kini guru, jadual, ketiadaan dan relief tidak memerlukan pemasangan semula PWA.

## Ujian

```sh
npm test
```

Fail utama PWA berada di akar repo. `builder.js` dan `builder.css` ialah pembina terbina; `jadual-app.html` dikekalkan sebagai salinan pembina asal untuk keserasian pautan lama. Data pembina lama pada origin yang sama terus dibaca tanpa menetap semula data.

## Aliran pembina → relief (versi 2.0)

1. Buka **Jadual → Bina & urus jadual**. Direktori guru diambil pada penggunaan pertama jika pembina belum mempunyai guru; **Ambil senarai guru** menyelaraskan nama/jawatan tanpa membuang agihan sedia ada.
2. Lengkapkan sekolah, subjek, kelas, peruntukan dan agihan. Tetapkan ketersediaan guru serta slot tetap.
3. Jana jadual, kemudian selesaikan isu dalam **Lihat & Edit**.
4. Pilih **Gunakan untuk relief**, semak guru yang diabaikan, isi nama versi serta tarikh kuat kuasa, dan sahkan.
5. Jadual aktif ialah salinan berasingan. Edit pembina tidak menukar relief sehingga diaktifkan semula. Versi terdahulu kekal digunakan sebelum tarikh kuat kuasa versi baharu.

Pengaktifan relief menyokong Isnin–Jumaat dan waktu 1–12. Waktu sebenar pembina dibawa bersama setiap slot. Slot aktiviti tetap seluruh sekolah/guru dan waktu tidak tersedia menyekat pemilihan guru relief. Hari/slot luar julat tidak diimport secara senyap.
