const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('refract', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  tabs: {
    create: (url) => ipcRenderer.invoke('tabs:create', url),
    close: (id) => ipcRenderer.invoke('tabs:close', id),
    activate: (id) => ipcRenderer.invoke('tabs:activate', id),
    get: () => ipcRenderer.invoke('tabs:get'),
    onState: (callback) => {
      const listener = (_e, state) => callback(state);
      ipcRenderer.on('tabs:state', listener);
      return () => ipcRenderer.removeListener('tabs:state', listener);
    },
  },
  nav: {
    go: (input) => ipcRenderer.invoke('nav:go', input),
    back: () => ipcRenderer.invoke('nav:back'),
    forward: () => ipcRenderer.invoke('nav:forward'),
    reload: () => ipcRenderer.invoke('nav:reload'),
  },
  glass: {
    onFrame: (callback) => {
      const listener = (_e, frame) => callback(frame);
      ipcRenderer.on('glass:frame', listener);
      return () => ipcRenderer.removeListener('glass:frame', listener);
    },
  },
});
