const { contextBridge, ipcRenderer } = require('electron');
const portArg = process.argv.find(arg => arg.startsWith('--overnote-port='));
const backendPort = portArg ? portArg.split('=')[1] : '8000';

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
      invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
      on: (channel, listener) => ipcRenderer.on(channel, listener),
      send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    },
    backendPort
  });