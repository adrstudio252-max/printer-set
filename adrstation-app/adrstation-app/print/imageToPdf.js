/**
 * =====================================================================
 * print/imageToPdf.js
 * =====================================================================
 * Mengubah foto (JPEG/PNG) yang dikirim tablet lewat AirLink menjadi
 * satu file PDF berukuran PERSIS sama dengan kertas fisik di printer
 * (dalam point, 1in = 72pt), supaya begitu dikirim ke driver printer
 * tidak ada auto-scale/crop tambahan dari OS yang bikin hasilnya meleset.
 *
 * Dua mode penempatan foto:
 *  - borderless (cover-fit)  : foto di-crop supaya penuh 1 halaman tanpa
 *                              tepi putih (dipakai kalau borderless ON
 *                              dan ukuran kertas mendukung borderless).
 *  - margin (contain-fit)    : foto diperkecil supaya utuh di dalam area
 *                              yang tersisa setelah margin, lalu
 *                              ditengahkan (dipakai kalau borderless OFF
 *                              atau custom margin dinyalakan).
 * =====================================================================
 */

const { PDFDocument } = require('pdf-lib');
const { mmToPt } = require('../config/printerProfiles');

/**
 * @param {Buffer} imageBuffer   isi file foto (jpg/png) dari tablet
 * @param {string} mimeType      'image/jpeg' | 'image/png'
 * @param {object} profile       salah satu entri dari PRINTER_PROFILES
 * @param {object} opts
 * @param {boolean} opts.borderless
 * @param {{top:number,right:number,bottom:number,left:number}|null} opts.marginMm
 * @param {number} opts.copies   berapa kali foto ini diulang di halaman
 *                               yang sama (dipakai untuk strip 2x6 -> 4x6)
 * @returns {Promise<Uint8Array>} bytes file PDF siap-cetak
 */
async function buildPrintReadyPdf(imageBuffer, mimeType, profile, opts = {}) {
  const { borderless = true, marginMm = null, copies = 1 } = opts;

  const pdfDoc = await PDFDocument.create();

  const pageWidthPt = mmToPt(profile.widthMm);
  const pageHeightPt = mmToPt(profile.heightMm);
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

  const image = mimeType === 'image/png'
    ? await pdfDoc.embedPng(imageBuffer)
    : await pdfDoc.embedJpg(imageBuffer);

  const imgW = image.width;
  const imgH = image.height;

  // Strip 2x6 digandakan berdampingan (side-by-side) di atas kertas 4x6.
  const slots = buildSlots(profile, copies, pageWidthPt, pageHeightPt);

  const useBorderless = borderless && profile.borderlessSupported && !marginMm;
  const effectiveMargin = marginMm || {
    top: profile.defaultMarginMm,
    right: profile.defaultMarginMm,
    bottom: profile.defaultMarginMm,
    left: profile.defaultMarginMm,
  };

  for (const slot of slots) {
    if (useBorderless) {
      drawCoverFit(page, image, imgW, imgH, slot.x, slot.y, slot.w, slot.h);
    } else {
      drawContainFitWithMargin(page, image, imgW, imgH, slot, effectiveMargin);
    }
  }

  return pdfDoc.save();
}

/** Bagi halaman jadi N slot berdampingan secara horizontal (untuk strip 2x6, dst). */
function buildSlots(profile, copies, pageWidthPt, pageHeightPt) {
  if (!profile.stripLayout || copies <= 1) {
    return [{ x: 0, y: 0, w: pageWidthPt, h: pageHeightPt }];
  }
  const n = profile.stripLayout.copies || copies;
  const slotW = pageWidthPt / n;
  const slots = [];
  for (let i = 0; i < n; i++) {
    slots.push({ x: i * slotW, y: 0, w: slotW, h: pageHeightPt });
  }
  return slots;
}

/** cover-fit: crop foto supaya penuh mengisi slot tanpa distorsi (mirip CSS background-size:cover). */
function drawCoverFit(page, image, imgW, imgH, x, y, w, h) {
  const scale = Math.max(w / imgW, h / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const dx = x + (w - drawW) / 2;
  const dy = y + (h - drawH) / 2;
  page.drawImage(image, { x: dx, y: dy, width: drawW, height: drawH });
}

/** contain-fit + margin: foto utuh, diperkecil supaya pas di dalam area setelah margin, lalu ditengahkan. */
function drawContainFitWithMargin(page, image, imgW, imgH, slot, marginMm) {
  const marginTopPt = mmToPt(marginMm.top);
  const marginRightPt = mmToPt(marginMm.right);
  const marginBottomPt = mmToPt(marginMm.bottom);
  const marginLeftPt = mmToPt(marginMm.left);

  const areaX = slot.x + marginLeftPt;
  const areaY = slot.y + marginBottomPt;
  const areaW = Math.max(1, slot.w - marginLeftPt - marginRightPt);
  const areaH = Math.max(1, slot.h - marginTopPt - marginBottomPt);

  const scale = Math.min(areaW / imgW, areaH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const dx = areaX + (areaW - drawW) / 2;
  const dy = areaY + (areaH - drawH) / 2;
  page.drawImage(image, { x: dx, y: dy, width: drawW, height: drawH });
}

module.exports = { buildPrintReadyPdf };
