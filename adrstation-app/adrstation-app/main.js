/**
 * =====================================================================
 * main.js — AdrStation (Electron main process)
 * =====================================================================
 * Tanggung jawab file ini:
 *  1. Buka jendela pengaturan (renderer/) tempat operator memilih
 *     printer sistem, ukuran kertas (khusus profil Epson L8050), margin,
 *     dan borderless.
 *  2. Jalankan server HTTP lokal (server/localServer.js) yang menerima
 *     foto dari tablet ADR Photobooth lewat Wi-Fi yang sama (AirLink),
 *     lalu benar-benar mencetaknya (print/printService.js).
 *  3. Simpan/baca pengaturan lewat config/store.js supaya persist antar
 *     buka-tutup aplikasi.
 *  4. Ikon di system tray supaya AdrStation bisa tetap jalan di
 *     background selama event berlangsung, tanpa jendela yang mengganggu.
 * =====================================================================
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const { loadSettings, saveSettings } = require('./config/store');
const { PRINTER_PROFILES, getProfileById } = require('./config/printerProfiles');
const { createServer } = require('./server/localServer');
const { getLanIpAddresses, getPrimaryLanIp } = require('./server/networkInfo');
const { listSystemPrinters, cleanupOldJobs } = require('./print/printService');

let mainWindow = null;
let tray = null;
let httpServer = null;
const jobLog = []; // { id, status, message, at } — riwayat ringkas untuk UI

function ensurePairingCode() {
  const settings = loadSettings();
  if (!settings.pairingCode) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    saveSettings({ pairingCode: code });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'AdrStation',
    backgroundColor: '#141221',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'renderer', 'icons', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    // Minimize ke tray, bukan benar-benar keluar — supaya server tetap
    // hidup dan bisa terus menerima print job selama event berlangsung.
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'icons', 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  const menu = Menu.buildFromTemplate([
    { label: 'Open AdrStation', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Quit AdrStation',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setToolTip('AdrStation — running');
  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow.show());
}

function startServer() {
  const settings = loadSettings();
  const expressApp = createServer({
    getSettings: loadSettings,
    onJobUpdate: (job) => {
      jobLog.unshift(job);
      if (jobLog.length > 200) jobLog.length = 200;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('job:update', job);
      }
    },
  });

  httpServer = expressApp.listen(settings.port, () => {
    console.log(`[AdrStation] Local server listening on port ${settings.port}`);
  });

  httpServer.on('error', (err) => {
    console.error('[AdrStation] Server failed to start:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server:error', err.message);
    }
  });
}

// ---------------------------------------------------------------------
// IPC — jembatan antara renderer (UI pengaturan) dan proses main
// ---------------------------------------------------------------------
function registerIpcHandlers() {
  ipcMain.handle('settings:get', () => loadSettings());

  ipcMain.handle('settings:save', (event, partial) => saveSettings(partial));

  ipcMain.handle('printers:list', async () => {
    try {
      return await listSystemPrinters();
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('paperProfiles:list', () => {
    const settings = loadSettings();
    return [...PRINTER_PROFILES, ...(settings.customProfiles || [])];
  });

  ipcMain.handle('paperProfiles:addCustom', (event, profile) => {
    const settings = loadSettings();
    const id = 'custom-' + Date.now();
    const clean = {
      id,
      label: profile.label || `Custom ${profile.widthMm}x${profile.heightMm}mm`,
      widthMm: Number(profile.widthMm),
      heightMm: Number(profile.heightMm),
      dpi: 300,
      borderlessSupported: !!profile.borderlessSupported,
      defaultMarginMm: Number(profile.defaultMarginMm || 3),
      stripLayout: null,
    };
    const customProfiles = [...(settings.customProfiles || []), clean];
    saveSettings({ customProfiles });
    return clean;
  });

  ipcMain.handle('network:info', async () => {
    const settings = loadSettings();
    const primary = getPrimaryLanIp();
    const payload = JSON.stringify({
      app: 'adrstation',
      ip: primary,
      port: settings.port,
      code: settings.pairingCode,
    });
    let qrDataUrl = null;
    try {
      qrDataUrl = primary ? await QRCode.toDataURL(payload, { margin: 1, width: 220 }) : null;
    } catch (err) {
      qrDataUrl = null;
    }
    return {
      addresses: getLanIpAddresses(),
      primary,
      port: settings.port,
      pairingCode: settings.pairingCode,
      qrDataUrl,
      qrPayload: payload,
    };
  });

  ipcMain.handle('jobs:history', () => jobLog);

  ipcMain.handle('pairing:regenerate', () => {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    return saveSettings({ pairingCode: code });
  });

  ipcMain.handle('links:openExternal', (event, url) => shell.openExternal(url));
}

app.whenReady().then(() => {
  ensurePairingCode();
  registerIpcHandlers();
  createWindow();
  createTray();
  startServer();
  cleanupOldJobs();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // Sengaja TIDAK quit di sini (kecuali macOS convention) supaya
  // AdrStation tetap jalan di tray selama laptop menyala/event berjalan.
  if (process.platform !== 'darwin' && app.isQuitting) app.quit();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (httpServer) httpServer.close();
});
