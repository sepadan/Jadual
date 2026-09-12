---
title: "PANDUAN PENGGUNAAN — Sistem Jadual (SePadan) — Edisi Terperinci"
---

# PANDUAN PENGGUNAAN SISTEM JADUAL

**Sistem Jadual — SePadan**
**Edisi terperinci · berdasarkan versi aplikasi 3.1.43**

Panduan ini ditulis untuk guru dan kakitangan sekolah yang tidak semestinya mahir teknikal. Ia menerangkan langkah demi langkah cara memasang aplikasi, log masuk, mengurus ketiadaan guru, menjana dan menerbitkan relief, membaca jadual minggu guru, menyediakan **masa tetapan guru pemulihan**, membina atau mengimport jadual waktu, dan menyelenggara data sekolah.

> **Cara menggunakan panduan ini.** Bahagian 1–3 untuk semua pengguna (pengenalan, pemasangan, log masuk). Bahagian 4–7 ialah kerja **harian** pentadbir (ketiadaan → relief → cetak). Bahagian 7–12 ialah kerja **sekali sekala atau bila jadual berubah** (baca jadual minggu, bina/import jadual, urus guru, masa tetapan guru pemulihan, tetapan). Bahagian 13–16 menerangkan paparan awam, penunjuk segerak, senarai semak dan telefon. Bahagian 17–20 ialah glosari, penyelesaian masalah, keselamatan dan kad rujukan pantas.

---

## 1. Gambaran keseluruhan sistem

### 1.1 Apa yang sistem ini uruskan

Sistem Jadual ialah aplikasi web (boleh dipasang sebagai aplikasi PWA) untuk sekolah menguruskan:

1. **Jadual waktu** guru dan kelas (versi rasmi yang berkuat kuasa pada sesuatu tarikh).
2. **Rekod ketiadaan guru** harian (sepanjang hari atau waktu tertentu sahaja).
3. **Cadangan dan penerbitan guru ganti (relief)** — termasuk jadual guru ganti untuk dicetak.
4. **Pembinaan jadual** dari kosong, atau **import PDF** laporan "Jadual Waktu Persendirian Guru" daripada perisian aSc.
5. **Masa tetapan guru pemulihan** — waktu mingguan yang bukan subjek, ditanda terus pada jadual guru berkenaan.

### 1.2 Di mana data disimpan

Semua data sekolah — guru, jadual, ketiadaan, relief, draf pembina — disimpan dalam **satu fail Google Sheets sekolah** bernama **Sistem Jadual**, melalui pelayan **Google Apps Script** yang terikat pada fail itu.

- Peranti anda menyimpan **salinan sementara** untuk memaparkan skrin dengan pantas dan supaya perubahan tidak hilang semasa sambungan terputus (lihat Bahagian 14).
- Data rasmi sentiasa yang berada di Google Sheets. Jika sesuatu perubahan tidak sempat dihantar ke Sheets, aplikasi memaparkan statusnya secara nyata pada penunjuk segerak.
- Aplikasi ini **tidak berfungsi** tanpa sambungan Apps Script yang disediakan oleh pentadbir sekolah.

### 1.3 Dua peranan pengguna

| Peranan | Capaian |
|---|---|
| **Pelawat / orang awam** (tanpa log masuk) | Melihat jadual rasmi yang berkuat kuasa pada hari semasa serta senarai ketiadaan (**tanpa sebab**) dan relief yang **telah diterbitkan** bagi tarikh yang dipilih. |
| **Admin** (selepas log masuk) | Mengurus guru dan jawatan, merekod ketiadaan, menjana/menerbitkan relief, menanda masa tetapan guru pemulihan, membina/mengimport jadual, mengubah tetapan, mengeksport, mengarkib dan mereset data. |

> Sistem ini pada asalnya dibina untuk **SK Paya Redan**, tetapi boleh disediakan semula untuk sekolah lain mengikut fail `SETUP-SEKOLAH.md` dalam repositori projek.

### 1.4 Peta skrin (di mana sesuatu berada)

| Skrin / tab | Untuk apa | Perlu log masuk? |
|---|---|---|
| **Hari ini** (Relief) | Kerja harian: rekod guru tiada, jana dan terbitkan relief, cetak/eksport jadual guru ganti. Mempunyai dua sub-tab: **Ketiadaan guru** dan **Relief**. | Sub-tab Relief boleh dilihat; merekod dan menerbitkan perlu admin |
| **Jadual** | Membaca jadual **seminggu penuh** bagi seseorang guru atau sesuatu kelas, dan (admin) membina serta mengimport jadual. | Membaca: semua. Membina/import: admin |
| **Guru** | Direktori guru, jawatan, kelayakan relief, **masa tetapan guru pemulihan**. | Admin |
| **Tetapan** | Had relief harian, akaun admin, maklumat aplikasi, arkib dan reset data. | Admin |

Di telefon, navigasi ini muncul sebagai **bar navigasi bawah**; di desktop ia berada pada **bar sisi kiri**.

---

## 2. Memasang aplikasi (PWA desktop dan telefon)

### 2.1 Pautan aplikasi

Repositori projek menerbitkan laman contoh di:

```
https://sepadan.github.io/Jadual/
```

> **Penting:** setiap sekolah yang menyediakan sistem ini sendiri mengikut `SETUP-SEKOLAH.md` akan menerbitkan salinan sendiri yang disambungkan kepada fail Google Sheets dan Apps Script sekolah itu. **Gunakan pautan yang dibekalkan oleh pentadbir/IT sekolah anda.** Jangan teka atau gunakan pautan sekolah lain.

### 2.2 Memasang di komputer (desktop)

1. Buka pautan aplikasi sekolah menggunakan pelayar (Chrome atau Edge disyorkan).
2. Apabila aplikasi sedia dipasang, butang **"Pasang aplikasi"** muncul di bar atas aplikasi. Tekan butang tersebut.
3. Sahkan pemasangan pada arahan pelayar.
4. Selepas dipasang, aplikasi boleh dibuka dari menu Mula/skrin utama seperti aplikasi biasa.

Jika butang itu tidak muncul: pelayar mungkin belum menganggap aplikasi "boleh dipasang", atau ia sudah dipasang. Cuba buka dalam tetingkap biasa (bukan mod penyamaran) dan muat semula halaman.

### 2.3 Memasang di telefon atau tablet

1. Buka pautan aplikasi dalam pelayar telefon.
2. Tekan butang **"Pasang aplikasi"** jika ia muncul di bar atas, kemudian sahkan.
3. Jika tidak muncul, gunakan menu pelayar (**"Tambah ke skrin utama"** / **"Install app"**) — nama menu bergantung pada pelayar.

### 2.4 Apa yang berfungsi tanpa internet

| Keadaan | Tanpa internet |
|---|---|
| Membuka aplikasi | **Berfungsi** — fail aplikasi disimpan dalam cache peranti oleh service worker. |
| Melihat jadual/hari ini | Berfungsi untuk **salinan terakhir** yang tersimpan pada peranti itu. |
| Log masuk | **Tidak berfungsi.** |
| Menyimpan perubahan ke Google Sheets | Perubahan disimpan **sementara pada peranti** dahulu dan dihantar apabila sambungan pulih (Bahagian 14). |

> Memasang sebagai PWA mempercepat dan memudahkan cara membuka aplikasi; ia **tidak** menjadikan sistem berfungsi sepenuhnya tanpa internet.

---

## 3. Log masuk, sesi, dan kata laluan

### 3.1 Langkah log masuk

1. Di skrin utama, tekan **"Login admin"** di bar atas.
2. Dalam dialog **Login admin**, isi **Nama pengguna** dan **Kata laluan**.
3. Jika sambungan Apps Script sekolah belum pernah disediakan pada peranti ini, dialog turut memaparkan medan **"URL Apps Script sekolah"** — masukkan URL `/exec` yang dibekalkan pentadbir sekolah.
4. Tekan **Login**.

Selepas berjaya, bar atas menunjukkan pilihan admin (contohnya **Log keluar**) dan skrin **Guru** serta **Tetapan** menjadi tersedia.

> **Butang bulat `?` di bar atas** membuka **panduan ini sebagai PDF** (`panduan/panduan-penggunaan-sistem-jadual.pdf` pada laman aplikasi). Ia **hanya muncul selepas log masuk pentadbir** — pelawat dan paparan awam tidak melihatnya. Tiada butang segerak manual di bar atas — penyegerakan berlaku **automatik** (Bahagian 14).

