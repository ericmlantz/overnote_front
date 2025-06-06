// main.js
// This is the main entry point for the Overnote Electron app, which manages windows, tray, polling, and backend process.

const { spawn } = require('child_process') // Import child_process module to spawn backend process
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  shell,
  systemPreferences
} = require('electron') // Import Electron modules for app functionality
const fs = require('fs') // Import file system module
const { execSync } = require('child_process') // Import execSync for synchronous command execution
const path = require('path') // Import path module for handling file paths
const { getActiveAppContext, normalizeContext } = require('./active-window');const isDev = !app.isPackaged // Check if the app is in development mode
let backendProcess = null // Variable to hold the backend process
let backendPort = 8000 // Default backend port

app.setName('Overnote') // Set the application name

/////////////////////////
// App lifecycle handling
/////////////////////////
app.on('quit', () => {
  // Handle app quitting
  console.log('Application is terminating...') // Log termination message
  stopPolling() // Stop polling for context updates
  if (backendProcess) {
    // If backend process exists
    backendProcess.kill() // Kill the backend process
  }
  app.quit() // Quit the app
})

app.on('before-quit', () => {
  // Handle app before quitting
  app.isQuitting = true // Set quitting flag
  stopPolling() // Stop polling for context updates
  if (backendProcess) {
    // If backend process exists
    backendProcess.kill() // Kill the backend process
  }
})

app.dock.setIcon(path.join(__dirname, '../public', 'icon.png')) // Set the dock icon for the app
let tray = null // Variable to hold the tray icon
let notesWindow = null // Variable to hold the notes window
let currentContext = '' // Variable to hold the current active application context
let allNotesWindow = null // Variable to hold the All Notes window

// Cache for tray icon state, so we don't set the same icon repeatedly
let lastTrayIconState = null;

// Polling Control
let pollingInterval = null // Variable to hold polling interval
let previousContext = '' // Variable to hold the previous context

///////////////////////////////////////////////////
// Function to start polling for active app context
///////////////////////////////////////////////////
function startPolling() {
  if (pollingInterval) return // If polling is already active, exit
  console.log('▶️ Starting context polling...') // Log polling start
  pollingInterval = setInterval(async () => {
    // Set an interval to poll every 500ms
    try {
      const context = await getCurrentContext() // Get the current context
      // const skipContextUpdate = notesWindow && notesWindow.isFocused();
      const contextChanged = context !== previousContext || context.includes('Silhouette Studio');
      if (contextChanged) {
        previousContext = context;
        console.log('Active app changed to:', context);
        await updateNotesWindowTitle(context);
      }

      // Always check if the current context has notes and update tray icon, with caching
      fetch(`http://127.0.0.1:${backendPort}/api/notes?context=${encodeURIComponent(context)}`)
        .then(res => res.json())
        .then(notes => {
          const hasNotes = Array.isArray(notes) && notes.length > 0;
          const nextIconState = hasNotes ? 'red' : 'white';

          if (nextIconState !== lastTrayIconState) {
            const iconFile = hasNotes
              ? 'red_scribble_overnote_logo.png'
              : 'white_map_scribble_overnote_logo.png';
            const iconPath = path.join(__dirname, '../public', iconFile);
            tray.setImage(iconPath);
            lastTrayIconState = nextIconState;
          }
        })
        .catch(err => {
          console.error('❌ Error checking notes for context:', err.message);
        });
    } catch (error) {
      console.warn('⚠️ Failed to fetch context during polling:', error.message) // Log polling error
    }
  }, 500) // Poll every 500ms
}

///////////////////////////
// Function to stop polling
///////////////////////////
function stopPolling() {
  if (pollingInterval) {
    // If polling is active
    console.log('⏸️ Pausing context polling...') // Log polling pause
    clearInterval(pollingInterval) // Clear the polling interval
    pollingInterval = null // Reset polling interval variable
  }
}

////////////
// IPC Setup
////////////
if (!ipcMain.eventNames().includes('get-current-context')) {
  // Check if 'get-current-context' event is already set
  ipcMain.handle('get-current-context', async () => {
    // Handle 'get-current-context' event
    try {
      const context = await getCurrentContext() // Get the current context
      return context // Return the context
    } catch (error) {
      console.error('Error in handler for get-current-context:', error) // Log error
      throw error // Throw error for handling
    }
  })
}

