const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('markdownReader', {
  openMarkdown: () => ipcRenderer.invoke('dialog:openMarkdown'),
  onFileOpen: (callback) => {
    const listener = (_event, file) => callback(file);
    ipcRenderer.on('file:open', listener);
    return () => ipcRenderer.removeListener('file:open', listener);
  },
  onZoomIn: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('view:zoom-in', listener);
    return () => ipcRenderer.removeListener('view:zoom-in', listener);
  },
  onZoomOut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('view:zoom-out', listener);
    return () => ipcRenderer.removeListener('view:zoom-out', listener);
  },
  onZoomReset: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('view:zoom-reset', listener);
    return () => ipcRenderer.removeListener('view:zoom-reset', listener);
  },
  onSearchFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('search:focus', listener);
    return () => ipcRenderer.removeListener('search:focus', listener);
  },
  onNextDocument: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('document:next', listener);
    return () => ipcRenderer.removeListener('document:next', listener);
  },
  onPreviousDocument: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('document:previous', listener);
    return () => ipcRenderer.removeListener('document:previous', listener);
  }
});
