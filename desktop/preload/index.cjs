const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tinyCivs', {
  getState: () => ipcRenderer.invoke('sim:get-state'),
  setCivlingCount: (count) => ipcRenderer.invoke('sim:set-civling-count', count),
  start: () => ipcRenderer.invoke('sim:start'),
  resume: () => ipcRenderer.invoke('sim:resume'),
  pause: () => ipcRenderer.invoke('sim:pause'),
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
