const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const DEFAULT_SETTINGS = require('./defaults');

let mainWindow;

// ---- Config persistence ----
function getConfigPath() {
  return path.join(app.getPath('userData'), 'pomodoro-config.json');
}

const DEFAULT_CONFIG = {
  settings: DEFAULT_SETTINGS,
  tasks: [],
  stats: { totalPomodoros: 0 },
  runtime: null,
};

function loadConfig() {
  try {
    const filePath = getConfigPath();
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        settings: { ...DEFAULT_CONFIG.settings, ...(parsed.settings || {}) },
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        stats: { ...DEFAULT_CONFIG.stats, ...(parsed.stats || {}) },
        runtime: parsed.runtime || null,
      };
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

// Async so a write never blocks the main process's event loop.
async function saveConfig(data) {
  try {
    await fs.promises.writeFile(getConfigPath(), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save config:', err);
    return false;
  }
}

// ---- Window ----
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 700,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '番茄钟',
    backgroundColor: '#f7f7f8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- Lifecycle ----
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC ----
ipcMain.handle('config:load', () => loadConfig());
ipcMain.handle('config:save', (_event, data) => saveConfig(data));

ipcMain.handle('notification:show', (_event, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title: title || '番茄钟', body: body || '', silent: false }).show();
    return true;
  }
  return false;
});
