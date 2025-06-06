const ipcRenderer = window.electron.ipcRenderer
const backendPort = window.electron?.backendPort || '8000'
const BACKEND_BASE_URL = `http://127.0.0.1:${backendPort}`
const savedContexts = new Set()

// This script runs in the renderer process of the Overnote app and handles UI interactions,
// context updates, note fetching and saving, and window behavior.

let isLocked = false // Indicates whether the notes are locked to a specific context
let lastLockedContext = null // Stores the context to which notes are locked
let lastValidContext = null // Keeps track of the last valid context for fallback
const ignoredTitles = ['History', 'Downloads', 'Settings', 'New Tab'] // Titles to ignore for context updates
const notesMap = new Map() // Map to store notes associated with different contexts

let consecutiveFailures = 0
const MAX_FAILURES_BEFORE_RESTART = 3

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Renderer process loaded.')
  console.log('🟢 Polling started: Notes window opened.')

  let isProgrammaticChange = false // New variable to guard against programmatic updates

  const quillEditor = document.getElementById('quill-editor')

  /////////////////////////////////////////////////////////////////////
  // Create loading spinner for visual feedback during fetch operations
  /////////////////////////////////////////////////////////////////////
  const spinner = document.createElement('div')
  spinner.id = 'loading-spinner'
  spinner.style.position = 'absolute'
  spinner.style.top = '50%'
  spinner.style.left = '50%'
  spinner.style.transform = 'translate(-50%, -50%)'
  spinner.style.border = '6px solid #f3f3f3'
  spinner.style.borderTop = '6px solid #3498db'
  spinner.style.borderRadius = '50%'
  spinner.style.width = '40px'
  spinner.style.height = '40px'
  spinner.style.animation = 'spin 1s linear infinite'
  spinner.style.display = 'none'
  spinner.style.zIndex = '10000'
  document.body.appendChild(spinner)

  // Add keyframes for spinner animation and tooltip styling
  const style = document.createElement('style')
  style.textContent = `
  @keyframes spin {
    0% { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
  }
  .ql-tooltip {
    z-index: 9999 !important;
    position: absolute !important;
  }
  `
  document.head.appendChild(style)

  /////////////////////////////////////////////////////////////////////////
  // Initialize Quill editor with custom toolbar including attachImage button
  /////////////////////////////////////////////////////////////////////////
  const quill = new Quill('#quill-editor', {
    theme: 'snow',
    placeholder: 'Write your notes here...',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'image', 'code-block'],
        ['attachImage'], // Custom button for attaching images
        ['clean']
      ]
    }
  });

  // Add custom handler for attachImage button
  const toolbar = quill.getModule('toolbar');
  toolbar.addHandler('attachImage', async () => {
    try {
      // Determine the most recently active, valid context
      const currentContext = quillEditor.dataset.context;
      const isValidContext =
        currentContext &&
        currentContext !== 'item-0' &&
        !currentContext.includes('Electron');

      const targetContext = isValidContext ? currentContext : lastValidContext;

      if (!targetContext) {
        console.warn('No valid context found for attaching the image.');
        return;
      }

      console.log(`Attaching image to context: ${targetContext}`);

      // Open the file dialog to select an image
      const filePath = await ipcRenderer.invoke('attach-image');

      if (filePath) {
        console.log(`Image selected: ${filePath}`);
        insertImageToQuill(filePath, targetContext);
      }
    } catch (error) {
      console.error('Error attaching image:', error);
    }
  });

  // Function to insert image into Quill editor
  function insertImageToQuill(filePath, context) {
    fetch(`file://${filePath}`)
      .then(res => res.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Image = e.target.result;
          const range = quill.getSelection();

          // Insert image only if the context matches the target context
          if (quillEditor.dataset.context === context) {
            quill.insertEmbed(range ? range.index : 0, 'image', base64Image);
          } else {
            console.warn(
              `Context mismatch: expected ${context} but found ${quillEditor.dataset.context}`
            );
          }
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error('Error reading file as base64:', error);
      });
  }

  /////////////////////////////////////////////////////////////////////////
  // Quill Link Format and adding https://
  /////////////////////////////////////////////////////////////////////////
  const Link = Quill.import('formats/link') // Import Quill's link format
  const builtInSanitize = Link.sanitize // Backup of the original sanitize function

  // Custom link sanitization to ensure URLs start with http(s)://
  Link.sanitize = function (url) {
    if (
      typeof url === 'string' &&
      !/^https?:\/\//i.test(url) &&
      !url.startsWith('mailto:') &&
      !url.startsWith('tel:')
    ) {
      url = 'https://' + url
    }
    return builtInSanitize.call(this, url)
  }

  Quill.register(Link, true) // Register the custom link format

  //////////////////////////////////
  // Fetch notes for a given context
  //////////////////////////////////