### 3.2 Kata laluan lalai dan peringatan keselamatan

Nama pengguna lalai ialah `admin` dan kata laluan lalai ialah `admin`. Ini sengaja dibenarkan oleh pembangun sistem supaya sekolah boleh terus menggunakan dan menyimpan data sebaik pemasangan selesai, tanpa disekat menunggu penukaran kata laluan.

> **Peringatan keselamatan:** tukar `admin/admin` secepat mungkin selepas pemasangan di **Tetapan → Akaun admin → Tukar kata laluan** (Bahagian 12.2). Selagi kata laluan lalai digunakan, aplikasi hanya memaparkan makluman neutral "kata laluan lalai sedang digunakan dan dibenarkan" selepas log masuk — ia **tidak** menyekat simpanan atau terbitan relief.

Kata laluan baharu mestilah sekurang-kurangnya **12 aksara**.

### 3.3 Berapa lama sesi bertahan, dan bila ia tamat

| Perkara | Kelakuan sistem |
|---|---|
| Tempoh sesi | **7 hari** pada peranti yang sama (token disimpan pada peranti, disahkan oleh pelayan Apps Script). |
| Selepas 7 hari | Admin perlu log masuk semula. |
| Kata laluan ditukar | **Semua** sesi lama pada semua peranti dibatalkan serta-merta; admin perlu log masuk semula dengan kata laluan baharu. |
| Lima percubaan salah berturut-turut | Pelayan menyekat percubaan baharu selama **15 minit**. |
| Membuka semula aplikasi | Sesi yang masih sah dipulihkan secara automatik (tidak perlu taip semula). |

### 3.4 Log keluar dengan selamat

Tekan **Log keluar** di bar atas. Jika ada **draf pembina jadual** yang belum disimpan atau perubahan yang masih **menunggu Sheets**, sistem meminta pengesahan terlebih dahulu.

> Baca status penunjuk segerak sebelum mengesahkan log keluar. Jika status menunjukkan **Tersimpan di peranti · menunggu Sheets**, perubahan itu belum tiba di Google Sheets; jika anda mengesahkan log keluar, salinan tertunda pada peranti itu dibuang. Cuba sambung semula internet, biarkan sehingga status kembali **Google Sheets · masa nyata**, kemudian baru log keluar.

> Sentiasa log keluar selepas menggunakan komputer atau telefon yang dikongsi bersama kakitangan lain.

---

## 4. Skrin Relief — sub-tab "Ketiadaan guru"

Skrin **Hari ini** ialah tempat kerja harian relief. Di bahagian atasnya terdapat pemilih **Tarikh** dan empat kad ringkasan bagi tarikh itu:

| Kad ringkasan | Maksud |
|---|---|
| **Guru tiada** | Bilangan guru yang direkodkan tidak hadir pada tarikh itu. |
| **Kelas terlibat** | Bilangan kelas berbeza yang memerlukan relief. |
| **Belum ditetapkan** | Bilangan slot draf relief yang belum ada guru ganti. |
| **Relief selesai** | Bilangan relief yang telah **diterbitkan** bagi tarikh itu. |

### 4.1 Merekod guru tidak hadir

1. Pastikan sub-tab **Ketiadaan guru** dipilih.
2. Tekan **"+ Tambah"**.
3. Pilih **Guru**, **Tarikh**, dan jika perlu tulis **Sebab ringkas** (contoh: "Kursus", "Cuti sakit").
4. Biarkan **"Sepanjang hari"** bertanda jika guru tidak hadir sepanjang hari. Nyahtanda kotak itu untuk memilih **waktu tertentu** sahaja daripada senarai waktu yang dipaparkan — gunakan ini untuk guru yang hadir separuh hari (contoh: keluar kursus pada waktu 7–9 sahaja).
5. Tekan **"Simpan dan jana relief"**.

Selepas disimpan, sistem **terus menjana draf cadangan relief** untuk tarikh itu, dan senarai ketiadaan bagi tarikh tersebut dipaparkan.

Perkara yang perlu diketahui:

- Guru yang **sama** tidak boleh direkod tidak hadir **dua kali** pada tarikh yang sama.
- Merekod ketiadaan **tidak** mengubah jadual rasmi. Ia hanya menghasilkan draf relief.
- Jika guru itu tidak mempunyai waktu mengajar pada tarikh tersebut, draf akan kosong — ini bukan ralat, tetapi sistem akan memberitahu sebabnya (Bahagian 5.1).

### 4.2 Memadam rekod ketiadaan

Tekan ikon **🗑** pada kad rekod. Sistem memadam rekod itu daripada Google Sheets **berserta relief yang bergantung padanya** bagi tarikh dan guru yang sama. Tindakan ini disahkan melalui dialog amaran dan **tidak boleh dibatalkan**.

> Jika anda hanya tersilap memasukkan **sebab**, anda tidak perlu memadam rekod — kesannya hanya pada paparan admin, bukan pada relief.

---

## 5. Skrin Relief — sub-tab "Relief" (jana, semak, terbitkan)

Berpindah ke sub-tab **Relief** bermakna anda mula menetapkan guru ganti.

### 5.1 Menjana cadangan relief ("Jana")

Tekan **"Jana"**. Sistem akan:

1. Menyemak semua rekod ketiadaan **aktif** bagi tarikh yang dipilih.
2. Mencari **waktu mengajar** guru tersebut dalam jadual rasmi yang berkuat kuasa pada tarikh itu.
3. Mencadangkan guru ganti yang **layak relief**, **tidak sibuk** pada waktu itu, **tidak turut tiada**, dan belum melebihi **had relief harian**.
4. Mengutamakan guru dengan jumlah **waktu mengajar + relief** hari itu yang **paling sedikit**, supaya beban relief tidak menumpuk pada orang yang sama.

Jika sudah ada draf yang belum diterbitkan, sistem meminta pengesahan sebelum menjana semula — kerana **draf lama akan digantikan**.

**Mengapa draf boleh keluar kosong.** Sistem akan memberitahu sebabnya, contohnya:

- tiada jadual rasmi yang berkuat kuasa pada tarikh itu;
- tiada rekod ketiadaan pada tarikh itu;
- guru tidak hadir itu tiada waktu mengajar yang perlu diganti;
- slot itu sudah dilindungi oleh aturan pairing guru (Bahagian 12.1) atau relief sudah diterbitkan;
- had relief harian guru calon sudah penuh (had lalai 2 waktu sehari).

### 5.2 Dua paparan: Senarai relief dan Preview

| Paparan | Isi |
|---|---|
| **Senarai relief** | Kad demi kad: waktu, kelas/subjek, guru tidak hadir, dan **dropdown guru ganti**. Di sinilah admin menukar calon yang dicadangkan sistem. |
| **Preview** | Jadual guru ganti dalam format yang sama seperti dokumen rasmi yang akan dicetak, **termasuk draf yang belum diterbitkan**, supaya keseluruhan lembaran boleh disemak sebelum diterbitkan. |

> **Perbezaan penting:** Preview memaparkan **draf + relief diterbitkan** untuk semakan. **Cetak** dan **Eksport PDF** (Bahagian 6) hanya memaparkan relief yang **telah diterbitkan**. Draf yang belum diterbitkan **tidak** akan muncul pada cetakan atau PDF.

Pada telefon, jadual Preview lebih lebar daripada skrin — **skrol mendatar** diperlukan untuk melihat kesemua lajur waktu. Pada desktop ia kelihatan penuh.

### 5.3 Menetapkan atau menukar guru ganti

Pada setiap kad draf dalam **Senarai relief**, pilih guru ganti daripada dropdown. Jika tiada calon tersenarai, pesanan seperti "Pilih atau ubah kelayakan guru" dipaparkan — semak semula kelayakan relief guru di tab **Guru** (Bahagian 10.2).

Yang perlu diperiksa sebelum menerbitkan:

- Setiap slot sudah ada guru ganti (bar bawah memaparkan "X/Y relief ditetapkan").
- Tiada guru ganti dipilih pada dua kelas yang berbeza pada waktu yang sama.
- Tiada guru yang turut tidak hadir dipilih.

### 5.4 Menerbitkan relief

1. Semak semua slot.
2. Tekan **"Terbitkan"** pada bar tindakan bawah.
3. Sistem mengesahkan semula tiada percanggahan, kemudian menyimpan relief sebagai rekod **diterbitkan** ke Google Sheets.

Selepas diterbitkan:

