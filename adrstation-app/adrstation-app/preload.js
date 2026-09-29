/**
 * preload.js — jembatan aman antara renderer (UI, tanpa akses Node) dan
 * proses main (akses filesystem/printer/dll). contextIsolation aktif,
 * jadi renderer HANYA bisa memanggil fungsi yang diekspos di sini.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adrstation', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partial) => ipcRenderer.invoke('settings:save', partial),

  listSystemPrinters: () => ipcRenderer.invoke('printers:list'),

  listPaperProfiles: () => ipcRenderer.invoke('paperProfiles:list'),
  addCustomPaperProfile: (profile) => ipcRenderer.invoke('paperProfiles:addCustom', profile),

  getNetworkInfo: () => ipcRenderer.invoke('network:info'),
  regeneratePairingCode: () => ipcRenderer.invoke('pairing:regenerate'),

  getJobHistory: () => ipcRenderer.invoke('jobs:history'),
  onJobUpdate: (callback) => {
    const listener = (event, job) => callback(job);
    ipcRenderer.on('job:update', listener);
    return () => ipcRenderer.removeListener('job:update', listener);
  },
  onServerError: (callback) => {
    const listener = (event, message) => callback(message);
    ipcRenderer.on('server:error', listener);
    return () => ipcRenderer.removeListener('server:error', listener);
  },

  openExternal: (url) => ipcRenderer.invoke('links:openExternal', url),
});
