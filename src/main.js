const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let tray;

app.on('ready', () => {
    tray = new Tray(path.join(__dirname, '../public/overnote_icon.png')); // Add your menu bar icon
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Notes',
            click: () => mainWindow.webContents.send('show-notes'),
        },
        {
            label: 'Toggle Overlay',
            click: () => mainWindow.webContents.send('toggle-overlay'),
        },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' },
    ]);
    tray.setToolTip('Overnote');
    tray.setContextMenu(contextMenu);

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'src/renderer.js'),
            nodeIntegration: true,
        },
    });

    mainWindow.loadURL('http://localhost:3000'); // Adjust for your frontend setup
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});