- relief itu kelihatan kepada **paparan awam** (tanpa sebab ketiadaan);
- ia tersedia untuk **Cetak** dan **Eksport PDF**;
- ia mula dikira dalam **had relief harian** setiap guru ganti.

---

## 6. Cetak dan eksport PDF jadual guru ganti

Dua butang berasingan disediakan pada bar alat skrin Relief:

| Butang | Fungsi |
|---|---|
| **Eksport PDF** | Menjana fail **PDF A4** jadual guru ganti bagi tarikh yang dipilih, untuk disimpan atau dikongsi. |
| **Cetak** | Membuka dialog cetak pelayar terus pada lembaran guru ganti tarikh yang dipilih. |

Kedua-duanya bergantung pada medan **Tarikh** di bar alat, dan **hanya** memaparkan relief yang **telah diterbitkan**. Jika tiada relief diterbitkan pada tarikh itu, sistem memaparkan makluman ralat dan **tidak** menjana dokumen.

Lembaran yang dihasilkan mengandungi:

- tajuk sekolah, tarikh dan hari;
- jadual mengikut waktu (bermula waktu 1, ditambah jika ada relief pada waktu lebih tinggi);
- kelompok mengikut **nama guru yang tidak hadir**;
- baris kelas/subjek, nama guru ganti dan ruang tandatangan.

**Amalan terbaik:** semak paparan **Preview** dahulu, terbitkan, kemudian baru cetak atau eksport. Jika sesuatu relief perlu dibatalkan, ia mesti diperbetulkan pada draf/diterbitkan sebelum mencetak, kerana cetakan sentiasa mengikut keadaan yang tersimpan di Google Sheets.

---
## 7. Skrin Jadual — membaca jadual **seminggu penuh**

Skrin **Jadual** memaparkan jadual rasmi yang sedang berkuat kuasa dalam **satu grid minggu penuh**: **hari persekolahan ke bawah** (Isnin–Jumaat), **waktu melintang ke kanan** (waktu 0 hingga 12 dengan jam mula di bawah setiap nombor), dan **lajur REHAT menegak** pada jurang jam sekolah. Bentuk ini sama seperti skrin **Lihat & edit** dalam Pembina, jadi sekolah hanya perlu belajar satu bentuk jadual. Tiada pemilih hari — pilih guru (atau kelas), dan seluruh minggu terus kelihatan.

### 7.1 Cara membaca jadual minggu

1. Buka tab **Jadual**.
2. Pada medan pertama (**Paparan**, admin sahaja), pilih **Guru** atau **Kelas**.
3. Pada medan kedua (**Guru** / **Kelas**), pilih nama yang hendak dilihat.
4. Jadual minggu dipaparkan serta-merta.

| Bahagian paparan | Maksud |
|---|---|
| Lajur paling kiri | **Hari** — Isnin hingga Jumaat. Baris **hari ini** berlatar hijau (jika hari ini hari persekolahan). |
| Baris paling atas | **Waktu** — nombor waktu 0 hingga 12 dan jam mula rasmi setiap waktu (contoh `1` di atas `07:30`). |
| Lajur `REHAT` menegak | Jurang jam sekolah (contoh 10:00–10:20 selepas waktu 5). Ia dikira daripada jam setiap waktu, bukan ditaip. |
| Blok berwarna: kod subjek + kelas | Waktu mengajar sebenar — kod subjek kecil di atas (contoh `BM`), nama kelas tebal di tengah (contoh `3 BIJAK`). |
| Blok kuning `Pemulihan` + `Aktiviti` | **Masa tetapan guru pemulihan** — waktu bukan subjek yang menyekat relief (Bahagian 11). |
| Sel kosong | Waktu lapang pada hari itu — guru **boleh** dipanggil mengganti pada waktu tersebut. |
| Legenda warna di bawah grid | Senarai kod subjek yang muncul pada jadual ini beserta warnanya. |

Tag di atas jadual (contoh "Jadual 14.09.2026 · 14 Sep 2026") memaparkan **nama versi** dan **tarikh kuat kuasa** jadual yang sedang aktif. Jika tiada jadual aktif, paparan memaklumkan "Belum ada jadual aktif".

### 7.2 Jadual ini yang digunakan oleh enjin relief

Jadual yang dipaparkan di sini ialah **jadual yang sebenarnya digunakan** sistem untuk mencadangkan guru ganti bagi sesuatu tarikh — mengikut versi yang berkuat kuasa **pada tarikh itu**, bukan mengikut draf pembina.

- Sel kosong bermakna guru itu **boleh** dipilih sebagai guru ganti pada waktu tersebut.
- Sel yang berisi subjek atau `PEMULIHAN` bermakna guru itu **sibuk** dan tidak akan dicadangkan pada waktu tersebut.
- Menukar paparan **Guru/Kelas** hanya menukar sudut pandang; ia tidak mengubah data.

### 7.3 Membaca jadual kelas

Pilih **Paparan: Kelas** (admin) untuk melihat jadual minggu bagi satu kelas. Ini berguna untuk:

- menyemak sama ada sesuatu kelas benar-benar memerlukan relief apabila gurunya tiada;
- memastikan tiada dua subjek pada waktu yang sama dalam satu kelas;
- mencetak/menyalin jadual kelas untuk kegunaan bilik darjah.

### 7.4 Pada telefon

Pada telefon grid ini **lebih lebar daripada skrin** — ini disengajakan supaya setiap waktu kekal boleh dibaca. **Leret ke kiri/kanan** untuk melihat semua waktu; petunjuk *"↔ Leret ke kiri/kanan untuk melihat semua waktu."* dipaparkan betul-betul di bawah grid. Teks dalam blok akan berbalut, jadi tiada nama kelas terpotong.

---

## 8. Skrin Jadual — membina dan mengurus jadual (mod Pembina)

Selain membaca jadual, admin boleh **membina** jadual dari kosong atau mengimportnya. Modul **Pembina jadual** mengandungi bahagian berikut:

| Bahagian | Fungsi |
|---|---|
| Ruang bina jadual (Papan Utama) | Ringkasan bilangan kelas, guru, subjek, waktu seminggu dan status persediaan. |
| Sekolah & masa (Tetapan) | Nama sekolah, tahun, hari persekolahan, masa mula, tempoh waktu, waktu rehat. |
| Subjek | Kod, nama, warna, subjek teras / waktu pagi. |
| Kelas | Nama kelas dan tahap tahun (1–6). |
| Guru & ketersediaan | Nama, kod, had waktu sehari, waktu guru tidak boleh mengajar. |
| Peruntukan waktu | Bilangan waktu setiap subjek mengikut tahun/tahap. |
| Agihan guru | Guru yang mengajar subjek tertentu di kelas tertentu. |
| Slot tetap | Perhimpunan, kokurikulum dan aktiviti berjadual tetap (**juga asas kepada masa tetapan guru pemulihan** — lihat Bahagian 11.5). |
| Kekangan | Had waktu berturut-turut, keutamaan waktu pagi untuk subjek teras, kemudahan terhad. |
| Jana jadual | Menjana jadual secara automatik berdasarkan data di atas. |
| Lihat & edit | Menyemak dan mengubah jadual yang dijana, termasuk menyemak isu/pertembungan. |
| Cetak / PDF | Mencetak jadual guru/kelas dalam format A4 landskap. |
| Data & sandaran | Muat turun sandaran JSON atau import sandaran lama; data utama tetap di Google Sheets. |

### 8.1 Tindakan penting pada bar atas pembina

| Butang | Apa yang dilakukannya |
|---|---|
| **Simpan draf ke Sheets** | Menyimpan keseluruhan draf pembina (sekolah, masa, subjek, kelas, guru, agihan, kekangan, jadual) ke Google Sheets sebagai **satu rekod berasingan** bernama BuilderState. |
| **Muat draf Sheets** | Memuat semula draf tersimpan daripada Sheets (menggantikan draf pada peranti, dengan pengesahan jika ada perubahan belum disimpan). |
| **Ambil senarai guru** | Menyelaraskan senarai guru pembina dengan senarai guru rasmi dalam tab **Guru**, termasuk pautan guru gantian (Personel MySTEP / Guru Praktikal). |
| **Gunakan untuk relief →** | Menyemak jadual yang dijana (mesti sudah dijana dan tiada isu belum selesai), kemudian membuka dialog **"Gunakan untuk relief"** untuk mengesahkan nama versi dan **tarikh kuat kuasa** sebelum diaktifkan. |

