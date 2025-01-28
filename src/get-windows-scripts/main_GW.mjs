import { app, BrowserWindow, Tray, Menu, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { getActiveAppContext } from './active-window_GW.mjs';

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.setName('Overnote');

let tray = null;
let notesWindow = null;
let allNotesWindow = null;
let currentContext = '';
let previousContext = '';

// Function to update the Notes Window title and content
async function updateNotesWindowTitle(context) {
    try {
        if (context && context !== currentContext) {
            console.log('Updating Notes Window Title to:', context);
            currentContext = context;

            if (notesWindow) {
                notesWindow.setTitle(currentContext);
                notesWindow.webContents.send('update-context', currentContext);
            }
        }
    } catch (error) {
        console.error('Error updating notes window title:', error);
    }
}

// Function to handle active window updates only when Notes Window is open
async function handleActiveWindowChange() {
    if (!notesWindow || !notesWindow.isVisible()) {
        console.log('Notes Window is not visible. Skipping context update.');
        return;
    }

    const context = await getActiveAppContext();

    if (context !== currentContext) {
        previousContext = currentContext; // Keep track of the previous context
        await updateNotesWindowTitle(context);
    }
}

// Function to create the Notes Window
function createNotesWindow() {
    notesWindow = new BrowserWindow({
        width: 400,
        height: 400,
        show: false,
        alwaysOnTop: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    notesWindow.loadFile(path.join(__dirname, '../../public/index.html'));

    notesWindow.on('close', (e) => {
        e.preventDefault();
        notesWindow.hide();
    });

    notesWindow.on('focus', () => {
        console.log('Notes Window focused. Ignoring context update.');
    });

    notesWindow.on('show', async () => {
        console.log('Notes Window shown. Updating context...');
        await handleActiveWindowChange();
    });

    notesWindow.on('blur', () => {
        console.log('Notes Window lost focus.');
    });
}

// Function to create the tray icon and menu
function createTray() {
    const trayIconPath = `${__dirname}/public/your-tray-icon.png`; // Ensure this path points to your icon
    console.log('Resolved tray icon path:', iconPath);
    const tray = new Tray(trayIconPath);

    tray.setToolTip('Overnote - Click to open notes');

    tray.on('click', () => {
        toggleNotesWindow();
    });

    tray.on('right-click', () => {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Open All Notes',
                click: () => openAllNotesWindow(),
            },
            {
                label: 'Quit',
                click: () => app.quit(),
            },
        ]);
        tray.popUpContextMenu(contextMenu);
    });
}

// Function to toggle the visibility of the Notes Window
function toggleNotesWindow() {
    if (!tray || !notesWindow) return;

    const trayBounds = tray.getBounds();
    const windowBounds = notesWindow.getBounds();

    const x = Math.round(trayBounds.x - windowBounds.width + trayBounds.width);
    const y = Math.round(trayBounds.y + trayBounds.height / 2 - windowBounds.height / 2);

    notesWindow.setBounds({
        x,
        y,
        width: windowBounds.width,
        height: windowBounds.height,
    });

    if (notesWindow.isVisible()) {
        notesWindow.hide();
    } else {
        notesWindow.show();
    }
}

// Function to open the All Notes Window
function openAllNotesWindow() {
    if (allNotesWindow) {
        allNotesWindow.focus();
        return;
    }

    allNotesWindow = new BrowserWindow({
        width: 1025,
        height: 600,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    allNotesWindow.loadFile(path.join(__dirname, '../../public/all-notes.html'));

    allNotesWindow.on('closed', () => {
        allNotesWindow = null;
    });
}

// Set up event listeners
app.on('ready', () => {
    createTray();
    createNotesWindow();

    // Listen for window focus and blur events
    app.on('browser-window-focus', () => {
        handleActiveWindowChange();
    });

    app.on('browser-window-blur', () => {
        handleActiveWindowChange();
    });
});