const fetchNotes = async (context) => {
  spinner.style.display = 'block';

  try {
    quill.setText('');
    quillEditor.dataset.context = context;

    const response = await fetch(
      `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
    );

    if (!response.ok) {
      console.warn(`No notes found for context: ${context}`);
      return;
    }

    const notes = await response.json();
    const combinedNotes = notes.map((note) => note.content).join('');
    quill.root.innerHTML = combinedNotes;
  } catch (error) {
    console.error('Error fetching notes:', error.message);
  } finally {
    spinner.style.display = 'none';
  }
};

const saveAllNotes = async (allContent) => {
  try {
    const context = quillEditor.dataset.context;
    if (!context) return;

    const requestData = JSON.stringify({ notes: allContent, context });
    await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: requestData,
    });
  } catch (error) {
    console.error('Error saving notes:', error.message);
  }
};

  //////////////////////////////////////////
  // Maybe delete context if notes are empty
  //////////////////////////////////////////
  const maybeDeleteContext = async (context) => {
    const content = quill.root.innerHTML.trim()

    // Parse the content to check for actual text
    const div = document.createElement('div')
    div.innerHTML = content
    const plainText = div.textContent.trim()

    const isEmpty = !plainText

    if (!savedContexts.has(context)) {
      console.log(
        `Skipping delete for context "${context}" because it has never been saved.`
      )
      return
    }

    if (isEmpty) {
      console.log(`🗑 maybeDeleteContext: '${context}' is empty. Deleting...`)
      await fetch(`${BACKEND_BASE_URL}/api/notes/delete-context/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context })
      })
      notesMap.delete(context)
    }
  }
  //////////////////////////////////////////////////
  // Listen for changes in the editor and save notes
  //////////////////////////////////////////////////
  let saveTimeout // Debounce timeout to optimize save calls
  quill.on('text-change', () => {
    if (isProgrammaticChange) return // Guard against programmatic changes
    clearTimeout(saveTimeout) // Clear previous timeout
    saveTimeout = setTimeout(() => {
      const content = quill.root.innerHTML.trim() // Get trimmed content
      saveAllNotes([content]) // Save notes after debounce period
    }, 500) // Debounce time of 500ms
  })

  /////////////////////////////////////////
  // IPC listener for always-on-top updates
  /////////////////////////////////////////
  ipcRenderer.on('update-always-on-top', (event, isOnTop) => {
    isAlwaysOnTop = isOnTop // Update always-on-top state
    const alwaysOnTopButton = document.getElementById('always-on-top-button')
    if (alwaysOnTopButton) {
      alwaysOnTopButton.textContent = `Always on Top: ${isOnTop ? 'On' : 'Off'}` // Update button text
    }
  })

  ///////////////////////////////////////////////
  // Handle context updates from the main process
  ///////////////////////////////////////////////
  ipcRenderer.on('update-context', async (event, context) => {
    const overlay = document.getElementById('no-context-overlay')
    
    if (context === 'Choose a context') {
      overlay.style.display = 'flex'
    } else {
      overlay.style.display = 'none'
    }

    console.log(`Context updated to: ${context}`)

    if (isLocked) {
      console.log(
        `Notes are locked to context: ${lastLockedContext}. Ignoring updates.`
      )
      return // Skip updates when locked
    }

    if (ignoredTitles.some((title) => context.includes(title))) {
      console.warn(
        `Ignored context detected: ${context}. Falling back to last valid context.`
      )
      if (lastValidContext) {
        await fetchNotes(lastValidContext)
      } else {
        console.error('No valid context to fall back to.')
        quill.setText('')
      }
      return
    }

    if (context && context !== 'Error retrieving context') {
      await fetchNotes(context)
    } else if (lastValidContext) {
      console.warn(
        'Current context unavailable. Falling back to last valid context.'
      )
      await fetchNotes(lastValidContext)
    } else {
      console.error('No valid context available.')
      quill.setText('')
    }
    // After handling the context update, verify if the displayed context matches the new context
    retryContextSync(context)
  })

  ////////////////////////////////
  // Add lock button functionality
  ////////////////////////////////
  const lockButton = document.getElementById('lock-button')

  // Lock Button On Click
  lockButton.addEventListener('click', async () => {
    isLocked = !isLocked // Toggle the lock state

    if (isLocked) {
      // Lock the notes to the current context
      lastLockedContext = quillEditor.dataset.context // Save the locked context
      lockButton.textContent = `Locked on ${lastLockedContext}` // Update button text
      console.log(`Notes locked to context: ${lastLockedContext}`)
    } else {
      // Unlock the notes and resume dynamic updates
      lastLockedContext = null // Clear locked context
      lockButton.textContent = 'Lock' // Reset button text
      console.log('Notes unlocked. Resuming dynamic updates.')

      try {
        // Clear the editor and fetch the current active context after unlocking
        quill.setText('')
        const currentContext = await ipcRenderer.invoke('get-current-context')
        console.log(
          `Fetching notes for current context after unlocking: ${currentContext}`
        )

        if (currentContext) {
          await fetchNotes(currentContext) // Refresh notes for the current context
          lastValidContext = currentContext // Update the last valid context
        } else {
          console.warn('No valid context available after unlocking.')
          quill.setText('') // Clear notes if no valid context exists
        }
      } catch (error) {
        console.error('Error updating context after unlocking:', error)
      }
    }
  })

  ////////////////////////////////////////
  // Always-on-top button toggle and state
  ////////////////////////////////////////
  const alwaysOnTopButton = document.getElementById('always-on-top-button')
  let isAlwaysOnTop = true // Default state
  alwaysOnTopButton.addEventListener('click', () => {
    ipcRenderer.send('request-toggle-always-on-top') // Send request to toggle always-on-top state
  })

  /////////////////////////////////////////////////
  // Load initial notes when the renderer is loaded
  /////////////////////////////////////////////////
  try {
    const initialContext = await ipcRenderer.invoke('get-current-context') // Get the initial context
    if (initialContext) {
      await fetchNotes(initialContext) // Fetch notes for the initial context
      lastValidContext = initialContext // Set the last valid context
    } else {
      console.warn('No valid context available on load.')
    }
  } catch (error) {
    console.error('❌ Failed to fetch initial context on load:', error)
  }

  ///////////////////////////
  // Cleanup on window unload
  ///////////////////////////
  window.addEventListener('beforeunload', async () => {
    const context = quillEditor.dataset.context // Get current context
    if (context) {
      await maybeDeleteContext(context) // Maybe delete context if empty
    }
    console.log('⏸️ Polling paused: Notes window closed.')
  })
})
// Helper function to retry context synchronization if a mismatch is detected
const retryContextSync = (context) => {
  if (!isLocked && quillEditor.dataset.context !== context) {
    console.log(
      `Context mismatch detected. Retrying context sync for: ${context}`
    )
    setTimeout(() => {
      fetchNotes(context)
    }, 2000)
  }
}