Cara membaca kad ini: draf pembina disimpan **pada peranti** semasa tuan bekerja, jadi menutup pelayar tidak menghilangkannya. **Simpan draf ke Sheets** ialah satu-satunya cara draf itu selamat melepasi peranti itu (telefon hilang, tukar komputer, atau dibuka oleh pentadbir lain) — ia **tidak** berlaku secara automatik. **Muat draf Sheets** jarang diperlukan kerana draf Sheets sudah dimuatkan sendiri semasa log masuk; gunakannya jika pentadbir lain mengubah draf di tempat lain. **Ambil senarai guru** perlu selepas tuan menambah atau menukar nama guru di tab **Guru** (penyelarasan automatik hanya berlaku apabila pembina masih belum ada guru). **Gunakan untuk relief** wajib dan tidak boleh dibuang — tanpanya jadual yang dibina tidak menjadi jadual rasmi yang digunakan oleh relief.

Jika peranti ini masih menyimpan draf yang belum dinaikkan ke Sheets, aplikasi **menggunakan draf peranti itu dahulu** dan baris status kad menulis **"Draf peranti ini digunakan — tekan Simpan draf ke Sheets untuk naik ke awan"**. Ini memang sengaja: menimpanya dengan draf Sheets akan membuang kerja terakhir tuan. Tekan **Muat draf Sheets** jika tuan mahu salinan awan sebaliknya. Apabila storan peranti penuh (atau pelayar berada dalam mod peribadi), pil draf bertukar **"Storan peranti penuh"** — eksport JSON sebelum menutup aplikasi, kerana perubahan seterusnya hanya kekal selagi tab dibuka.

### 8.2 Draf pembina lawan jadual aktif — PERBEZAAN PALING PENTING

**Draf pembina** dan **jadual aktif untuk relief** ialah **dua rekod yang berasingan**:

- Apa jua perubahan dalam pembina (menambah kelas, mengubah agihan guru, menjana semula) **hanya mengubah draf**. Ia **tidak** mengubah jadual yang digunakan relief harian, walaupun draf itu telah **Simpan draf ke Sheets**.
- Jadual relief hanya berubah apabila admin menekan **"Gunakan untuk relief →"**, mengesahkan nama versi dan tarikh kuat kuasa, kemudian menekan **"Aktifkan jadual"**.
- Selepas diaktifkan, jadual itu menjadi versi **aktif**, dan versi aktif sebelumnya ditukar kepada status **superseded** (digantikan) tetapi kekal dalam sejarah.
- Draf yang terus diubah selepas pengaktifan **tidak** menjejaskan jadual relief yang sedang berkuat kuasa sehingga ia diaktifkan semula secara eksplisit.

> **Amalan selamat:** sebelum menekan **Aktifkan jadual**, pastikan tarikh kuat kuasa betul. Semua cadangan relief selepas itu — dan semua **masa tetapan guru pemulihan** — akan dikira daripada versi baharu ini.

---

## 9. Import PDF "Jadual Waktu Persendirian Guru" (aSc)

### 9.1 Format yang disokong

Hanya PDF **teks** yang dijana terus oleh perisian aSc — khususnya laporan **"Jadual Waktu Persendirian Guru"**, waktu **0–12**. PDF hasil imbasan/gambar (OCR) **tidak** disokong dan akan ditolak dengan mesej "Susun atur PDF tidak dikenali".

### 9.2 Langkah import

1. Pergi ke **Jadual**, tekan **"Import PDF aSc"**.
2. **LANGKAH 1:** pilih fail PDF (maksimum 25 MB). Sistem cuba mengesan tarikh daripada nama fail untuk mengisi **Tarikh mula berkuat kuasa** dan **Nama versi** secara automatik; kedua-duanya masih boleh diubah.
3. Tekan **"Baca dan semak PDF"**. PDF diproses **sepenuhnya pada peranti** sebelum apa-apa data dihantar ke Sheets.
4. **LANGKAH 2:** semak ringkasan import (halaman guru, slot digunakan, halaman diabaikan, makluman) dan jadual padanan bagi setiap halaman.

### 9.3 Padanan nama guru

Sistem memadankan nama pada setiap halaman PDF dengan nama dalam tab **Guru**, selepas menormalkan gelaran (TN HJ / EN / PN / CIK) dan ejaan yang diketahui berbeza.

| Keadaan | Kelakuan |
|---|---|
| Nama sepadan | Halaman ditandakan dengan nama guru itu dan slotnya disertakan dalam import. |
| Nama tidak sepadan | Halaman **diabaikan secara automatik** (bukan ralat). Admin boleh **memilih padanan secara manual** melalui dropdown pada baris berkenaan, atau memilih **"Abaikan halaman ini"**. |
| Guru sudah dipadankan | Satu guru tidak boleh dipadankan dengan dua halaman — mesej "Guru itu sudah dipadankan dengan halaman lain". |
| Guru tiada halaman PDF | Disenaraikan sebagai makluman ("Tiada halaman jadual untuk [nama guru]") supaya admin boleh menyemak semula. |

> Jika **tiada profil guru langsung** dalam sistem (contohnya selepas reset data), import tidak dapat dipadankan. Pergi ke tab **Guru** dan tekan **"Pulihkan senarai guru asal"** (Bahagian 10.5) sebelum membaca semula PDF.

### 9.4 Menyimpan hasil import

| Pilihan | Kesan |
|---|---|
| **Simpan jadual** | Menyimpan slot yang telah dipadankan sebagai **versi jadual baharu**. Jika kotak **"Jadikan versi ini jadual aktif"** bertanda (lalai bertanda), versi ini terus menjadi jadual aktif untuk relief; versi sebelumnya menjadi superseded. |
| **Buka sebagai draf pembina** | Memindahkan hasil import ke **draf pembina** pada peranti untuk disemak dan disunting lanjut. Ia menggantikan draf pembina semasa selepas pengesahan, dan **tidak** menyimpan apa-apa ke Google Sheets sehingga anda menekan **Simpan draf ke Sheets**. Jadual aktif sedia ada tidak berubah. |

> Jika masa tetapan guru pemulihan pernah ditanda pada versi lama, ia **tidak** berpindah ke versi baharu secara automatik. Selepas mengaktifkan versi baharu, buka semula **Tetapan Jadual** guru pemulihan berkenaan dan tandakan kembali waktunya (Bahagian 11).

---

## 10. Tab Guru dan jawatan

Tab **Guru** (admin sahaja) menyenaraikan semua profil guru aktif. Pada setiap kad dipaparkan nama, avatar, jawatan, status kelayakan relief, dan (jika berkaitan) nota "Menggantikan [nama guru]".

### 10.1 Menambah atau mengubah profil guru

Tekan **"+ Tambah guru"**, atau ikon **✎** pada kad guru untuk mengubah profil. Dialog **Profil guru** mengandungi:

| Medan | Keterangan |
|---|---|
| **Nama penuh** | Nama rasmi guru (digunakan untuk padanan import PDF dan cetakan relief). |
| **Nama ringkas** | Nama pendek untuk paparan sempit (maksimum 24 aksara). |
| **Jawatan** | Guru Besar, Guru Penolong Kanan 1 / HEM / Kokurikulum, Guru Akademik Biasa, Guru Prasekolah, **Guru Pemulihan**, Guru Praktikal, Personel MySTEP, atau **"Jawatan lain…"** untuk jawatan tersuai. |
| **Boleh menerima relief mulai** (Guru Prasekolah sahaja) | Waktu mula guru prasekolah boleh menerima relief. Guru prasekolah yang **belum** menetapkan waktu ini dianggap **dikecualikan** daripada relief secara automatik. |
| **Menggantikan guru** (Personel MySTEP / Guru Praktikal) | Memautkan guru ini kepada guru sedia ada. **MySTEP** mengambil alih **keseluruhan** jadual (guru asal tidak lagi dipaparkan); **Guru Praktikal** berkongsi kelas dengan guru asal (guru asal tetap dipaparkan) dan boleh dipautkan kepada lebih daripada seorang guru serta subjek tertentu sahaja. |
| **Layak menerima tugasan relief** | Kotak semak kelayakan relief. |

Sistem mengutamakan guru dengan jumlah **waktu mengajar + relief** hari tersebut **paling sedikit** semasa mencadangkan guru ganti automatik.

### 10.2 Menukar kelayakan relief dengan pantas

