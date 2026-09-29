'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
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

ipcMain.handle('validate-files', (_e, files) => {
  const inputs = (files || []).slice(0, MAX_FILES).map((f) => ({ name: String(f.name), data: Buffer.from(f.data) }));
  return validateFiles(inputs);
});

ipcMain.handle('export-results', async (_e, results) => {
  const rows = [['ไฟล์', 'ประเภท', 'แถว', 'CN', 'สาเหตุ']];
  for (const r of results) {
    for (const m of r.fileErrors) rows.push([r.fileName, 'ไฟล์', '', '', m]);
    for (const x of r.errors) rows.push([r.fileName, 'ผิดพลาด', x.rowsText, x.cn, x.message]);
    for (const x of r.warnings) rows.push([r.fileName, 'คำเตือน', x.rowsText, x.cn, x.message]);
  }
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'ส่งออกผลการตรวจ',
    defaultPath: 'ผลตรวจสอบไฟล์ผลตรวจปอด.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }, { name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { saved: false };
  try {
    if (/\.csv$/i.test(filePath)) {
      const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const text = rows.map((r) => r.map(esc).join(',')).join('\r\n');
      fs.writeFileSync(filePath, '﻿' + text, 'utf8'); // BOM ให้ Excel อ่านภาษาไทยถูก
    } else {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 60 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ผลตรวจ');
      XLSX.writeFile(wb, filePath);
    }
    return { saved: true, filePath };
  } catch (err) {
    return { saved: false, error: err.message };
  }
});

ipcMain.handle('show-in-folder', (_e, p) => shell.showItemInFolder(p));

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
