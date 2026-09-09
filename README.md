# Sistem Jadual SK Paya Redan

PWA mesra desktop dan telefon yang menggabungkan penjana jadual sekolah dengan pengurusan guru relief.

## Pautan aplikasi

https://sepadan.github.io/Jadual/

## Modul

- **Hari ini** — cadangan guru relief berdasarkan guru yang lapang dan agihan yang adil.
- **Ketiadaan** — rekod guru tiada sepanjang hari atau mengikut waktu.
- **Jadual** — penjana jadual lama berada dalam tab ini; paparan jadual PDF untuk Relief juga disediakan.
- **Guru** — tambah, ubah atau nyahaktif guru, jawatan, keutamaan dan kelayakan relief.
- **Import PDF** — membaca fail Jadual Waktu Persendirian Guru keluaran aSc pada peranti.
- **Tetapan** — sambungkan aplikasi kepada Google Sheets melalui Google Apps Script.

ANIZAN dan SYAHIDAH ialah dua guru berlainan. ANIZAN ditetapkan sebagai Guru Prasekolah dan tidak menerima relief secara lalai; tetapan ini boleh diubah dalam modul Guru.

## Google Sheets

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

Fail utama PWA berada di akar repo. `jadual-app.html` ialah modul penjana jadual asal yang dibuka dari tab Jadual.
