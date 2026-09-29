/**
 * =====================================================================
 * print/printService.js
 * =====================================================================
 * Lapisan yang benar-benar mengirim file PDF siap-cetak ke printer
 * fisik (mis. Epson L8050) lewat driver yang sudah ter-install di OS.
 *
 * Windows : pakai paket 'pdf-to-printer' (membungkus SumatraPDF utk
 *           cetak PDF secara silent, tanpa dialog, dengan --print-settings
 *           supaya ukuran kertas & orientasi mengikuti PDF apa adanya).
 * macOS   : pakai perintah bawaan `lp` (CUPS), yang tersedia di semua
 *           Mac tanpa instalasi tambahan.
 * Linux   : juga lewat `lp` (CUPS) — didukung sebagai bonus meskipun
 *           produk utamanya untuk Windows/Mac.
 * =====================================================================
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');

function tempPdfPath(jobId) {
  const dir = path.join(app.getPath('temp'), 'adrstation-print-jobs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `job-${jobId}.pdf`);
}

/** Daftar nama printer yang terpasang di sistem operasi laptop ini. */
async function listSystemPrinters() {
  if (process.platform === 'win32') {
    const { getPrinters } = require('pdf-to-printer');
    const printers = await getPrinters();
    return printers.map((p) => p.name);
  }
  // macOS / Linux: parse `lpstat -p`
  return new Promise((resolve) => {
    const child = spawn('lpstat', ['-p']);
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('close', () => {
      const names = [];
      out.split('\n').forEach((line) => {
        const m = line.match(/^printer\s+(\S+)/);
        if (m) names.push(m[1]);
      });
      resolve(names);
    });
    child.on('error', () => resolve([]));
  });
}

/**
 * Kirim PDF ke printer.
 * @param {Uint8Array} pdfBytes
 * @param {object} opts
 * @param {string|null} opts.printerName  null = pakai printer default sistem
 * @param {number} opts.copies
 * @param {string} opts.jobId
 * @returns {Promise<{ok: boolean, message: string, filePath: string}>}
 */
async function sendToPrinter(pdfBytes, opts = {}) {
  const { printerName = null, copies = 1, jobId = Date.now().toString() } = opts;
  const filePath = tempPdfPath(jobId);
  fs.writeFileSync(filePath, pdfBytes);

  try {
    if (process.platform === 'win32') {
      await printWindows(filePath, printerName, copies);
    } else {
      await printUnix(filePath, printerName, copies);
    }
    return { ok: true, message: 'Sent to printer', filePath };
  } catch (err) {
    return { ok: false, message: err.message || String(err), filePath };
  }
}

function printWindows(filePath, printerName, copies) {
  const { print } = require('pdf-to-printer');
  const options = {};
  if (printerName) options.printer = printerName;
  // pdf-to-printer prints the PDF at its own page size (fit=noscale by
  // default in recent versions); copies is handled by looping since not
  // every SumatraPDF build supports a native copies flag reliably.
  const jobs = [];
  for (let i = 0; i < Math.max(1, copies); i++) {
    jobs.push(print(filePath, options));
  }
  return Promise.all(jobs);
}

function printUnix(filePath, printerName, copies) {
  return new Promise((resolve, reject) => {
    const args = ['-n', String(Math.max(1, copies))];
    if (printerName) args.push('-d', printerName);
    // -o fit-to-page dimatikan sengaja: PDF sudah dibuat PERSIS ukuran
    // kertas fisik di imageToPdf.js, jadi tidak perlu di-scale ulang.
    args.push(filePath);
    const child = spawn('lp', args);
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `lp exited with code ${code}`));
    });
    child.on('error', (err) => reject(err));
  });
}

/** Bersihkan file PDF sementara yang lebih tua dari `maxAgeMs`. Dipanggil berkala dari main.js. */
function cleanupOldJobs(maxAgeMs = 24 * 60 * 60 * 1000) {
  const dir = path.join(app.getPath('temp'), 'adrstation-print-jobs');
  if (!fs.existsSync(dir)) return;
  const now = Date.now();
  for (const file of fs.readdirSync(dir)) {
    const full = path.join(dir, file);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(full);
    } catch (_) { /* ignore */ }
  }
}

module.exports = { listSystemPrinters, sendToPrinter, cleanupOldJobs };
