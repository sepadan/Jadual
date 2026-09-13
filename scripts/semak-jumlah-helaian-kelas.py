#!/usr/bin/env python3
"""Semak tiga jumlah pada helaian kelas PDF (Cetak/eksport) dan invariannya.

Guna: python scripts/semak-jumlah-helaian-kelas.py <pdf> [kapasiti ...]
  kapasiti  nombor kapasiti mengikut susunan helaian, dipisah ruang (pilihan).

Invarian yang disemak setiap helaian:
  Waktu Subjek + Waktu Tetapan = Jumlah Waktu Kelas
  Jumlah Waktu Kelas <= kapasiti kelas itu (jika kapasiti diberi)

Kod keluar: 0 = semua lulus, 1 = ada helaian yang gagal atau angka tidak ditemui.
"""
import re
import sys

import pymupdf

LABEL = ("Subjek", "Tetapan", "Kelas")


def angka_kanan(words, y, xmin):
    calon = [w for w in words if abs(w[1] - y) < 4 and w[0] > xmin and re.fullmatch(r"\d+", w[4].strip())]
    calon.sort(key=lambda w: w[0])
    return int(calon[0][4]) if calon else None


def nama_kelas(words):
    """Nama kelas daripada teks helaian, cth '1 BIJAK'. Token aSc/jadual boleh berpecah, jadi
    cantumkan token berhampiran dan cari corak tahun + nama kelas."""
    teks = " ".join(w[4] for w in sorted(words, key=lambda w: (round(w[1]), w[0])))
    padan = re.search(r"\b([1-6])\s+([A-Z][A-Z]{2,})\b", teks.upper())
    return f"{padan.group(1)} {padan.group(2)}" if padan else "(nama kelas tidak dijumpai)"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    laluan = sys.argv[1]
    kapasiti = [int(x) for x in sys.argv[2:]]
    dokumen = pymupdf.open(laluan)
    gagal = False
    for i, halaman in enumerate(dokumen):
        words = halaman.get_text("words")
        nilai = {}
        for x0, y0, x1, y1, t, *_ in words:
            teks = t.strip()
            if teks in LABEL:
                nilai[teks] = angka_kanan(words, y0, x1)
        nama = nama_kelas(words)
        subjek, tetapan, kelas = nilai.get("Subjek"), nilai.get("Tetapan"), nilai.get("Kelas")
        if None in (subjek, tetapan, kelas):
            print(f"halaman {i + 1}: {nama} | RALAT: angka tidak lengkap {nilai}")
            gagal = True
            continue
        ok = subjek + tetapan == kelas
        nota = f"subjek {subjek} + tetapan {tetapan} = kelas {kelas}"
        if i < len(kapasiti):
            if kelas > kapasiti[i]:
                ok = False
                nota += f" | MELEBIHI kapasiti {kapasiti[i]}"
            else:
                nota += f" | kapasiti {kapasiti[i]} OK"
        print(f"halaman {i + 1}: {nama} | {nota} | {'LULUS' if ok else 'GAGAL'}")
        gagal = gagal or not ok
    print("KESIMPULAN:", "GAGAL" if gagal else "SEMUA LULUS")
    return 1 if gagal else 0


if __name__ == "__main__":
    raise SystemExit(main())
