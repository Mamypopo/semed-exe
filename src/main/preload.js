'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getVersion: () => ipcRenderer.invoke('app-version'),
  validateFiles: (files) => ipcRenderer.invoke('validate-files', files),
  exportResults: (results) => ipcRenderer.invoke('export-results', results),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  listTools: (force) => ipcRenderer.invoke('tools-list', force),
  openWeb: (id) => ipcRenderer.invoke('tool-open-web', id),
  downloadTool: (id) => ipcRenderer.invoke('tool-download', id),
  openDownloaded: (p) => ipcRenderer.invoke('tool-open-file', p),
  onToolProgress: (cb) => ipcRenderer.on('tool-progress', (_e, d) => cb(d)),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s)),
});
