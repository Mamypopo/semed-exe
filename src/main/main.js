'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { validateFiles } = require('../core/validator');

const MAX_FILES = 20;
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 760,
    minHeight: 560,
    title: 'ตรวจสอบไฟล์ผลตรวจปอด',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // ไม่ให้เปิดหน้าเว็บ/ไฟล์อื่นในหน้าต่างแอป (เช่น ลากไฟล์ผิดที่)
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

ipcMain.handle('app-version', () => app.getVersion());

ipcMain.handle('validate-files', (_e, files) => {
  const inputs = (files || []).slice(0, MAX_FILES).map((f) => ({ name: String(f.name), data: Buffer.from(f.data) }));
  return validateFiles(inputs);
});

// ---------- อัปเดตอัตโนมัติจาก GitHub Releases ----------
function setupUpdater() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  const send = (payload) => win && !win.isDestroyed() && win.webContents.send('update-status', payload);
  autoUpdater.on('update-available', (i) => send({ state: 'available', version: i.version }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', () => {}); // ออฟไลน์ / ยังไม่มี release — เงียบไว้ ไม่รบกวนการใช้งาน
  ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());
  autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(() => {
  createWindow();
  setupUpdater();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => app.quit());
