const { spawn } = require('child_process')
const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron')
const fs = require('fs')
const { execSync } = require('child_process')
const path = require('path')
const { getActiveAppContext } = require('./active-window')
const { systemPreferences } = require('electron')
const isDev = !app.isPackaged;

let backendProcess = null
let backendPort = 8000; // default fallback

if (!systemPreferences.isTrustedAccessibilityClient(false)) {
  console.log('Requesting Accessibility permissions...')
  systemPreferences.isTrustedAccessibilityClient(true)
}

app.setName('Overnote')

app.on('quit', () => {
  console.log('Application is terminating...')
  stopPolling()
  if (backendProcess) {
    backendProcess.kill();
  }
  app.quit()
})

app.on('before-quit', () => {
  app.isQuitting = true
  stopPolling()
  if (backendProcess) {
    backendProcess.kill();
  }
})

app.dock.setIcon(path.join(__dirname, '../public', 'icon.png'))

let tray = null
let notesWindow = null
let currentContext = ''
let allNotesWindow = null

// Polling Control
let pollingInterval = null
let previousContext = ''

function startPolling() {
  if (pollingInterval) return
  console.log('▶️ Starting context polling...')
  pollingInterval = setInterval(async () => {
    try {
      const context = await getCurrentContext()
      if (notesWindow && notesWindow.isFocused()) return
      if (context !== previousContext) {
        previousContext = context
        console.log('Active app changed to:', context)
        await updateNotesWindowTitle(context)
      }
    } catch (error) {
      console.warn('⚠️ Failed to fetch context during polling:', error.message)
    }
  }, 500)
}