Tekan terus pada bahagian nama/status kad guru untuk menogol kelayakan relief antara **layak** (hijau) dan **dikecualikan** (merah) tanpa membuka dialog penuh. Gunakan ini apabila seseorang guru sedang bercuti panjang, menjalankan tugas luar, atau memang tidak boleh menerima relief pada sesuatu tempoh.

### 10.3 Memadam atau menyahaktifkan guru

**Memadam guru** (ikon **×**) hanya dibenarkan jika guru itu **tiada** rekod jadual, ketiadaan atau relief yang bergantung kepadanya. Jika ada, sistem secara automatik **menyahaktifkan** (bukan memadam) profil itu supaya sejarah rekod tidak rosak, dan memberitahu sebabnya.

### 10.4 Muat turun / muat naik senarai guru

- **Muat turun senarai** — mengeksport senarai guru sebagai fail JSON Sistem Jadual (berguna sebagai sandaran).
- **Muat naik senarai** — mengimport senarai guru. Import **hanya menambah guru baharu**; nama yang sudah wujud **diabaikan** dan tidak ditindih.

### 10.5 Memulihkan senarai guru asal

Jika tab Guru kosong (contohnya selepas reset data), sistem memaparkan makluman **"Tiada profil guru dalam sistem"** dengan butang **"Pulihkan senarai guru asal"**. Butang ini menambah semula senarai guru asal sekolah yang dibina bersama sistem; guru yang **masih ada** dalam sistem **tidak diubah**, dan ID guru asal dikekalkan supaya rekod lama masih sepadan.

---

## 11. Guru pemulihan dan **masa tetapan** mereka

### 11.1 Apa itu guru pemulihan

Di sesetengah sekolah, guru pemulihan **tidak mempunyai subjek** dalam jadual rasmi. Subjek bagi kelas pemulihan diisi oleh guru itu sendiri, jadi jadualnya hanya perlu menunjukkan **waktu (masa) yang dikhaskan untuk kerja pemulihan** — contohnya waktu 1 dan 2 setiap hari. Waktu-waktu itu dalam sistem ini dipanggil **masa tetapan**.

### 11.2 Apa yang berlaku apabila masa tetapan ditanda

| Kesan | Keterangan |
|---|---|
| Pada jadual guru itu | Sel dipaparkan sebagai `PEMULIHAN` / `Aktiviti` (kuning) pada minggu guru tersebut (Bahagian 7.1). |
| Pada enjin relief | Guru itu **tidak** akan dicadangkan sebagai guru ganti pada waktu tersebut — dia dianggap **sibuk**. |
| Pada waktu lapangnya | Dia **boleh** dipanggil mengganti seperti guru lain. Sistem tidak mengunci seluruh harinya. |
| Pada kelas | Tiada kelas diambil kira: masa tetapan bukan pengajaran dan tidak menyentuh jadual kelas. |

### 11.3 Langkah menanda masa tetapan (di telefon atau desktop)

1. Buka tab **Guru**.
2. Cari kad guru pemulihan, tekan ikon **✎** untuk membuka **Profil guru**.
3. Pastikan **Jawatan** ialah **Guru Pemulihan**. Jika baru ditukar, tekan **Simpan guru** dahulu dan buka semula profil — butang di langkah 4 hanya muncul untuk guru yang sudah disimpan.
4. Tekan butang **Tetapan Jadual** (di baris butang dialog, di sebelah **Batal**).
5. **Jadual minggu** guru itu terbuka — **hari ke bawah (5 baris), waktu melintang (13 lajur, waktu 0–12)** — supaya lajur waktu mudah dibaca pada telefon:

    - Sel kosong bertulis **"kosong"** boleh ditekan untuk menanda masa tetapan.
    - Sel yang sudah ditanda menunjukkan **"Pemulihan"** dengan nota *tekan untuk buang* — tekan sekali lagi untuk membuang tanda.
    - Sel yang sudah ada kelas sebenar (contoh `BM` + `3 BIJAK`) **tidak boleh ditekan** — masa tetapan tidak boleh menindih pengajaran sebenar.
6. Tekan setiap ruang kosong yang sepatutnya menjadi masa pemulihan. Setiap ketukan menghasilkan tanda, dan kiraan di bawah jadual berubah (contoh: "3 waktu pemulihan ditanda.").
7. Tekan **Simpan tetapan**.

Selepas disimpan, dialog ditutup dan butang kembali kepada keadaan asal. Jadual minggu guru itu kini menunjukkan masa tetapan, dan enjin relief menghormatinya.

### 11.4 Mengubah, menambah atau membuang masa tetapan

- Buka semula **Tetapan Jadual** pada kad guru yang sama; tanda sedia ada dipaparkan.
- Tekan sel yang sudah ditanda untuk **membuang** tanda itu.
- Tekan **Kosongkan tanda** untuk membuang **semua** tanda sebelum menyimpan.
- Tekan **Simpan tetapan** untuk menyimpan keadaan terakhir.

Bilangan waktu tetapan boleh berubah bila-bila masa tanpa menjejaskan relief yang sudah diterbitkan bagi tarikh lampau.

### 11.5 Cara lain yang menghasilkan masa tetapan

Sebelum ciri di atas diperkenalkan, masa tetapan dihasilkan dengan:

1. **Slot tetap** dalam modul Pembina (bahagian "Slot tetap") — sesuai jika waktu yang sama diulang setiap hari; atau
2. **Import PDF aSc** — sel tanpa nama kelas dalam PDF ditafsirkan sebagai **tugas (duty)**, iaitu bukan pengajaran, sama seperti masa tetapan;

Kedua-duanya masih dihormati oleh enjin relief: apa-apa baris jadual yang bertanda tugas menyekat guru itu daripada dicadangkan pada waktu tersebut.

### 11.6 Amaran penting: "Jadual ini sudah berubah pada pentadbir atau peranti lain"

Apabila anda menekan **Simpan tetapan**, sistem menyemak semula jadual di pelayan sekolah terlebih dahulu. Ini kerana menyimpan menulis semula **seluruh** versi jadual tersebut, jadi simpanan yang menggunakan data lama boleh memadam perubahan orang lain secara senyap.

| Mesej yang muncul | Maksudnya | Apa yang perlu dibuat |
|---|---|---|
| "Jadual ini sudah berubah pada pentadbir atau peranti lain. Data terkini sudah dimuatkan — semak N tanda anda, kemudian tekan Simpan sekali lagi." | Jadual versi itu telah berubah (contohnya pentadbir lain menambah kelas) sementara dialog anda terbuka. **Tiada apa-apa disimpan.** | Jadual minggu telah dimuat semula dengan data terkini dan tanda anda yang masih sah dikekalkan. Semak sekali lagi, kemudian tekan **Simpan tetapan** semula. |
| "Tidak dapat mengesahkan jadual terkini (…). Simpanan tidak dibuat supaya perubahan pentadbir lain tidak hilang." | Sambungan ke pelayan sekolah terputus semasa menyemak. | Periksa sambungan internet dan cuba simpan semula. Sistem **sengaja tidak menyimpan** supaya kerja pentadbir lain tidak hilang. |

Tanda yang berada pada waktu yang kini sudah ada kelas akan dibuang secara automatik semasa jadual dimuat semula — supaya anda tidak menuntut waktu mengajar.

> Nasihat praktikal: jadual biasanya disunting sebelum sesi baharu bermula. Semasa tempoh itu, elakkan dua orang membuka **Tetapan Jadual** (atau import PDF) pada masa yang sama. Amaran di atas akan melindungi anda, tetapi kerja menjadi lebih mudah jika seorang sahaja menyunting pada satu-satu masa.

---

## 12. Tetapan

Tab **Tetapan** (admin sahaja) mengandungi:

### 12.1 Had dan aturan relief

| Tetapan | Maksud dan kesannya |
|---|---|
| **Abaikan relief pairing jika guru lain masih hadir dalam kelas dan waktu yang sama** | Untuk kelas yang benar-benar **dikongsi (team teaching / pairing)**, relief tidak dijana jika salah seorang guru masih hadir. Hidupkan **hanya jika** perkongsian itu memang pairing — bukan kumpulan berasingan yang kebetulan berkongsi label kelas. Jika **semua** guru pasangan tidak hadir, relief tetap dijana. |
| **Maksimum waktu relief sehari bagi setiap guru** | Lalai **2 waktu**. Tidak termasuk waktu mengajar asal guru itu. Nilai **0** bermakna sistem tidak mencadangkan relief langsung. Menukar had ini **tidak** membatalkan relief yang sudah diterbitkan. |

