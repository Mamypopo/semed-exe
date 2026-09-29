'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  validateFiles: (files) => ipcRenderer.invoke('validate-files', files),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, s) => cb(s)),
});