function stopPolling() {
  if (pollingInterval) {
    console.log('⏸️ Pausing context polling...')
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

// IPC Setup
if (!ipcMain.eventNames().includes('get-current-context')) {
  ipcMain.handle('get-current-context', async () => {
    try {
      const context = await getCurrentContext()
      return context
    } catch (error) {
      console.error('Error in handler for get-current-context:', error)
      throw error
    }
  })
}

ipcMain.on('request-toggle-always-on-top', (event) => {
  if (notesWindow) {
    const isAlwaysOnTop = !notesWindow.isAlwaysOnTop();
    notesWindow.setAlwaysOnTop(isAlwaysOnTop);
    console.log(`⬆️ Always on Top set to: ${isAlwaysOnTop}`);
    event.sender.send('update-always-on-top', isAlwaysOnTop);
  }
});

ipcMain.on('toggle-always-on-top', (event, isAlwaysOnTop) => {
  if (notesWindow) {
    notesWindow.setAlwaysOnTop(isAlwaysOnTop)
    console.log(`Always on Top set to: ${isAlwaysOnTop}`)
  }
})

// Get current context
async function getCurrentContext() {
  try {
    const context = await getActiveAppContext()
    if (notesWindow && notesWindow.isFocused()) return currentContext
    return context
  } catch (error) {
    console.error('Error in getCurrentContext:', error)
    return 'Error retrieving context'
  }
}

// Update window title + context
async function updateNotesWindowTitle(context) {
  try {
    if (context === 'Overnote' && currentContext) {
      console.log('Context was Overnote; keeping current context:', currentContext);
      context = currentContext;
    }

    if (context && context !== currentContext) {
      currentContext = context;
      if (notesWindow) {
        notesWindow.setTitle(`${currentContext}`);
        notesWindow.webContents.send('update-context', currentContext);
      }
    } else {
      console.log('No update needed. Current context:', currentContext)
    }
  } catch (error) {
    console.error('Error updating notes window title:', error)
  }
}

// Listen for context changes (Notes Window only)
async function setupContextListeners() {
  notesWindow.on('show', () => {
    startPolling()
  })

  notesWindow.on('hide', () => {
    stopPolling()
  })

  console.log('Context listeners set up.')
}

// Create Notes Window
function createNotesWindow() {
  if (allNotesWindow && !allNotesWindow.isDestroyed()) {
    allNotesWindow.close()
    stopPolling()
  }

  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.hide() // Prevent visual flash of old data

    getCurrentContext()
      .then((context) => {
        console.log(
          'Forcing full refresh of notes window for context:',
          context
        )
        currentContext = ''

        notesWindow.webContents.once('did-finish-load', () => {
          console.log(
            '✅ Notes window finished loading, sending updated context:',
            context
          )
          updateNotesWindowTitle(context)
          notesWindow.show() // Only show after update
        })

        notesWindow.webContents.reloadIgnoringCache()
      })
      .catch((error) => {
        console.error('Error forcing context refresh:', error)
        notesWindow.show() // Ensure it doesn't remain hidden on error
      })

    return
  }

  const iconPath = path.join(__dirname, '../public', 'icon.png')

  notesWindow = new BrowserWindow({
    width: 472,
    height: 400,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--overnote-port=${backendPort}`]
    },
    icon: iconPath
  })

  notesWindow.loadFile(path.join(__dirname, '../public/index.html'))

  notesWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      notesWindow.hide()
    }
  })

  notesWindow.on('focus', () => {
    console.log('Notes window focused, ignoring context update.')
  })

  setupContextListeners()
}

// Toggle Notes Window from Tray
function toggleNotesWindow() {
  if (!tray || !notesWindow) return

  if (allNotesWindow && !allNotesWindow.isDestroyed()) {
    allNotesWindow.close()
    allNotesWindow = null
  }

  startPolling()

  const trayBounds = tray.getBounds()
  const windowBounds = notesWindow.getBounds()

  const x = Math.round(trayBounds.x - windowBounds.width + trayBounds.width)
  const y = Math.round(
    trayBounds.y + trayBounds.height / 2 - windowBounds.height / 2
  )

  notesWindow.setBounds({
    x: x,
    y: y,
    width: windowBounds.width,
    height: windowBounds.height
  })

  if (notesWindow.isVisible()) {
    notesWindow.hide()
  } else {
    getCurrentContext()
      .then((context) => {
        console.log('Fetched context on menu bar click:', context)
        currentContext = '' // Force context to refresh
        notesWindow.webContents.once('did-finish-load', () => {
          console.log(
            '✅ Notes window finished loading (from tray), sending updated context:',
            context
          )
          updateNotesWindowTitle(context)
        })
        notesWindow.webContents.reloadIgnoringCache()
        notesWindow.show()
        setTimeout(() => {
          if (notesWindow && notesWindow.webContents) {
            notesWindow.webContents.send('update-always-on-top', notesWindow.isAlwaysOnTop());
          }
        }, 100);
      })
      .catch((error) => {
        console.error('Error fetching context on menu bar click:', error)
      })
  }
}

// Create All Notes Window
function openAllNotesWindow() {
  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.close()
    stopPolling()
  }

  if (allNotesWindow && !allNotesWindow.isDestroyed()) {
    allNotesWindow.focus()
    return
  }

  allNotesWindow = new BrowserWindow({
    width: 1025,
    height: 600,
    show: true,
    transparent: true,
    frame: false,
    resizable: true,
    movable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--overnote-port=${backendPort}`]
    }
  })

  allNotesWindow.loadFile(path.join(__dirname, '../public/all-notes.html'))

  allNotesWindow.on('closed', () => {
    allNotesWindow = null
  })

  return allNotesWindow
}

// App Ready
app.on('ready', () => {
  // Start the Django backend binary with SQLite DB path passed via env variable
  const userDataPath = app.getPath('userData');
  const sqlitePath = path.join(userDataPath, 'overnote.sqlite3');
  
  const backendBinaryPath = isDev
    ? path.join(__dirname, '../../overnote_back/dist/run_backend')
    : path.join(process.resourcesPath, 'run_backend');
  
    backendProcess = spawn(backendBinaryPath, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, OVERNOTE_DB_PATH: sqlitePath }
    });
    
    backendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);
      const match = output.match(/Starting development server at http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        backendPort = parseInt(match[1], 10);
        console.log(`✅ Captured backend port: ${backendPort}`);
      }
    });
    
    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend stderr: ${data}`);
    });

  const iconPath = path.join(
    __dirname,
    '../public',
    'white_map_scribble_overnote_logo.png'
  )
  tray = new Tray(iconPath)
  tray.setToolTip('Overnote - Click to open notes')

  tray.on('click', () => {
    toggleNotesWindow()
  })

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open All Notes',
        click: () => openAllNotesWindow()
      },
      {
        label: 'Quit',
        click: () => {
          console.log('Quit selected from tray icon')
          app.isQuitting = true
          app.quit()
        }
      }
    ])
    tray.popUpContextMenu(contextMenu)
  })

  createNotesWindow()
})