/////////////////////////////////////////
// Handle request to toggle always on top
/////////////////////////////////////////
ipcMain.on('request-toggle-always-on-top', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) // Get the window from the event sender
  if (win) {
    // If the window exists
    const newState = !win.isAlwaysOnTop() // Toggle the always on top state
    win.setAlwaysOnTop(newState) // Set the new state
    console.log(`⬆️ Always on Top toggled: ${newState}`) // Log the new state
    event.sender.send('update-always-on-top', newState) // Send updated state back to renderer
  }
})

////////////////////////////////////
// Handle toggle always on top event
////////////////////////////////////
ipcMain.on('toggle-always-on-top', (event, isAlwaysOnTop) => {
  if (notesWindow) {
    // If notes window exists
    notesWindow.setAlwaysOnTop(isAlwaysOnTop) // Set always on top state
    console.log(`Always on Top set to: ${isAlwaysOnTop}`) // Log the state
  }
})

//////////////////////
// Get current context
//////////////////////
async function getCurrentContext() {
  try {
    const context = await getActiveAppContext();
    const normalizedContext = normalizeContext(context);

    if (notesWindow && notesWindow.isFocused() && currentContext) {
      return currentContext;
    }

    return normalizedContext;
  } catch (error) {
    console.error('Error in getCurrentContext:', error);
    return 'Error retrieving context';
  }
}

////////////////////////////////
// Update window title + context
////////////////////////////////
async function updateNotesWindowTitle(context) {
  // Function to update the notes window title and context
  try {
    if (context === 'Overnote' && currentContext) {
      // If context is Overnote
      console.log(
        'Context was Overnote; keeping current context:',
        currentContext
      ) // Log current context
      context = currentContext // Keep current context
    }

    // Load user-defined alias map if available
    const aliasPath = path.join(app.getPath('userData'), 'context_aliases.json');
    let aliasMap = {};
    try {
      if (fs.existsSync(aliasPath)) {
        aliasMap = JSON.parse(fs.readFileSync(aliasPath, 'utf-8'));
      }
    } catch (err) {
      console.warn('Could not load context alias map:', err.message);
    }

    let displayContext = aliasMap[context] || context;

    if (context && context !== currentContext) {
      // If context is valid and different from current context
      currentContext = context // Update current context
      if (notesWindow) {
        // If notes window exists
        notesWindow.setTitle(`${displayContext}`) // Set the window title using displayContext
        notesWindow.webContents.send('update-context', displayContext) // Send updated context to renderer
      }
    } else {
      console.log('No update needed. Current context:', currentContext) // Log that no update is needed
    }
  } catch (error) {
    console.error('Error updating notes window title:', error) // Log error
  }
}

/////////////////////////////////////////////////
// Listen for context changes (Notes Window only)
/////////////////////////////////////////////////
async function setupContextListeners() {
  // Function to set up context listeners for notes window
  notesWindow.on('show', () => {
    // When notes window is shown
    startPolling() // Start polling for context updates
  })
  // notesWindow.on('hide', () => {
  //   // When notes window is hidden
  //   stopPolling() // Stop polling for context updates
  // })

  console.log('Context listeners set up.') // Log that context listeners are set up
}

