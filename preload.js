const { contextBridge, ipcRenderer } = require('electron');
const DEFAULT_SETTINGS = require('./defaults');

// Minimal, whitelisted bridge — no Node surface exposed to the renderer.
contextBridge.exposeInMainWorld('api', {
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (data) => ipcRenderer.invoke('config:save', data),
  showNotification: (title, body) =>
    ipcRenderer.invoke('notification:show', title, body),
});

// Static defaults shared from defaults.js — available to the renderer with no
// IPC round-trip, so the main process remains the single source of truth.
contextBridge.exposeInMainWorld('DEFAULTS', DEFAULT_SETTINGS);
