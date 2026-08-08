'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setKeepAwake: (enabled) => ipcRenderer.invoke('set-keep-awake', enabled),
});