//////////////////////
// Create Notes Window
//////////////////////
function createNotesWindow() {
  // Function to create the notes window
  if (allNotesWindow && !allNotesWindow.isDestroyed()) {
    // If all notes window exists and is not destroyed
    allNotesWindow.close() // Close all notes window
    stopPolling() // Stop polling for context updates
  }

  if (notesWindow && !notesWindow.isDestroyed()) {
    // If notes window exists and is not destroyed
    notesWindow.hide() // Prevent visual flash of old data

    getCurrentContext() // Get current context
      .then((context) => {
        // On success
        console.log(
          // Log context refresh
          'Forcing full refresh of notes window for context:',
          context
        )
        currentContext = '' // Reset current context

        notesWindow.webContents.once('did-finish-load', () => {
          // When notes window finishes loading
          console.log(
            // Log updated context
            '✅ Notes window finished loading, sending updated context:',
            context
          )
          updateNotesWindowTitle(context) // Update notes window title
          notesWindow.show() // Only show after update
        })

        notesWindow.webContents.reloadIgnoringCache() // Reload notes window ignoring cache
      })
      .catch((error) => {
        // On error
        console.error('Error forcing context refresh:', error) // Log error
        notesWindow.show() // Ensure it doesn't remain hidden on error
      })

    return // Exit function
  }

  const iconPath = path.join(__dirname, '../public', 'icon.png') // Path to notes window icon

  notesWindow = new BrowserWindow({
    // Create notes window
    width: 472, // Set width
    height: 400, // Set height
    show: false, // Initially hidden
    alwaysOnTop: true, // Always on top
    webPreferences: {
      // Web preferences for the window
      preload: path.join(__dirname, 'preload.js'), // Preload script
      contextIsolation: true, // Enable context isolation
      nodeIntegration: false, // Disable node integration
      additionalArguments: [`--overnote-port=${backendPort}`] // Pass backend port as an argument
    },
    icon: iconPath // Set window icon
  })

  notesWindow.loadFile(path.join(__dirname, '../public/index.html')) // Load notes window HTML file

  notesWindow.on('close', (e) => {
    // Handle notes window close event
    if (!app.isQuitting) {
      // If not quitting the app
      e.preventDefault() // Prevent default close behavior
      notesWindow.hide() // Hide the window instead
    }
  })

  notesWindow.on('focus', () => {
    // Handle notes window focus event
    console.log('Notes window focused, ignoring context update.') // Log focus event
  })

  setupContextListeners() // Set up context listeners for notes window
}

////////////////////////////////
// Toggle Notes Window from Tray
////////////////////////////////
function toggleNotesWindow() {
  // Function to toggle notes window visibility
  if (!tray || !notesWindow) return // If tray or notes window does not exist, exit

  if (allNotesWindow && !allNotesWindow.isDestroyed()) {
    // If all notes window exists and is not destroyed
    allNotesWindow.close() // Close all notes window
    allNotesWindow = null // Reset all notes window variable
  }

  startPolling() // Start polling for context updates

  const trayBounds = tray.getBounds() // Get tray bounds
  const windowBounds = notesWindow.getBounds() // Get notes window bounds

  const x = Math.round(trayBounds.x - windowBounds.width + trayBounds.width) // Calculate x position
  const y = Math.round(
    // Calculate y position
    trayBounds.y + trayBounds.height / 2 - windowBounds.height / 2
  )

  notesWindow.setBounds({
    // Set notes window bounds
    x: x,
    y: y,
    width: windowBounds.width,
    height: windowBounds.height
  })

  if (notesWindow.isVisible()) {
    // If notes window is visible
    notesWindow.hide() // Hide the window
  } else {
    // If notes window is hidden
    getCurrentContext() // Get current context
      .then((context) => {
        // On success
        console.log('Fetched context on menu bar click:', context) // Log fetched context
        currentContext = '' // Force context to refresh
        notesWindow.webContents.once('did-finish-load', () => {
          // When notes window finishes loading
          console.log(
            // Log updated context
            '✅ Notes window finished loading (from tray), sending updated context:',
            context
          )
          updateNotesWindowTitle(context) // Update notes window title
        })
        notesWindow.webContents.reloadIgnoringCache() // Reload notes wiSndow ignoring cache
        notesWindow.show() // Show the notes window
        setTimeout(() => {
          // Delay to send updated always on top state
          if (notesWindow && notesWindow.webContents) {
            // If notes window and web contents exist
            notesWindow.webContents.send(
              'update-always-on-top',
              notesWindow.isAlwaysOnTop()
            ) // Send updated always on top state
          }
        }, 100) // Delay for 100ms
      })
      .catch((error) => {
        // On error
        console.error('Error fetching context on menu bar click:', error) // Log error
      })
  }
}

//////////////////////////
// Create All Notes Window
//////////////////////////
function openAllNotesWindow() {
  // Function to create the All Notes window
  if (notesWindow && !notesWindow.isDestroyed()) {
    // If notes window exists and is not destroyed
    notesWindow.close() // Close notes window
    stopPolling() // Stop polling for context updates
  }

  if (allNotesWindow && !allNotesWindow.isDestroyed()) {
    // If all notes window exists and is not destroyed
    allNotesWindow.focus() // Focus on the all notes window
    return // Exit function
  }

  allNotesWindow = new BrowserWindow({
    // Create all notes window
    width: 1025, // Set width
    height: 600, // Set height
    show: true, // Initially shown
    transparent: true, // Make window transparent
    frame: false, // Remove window frame
    resizable: true, // Allow window resizing
    movable: true, // Allow window moving
    webPreferences: {
      // Web preferences for the window
      preload: path.join(__dirname, 'preload.js'), // Preload script
      contextIsolation: true, // Enable context isolation
      nodeIntegration: false, // Disable node integration
      additionalArguments: [`--overnote-port=${backendPort}`] // Pass backend port as an argument
    }
  })

  allNotesWindow.loadFile(path.join(__dirname, '../public/all-notes.html')) // Load all notes window HTML file

  allNotesWindow.on('closed', () => {
    // Handle all notes window closed event
    allNotesWindow = null // Reset all notes window variable
  })

  return allNotesWindow // Return the all notes window
}

