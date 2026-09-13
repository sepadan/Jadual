// SEMENTARA — kotak "tampal senarai waktu pemulihan" dalam dialog Tetapan Jadual (buang selepas
// guru selesai mengisi jadualnya).
//
// Guru pemulihan tidak perlu mengklik 30+ kali: borang PDPC dicetak sebagai grid, jadi senarai
// ringkas "HARI WAKTU SUBJEK KELAS" (satu baris satu waktu) boleh ditampal dan sistem menandakan
// semuanya. Parser ini sengaja longgar (nama hari penuh atau singkatan, "IS-4" atau "IS 4", kelas
// berspace atau tiada) kerana ia datang daripada dokumen sekolah, bukan borang web.

const HARI = {
  IS: "IS", ISNIN: "IS",
  SEL: "SEL", SELASA: "SEL",
  RAB: "RAB", RABU: "RAB",
  KHA: "KHA", KHAMIS: "KHA",
  JUM: "JUM", JUMAAT: "JUM",
};

// Satu baris: "IS 4 MT 3B" · "ISNIN 4 MT" · "IS-4 MT 3 BIJAK" · "SEL 1 1M1S".
export function tafsirTampalPemulihan(teks, { hari = [], waktu = [] } = {}) {
  const tanda = [];
  const ralat = [];
  const hariSah = new Set((hari || []).map((nilai) => String(nilai).toUpperCase()));
  const waktuSah = new Set((waktu || []).map((nilai) => Number(nilai)));
  const barisSemua = String(teks || "").split(/\r?\n/);
  barisSemua.forEach((baris, index) => {
    const bersih = baris.replace(/[|,;\t]+/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
    if (!bersih) return;
    const bahagian = bersih.split(" ");
    const nombor = index + 1;
    if (bahagian.length < 3) {
      ralat.push({ baris: nombor, teks: bersih, sebab: "perlu sekurang-kurangnya: HARI WAKTU SUBJEK" });
      return;
    }
    const kodHari = HARI[bahagian[0].toUpperCase()];
    if (!kodHari || (hariSah.size && !hariSah.has(kodHari))) {
      ralat.push({ baris: nombor, teks: bersih, sebab: `hari "${bahagian[0]}" tidak dikenali` });
      return;
    }
    const masa = Number(bahagian[1]);
    if (!Number.isFinite(masa) || (waktuSah.size && !waktuSah.has(masa))) {
      ralat.push({ baris: nombor, teks: bersih, sebab: `waktu "${bahagian[1]}" tiada dalam jam sekolah` });
      return;
    }
    const subjek = bahagian[2].toUpperCase();
    const kelas = bahagian.slice(3).join(" ").trim();
    tanda.push({ h: kodHari, w: masa, s: subjek, k: kelas });
  });
  return { tanda, ralat };
}

// Petakan senarai itu kepada sel grid: setiap slot menjadi satu tanda, dan sel yang tidak boleh
// ditanda dilaporkan dengan sebabnya (kelas sebenar vs tugas lain) supaya pentadbir tahu ia
// dilangkau, bukan hilang senyap.
export function susunTampalPemulihan({ grid, tanda, bolehTanda }) {
  const boleh = [];
  const dilangkau = [];
  const sudahAda = new Set();
  for (const item of tanda || []) {
    // Baris pendua dalam satu tampalan (senarai PDPC sering disalin dua kali) tidak boleh menimpa
    // satu sama lain secara senyap: yang pertama dikira, yang kedua dilaporkan.
    const kunci = `${item.h}-${item.w}`;
    if (sudahAda.has(kunci)) {
      dilangkau.push({ ...item, sebab: "waktu ini muncul dua kali dalam senarai" });
      continue;
    }
    const baris = (grid?.rows || []).find((line) => line.day === item.h);
    const sel = baris?.cells.find((cell) => Number(cell.period) === Number(item.w));
    if (!sel) {
      dilangkau.push({ ...item, sebab: "luar waktu sekolah" });
      continue;
    }
    if (!bolehTanda(sel)) {
      const nama = [sel.subject, sel.label].filter(Boolean).join(" ").trim();
      dilangkau.push({ ...item, sebab: sel.state === "lesson" ? `sudah ada kelas sebenar (${nama})` : `sudah ada tugas lain (${nama || "tugas"})` });
      continue;
    }
    sudahAda.add(kunci);
    boleh.push(item);
  }
  return { boleh, dilangkau };
}

// Ayat laporan ringkas untuk dipaparkan di bawah kotak tampal.
export function laporanTampalPemulihan({ boleh, dilangkau, ralat }) {
  const bahagian = [`${boleh.length} waktu ditanda`];
  if (dilangkau.length) bahagian.push(`${dilangkau.length} dilangkau (${dilangkau.map((item) => `${item.h} wk ${item.w}: ${item.sebab}`).join("; ")})`);
  if (ralat.length) bahagian.push(`${ralat.length} baris tidak difahami (baris ${ralat.map((item) => item.baris).join(", ")})`);
  return bahagian.join(" · ");
}
