'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kingdee', {
  getSettings: () => ipcRenderer.invoke('kingdee:get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('kingdee:save-settings', settings),
  getStatus: () => ipcRenderer.invoke('kingdee:get-status'),
});