Tekan **"Simpan had relief"** untuk menyimpan kedua-duanya.

### 12.2 Akaun admin

**Tukar kata laluan** — isi kata laluan semasa dan kata laluan baharu (sekurang-kurangnya 12 aksara), tekan **Simpan kata laluan**. Penukaran kata laluan **membatalkan semua sesi lama pada semua peranti**, dan admin akan log keluar secara automatik lalu perlu log masuk semula.

### 12.3 Aplikasi (PWA)

Memaparkan **versi aplikasi semasa**, **semakan data (nombor revisi)** dan masa kemas kini terakhir. Tekan **"Semak versi baharu"** untuk memaksa service worker menyemak kemas kini aplikasi.

> Data Google Sheets disegerakkan secara berasingan dan **tidak** memerlukan pemasangan semula aplikasi. Menyemak versi baharu tidak menyegerakkan data.

### 12.4 Arkib dan reset data

| Tindakan | Kesan |
|---|---|
| **Arkibkan jadual lama** | Menukar status versi jadual bukan aktif kepada **archived** — tidak lagi digunakan untuk relief tetapi kekal boleh dilihat dalam Google Sheets. |
| **Padam jadual yang diarkib** | Memadam **kekal** versi yang telah diarkibkan berserta semua baris jadualnya daripada Google Sheets. Tidak boleh dibatalkan, dan tidak boleh digunakan pada jadual aktif. |
| **Reset data terpilih** | Memadam data terpilih (Profil guru / Rekod ketiadaan / Rekod relief / Jadual waktu / Draf pembina jadual) daripada **Google Sheets dan aplikasi**. Mesti menandakan sekurang-kurangnya satu jenis data dan menaip **PADAM** dalam kotak pengesahan. **Tidak boleh dibatalkan.** |

> Biarkan kotak **"Rekod relief"** tidak ditanda jika anda mahu sejarah relief kekal. Jika anda mereset **Jadual waktu**, masa tetapan guru pemulihan turut hilang kerana ia disimpan sebagai sebahagian daripada jadual.

---
## 13. Paparan awam (tanpa log masuk)

Pelawat yang tidak log masuk hanya melihat:

- jadual guru/kelas bagi **versi rasmi (aktif)** yang berkuat kuasa **pada hari ini** sahaja — jadual/versi lama tidak dihantar kepada pelawat;
- senarai ketiadaan guru, **tanpa sebab ketiadaan**;
- relief yang **telah diterbitkan** sahaja bagi hari yang dipilih — draf yang belum diterbitkan tidak kelihatan.

Maklumat berikut **tidak pernah** dihantar kepada paparan awam: sebab ketiadaan, catatan dalaman, draf relief, kelayakan/profil penuh guru, draf pembina jadual, atau masa tetapan guru pemulihan.

Di telefon, paparan awam ini ialah rujukan pantas untuk guru menyemak: **siapa tiada hari ini, siapa mengganti, dan apa yang perlu dia ajar**.

Apabila seseorang guru membuka pautan awam, dia boleh:

1. Memilih tarikh pada medan tarikh (hari ini dipilih secara lalai).
2. Melihat senarai ketiadaan dan guru ganti bagi tarikh itu.
3. Membuka tab **Jadual** untuk melihat jadual minggu guru atau kelas.

Peranti pelawat menyimpan salinan jadual terakhir supaya paparan berikutnya lebih pantas. Jika data di pelayan tidak berubah, pelayan hanya menjawab ringkas ("tiada perubahan") berbanding menghantar semula keseluruhan data — ini menjimatkan kuota internet sekolah.

---

## 14. Penunjuk status segerak dan keadaan luar talian

Di bar atas aplikasi terdapat penunjuk segerak (teks kecil di sebelah butang **?**). **Tiada butang segerak manual**: aplikasi menyegerak sendiri setiap kira-kira 8 saat, apabila tab kembali aktif, dan apabila peranti kembali dalam talian. Bacalah penunjuk itu seperti ini:

| Status | Maksud | Apa yang perlu dibuat |
|---|---|---|
| **Google Sheets · masa nyata** | Semua perubahan telah sampai ke Google Sheets. | Selamat log keluar atau menutup aplikasi. |
| **Disimpan di peranti · segerak N** | N perubahan sudah disimpan pada peranti dan sedang dihantar ke Sheets. | Tunggu sebentar. Jangan ulang tindakan yang sama pada peranti lain. |
| **Tersimpan di peranti · menunggu Sheets** | Penghantaran gagal (biasanya sambungan terputus). Data **tidak hilang** — ia ada pada peranti. | Sila sambung semula internet dan biarkan aplikasi mencuba semula. **Jangan** log keluar, **jangan** kosongkan data pelayar, dan **jangan** buat perubahan yang sama pada peranti lain sehingga status kembali **masa nyata**. |
| **Luar talian** | Peranti tiada sambungan. | Sambungkan semula. Paparan kekal daripada salinan terakhir. |
| **Belum disambungkan** | URL Apps Script sekolah belum ditetapkan pada peranti ini. | Log masuk dengan memasukkan URL `/exec` yang dibekalkan pentadbir sekolah. |

Sistem mengesan kembali sambungan secara automatik dan menyegerak apabila peranti kembali dalam talian. Jika ada perubahan yang masih tertunda, biarkan aplikasi terbuka dan bersambung sehingga penunjuk kembali **Google Sheets · masa nyata**.

### 14.1 Mengapa sistem boleh enggan menyimpan

Sesetengah simpanan — terutamanya menyimpan **masa tetapan guru pemulihan** — disemak terlebih dahulu dengan pelayan sekolah. Jika jadual telah berubah, sistem memuatkan data terkini dan meminta anda menyemak semula, sebaliknya menulis data lama di atas kerja orang lain. Jika sambungan tiada, simpanan itu **tidak dibuat langsung** dan anda akan dimaklumkan. Ini perlakuan yang **disengajakan** untuk melindungi data sekolah.

---

## 15. Aliran kerja dan senarai semak

### 15.1 Setiap hari persekolahan (5–10 minit)

1. **Log masuk** (jika sesi 7 hari belum tamat, ia dipulihkan secara automatik).
2. Buka **Hari ini** → sub-tab **Ketiadaan guru**.
3. Rekod setiap guru yang tidak hadir: **+ Tambah** → guru → tarikh → sepanjang hari atau waktu tertentu → sebab ringkas.
4. Beralih ke sub-tab **Relief**. Draf biasanya terjana sendiri; jika belum, tekan **Jana**.
5. Semak **Senarai relief** — pastikan setiap slot ada guru ganti yang sesuai dan **tiada percanggahan**.
6. Buka **Preview** untuk melihat lembaran seperti yang akan dicetak.
7. Tekan **Terbitkan**.
8. **Eksport PDF** untuk simpanan/kongsi, dan/atau **Cetak** untuk salinan kertas.
9. Tampal/cetak lembaran itu di bilik guru supaya guru ganti boleh terus merujuk.

**Aliran ringkas:**
> Rekod guru tiada → Jana cadangan relief → Semak (Senarai relief / Preview) → Terbitkan → Cetak / Eksport PDF

> **Draf relief disimpan pada peranti.** Jika storan peranti penuh atau dibatalkan (contohnya mod peribadi), aplikasi memaparkan amaran **"Storan peranti penuh atau tidak dibenarkan — draf ini hanya kekal selagi aplikasi terbuka"**. Jangan tutup aplikasi sebelum menekan **Terbitkan**, kerana draf itu belum sampai ke Sheets.

### 15.2 Setiap minggu

- Semak penunjuk segerak — pastikan ia menunjukkan **masa nyata** sekurang-kurangnya sekali.
- Semak semula kelayakan relief guru yang bercuti panjang atau bertugas luar.
- Semak tab **Jadual** bagi guru yang mempunyai masa tetapan — pastikan tandanya masih betul.

### 15.3 Tabiat sebelum menerbitkan jadual (elak jadual lama kembali aktif)

Jadual lama boleh jadi aktif semula **tanpa amaran** jika satu tulisan tertunda mendarat lewat: contohnya tuan menerbitkan jadual malam ini, tulisan itu tersangkut kerana sambungan terputus, lalu peranti menghantarnya sendiri pagi esok. Baris kedua-dua versi tetap ada di Sheets (boleh dipulihkan dengan terbit semula), tetapi sehingga perasan, sekolah memakai jadual lama. Tiga tabiat ini menutup hampir semua kejadian itu:

