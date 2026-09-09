# Sistem Jadual — pemasangan SePadan

Satu fail Google Sheets bernama **Sistem Jadual** dalam My Drive akaun **sekolah-3458-cm1@moe-dl.edu.my**. Fail lain dalam Drive tidak diperlukan dan tidak disentuh.

Fail sekolah telah dicipta: [Sistem Jadual](https://docs.google.com/spreadsheets/d/19UXqtXYIleADJ0nalo8f613qbb4GuvL6Md5KEfbPEDA/edit).
Projek terikat: [Apps Script Sistem Jadual](https://script.google.com/u/0/home/projects/1-FkT52LGzqbR1mDM0WM96zpdAjRju76eHTlBE_ZbBbALQhxB2605CNS9/edit).
Kod pelayan berada dalam satu `Code.gs` gabungan, setara dengan tiga fail sumber dalam repo. Izin Google telah diluluskan dan rekod Executions mengesahkan `setupSystem` selesai pada 10 September 2026, 01:39 waktu Malaysia. Deployment versi 1 diterbitkan pada 01:46 dengan akses Anyone selepas persetujuan pemilik. URL sebenar telah dimasukkan dalam `site-config.js`.

Semakan sambungan sebenar: health 3.0.0, 23 guru pada paparan awam, bootstrap tanpa token ditolak, login admin berjaya, draf disimpan ke Sheets dan dipulihkan selepas muat semula, serta logout menyembunyikan kawalan admin. PDF guru 14.09.2026 dibaca dalam aplikasi (22 halaman, 557 slot) tanpa diaktifkan sebagai jadual rasmi. Senarai guru serta draf awal telah disimpan; jadual rasmi perlu diimport/diaktifkan oleh admin.

## Sekali sahaja

1. Buka Google Sheets baharu menggunakan akaun sekolah yang betul. Namakan **Sistem Jadual**. Jangan kongsi fail data ini kepada umum.
2. Dari fail itu, pilih **Extensions → Apps Script**. Cipta fail `Code.gs`, `Auth.gs` dan `Builder.gs`, kemudian salin kod daripada folder `apps-script` repo ini. Salin juga `appsscript.json` melalui tetapan paparan manifest.
3. Jalankan `setupSystem()` sekali. Skrip menyediakan jadual data, senarai guru dan login awal **admin / admin**, serta mengunci ID fail dalam Script Properties. Google memerlukan skop Google Sheets untuk membuka fail daripada web app; dialog izin boleh menyebut semua spreadsheet. Kod aplikasi hanya membuka ID fail Sistem Jadual yang disimpan, bukan fail lain. Semak dan luluskan sendiri izin Google ini.
4. Deploy sebagai **Web app**, **Execute as: Me**, akses **Anyone**. Endpoint awam hanya memulangkan jadual, ketiadaan tanpa sebab dan relief diterbitkan. Semua bacaan dalaman dan perubahan memerlukan sesi admin yang sah.
5. Masukkan URL `/exec` deployment dalam `site-config.js` pada `SITE_CONFIG.apiUrl`, kemudian terbitkan repo ke GitHub Pages. URL yang sama dikongsi oleh semua peranti; tiada kata laluan disimpan dalam konfigurasi GitHub.
6. Buka aplikasi, login admin dan tukar kata laluan awal di Tetapan. Kata laluan baharu mestilah sekurang-kurangnya 12 aksara. Penggunaan `admin` sebagai kata laluan awal adalah atas permintaan pemilik dan tidak sesuai untuk penggunaan berterusan.

## Data dalam satu fail

- Teachers: nama, jawatan dan kelayakan relief.
- ScheduleVersions dan Schedule: jadual aktif serta versi terdahulu.
- Absences dan Reliefs: ketiadaan dan tugasan ganti.
- BuilderState: semua draf pembina termasuk sekolah, masa, subjek, kelas, guru, agihan, kekangan dan jadual.
- Config dan Audit: konfigurasi teknikal serta rekod perubahan.

Kelayakan login dan sesi disimpan dalam stor pelayan Apps Script yang terikat pada fail ini, bukan dalam sel atau kod frontend. Sesi tamat selepas dua jam, percubaan login salah berulang disekat sementara, dan penukaran kata laluan membatalkan sesi lama.

## Penggunaan

Tanpa login: lihat jadual guru, ketiadaan dan relief diterbitkan. Sebab ketiadaan dan catatan dalaman tidak dihantar ke pelawat.

Admin: bina dari kosong atau import PDF Jadual Guru aSc. Semak padanan; guru tidak sepadan diabaikan atau dipilih manual. Pilih **Buka sebagai draf pembina** untuk menyunting import, atau **Simpan jadual** untuk jadual relief. PDF mesti mempunyai teks aSc yang boleh diekstrak, bukan foto/imbasan.

Dalam pembina, tekan **Simpan draf ke Sheets** selepas perubahan. **Gunakan untuk relief** menerbitkan salinan berasingan mengikut tarikh kuat kuasa. Perubahan draf tidak mengubah jadual aktif secara automatik.

Simpanan memerlukan internet. Jika pengesahan simpanan gagal, segerakkan dahulu sebelum mencuba semula. Konflik draf daripada peranti lain tidak akan menindih data secara senyap. Pelayar memberi amaran jika menutup draf yang belum disimpan.

## Semakan sebelum dilancarkan

- Pastikan fail dimiliki akaun sekolah dan tidak dikongsi secara awam.
- Semak `?action=health` memulangkan `version: 3.0.0` dan `auth: session`.
- Tanpa token, POST `bootstrap` dan setiap tindakan tulis mesti ditolak.
- Uji login, simpan draf, muat semula, import PDF, jadual guru/kelas, ketiadaan, terbit relief, logout dan paparan telefon.
- Pastikan `site-config.js` mengandungi URL sebenar. Fail Sheets sahaja belum menjadikan API/login berfungsi; deployment Apps Script tetap diperlukan.
