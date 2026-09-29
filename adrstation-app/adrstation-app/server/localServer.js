/**
 * =====================================================================
 * server/localServer.js
 * =====================================================================
 * Server HTTP lokal yang dijalankan AdrStation di laptop yang tersambung
 * ke printer. Tablet/iPad (app ADR Photobooth, lewat toggle "Use AirLink
 * to Print" di settings.html) mengirim foto ke sini lewat Wi-Fi yang
 * sama, lalu AdrStation yang mencetaknya ke printer fisik.
 *
 * Endpoint:
 *  GET  /                 -> 200 OK teks singkat. Dipakai persis oleh
 *                             fungsi testPrinterConnection() di app
 *                             tablet (js/printer.js) untuk cek reachability.
 *  GET  /status           -> JSON status AdrStation (nama, versi, printer
 *                             sistem yang dipakai, paper profile aktif,
 *                             perlu pairing code atau tidak).
 *  POST /pair             -> body { code } — verifikasi kode pairing 6
 *                             digit yang ditampilkan di jendela AdrStation
 *                             (lihat renderer/renderer.js "Scan QR Code").
 *  POST /print            -> multipart/form-data, field "photo" (file)
 *                             + field opsional "paperProfileId",
 *                             "copies", "borderless". Ini yang benar-benar
 *                             mencetak ke Epson L8050.
 *  GET  /paper-profiles    -> daftar ukuran kertas yang didukung, supaya
 *                             app tablet bisa menampilkan pilihan yang
 *                             SAMA dengan yang dikonfigurasi di AdrStation.
 * =====================================================================
 */

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');

const { PRINTER_PROFILES, getProfileById } = require('../config/printerProfiles');
const { buildPrintReadyPdf } = require('../print/imageToPdf');
const { sendToPrinter } = require('../print/printService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

/**
 * @param {object} deps
 * @param {() => object} deps.getSettings   ambil settings terkini (config/store.js)
 * @param {(job: object) => void} deps.onJobUpdate  dipanggil setiap job
 *        berubah status, supaya renderer bisa menampilkan log real-time.
 */
function createServer({ getSettings, onJobUpdate }) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/', (req, res) => {
    res.status(200).send('AdrStation is running.');
  });

  app.get('/status', (req, res) => {
    const settings = getSettings();
    const profile = getProfileById(settings.paperProfileId);
    res.json({
      ok: true,
      name: 'AdrStation',
      requiresPairing: true,
      printerName: settings.systemPrinterName || '(default system printer)',
      paperProfile: profile ? { id: profile.id, label: profile.label } : null,
      borderless: settings.borderless,
    });
  });

  app.get('/paper-profiles', (req, res) => {
    const all = [...PRINTER_PROFILES, ...(getSettings().customProfiles || [])];
    res.json(all.map((p) => ({ id: p.id, label: p.label, widthMm: p.widthMm, heightMm: p.heightMm })));
  });

  app.use(express.json());

  app.post('/pair', (req, res) => {
    const settings = getSettings();
    const submitted = String((req.body && req.body.code) || '').trim();
    if (!settings.pairingCode) {
      return res.json({ ok: true, paired: true }); // pairing dimatikan operator
    }
    const ok = timingSafeEqual(submitted, settings.pairingCode);
    res.status(ok ? 200 : 403).json({ ok, paired: ok });
  });

  app.post('/print', upload.single('photo'), async (req, res) => {
    const settings = getSettings();
    const jobId = crypto.randomBytes(4).toString('hex');

    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'No photo file received (field "photo").' });
    }

    // Pairing code wajib untuk endpoint cetak (bukan hanya /status),
    // supaya perangkat lain di jaringan yang sama tidak bisa iseng kirim
    // print job tanpa persetujuan operator AdrStation.
    if (settings.pairingCode) {
      const submitted = String(req.body.pairingCode || req.header('x-adrstation-pair') || '').trim();
      if (!timingSafeEqual(submitted, settings.pairingCode)) {
        emitJob(onJobUpdate, jobId, 'rejected', 'Invalid/missing pairing code');
        return res.status(403).json({ ok: false, message: 'Invalid or missing pairing code.' });
      }
    }

    const profileId = req.body.paperProfileId || settings.paperProfileId;
    const profile = getProfileById(profileId) || getProfileById(settings.paperProfileId);
    const borderless = req.body.borderless != null ? req.body.borderless === 'true' : settings.borderless;
    const copies = Math.max(1, parseInt(req.body.copies, 10) || settings.copies || 1);

    emitJob(onJobUpdate, jobId, 'received', `Photo received (${(req.file.size / 1024).toFixed(0)} KB), paper: ${profile.label}`);

    try {
      const pdfBytes = await buildPrintReadyPdf(req.file.buffer, req.file.mimetype, profile, {
        borderless,
        marginMm: settings.customMarginMm,
        copies: profile.stripLayout ? profile.stripLayout.copies : 1,
      });

      emitJob(onJobUpdate, jobId, 'rendering', 'Print-ready PDF generated, sending to printer…');

      const result = await sendToPrinter(pdfBytes, {
        printerName: settings.systemPrinterName,
        copies,
        jobId,
      });

      if (result.ok) {
        emitJob(onJobUpdate, jobId, 'printed', `Sent to ${settings.systemPrinterName || 'default printer'} (${copies}x)`);
        res.json({ ok: true, jobId, message: 'Print job sent to printer.' });
      } else {
        emitJob(onJobUpdate, jobId, 'error', result.message);
        res.status(500).json({ ok: false, jobId, message: result.message });
      }
    } catch (err) {
      emitJob(onJobUpdate, jobId, 'error', err.message || String(err));
      res.status(500).json({ ok: false, jobId, message: err.message || String(err) });
    }
  });

  return app;
}

function emitJob(onJobUpdate, id, status, message) {
  if (typeof onJobUpdate === 'function') {
    onJobUpdate({ id, status, message, at: Date.now() });
  }
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { createServer };
