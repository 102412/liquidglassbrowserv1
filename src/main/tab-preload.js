const { contextBridge, ipcRenderer } = require('electron');

// Only ever expose the bridge to our own local pages (currently just
// newtab.html), never to real, remote web content a tab navigates to —
// otherwise any site could reach into browser navigation via window.refract.
if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('refract', {
    nav: {
      go: (input) => ipcRenderer.invoke('nav:go', input),
    },
  });
}
