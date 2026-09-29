/**
 * =====================================================================
 * config/printerProfiles.js
 * =====================================================================
 * Daftar ukuran kertas yang didukung untuk printing photobooth, dibuat
 * khusus mengikuti kemampuan Epson L8050 (A4 borderless photo printer)
 * tapi juga dipakai sebagai fallback umum untuk printer lain yang
 * mendukung ukuran serupa.
 *
 * Setiap profile berisi:
 *  - id            : dipakai sebagai <select> value & disimpan di config
 *  - label         : nama yang ditampilkan di UI AdrStation
 *  - widthMm/heightMm : ukuran fisik kertas (mm) — dipakai untuk generate
 *                    PDF print-ready dengan ukuran halaman yang presisi
 *  - dpi           : resolusi target saat foto dari tablet di-render ke
 *                    halaman cetak (300 = standar cetak foto)
 *  - borderlessSupported : apakah ukuran ini bisa dicetak tanpa tepi di L8050
 *  - defaultMarginMm     : margin bawaan kalau borderless dimatikan
 *  - stripLayout   : khusus strip photobooth (mis. 2x6) — dipakai untuk
 *                    logika "gandakan strip jadi 1 lembar 4x6" (fitur
 *                    copy2x6to4x6 di app tablet)
 *
 * Sumber ukuran: spesifikasi media Epson L8050 (A4 dan berbagai ukuran
 * foto standar). Ukuran non-standar bisa ditambah operator lewat menu
 * "Custom Paper Size" di AdrStation (lihat renderer/renderer.js).
 * =====================================================================
 */

const PRINTER_PROFILES = [
  {
    id: '4x6',
    label: '4 x 6 in (10R / Postcard)',
    widthMm: 101.6,
    heightMm: 152.4,
    dpi: 300,
    borderlessSupported: true,
    defaultMarginMm: 3,
    stripLayout: null,
    isDefault: true,
  },
  {
    id: '5x7',
    label: '5 x 7 in',
    widthMm: 127,
    heightMm: 177.8,
    dpi: 300,
    borderlessSupported: true,
    defaultMarginMm: 3,
    stripLayout: null,
  },
  {
    id: '2l',
    label: '5 x 8 in (2L)',
    widthMm: 127,
    heightMm: 203.2,
    dpi: 300,
    borderlessSupported: true,
    defaultMarginMm: 3,
    stripLayout: null,
  },
  {
    id: '3.5x5',
    label: '3.5 x 5 in',
    widthMm: 88.9,
    heightMm: 127,
    dpi: 300,
    borderlessSupported: true,
    defaultMarginMm: 3,
    stripLayout: null,
  },
  {
    id: 'square-6x6',
    label: '6 x 6 in (Square)',
    widthMm: 152.4,
    heightMm: 152.4,
    dpi: 300,
    borderlessSupported: true,
    defaultMarginMm: 3,
    stripLayout: null,
  },
  {
    id: 'a4',
    label: 'A4 (210 x 297 mm)',
    widthMm: 210,
    heightMm: 297,
    dpi: 300,
    borderlessSupported: true,
    defaultMarginMm: 5,
    stripLayout: null,
  },
  {
    id: 'a5',
    label: 'A5 (148 x 210 mm)',
    widthMm: 148,
    heightMm: 210,
    dpi: 300,
    borderlessSupported: true,
    defaultMarginMm: 5,
    stripLayout: null,
  },
  {
    id: 'letter',
    label: 'Letter (8.5 x 11 in)',
    widthMm: 215.9,
    heightMm: 279.4,
    dpi: 300,
    borderlessSupported: false,
    defaultMarginMm: 5,
    stripLayout: null,
  },
  {
    id: '2x6-strip',
    label: '2 x 6 in Strip (photobooth strip)',
    widthMm: 50.8,
    heightMm: 152.4,
    dpi: 300,
    borderlessSupported: true,
    defaultMarginMm: 2,
    // 2 strip 2x6 digandakan berdampingan supaya muat 1 lembar 4x6,
    // lalu dipotong jadi 2 secara manual — sama seperti opsi
    // "copy2x6to4x6" di app tablet (js/printer.js).
    stripLayout: { copies: 2, ontoPaperId: '4x6' },
  },
];

/** Ambil satu profile berdasarkan id. Return null kalau tidak ada. */
function getProfileById(id) {
  return PRINTER_PROFILES.find((p) => p.id === id) || null;
}

/** Profile default yang dipakai kalau operator belum memilih apa pun. */
function getDefaultProfile() {
  return PRINTER_PROFILES.find((p) => p.isDefault) || PRINTER_PROFILES[0];
}

/** mm -> points (unit yang dipakai pdf-lib), 1 in = 25.4mm = 72pt. */
function mmToPt(mm) {
  return (mm / 25.4) * 72;
}

/** mm -> pixel pada dpi tertentu, dipakai untuk menghitung ukuran render foto. */
function mmToPx(mm, dpi) {
  return Math.round((mm / 25.4) * dpi);
}

module.exports = {
  PRINTER_PROFILES,
  getProfileById,
  getDefaultProfile,
  mmToPt,
  mmToPx,
};
