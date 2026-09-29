'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  validateFiles: (files) => ipcRenderer.invoke('validate-files', files),
  exportResults: (results) => ipcRenderer.invoke('export-results', results),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s)),
});