1. Sebelum menutup aplikasi atau menerbitkan, pastikan penunjuk segerak menunjukkan **Google Sheets · masa nyata**. Jika ia berkata **menunggu Sheets**, ada tulisan tertunda yang akan mendarat lewat.
2. **Muat semula** tab atau peranti yang sudah lama terbuka sebelum menekan **Gunakan untuk relief →** — halaman yang dimuat semula sentiasa menarik jadual terkini.
3. Jika baris status kad **Draf** berkata **"Draf peranti ini digunakan"**, putuskan dahulu: **Simpan draf ke Sheets** (naikkan kerja peranti ini) atau **Muat draf Sheets** (ambil salinan awan). Jangan terus terbitkan.

### 15.4 Sekali sekala (awal sesi atau bila jadual berubah)

1. Terima/sediakan jadual baharu (Pembina atau Import PDF).
2. **Semak** draf — pastikan kelas, subjek dan guru betul.
3. **Gunakan untuk relief →** dan sahkan **tarikh kuat kuasa**.
4. **Tandakan semula masa tetapan** guru pemulihan pada versi baharu (Bahagian 11).
5. Semak **Paparan awam** — pastikan jadual yang keluar pada hari ini ialah jadual yang betul.
6. Tukar **kata laluan admin** jika ia masih `admin/admin`.
7. Muat turun **sandaran JSON** (Pembina → Data & Sandaran) dan **senarai guru** sebagai salinan tambahan.

---

## 16. Telefon berbanding desktop

| Aspek | Desktop | Telefon / tablet sempit |
|---|---|---|
| Navigasi utama | Bar sisi (sidebar) di kiri | Bar navigasi **bawah** (Relief, Jadual, Guru, Tetapan) |
| Susun atur | Kandungan penuh dalam satu paparan lebar | Kandungan menegak; kad dan borang memenuhi lebar skrin |
| **Jadual minggu guru** | Kelihatan penuh, selesa | **Dipadatkan supaya muat satu skrin tanpa skrol mendatar** |
| Preview relief & jadual cetak | Kelihatan penuh | Jadual lebih lebar daripada skrin — **skrol mendatar** diperlukan |
| Butang penting (contoh Tetapan Jadual, Simpan) | Saiz biasa | Dinaikkan kepada sekurang-kurangnya **40 piksel** tinggi supaya selesa ditekan dengan ibu jari |
| Menanda masa tetapan | Klik sel | Ketuk sel; sel yang ada kelas dikunci |
| Pemasangan aplikasi | Butang **Pasang aplikasi** di bar atas | Sama; atau menu pelayar "Tambah ke skrin utama" |
| Luar talian | Fail aplikasi dari cache peranti | Sama |

---

## 17. Glosari

| Istilah | Maksud dalam sistem ini |
|---|---|
| **Relief** | Tugasan menggantikan guru yang tidak hadir pada waktu tertentu. |
| **Guru ganti** | Guru yang ditugaskan mengisi waktu guru yang tidak hadir. |
| **Draf relief** | Cadangan relief yang **belum diterbitkan**. Tidak kelihatan kepada awam dan tidak muncul pada cetakan/PDF. |
| **Terbit (published)** | Relief yang telah disahkan dan disimpan sebagai rekod rasmi; kelihatan kepada awam dan boleh dicetak. |
| **Versi jadual** | Satu set jadual lengkap dengan nama dan **tarikh kuat kuasa**. Hanya satu versi **aktif** pada satu-satu masa. |
| **Aktif / superseded / archived** | Aktif = sedang digunakan untuk relief. Superseded = digantikan versi baharu. Archived = disimpan sebagai sejarah sahaja. |
| **Tarikh kuat kuasa** | Tarikh mulai sesuatu versi jadual digunakan. |
| **Draf pembina** | Jadual yang sedang dibina dalam modul Pembina; **bukan** jadual rasmi sehingga diaktifkan. |
| **Masa tetapan (PEMULIHAN)** | Waktu bukan subjek yang ditanda pada jadual guru pemulihan; menyekat guru itu daripada dipilih sebagai guru ganti pada waktu tersebut. |
| **Duty / tugas** | Baris jadual yang bukan pengajaran (perhimpunan, aktiviti, masa tetapan). |
| **Pairing (team teaching)** | Dua guru berkongsi satu kelas dan waktu yang sama. Dengan tetapan pairing dihidupkan, relief tidak dijana jika salah seorang masih hadir. |
| **Personel MySTEP** | Personel yang mengambil alih **keseluruhan** jadual seorang guru. |
| **Guru Praktikal** | Guru pelatih yang berkongsi kelas/beberapa subjek dengan guru asal. |
| **Had relief harian** | Maksimum bilangan waktu relief sehari bagi setiap guru (lalai 2). |
| **PWA** | Aplikasi web yang boleh dipasang pada peranti seperti aplikasi biasa. |
| **Revisi (revision)** | Nombor semakan data di pelayan. Ia berubah setiap kali data sekolah berubah, dan digunakan untuk mengesan perubahan yang berlaku di peranti lain. |
| **Outbox / tertunda** | Perubahan yang disimpan pada peranti dan menunggu dihantar ke Google Sheets. |

---

## 18. Masalah biasa dan penyelesaian

| Masalah | Sebab lazim | Penyelesaian |
|---|---|---|
| Tidak boleh log masuk / kata laluan ditolak | Kata laluan salah, atau lima percubaan gagal (disekat 15 minit) | Semak ejaan. Jika baru dipasang, cuba `admin` / `admin`. Selepas lima kegagalan, tunggu 15 minit. |
| Sesi tiba-tiba tamat / diminta log masuk semula | Sesi 7 hari tamat, atau kata laluan ditukar pada peranti lain | Log masuk semula. Jika ia berlaku serta-merta selepas seseorang menukar kata laluan, ini normal. |
| Butang **Tetapan Jadual** tidak muncul dalam profil guru | Guru itu belum disimpan, atau jawatannya bukan **Guru Pemulihan** | Simpan profil dahulu, kemudian buka semula. Pastikan medan **Jawatan** = Guru Pemulihan. |
| Tekan **Simpan tetapan** tetapi dialog tidak tertutup, dan mesej menyatakan jadual telah berubah | Pentadbir atau peranti lain mengubah jadual versi itu, atau sambungan terputus | Baca mesejnya: jika jadual dimuat semula, semak tanda anda dan tekan **Simpan tetapan** sekali lagi. Jika sambungan terputus, pulihkan internet dahulu. Tiada data dibuang. |
| Sel dalam Tetapan Jadual tidak boleh ditekan | Waktu itu sudah ada kelas sebenar | Betulkan jadualnya dahulu (Pembina / import). Masa tetapan **tidak** menindih pengajaran. |
| Guru pemulihan masih dipanggil mengganti pada waktu tetapan | Masa tetapan disimpan pada versi jadual lama, bukan versi yang berkuat kuasa sekarang | Buka semula **Tetapan Jadual** pada jadual aktif sekarang dan tandakan kembali waktunya. |
| Draf relief kosong walaupun ada rekod ketiadaan | Guru itu tiada waktu mengajar pada tarikh itu, had relief calon penuh, atau slot dilindungi pairing | Baca sebab yang dipaparkan sistem; semak tab Jadual untuk guru tersebut, tab Tetapan untuk had relief, dan tetapan pairing. |
| Relief tidak muncul pada cetakan/PDF | Relief itu masih **draf** (belum diterbitkan) | Tekan **Terbitkan** dahulu, semak **Preview**, kemudian cetak/eksport. |
| Muat naik PDF aSc gagal / "Susun atur PDF tidak dikenali" | Bukan PDF teks aSc "Jadual Waktu Persendirian Guru" waktu 0–12 | Eksport semula daripada aSc menggunakan laporan yang betul dan dalam bentuk teks (bukan imbasan). |
| Sesetengah guru diabaikan semasa import PDF | Nama pada PDF tidak sepadan dengan tab Guru | Padankan secara manual pada dropdown baris berkenaan. Jika tab Guru kosong, tekan **Pulihkan senarai guru asal** dahulu. |
| Perubahan tidak sampai ke Google Sheets | Tiada sambungan semasa menyimpan | Status penunjuk segerak akan menyatakan **menunggu Sheets**; data selamat pada peranti. Jangan log keluar atau mengosongkan data pelayar sehingga ia dihantar. |
| Jadual bertukar tidak seperti yang dijangkakan | Versi jadual lama masih aktif, atau tarikh kuat kuasa salah | Tab **Jadual** menunjukkan versi dan tarikh kuat kuasa yang aktif. Aktifkan versi yang betul melalui **Gunakan untuk relief →**. |
| Jadual/hari ini kosong untuk sesuatu tarikh | Tiada versi jadual yang berkuat kuasa pada tarikh itu | Semak tarikh kuat kuasa versi jadual dan aktifkan versi yang sesuai. |
| Log masuk/simpan langsung tidak berfungsi walaupun internet baik | URL Apps Script (`site-config.js` / `/exec`) salah atau belum disediakan | Hubungi pentadbir sekolah untuk mengesahkan URL deployment Apps Script. |
| Paparan kelihatan lama selepas kemas kini | Service worker masih memegang versi lama | Tetapan → **Semak versi baharu**, kemudian tutup dan buka semula aplikasi. Data Sheets tidak terjejas. |

