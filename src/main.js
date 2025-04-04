// ========================================
// Imports and Initial Setup
// ========================================
import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  systemPreferences
} from 'electron'
import path from 'path'
// Now uses get-windows instead of active-win for active window detection
import { getActiveAppContext } from './active-window.js' // Active app/window context helper

import { fileURLToPath } from 'url'
import { dirname } from 'path'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ========================================
// Accessibility Permission (macOS)
// ========================================
if (!systemPreferences.isTrustedAccessibilityClient(false)) {
  console.log('Requesting Accessibility permissions...')
  systemPreferences.isTrustedAccessibilityClient(true)
}

// ========================================
// App Identity
// ========================================
app.setName('Overnote') // Set app name
app.dock.setIcon(path.join(__dirname, '../public', 'icon.png')) // Set dock icon

// ========================================
// Global Variables
// ========================================
let tray = null
let notesWindow = null
let allNotesWindow = null
let currentContext = ''

// ========================================
// IPC Handlers
// ========================================

// Prevent duplicate handler registration
if (!ipcMain.eventNames().includes('get-current-context')) {
  ipcMain.handle('get-current-context', async () => {
    try {
      return await getCurrentContext()
    } catch (error) {
      console.error('Error in get-current-context handler:', error)
      throw error
    }
  })
}

// Handle always-on-top toggle from renderer
ipcMain.on('toggle-always-on-top', (event, isAlwaysOnTop) => {
  if (notesWindow) {
    notesWindow.setAlwaysOnTop(isAlwaysOnTop)
    console.log(`Always on Top set to: ${isAlwaysOnTop}`)
  }
})

// ========================================
// Context Fetching
// ========================================
async function getCurrentContext() {
  try {
    const context = await getActiveAppContext()
    if (notesWindow?.isFocused()) return currentContext
    return context
  } catch (error) {
    console.error('Error retrieving context:', error)
    return 'Error retrieving context'
  }
}

// Update Notes Window Title and Renderer Context
async function updateNotesWindowTitle(context) {
  if (context && context !== currentContext) {
    currentContext = context
    // console.log('Updating Notes Window Title to:', context);
    if (notesWindow) {
      notesWindow.setTitle(currentContext)
      notesWindow.webContents.send('update-context', currentContext)
    }
  }
}

// ========================================
// Single Note - Window Management
// ========================================
function createNotesWindow() {
  if (allNotesWindow && !allNotesWindow.isDestroyed()) allNotesWindow.close()

  if (notesWindow && !notesWindow.isDestroyed()) {
    notesWindow.focus()
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
      nodeIntegration: false
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

  app.on('before-quit', () => {
    app.isQuitting = true
  })
}

function toggleNotesWindow() {
  if (!tray || !notesWindow) return

  if (allNotesWindow && !allNotesWindow.isDestroyed()) {
    allNotesWindow.close()
    allNotesWindow = null
  }

  const trayBounds = tray.getBounds()
  const windowBounds = notesWindow.getBounds()
  const x = Math.round(trayBounds.x - windowBounds.width + trayBounds.width)
  const y = Math.round(
    trayBounds.y + trayBounds.height / 2 - windowBounds.height / 2
  )

  notesWindow.setBounds({
    x,
    y,
    width: windowBounds.width,
    height: windowBounds.height
  })

  if (notesWindow.isVisible()) {
    notesWindow.hide()
  } else {
    getCurrentContext()
      .then((context) => {
        console.log('Fetched context on tray click:', context)
        updateNotesWindowTitle(context)
        notesWindow.show()
      })
      .catch((err) =>
        console.error('Error fetching context on tray click:', err)
      )
  }
}

// ========================================
// All Notes Hub - Window Management
// ========================================
function openAllNotesWindow() {
  if (notesWindow && !notesWindow.isDestroyed()) notesWindow.close()

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
      nodeIntegration: false
    }
  })

  allNotesWindow.loadFile(path.join(__dirname, '../public/all-notes.html'))

  allNotesWindow.on('closed', () => {
    allNotesWindow = null
  })
}

// ========================================
// Context Polling Logic
// ========================================
async function setupContextListeners() {
  let previousWindowId = null
  let previousTitle = null
  let pollingInterval = null
  let wasVisible = true;

  const checkActiveWindow = async () => {
    if (!notesWindow.isVisible()) {
      if (wasVisible) {
        console.log('⏸️ Notes window is hidden. Polling paused.');
        wasVisible = false;
      }
      return;
    }

    if (!wasVisible) {
      console.log('▶️ Notes window reopened. Polling resumed.');
      wasVisible = true;
    }

    try {
      const { activeWindow } = await import('get-windows')
      const win = await activeWindow()
      if (!win || (win.id === previousWindowId && win.title === previousTitle))
        return

      previousWindowId = win.id
      previousTitle = win.title
      const context = await getCurrentContext()
      if (notesWindow?.isFocused()) return

      console.log('🔍 Active window change. New context is:', context)
      await updateNotesWindowTitle(context)
    } catch (error) {
      console.warn('Error detecting active window:', error)
    }
  }

  // Polling every 1000ms but skipping if window ID is unchanged
  pollingInterval = setInterval(checkActiveWindow, 1000)

  app.on('quit', () => clearInterval(pollingInterval))
}

// ========================================
// App Ready Event
// ========================================
app.on('ready', () => {
  const iconPath = path.join(
    __dirname,
    '../public',
    'white_map_scribble_overnote_logo.png'
  )
  tray = new Tray(iconPath)

  tray.setToolTip('Overnote - Click to open notes')
  tray.on('click', toggleNotesWindow)
  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open All Notes', click: openAllNotesWindow },
      {
        label: 'Quit',
        click: () => {
          console.log('Quit selected from tray')
          app.isQuitting = true
          app.quit()
        }
      }
    ])
    tray.popUpContextMenu(contextMenu)
  })

  createNotesWindow() // Launch invisible notes window
  setupContextListeners() // Begin context tracking
})
