'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  rememberPassword: (pw) => ipcRenderer.invoke('remember', pw),
  forgetPassword: () => ipcRenderer.invoke('forget'),
});