---

## 19. Keselamatan data dan amalan terbaik

1. **Tukar kata laluan `admin/admin` secepat mungkin** selepas pemasangan; gunakan sekurang-kurangnya 12 aksara.
2. **Jangan kongsi fail Google Sheets data sekolah** secara awam. Hadkan capaian kepada akaun sekolah sahaja.
3. **Log keluar** selepas menggunakan peranti yang dikongsi.
4. Sebelum **Reset data** atau **Padam jadual yang diarkib**, faham bahawa tindakan itu **tidak boleh dibatalkan** dan ia memadam rekod daripada Google Sheets, bukan sekadar daripada paparan.
5. Gunakan **Muat turun senarai guru** dan **Muat turun sandaran JSON** dari semasa ke semasa sebagai salinan tambahan.
6. Semak draf pembina dan tarikh kuat kuasa sebelum **Aktifkan jadual** — pengaktifan menggantikan jadual rasmi yang digunakan relief harian.
7. Paparan awam **tidak** memaparkan sebab ketiadaan, jadi apabila menulis sebab, anggap ia dibaca oleh admin lain — **jangan** masukkan maklumat sensitif murid atau perubatan di situ.
8. Jangan bina dua versi jadual "serentak" tanpa menyelesaikan yang lama (arkibkan), supaya tidak timbul kekeliruan tentang versi yang berkuat kuasa.
9. Pada telefon yang dikongsi bersama guru lain, paparan awam sahaja yang sepatutnya dibuka.

---

## 20. Lampiran

### 20.1 Kad rujukan pantas

**Rekod guru tidak hadir**
> Hari ini → **Ketiadaan guru** → **+ Tambah** → guru, tarikh, sepanjang hari / waktu → **Simpan dan jana relief**

**Terbitkan relief**
> Hari ini → **Relief** → **Jana** (jika perlu) → semak **Senarai relief** → **Preview** → **Terbitkan** → **Eksport PDF** / **Cetak**

**Tandakan masa tetapan guru pemulihan**
> **Guru** → ikon ✎ pada kad guru pemulihan → butang **Tetapan Jadual** → ketuk ruang kosong → **Simpan tetapan**

**Lihat jadual minggu**
> **Jadual** → pilih **Guru/Kelas** → pilih nama → minggu penuh dipaparkan (hari ini ditanda hijau)

**Aktifkan jadual baharu**
> **Jadual** → Pembina → jana → **Gunakan untuk relief →** → sahkan tarikh kuat kuasa → **Aktifkan jadual** → tandakan semula masa tetapan guru pemulihan

**Jika perubahan belum sampai ke Sheets**
> Lihat penunjuk segerak. **Menunggu Sheets** = sambung internet dan tunggu. Jangan log keluar.

### 20.2 Apa yang baharu dalam versi terkini

| Versi | Perubahan penting untuk pengguna |
|---|---|
| **3.1.40** | Butang bulat **`?`** di bar atas membuka **panduan PDF** ini; butang segerak manual dibuang kerana penyegerakan sudah automatik; item **Panduan** dibuang daripada menu Pembina. |
| **3.1.41** | Butang buka panduan `?` dipaparkan **hanya kepada pentadbir** (paparan awam tidak melihatnya). |
| **3.1.42** | Draf Pembina kini benar-benar **disimpan pada peranti** — memuat semula halaman tidak lagi membuang kerja yang belum dinaikkan ke Sheets; draf peranti diutamakan berbanding draf Sheets dan statusnya dinyatakan pada kad Draf. |
| **3.1.43** | Amaran jelas apabila peranti enggan menyimpan **draf relief** (storan penuh / mod peribadi) — sebelum ini kegagalan itu senyap. |
| **3.1.39** | Semua jadual guru memakai bentuk grid Pembina: **hari ke bawah, waktu melintang, lajur REHAT**, blok berwarna mengikut subjek dan legenda warna — pada tab Jadual, paparan Kelas dan dialog Tetapan Jadual guru pemulihan. |
| **3.1.38** | Jadual guru dipaparkan sebagai **minggu penuh** (waktu di tepi, Isnin–Jumaat di atas; hari ini ditanda hijau; masa tetapan berwarna kuning) dan muat satu skrin telefon tanpa skrol mendatar. |
| **3.1.36–3.1.37** | **Butang Tetapan Jadual berpindah ke dalam dialog profil guru** (bukan lagi pada muka kad). Simpanan masa tetapan kini **menyemak jadual terkini** dahulu — jika jadual telah berubah, ia meminta semak semula dan **tidak** menindih kerja pentadbir lain. |
| **3.1.34–3.1.35** | Ciri **Guru Pemulihan**: jawatan baharu, butang Tetapan Jadual, jadual minggu untuk menanda masa tetapan. |
| **3.1.32–3.1.33** | Pariti paparan telefon dan desktop (preview relief di telefon), sasaran sentuh 40 piksel, susunan bar alat yang tidak bertindih. |

### 20.3 Rujukan teknikal untuk pentadbir IT

Panduan ini disemak berdasarkan kod sumber versi **3.1.43** dalam repositori tempatan `C:/Users/seman/work/Jadual-audit`:

| Perkara | Fail berkaitan |
|---|---|
| Papan pemuka, dialog, paparan jadual minggu | `index.html`, `app.js` |
| Model jadual minggu (fungsi tulen) | `week-view.js`, `tests/week-view.test.mjs` |
| Masa tetapan guru pemulihan | `setting-slots.js`, `tests/setting-slots.test.mjs`, `tests/setting-relief-block.test.mjs` |
| Enjin cadangan relief | `relief-engine.js` |
| Cetakan & PDF relief | `relief-print.js`, `relief-pdf.js` |
| Import PDF aSc | `pdf-import.js`, `pdf-builder.js` |
| Pelayan sekolah | `apps-script/Code.gs`, `apps-script/Auth.gs` |
| Cache luar talian | `sw.js` |
| Pemasangan sekolah baharu | `SETUP-SEKOLAH.md` |

---

## Perlu pengesahan pengguna

Perkara berikut tidak dapat disahkan sepenuhnya daripada kod sumber sahaja dan sebaiknya disemak oleh sekolah sebelum dijadikan panduan muktamad:

1. **Pautan aplikasi sebenar sekolah anda** — panduan ini hanya boleh mengesahkan pautan contoh (`https://sepadan.github.io/Jadual/`) yang tercatat dalam `README.md`. Sekolah yang menyediakan sistem sendiri mengikut `SETUP-SEKOLAH.md` mungkin menerbitkan pautan yang berbeza — dapatkan pautan sebenar daripada pentadbir/IT sekolah.
2. **Kelakuan sebenar butang "Pasang aplikasi"** bergantung pada jenis dan versi pelayar (Chrome, Edge, Safari). Kod hanya mengesan sokongan asas (`beforeinstallprompt`) dan tidak dapat mengesahkan rupa sebenar pada setiap peranti.
3. **Gambar skrin** dalam edisi ini tidak disertakan; langkah ditulis mengikut label sebenar pada skrin. Jika sekolah menggunakan versi yang lebih baharu, nama butang mungkin berbeza sedikit — semak nombor versi di **Tetapan → Aplikasi (PWA)**.
4. **Bilangan waktu harian** yang dipaparkan (0–12) mengikut `data.js` dalam kod sumber; jika jadual sekolah anda menggunakan bilangan waktu atau waktu rehat yang berlainan, paparan akan mengikut tetapan dalam modul Pembina.
