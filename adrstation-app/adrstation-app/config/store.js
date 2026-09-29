/**
 * =====================================================================
 * config/store.js
 * =====================================================================
 * Penyimpanan pengaturan AdrStation secara sederhana pakai file JSON di
 * folder userData Electron (persist antar restart aplikasi). Sengaja
 * tidak pakai dependency tambahan (electron-store dll.) supaya install
 * lebih ringan dan gampang di-audit.
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getDefaultProfile } = require('./printerProfiles');

function getStorePath() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'adrstation-settings.json');
}

const DEFAULTS = () => ({
  port: 8787,
  pairingCode: null, // dibuat sekali saat pertama kali dijalankan, lihat main.js
  systemPrinterName: null, // null = pakai printer default sistem
  paperProfileId: getDefaultProfile().id,
  borderless: true,
  customMarginMm: null, // { top, right, bottom, left } — override defaultMarginMm profile
  copies: 1,
  autoPrintOnReceive: true, // true = langsung cetak begitu foto diterima dari AirLink
  customProfiles: [], // ukuran kertas custom yang ditambahkan operator
  jobHistoryLimit: 50,
});

function loadSettings() {
  const file = getStorePath();
  try {
    if (!fs.existsSync(file)) {
      const defaults = DEFAULTS();
      fs.writeFileSync(file, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    const raw = fs.readFileSync(file, 'utf-8');
    return { ...DEFAULTS(), ...JSON.parse(raw) };
  } catch (err) {
    console.error('[store] Gagal membaca settings, memakai default.', err);
    return DEFAULTS();
  }
}

function saveSettings(partial) {
  const current = loadSettings();
  const merged = { ...current, ...partial };
  fs.writeFileSync(getStorePath(), JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { loadSettings, saveSettings, getStorePath };