/////////////////////////
// Handle app ready event
/////////////////////////
app.on('ready', () => {
  // Start the Django backend binary with SQLite DB path passed via env variable
  const userDataPath = app.getPath('userData') // Get user data path
  const sqlitePath = path.join(userDataPath, 'overnote.sqlite3') // Path to SQLite database

  const isDev = !app.isPackaged;

const backendBinaryPath = isDev
  ? path.join(__dirname, '../../overnote_back/dist/run_backend')
  : path.join(process.resourcesPath, 'backend/run_backend');
console.log('🔍 Backend binary path:', backendBinaryPath);

const windowHelperPath = isDev
  ? path.join(__dirname, '../build-helpers/GetWindowInfo')
  : path.join(process.resourcesPath, 'build-helpers/GetWindowInfo');
  
    backendProcess = spawn(backendBinaryPath, {
    // Spawn the backend process
    stdio: ['pipe', 'pipe', 'pipe'], // Set stdio to pipe
    env: { ...process.env, OVERNOTE_DB_PATH: sqlitePath } // Pass environment variables
  })

  backendProcess.stdout.on('data', (data) => {
    // Listen for data from backend stdout
    const output = data.toString() // Convert data to string
    console.log(output) // Log output
    const match = output.match(
      /Starting development server at http:\/\/127\.0\.0\.1:(\d+)/
    ) // Match backend port in output
    if (match) {
      // If match found
      backendPort = parseInt(match[1], 10) // Parse and set backend port
      console.log(`✅ Captured backend port: ${backendPort}`) // Log captured port
    }
  })

  backendProcess.stderr.on('data', (data) => {
    // Listen for data from backend stderr
    console.error(`Backend stderr: ${data}`) // Log error output
  })

  ////////////////////////////////////////////////
  // Tray Icon and right click menu initialization
  ////////////////////////////////////////////////
  const iconPath = path.join(
    // Path to tray icon
    __dirname,
    '../public',
    'white_map_scribble_overnote_logo.png'
  )
  tray = new Tray(iconPath) // Create tray icon
  tray.setToolTip('Overnote - Click to open notes') // Set tooltip for tray icon
  startPolling(); // Start polling immediately on app load to ensure icon updates from the start

  tray.on('click', () => {
    // Handle tray icon click
    toggleNotesWindow() // Toggle notes window visibility
  })

  tray.on('right-click', () => {
    // Handle tray icon right-click
    const contextMenu = Menu.buildFromTemplate([
      // Create context menu
      {
        label: 'Open All Notes', // Menu item for opening all notes
        click: () => openAllNotesWindow() // Click handler
      },
      {
        label: 'Quit', // Menu item for quitting
        click: () => {
          // Click handler
          console.log('Quit selected from tray icon') // Log quit selection
          app.isQuitting = true // Set quitting flag
          app.quit() // Quit the app
        }
      }
    ])
    tray.popUpContextMenu(contextMenu) // Show context menu
  })

  /////////////////////////////////////
  // Call Note Window Creation Function
  /////////////////////////////////////
  createNotesWindow() // Create the notes window
})

// ================================
// Attachment Handling (Image/File)
// ================================
const { ipcMain: _ipcMain, dialog: _dialog, shell: _shell } = require('electron');
const _path = require('path');

// Handle Image Attachment
ipcMain.handle('attach-image', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select an Image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }]
  });
  if (!canceled && filePaths.length > 0) {
    return filePaths[0];
  }
  return null;
});

// Handle File Attachment
ipcMain.handle('attach-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select a File',
    properties: ['openFile']
  });
  if (!canceled && filePaths.length > 0) {
    return filePaths[0];
  }
  return null;
});

// Handle Opening Files
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
  } catch (error) {
    console.error(`Failed to open file: ${filePath}`, error.message);
  }
});