const ipcRenderer = window.electron.ipcRenderer
const backendPort = window.electron?.backendPort || '8000';
const BACKEND_BASE_URL = `http://127.0.0.1:${backendPort}`;
const savedContexts = new Set();

// This script runs in the renderer process of the Overnote app and handles UI interactions,
// context updates, note fetching and saving, and window behavior.

let isLocked = false; // Indicates whether the notes are locked to a specific context
let lastLockedContext = null; // Stores the context to which notes are locked
let lastValidContext = null; // Keeps track of the last valid context for fallback
const ignoredTitles = ['History', 'Downloads', 'Settings', 'New Tab']; // Titles to ignore for context updates
const notesMap = new Map(); // Map to store notes associated with different contexts

let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_RESTART = 3;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Renderer process loaded.')
  console.log('🟢 Polling started: Notes window opened.');

  let isProgrammaticChange = false; // New variable to guard against programmatic updates

  const quillEditor = document.getElementById('quill-editor');

  /////////////////////////////////////////////////////////////////////
  // Create loading spinner for visual feedback during fetch operations
  /////////////////////////////////////////////////////////////////////
  const spinner = document.createElement('div');
  spinner.id = 'loading-spinner';
  spinner.style.position = 'absolute';
  spinner.style.top = '50%';
  spinner.style.left = '50%';
  spinner.style.transform = 'translate(-50%, -50%)';
  spinner.style.border = '6px solid #f3f3f3';
  spinner.style.borderTop = '6px solid #3498db';
  spinner.style.borderRadius = '50%';
  spinner.style.width = '40px';
  spinner.style.height = '40px';
  spinner.style.animation = 'spin 1s linear infinite';
  spinner.style.display = 'none';
  spinner.style.zIndex = '10000';
  document.body.appendChild(spinner);
  
  // Add keyframes for spinner animation and tooltip styling
  const style = document.createElement('style');
  style.textContent = `
  @keyframes spin {
    0% { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
  }
  .ql-tooltip {
    z-index: 9999 !important;
    position: absolute !important;
  }
  `;
  document.head.appendChild(style);

  /////////////////////////////////////////////////////////////////////////
  // Initialize Quill editor with specified theme and toolbar configuration
  /////////////////////////////////////////////////////////////////////////
  const quill = new Quill('#quill-editor', {
    theme: 'snow', // Use Quill's Snow theme
    placeholder: 'Write your notes here...',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }], // Header options
        ['bold', 'italic', 'underline', 'strike'], // Text formatting options
        [{ 'list': 'ordered' }, { 'list': 'bullet' }], // List options
        ['link', 'blockquote', 'code-block',], // Link, blockquote, and code block options
        ['clean'] // Clear formatting option
      ]
    }
  });

  /////////////////////////////////////////////////////////////////////////
  // Quill Link Format and adding https://
  /////////////////////////////////////////////////////////////////////////
  const Link = Quill.import('formats/link'); // Import Quill's link format
  const builtInSanitize = Link.sanitize; // Backup of the original sanitize function

  // Custom link sanitization to ensure URLs start with http(s)://
  Link.sanitize = function (url) {
    if (typeof url === 'string' && !/^https?:\/\//i.test(url) && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
      url = 'https://' + url;
    }
    return builtInSanitize.call(this, url);
  };

  Quill.register(Link, true); // Register the custom link format

  //////////////////////////////////
  // Fetch notes for a given context
  //////////////////////////////////
  const fetchNotes = async (context) => {
    spinner.style.display = 'block'; // Show spinner while fetching notes
    try {
        isProgrammaticChange = true; // Set the flag for programmatic change
        // Clear editor and reset context before fetching
        quill.setText('');
        quillEditor.dataset.context = context;

        const response = await fetch(
            `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
        );

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`⚠️ No notes found for context: ${context}`);
                spinner.style.display = 'none'; // Hide spinner if no notes found
                return;
            }
            throw new Error(`Failed to fetch notes: ${response.statusText}`);
        }

        const notes = await response.json(); // Parse fetched notes
        console.log("🔎 Fetched notes:", notes);
        
        ////////////////////////////////////////////////////////
        // Convert notes to HTML and set content in Quill editor
        ////////////////////////////////////////////////////////
        const combinedNotes = notes.map((note) => note.content).join('');
        console.log("📝 Updating Quill editor with content:", combinedNotes);
        quill.root.innerHTML = combinedNotes; // Update editor content
        setTimeout(() => { isProgrammaticChange = false; }, 200); // Reset the flag after the update
        lastValidContext = context; // Update last valid context
        spinner.style.display = 'none'; // Hide spinner after fetching
        consecutiveFailures = 0; // Reset consecutive failures on successful fetch
    } catch (error) {
        console.error("❌ Error fetching notes:", error);
        consecutiveFailures++; // Increment failure count
        console.log(`Consecutive failures: ${consecutiveFailures}`);
        spinner.style.display = 'none'; // Hide spinner on error
        
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_RESTART) {
            consecutiveFailures = 0; // Reset counter
            ipcRenderer.send('restart-backend'); // Send message to restart backend
        }
    }
  };

  //////////////////////////////////////////////////
  // Save notes when there are changes in the editor
  //////////////////////////////////////////////////
  const saveAllNotes = async (allContent) => {
    try {
        const context = quillEditor.dataset.context; // Get current context
        console.log('📝 saveAllNotes called for context:', context);

        if (!context) {
            throw new Error('❌ Context is missing. Unable to save notes.');
        }

        const htmlContent = allContent[0]?.trim(); // Trim content for saving
        const requestData = JSON.stringify({ notes: [htmlContent], context }); // Prepare request data
        console.log(`🚀 Sending payload to backend:\n`, requestData);

        const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: requestData, // Send as JSON
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to update notes: ${errorText}`);
        }

        console.log(`✅ Notes updated successfully for context: ${context}`);
        savedContexts.add(context);
    } catch (error) {
        console.error("❌ Error saving notes:", error);
    }
  };

  //////////////////////////////////////////
  // Maybe delete context if notes are empty
  //////////////////////////////////////////
  const maybeDeleteContext = async (context) => {
  const content = quill.root.innerHTML.trim();
  
  // Parse the content to check for actual text
  const div = document.createElement('div');
  div.innerHTML = content;
  const plainText = div.textContent.trim();

  const isEmpty = !plainText;
  
  if (!savedContexts.has(context)) {
    console.log(`Skipping delete for context "${context}" because it has never been saved.`);
    return;
  }

  if (isEmpty) {
    console.log(`🗑 maybeDeleteContext: '${context}' is empty. Deleting...`);
    await fetch(`${BACKEND_BASE_URL}/api/notes/delete-context/`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    });
    notesMap.delete(context);
  }
};
  //////////////////////////////////////////////////
  // Listen for changes in the editor and save notes
  //////////////////////////////////////////////////
  let saveTimeout; // Debounce timeout to optimize save calls
  quill.on('text-change', () => {
    if (isProgrammaticChange) return; // Guard against programmatic changes
    clearTimeout(saveTimeout); // Clear previous timeout
    saveTimeout = setTimeout(() => {
      const content = quill.root.innerHTML.trim(); // Get trimmed content
      saveAllNotes([content]); // Save notes after debounce period
    }, 500); // Debounce time of 500ms
  });
  
  /////////////////////////////////////////
  // IPC listener for always-on-top updates
  /////////////////////////////////////////
  ipcRenderer.on('update-always-on-top', (event, isOnTop) => {
    isAlwaysOnTop = isOnTop; // Update always-on-top state
    const alwaysOnTopButton = document.getElementById('always-on-top-button');
    if (alwaysOnTopButton) {
      alwaysOnTopButton.textContent = `Always on Top: ${isOnTop ? 'On' : 'Off'}`; // Update button text
    }
  });

  ///////////////////////////////////////////////
  // Handle context updates from the main process
  ///////////////////////////////////////////////
  ipcRenderer.on('update-context', async (event, context) => {
    console.log(`Context updated to: ${context}`);
 
    if (isLocked) {
      console.log(
        `Notes are locked to context: ${lastLockedContext}. Ignoring updates.`
      );
      return; // Skip updates when locked
    }
 
    if (ignoredTitles.some((title) => context.includes(title))) {
      console.warn(
        `Ignored context detected: ${context}. Falling back to last valid context.`
      );
      if (lastValidContext) {
        await fetchNotes(lastValidContext);
      } else {
        console.error('No valid context to fall back to.');
        quill.setText('');
      }
      return;
    }
 
    if (context && context !== 'Error retrieving context') {
      await fetchNotes(context);
    } else if (lastValidContext) {
      console.warn(
        'Current context unavailable. Falling back to last valid context.'
      );
      await fetchNotes(lastValidContext);
      } else {
        console.error('No valid context available.');
        quill.setText('');
      }
      // After handling the context update, verify if the displayed context matches the new context
      retryContextSync(context);
    });

  ////////////////////////////////
  // Add lock button functionality
  ////////////////////////////////
  const lockButton = document.getElementById('lock-button');

  // Lock Button On Click
  lockButton.addEventListener('click', async () => {
    isLocked = !isLocked; // Toggle the lock state

    if (isLocked) {
      // Lock the notes to the current context
      lastLockedContext = quillEditor.dataset.context; // Save the locked context
      lockButton.textContent = `Locked on ${lastLockedContext}`; // Update button text
      console.log(`Notes locked to context: ${lastLockedContext}`);
    } else {
      // Unlock the notes and resume dynamic updates
      lastLockedContext = null; // Clear locked context
      lockButton.textContent = 'Lock'; // Reset button text
      console.log('Notes unlocked. Resuming dynamic updates.');

      try {
        // Clear the editor and fetch the current active context after unlocking
        quill.setText('');
        const currentContext = await ipcRenderer.invoke('get-current-context');
        console.log(`Fetching notes for current context after unlocking: ${currentContext}`);

        if (currentContext) {
          await fetchNotes(currentContext); // Refresh notes for the current context
          lastValidContext = currentContext; // Update the last valid context
        } else {
          console.warn('No valid context available after unlocking.');
          quill.setText(''); // Clear notes if no valid context exists
        }
      } catch (error) {
        console.error('Error updating context after unlocking:', error);
      }
    }
  });
  
  ////////////////////////////////////////
  // Always-on-top button toggle and state
  ////////////////////////////////////////
  const alwaysOnTopButton = document.getElementById('always-on-top-button');
  let isAlwaysOnTop = true; // Default state
  alwaysOnTopButton.addEventListener('click', () => {
    ipcRenderer.send('request-toggle-always-on-top'); // Send request to toggle always-on-top state
  });

  /////////////////////////////////////////////////
  // Load initial notes when the renderer is loaded
  /////////////////////////////////////////////////
  try {
    const initialContext = await ipcRenderer.invoke('get-current-context'); // Get the initial context
    if (initialContext) {
      await fetchNotes(initialContext); // Fetch notes for the initial context
      lastValidContext = initialContext; // Set the last valid context
    } else {
      console.warn('No valid context available on load.');
    }
  } catch (error) {
    console.error('❌ Failed to fetch initial context on load:', error);
  }

  ///////////////////////////
  // Cleanup on window unload
  ///////////////////////////
  window.addEventListener('beforeunload', async () => {
      const context = quillEditor.dataset.context; // Get current context
      if (context) {
          await maybeDeleteContext(context); // Maybe delete context if empty
      }
      console.log('⏸️ Polling paused: Notes window closed.');
  });
})
  // Helper function to retry context synchronization if a mismatch is detected
  const retryContextSync = (context) => {
    if (!isLocked && quillEditor.dataset.context !== context) {
      console.log(`Context mismatch detected. Retrying context sync for: ${context}`);
      setTimeout(() => {
        fetchNotes(context);
      }, 2000);
    }
  };