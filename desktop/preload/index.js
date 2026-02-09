import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tinyCivs', {
  getState: () => ipcRenderer.invoke('sim:get-state'),
  start: () => ipcRenderer.invoke('sim:start'),
  stop: () => ipcRenderer.invoke('sim:stop'),
  reset: () => ipcRenderer.invoke('sim:reset'),
  onTick: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('sim:tick', wrapped);
    return () => {
      ipcRenderer.removeListener('sim:tick', wrapped);
    };
  }
});
