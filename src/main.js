const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron')
const path = require('path')
const { getActiveAppContext } = require('./active-window') // Import context-fetching function

let tray = null
let notesWindow = null
let currentContext = ''
let allNotesWindow = null

// Prevent multiple registrations of the same IPC handler
if (!ipcMain.eventNames().includes('get-current-context')) {
  ipcMain.handle('get-current-context', async () => {
    try {
      const context = await getCurrentContext()
      return context // Send context back to the renderer process
    } catch (error) {
      console.error('Error in handler for get-current-context:', error)
      throw error // Propagate the error to the renderer process
    }
  })
}
ipcMain.on('toggle-always-on-top', (event, isAlwaysOnTop) => {
    if (notesWindow) {
        notesWindow.setAlwaysOnTop(isAlwaysOnTop);
        console.log(`Always on Top set to: ${isAlwaysOnTop}`);
    }
});

// Function to get the current active window's context
async function getCurrentContext() {
  try {
    const context = await getActiveAppContext() // This function should provide the active app or URL

    // If the notes window is focused, return the last known context
    if (notesWindow && notesWindow.isFocused()) {
      console.log(
        'Notes window is focused. Returning previous context:',
        currentContext
      )
      return currentContext
    }

    console.log('Fetched Context:', context)
    return context
  } catch (error) {
    console.error('Error in getCurrentContext:', error)
    return 'Error retrieving context'
  }
}

// Function to update the notes window title dynamically
async function updateNotesWindowTitle(context) {
  try {
    if (context && context !== currentContext) {
      console.log('Updating Notes Window Title to:', context)
      currentContext = context // Cache the new context

      if (notesWindow) {
        notesWindow.setTitle(`${currentContext}`)

        // Send the updated context to the renderer process
        notesWindow.webContents.send('update-context', currentContext)
      }
    } else {
      console.log('No update needed. Current context:', currentContext)
    }
  } catch (error) {
    console.error('Error updating notes window title:', error)
  }
}

// Function to set up listeners for focus changes
async function setupContextListeners() {
  let previousContext = ''

  // Poll for active app changes
  const checkActiveApp = async () => {
    const context = await getCurrentContext()

    // Ignore the notes window when focused
    if (context === 'Notes Window') {
      console.log(
        'Notes window is focused; keeping previous context:',
        previousContext
      )
      return
    }

    if (context !== previousContext) {
      previousContext = context
      console.log('Active app changed to:', context)
      await updateNotesWindowTitle(context)
    }
  }

  let pollingInterval

  app.on('browser-window-focus', () => {
    console.log('Browser window focus detected.')
    clearInterval(pollingInterval) // Stop polling when a window gains focus
    pollingInterval = setInterval(checkActiveApp, 500) // Poll for changes
  })

  app.on('browser-window-blur', () => {
    console.log('Browser window lost focus.')
    clearInterval(pollingInterval)
    pollingInterval = setInterval(checkActiveApp, 500) // Start polling again
  })

  app.on('quit', () => {
    clearInterval(pollingInterval) // Clean up on app quit
  })

  console.log('Context listeners set up.')
}

// Function to create the notes window
function createNotesWindow() {
  notesWindow = new BrowserWindow({
    width: 400,
    height: 400,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Path to preload script
      contextIsolation: true, // Ensure secure context isolation
      nodeIntegration: false // Prevent direct Node.js access for security
    }
  })

  console.log('Preload Path:', path.join(__dirname, 'preload.js')) // Debugging log

  notesWindow.loadFile(path.join(__dirname, '../public/index.html'))

  notesWindow.on('close', (e) => {
    e.preventDefault()
    notesWindow.hide() // Prevent closing the window; just hide it
  })

  // Ignore context updates when the notes window is focused
  notesWindow.on('focus', () => {
    console.log('Notes window focused, ignoring context update.')
  })
}

// Function to toggle the visibility of the notes window
function toggleNotesWindow() {
    if (!tray || !notesWindow) return;

    const trayBounds = tray.getBounds(); // Get the tray icon's bounds
    console.log(trayBounds)
    const windowBounds = notesWindow.getBounds(); // Get the current notes window size

    // Calculate the position for the notes window
    const x = Math.round((trayBounds.x - windowBounds.width) + trayBounds.width); // Position to the left of the tray icon
    const y = Math.round(trayBounds.y + trayBounds.height / 2 - windowBounds.height / 2); // Center vertically with the tray icon

    // Set the notes window position
    notesWindow.setBounds({
        x: x,
        y: y,
        width: windowBounds.width,
        height: windowBounds.height,
    });

    if (notesWindow.isVisible()) {
        notesWindow.hide();
    } else {
        notesWindow.show();
        getCurrentContext().then((context) => updateNotesWindowTitle(context)); // Update the title with the current context
    }
}

function openAllNotesWindow() {
    if (allNotesWindow) {
        allNotesWindow.focus()
        return
    }

    allNotesWindow = new BrowserWindow({
        width: 1025,
        height: 600,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    allNotesWindow.loadFile(path.join(__dirname, '../public/all-notes.html'))
    
    allNotesWindow.on('closed', () => {
        allNotesWindow = null
    })
}

// App ready event
app.on('ready', () => {
  const iconPath = path.join(__dirname, '../public', 'overnote_icon.png')
  tray = new Tray(iconPath)

  // Set the tray's tooltip
  tray.setToolTip('Overnote - Click to open notes')

  // Listen for click on tray icon
  tray.on('click', () => {
    toggleNotesWindow()
  })

  // Create a context menu for additional options
  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open All Notes',
        click: () => openAllNotesWindow()
      },
      { 
        label: 'Quit',
        click: () => app.quit()
       }
    ])
    tray.popUpContextMenu(contextMenu)
  })
  // Preload notes window
  createNotesWindow()

  // Set up context listeners
  console.log('Setting up context listeners...')
  setupContextListeners()
})
