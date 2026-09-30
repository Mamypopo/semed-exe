'use strict';
const { app, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const { TOOLS, pickInstaller, isAllowedDownload, parseDigest, findInstalled, installState } = require('./tools-core');

const CACHE_MS = 10 * 60 * 1000; // ลดการเรียก GitHub (ไม่ล็อกอินได้ 60 ครั้ง/ชม.)
const HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'semed-exe' };
let cache = { at: 0, items: null };
const downloaded = new Set(); // ไฟล์ที่แอปโหลดเอง — อนุญาตให้สั่งเปิดได้เฉพาะพวกนี้

async function fetchRelease(tool) {
  const res = await fetch(`https://api.github.com/repos/${tool.repo}/releases/latest`, { headers: HEADERS });
  if (res.status === 404) return { available: false, reason: 'ยังไม่มี Release' };
  if (!res.ok) throw new Error(`GitHub ตอบ ${res.status}`);
  const rel = await res.json();
  const a = pickInstaller(rel.assets);
  if (!a) return { available: false, reason: 'Release นี้ไม่มีตัวติดตั้ง .exe', version: rel.tag_name };
  return {
    available: true,
    version: rel.tag_name,
    file: { name: a.name, size: a.size, url: a.browser_download_url, sha256: parseDigest(a.digest) },
  };
}

// อ่านรายการโปรแกรมที่ติดตั้งจาก Registry (เฉพาะ Windows) — พลาดก็ถือว่าไม่ทราบ ไม่กระทบการใช้งาน
function readInstalledApps() {
  if (process.platform !== 'win32') return Promise.resolve([]);
  const script = String.raw`
    [Console]::OutputEncoding = [Text.Encoding]::UTF8
    $p = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
         'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
         'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    $r = @(Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | Select-Object DisplayName, DisplayVersion)
    ConvertTo-Json -InputObject $r -Compress`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (err, out) => {
      if (err) return resolve([]);
      try { const j = JSON.parse(out); resolve(Array.isArray(j) ? j : [j]); } catch { resolve([]); }
    });
  });
}

async function loadTools(force) {
  if (!force && cache.items && Date.now() - cache.at < CACHE_MS) return cache.items;
  const apps = TOOLS.some((t) => t.installName) ? await readInstalledApps() : [];
  const items = await Promise.all(TOOLS.map(async (t) => {
    const base = { id: t.id, type: t.type, name: t.name, desc: t.desc };
    if (t.type === 'web') return { ...base, available: true };
    try {
      const rel = await fetchRelease(t);
      const installed = findInstalled(apps, t.installName);
      return { ...base, ...rel, installed, state: rel.available ? installState(installed, rel.version) : (installed ? 'current' : 'none') };
    } catch (e) {
      return { ...base, available: false, reason: 'เชื่อมต่อ GitHub ไม่ได้', error: true };
    }
  }));
  // ไม่จำผลที่พลาดเพราะเน็ต เพื่อให้กดลองใหม่ได้ทันที
  if (!items.some((i) => i.error)) cache = { at: Date.now(), items };
  return items;
}

function register(getWin) {
  const send = (payload) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('tool-progress', payload); };

  ipcMain.handle('tools-list', (_e, force) => loadTools(Boolean(force)).then((items) => items.map(({ file, ...pub }) => ({ ...pub, size: file && file.size, fileName: file && file.name, verified: Boolean(file && file.sha256) }))));

  ipcMain.handle('tool-open-web', (_e, id) => {
    const t = TOOLS.find((x) => x.id === id && x.type === 'web');
    if (t) shell.openExternal(t.url);
  });

  ipcMain.handle('tool-download', async (_e, id) => {
    const tool = TOOLS.find((x) => x.id === id && x.type === 'github');
    const item = tool && (await loadTools(false)).find((x) => x.id === id);
    if (!item || !item.available) return { error: 'ไม่พบตัวติดตั้ง' };
    const { file } = item;
    if (!isAllowedDownload(file.url, tool.repo)) return { error: 'ที่อยู่ไฟล์ไม่ได้รับอนุญาต' };

    const dest = path.join(app.getPath('downloads'), path.basename(file.name));
    const part = `${dest}.part`;
    try {
      const res = await fetch(file.url, { headers: { 'User-Agent': 'semed-exe' }, redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`ดาวน์โหลดไม่ได้ (${res.status})`);
      const total = Number(res.headers.get('content-length')) || file.size || 0;
      const hash = crypto.createHash('sha256');
      let got = 0;
      let lastPct = -1;
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          got += chunk.length;
          const pct = total ? Math.floor((got / total) * 100) : 0;
          if (pct !== lastPct) { lastPct = pct; send({ id, percent: pct }); }
          cb(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(part));
      if (file.sha256 && hash.digest('hex') !== file.sha256) {
        fs.rmSync(part, { force: true });
        return { error: 'ไฟล์ที่โหลดไม่ตรงกับที่ GitHub รับรอง (SHA-256) จึงลบทิ้งแล้ว' };
      }
      fs.renameSync(part, dest);
      downloaded.add(dest);
      return { ok: true, filePath: dest, verified: Boolean(file.sha256) };
    } catch (e) {
      fs.rmSync(part, { force: true });
      return { error: e.message };
    }
  });

  ipcMain.handle('tool-open-file', async (_e, p) => {
    if (!downloaded.has(p)) return { error: 'ไม่ใช่ไฟล์ที่แอปดาวน์โหลด' };
    const err = await shell.openPath(p); // เปิดตัวติดตั้ง (Windows อาจถามสิทธิ์ผู้ดูแล)
    return err ? { error: err } : { ok: true };
  });
}

module.exports = { register };
