'use strict';
// สร้าง build/icon.png (512x512, พื้นโปร่งใส) จากโลโก้ src/renderer/icon/Logosemed.png
// รัน: npx electron scripts/make-icon.js   (electron-builder แปลง PNG เป็น .ico ให้เองตอน build)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'renderer', 'icon', 'Logosemed.png');
const OUT = path.join(__dirname, '..', 'build', 'icon.png');
const SIZE = 512;
const PAD = 24;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<meta charset=utf-8>');
  const b64 = fs.readFileSync(SRC).toString('base64');
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = ${SIZE};
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      const k = Math.min((${SIZE} - 2 * ${PAD}) / img.width, (${SIZE} - 2 * ${PAD}) / img.height);
      const w = img.width * k, h = img.height * k;
      ctx.drawImage(img, (${SIZE} - w) / 2, (${SIZE} - h) / 2, w, h);
      res(c.toDataURL('image/png'));
    };
    img.onerror = () => rej(new Error('โหลดโลโก้ไม่ได้'));
    img.src = 'data:image/png;base64,${b64}';
  })`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('สร้าง', OUT);
  app.quit();
});
