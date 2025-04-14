const Quill = window.Quill
const ipcRenderer = window.electron.ipcRenderer
const backendPort = window.electron?.backendPort || '8000';
const BACKEND_BASE_URL = `http://127.0.0.1:${backendPort}`;

let isLocked = false
let lastLockedContext = null
let lastValidContext = null
const ignoredTitles = ['History', 'Downloads', 'Settings', 'New Tab']
const notesMap = new Map(); // Assuming notesMap is defined somewhere

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Renderer process loaded.')
  console.log('🟢 Polling started: Notes window opened.');

  let isProgrammaticChange = false; // New variable to guard against programmatic updates

  // const notesContainer = document.getElementById('notes-container');
  const quillEditor = document.getElementById('quill-editor')
  
  // Create loading spinner
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
  
  // Add keyframes for spinner animation
  const style = document.createElement('style');
  style.textContent = `
  @keyframes spin {
    0% { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
  }
  `;
  document.head.appendChild(style);

  // Create a div for the Quill editor
  const editorDiv = document.createElement('div')
  editorDiv.id = 'quill-editor'
  quillEditor.appendChild(editorDiv)

  // Initialize Quill editor
  const quill = new Quill('#quill-editor', {
    theme: 'snow', // Use Quill's Snow theme
    placeholder: 'Write your notes here...',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link', 'blockquote', 'code-block',],
        ['clean']
      ]
    }
  })

  // Fetch notes for a given context and set them in Quill
  const fetchNotes = async (context) => {
    spinner.style.display = 'block';
    try {
        isProgrammaticChange = true; // Set the flag for programmatic change
        // Clear editor and reset context before fetching
        quill.setText('');
        editorDiv.dataset.context = context;

        const response = await fetch(
            `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
        );

        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`⚠️ No notes found for context: ${context}`);
                spinner.style.display = 'none';
                return;
            }
            throw new Error(`Failed to fetch notes: ${response.statusText}`);
        }

        const notes = await response.json();
        console.log("🔎 Fetched notes:", notes);

        // Convert notes to HTML and set content
        const combinedNotes = notes.map((note) => note.content).join('');
        console.log("📝 Updating Quill editor with content:", combinedNotes);
        quill.root.innerHTML = combinedNotes;
        setTimeout(() => { isProgrammaticChange = false; }, 200); // Reset the flag after the update
        lastValidContext = context; // Update last valid context
        spinner.style.display = 'none';
    } catch (error) {
        console.error("❌ Error fetching notes:", error);
        spinner.style.display = 'none';
    }
  };

  // Save notes when there are changes in the editor
  const saveAllNotes = async (allContent) => {
    try {
        const context = editorDiv.dataset.context;
        console.log('📝 saveAllNotes called for context:', context);

        if (!context) {
            throw new Error('❌ Context is missing. Unable to save notes.');
        }

        const htmlContent = allContent[0]?.trim();
        const requestData = JSON.stringify({ notes: [htmlContent], context });
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
    } catch (error) {
        console.error("❌ Error saving notes:", error);
    }
};

  const maybeDeleteContext = async (context) => {
      const content = quill.root.innerHTML.trim();
      const isEmpty = !content || ['<p><br></p>', '<p><br/></p>', '<p></p>'].includes(content);

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

  // Listen for changes in the editor and save notes
  let saveTimeout; // Debounce timeout
  quill.on('text-change', () => {
    if (isProgrammaticChange) return; // Guard against programmatic changes
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const content = quill.root.innerHTML.trim();
      saveAllNotes([content]);
    }, 500); // Debounce time of 500ms
  });
  
  ipcRenderer.on('update-always-on-top', (event, isOnTop) => {
    isAlwaysOnTop = isOnTop;
    const alwaysOnTopButton = document.getElementById('always-on-top-button');
    if (alwaysOnTopButton) {
      alwaysOnTopButton.textContent = `Always on Top: ${isOnTop ? 'On' : 'Off'}`;
    }
  });

  // Handle context updates from the main process
  ipcRenderer.on('update-context', async (event, context) => {
    console.log(`Context updated to: ${context}`)

    await maybeDeleteContext(editorDiv.dataset.context);

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
        await fetchNotes(lastValidContext) // Use the last valid context
      } else {
        console.error('No valid context to fall back to.')
        quill.setText('')
      }
      return
    }

    if (context && context !== 'Error retrieving context') {
      await fetchNotes(context) // Fetch notes for the new context
    } else if (lastValidContext) {
      console.warn(
        'Current context unavailable. Falling back to last valid context.'
      )
      await fetchNotes(lastValidContext) // Fallback to the last valid context
    } else {
      console.error('No valid context available.')
      quill.setText('') // Clear notes if no valid context exists
    }
  })

  // Add lock button functionality
  const lockButton = document.getElementById('lock-button')

// Lock Button On Click
  lockButton.addEventListener('click', async () => {
    isLocked = !isLocked // Toggle the lock state

    if (isLocked) {
      // Lock the notes to the current context
      lastLockedContext = editorDiv.dataset.context // Save the locked context
      lockButton.textContent = `Locked on ${lastLockedContext}`
      console.log(`Notes locked to context: ${lastLockedContext}`)
    } else {
      // Unlock the notes and resume dynamic updates
      lastLockedContext = null
      lockButton.textContent = 'Lock'
      console.log('Notes unlocked. Resuming dynamic updates.')

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
  })
  
  // Make Lock on {CurrentContext} button say Unlock on hover

  // lockButton.addEventListener('mouseover', () => {
  //   if (isLocked) {
  //     lockButton.dataset.originalText = lockButton.textContent // Store the original text
  //     lockButton.textContent = 'Unlock'
  //   }
  // })

  // lockButton.addEventListener('mouseout', () => {
  //   if (isLocked && lockButton.dataset.originalText) {
  //     lockButton.textContent = lockButton.dataset.originalText // Restore the original text
  //   }
  // })

  // Remove refresh button functionality
  // const refreshButton = document.getElementById('refresh-button');
  // refreshButton.addEventListener('click', async () => {
  //     console.log('Refresh button clicked. Re-fetching the last valid context...');
  //     try {
  //         const refreshedContext = await ipcRenderer.invoke('get-previous-context');
  //         if (refreshedContext && refreshedContext !== 'Notes Window') {
  //             console.log(`Refreshing notes for previous valid context: ${refreshedContext}`);
  //             await fetchNotes(refreshedContext);
  //         } else {
  //             console.warn('No valid previous context available.');
  //         }
  //     } catch (error) {
  //         console.error('Error refreshing to previous context:', error);
  //     }
  // });

  const alwaysOnTopButton = document.getElementById('always-on-top-button');
  let isAlwaysOnTop = true; // Default state
  alwaysOnTopButton.addEventListener('click', () => {
    ipcRenderer.send('request-toggle-always-on-top');
  });

  // Load initial notes
  try {
    const initialContext = await ipcRenderer.invoke('get-current-context');
    if (initialContext) {
      await fetchNotes(initialContext);
      lastValidContext = initialContext;
    } else {
      console.warn('No valid context available on load.');
    }
  } catch (error) {
    console.error('❌ Failed to fetch initial context on load:', error);
  }

  window.addEventListener('beforeunload', async () => {
      const context = editorDiv.dataset.context;
      if (context) {
          await maybeDeleteContext(context);
      }
      console.log('⏸️ Polling paused: Notes window closed.');
  });
})