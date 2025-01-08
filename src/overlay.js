const { BrowserWindow, ipcMain } = require('electron');

let overlayWindow;

ipcMain.on('toggle-overlay', () => {
    if (!overlayWindow) {
        overlayWindow = new BrowserWindow({
            width: 800,
            height: 600,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            webPreferences: {
                nodeIntegration: true,
            },
        });
        overlayWindow.loadURL('http://localhost:3000/overlay'); // Adjust URL
        overlayWindow.on('closed', () => {
            overlayWindow = null;
        });
    } else {
        overlayWindow.close();
        overlayWindow = null;
    }
});