// SEMENTARA — pautan khas "tandakan jadual pemulihan" (buang selepas data guru dimasukkan).
//
// Guru pemulihan tidak mampu mengklik 30+ waktu satu demi satu, jadi satu pautan boleh membawa
// seluruh jadual PDPC-nya: `#pemulihan=<base64url>` dengan muatan
// `{ guru: "AMIRAH BINTI SHEIKH ISMAIL", slot: [{ h: "IS", w: 4, s: "MT", k: "3B" }, ...] }`.
//
// Pautan itu TIDAK memintas apa-apa: ia hanya menyediakan tanda dalam dialog Tetapan Jadual, yang
// masih memerlukan login admin dan masih ditulis melalui aliran simpan biasa ke Google Sheets.
export function kodPemulihan(muatan) {
  // Format ringkas "NAMA:HARI-waktu~SUBJEK~KELAS;..." — 37 waktu menjadi ~470 aksara, bukan ~2 KB
  // base64. Subjek dan kelas di-escape kerana kod subjek boleh mengandungi titik (B.ALQ) atau
  // ruang (3 BIJAK). Bentuk base64 lama masih diterima oleh pembaca di bawah.
  const bahagian = (muatan?.slot || []).map((item) => [
    `${String(item?.h || "").toUpperCase()}-${Number(item?.w)}`,
    encodeURIComponent(String(item?.s || "").toUpperCase()),
    encodeURIComponent(String(item?.k || "").trim()),
  ].join("~"));
  return `${encodeURIComponent(String(muatan?.guru || "").trim())}:${bahagian.join(";")}`;
}

export function bacaPemulihanHash(hash) {
  const padan = /(?:^|[#&])pemulihan=([^&]+)/.exec(String(hash || ""));
  if (!padan) return null;
  const mentah = padan[1];
  const buka = (teks) => { try { return decodeURIComponent(teks); } catch { return teks; } };
  if (mentah.includes(":")) {
    const pisah = mentah.indexOf(":");
    const guru = buka(mentah.slice(0, pisah)).trim();
    const slot = mentah.slice(pisah + 1).split(";").map((bahagian) => bahagian.trim()).filter(Boolean).map((bahagian) => {
      const [masa, subjek = "", kelas = ""] = bahagian.split("~");
      const [hari, waktu] = String(masa).split("-");
      return { h: String(hari || "").toUpperCase(), w: Number(waktu), s: buka(subjek).toUpperCase(), k: buka(kelas) };
    }).filter((item) => item.h && Number.isFinite(item.w));
    return slot.length ? { guru, slot } : null;
  }
  try {
    const b64 = mentah.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (huruf) => huruf.charCodeAt(0));
    const muatan = JSON.parse(new TextDecoder().decode(bytes));
    if (!muatan || !Array.isArray(muatan.slot)) return null;
    return { guru: String(muatan.guru || ""), slot: muatan.slot };
  } catch {
    return null;
  }
}

// Setiap slot menjadi satu tanda; waktu yang sudah ada kelas sebenar (tidak boleh ditanda) hanya
// dikira supaya pentadbir tahu ia dilangkau, bukan senyap-senyap hilang.
export function susunSlotPemulihan({ grid, slot, bolehTanda }) {
  const tanda = [];
  const terkunci = [];
  for (const item of slot || []) {
    const hari = String(item?.h || "").toUpperCase();
    const waktu = Number(item?.w);
    const baris = (grid?.rows || []).find((line) => line.day === hari);
    const sel = baris?.cells.find((cell) => Number(cell.period) === waktu);
    if (!sel || !bolehTanda(sel)) {
      terkunci.push({ hari, waktu, sebab: sel ? "ada kelas sebenar" : "luar waktu sekolah" });
      continue;
    }
    tanda.push({ hari, waktu, subjek: String(item?.s || "").toUpperCase(), kelas: String(item?.k || "") });
  }
  return { tanda, terkunci };
}

// Berapa tanda itu baharu, berapa hanya dikemas kini, dan berapa sudah betul sejak awal.
export function kiraPerubahanPemulihan({ tanda, pilihan, butiran, kunci }) {
  let baharu = 0;
  let dikemas = 0;
  let sama = 0;
  for (const item of tanda || []) {
    const id = kunci(item.hari, item.waktu);
    const sedia = butiran[id];
    if (!pilihan.has(id)) baharu += 1;
    else if (!sedia || sedia.subjek !== item.subjek || sedia.kelas !== item.kelas) dikemas += 1;
    else sama += 1;
  }
  return { baharu, dikemas, sama };
}

// Nama guru dalam Sheets tidak selalu sama ejaannya dengan nama dalam borang PDPC
// ("AMIRAH BINTI SHEIKH ISMAIL" lawan "AMIRAH BT SHEIKH ISMAIL"), jadi padanan dilonggarkan:
// tanda baca diabaikan, dan BIN/BINTI/BT boleh ada atau tidak.
export function kunciNamaPemulihan(teks) {
  return String(teks || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function tanpaBin(kunci) {
  return kunci.replace(/\b(BINTI|BIN|BT)\b/g, "").replace(/\s+/g, " ").trim();
}

export function samaNamaPemulihan(satu, dua) {
  const a = kunciNamaPemulihan(satu);
  const b = kunciNamaPemulihan(dua);
  if (!a || !b) return false;
  return a === b || (tanpaBin(a) && tanpaBin(a) === tanpaBin(b));
}

// Guru yang sepatutnya ditanda: padan nama penuh; kalau tiada, padan nama pendek; kalau masih tiada,
// pentadbir memilih sendiri daripada senarai guru pemulihan.
export function pilihGuruPemulihan({ nama, guru }) {
  const senarai = (guru || []).filter((item) => item.active !== false);
  const tepat = senarai.find((item) => samaNamaPemulihan(item.name, nama)) || senarai.find((item) => samaNamaPemulihan(item.shortName, nama));
  if (tepat) return { tepat, calon: [tepat] };
  const pemulihan = senarai.filter((item) => item.position === "Guru Pemulihan").sort((a, b) => String(a.name).localeCompare(String(b.name), "ms"));
  return { tepat: null, calon: pemulihan.length ? pemulihan : senarai };
}
