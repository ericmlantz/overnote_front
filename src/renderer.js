const Quill = window.Quill
const ipcRenderer = window.electron.ipcRenderer
const BACKEND_BASE_URL = 'http://127.0.0.1:8000'

let isLocked = false
let lastLockedContext = null
let lastValidContext = null
const ignoredTitles = ['History', 'Downloads', 'Settings', 'New Tab']

document.addEventListener('DOMContentLoaded', () => {
  console.log('Renderer process loaded.')

  // const notesContainer = document.getElementById('notes-container');
  const quillEditor = document.getElementById('quill-editor')

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
    console.log(`Fetching notes for context: ${context}`);
    try {
        const response = await fetch(
            `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
        );
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`No notes found for context: ${context}`);
                quill.setText(''); // Clear the editor
                return; // Do NOT update dataset.context yet
            }
            throw new Error(`Failed to fetch notes: ${response.statusText}`);
        }

        const notes = await response.json();
        console.log('Fetched notes:', notes);

        const combinedNotes = notes.map((note) => note.content).join('');
        quill.root.innerHTML = combinedNotes; // Update the Quill editor
        editorDiv.dataset.context = context; // Store the current context only if notes exist
    } catch (error) {
        console.error('Error fetching notes:', error);
        quill.setText(''); // Clear the editor on error
    }
};

  // Save notes when there are changes in the editor
  const saveAllNotes = async (allContent) => {
    try {
        const context = editorDiv.dataset.context; // Get the current context
        console.log('saveAllNotes called for context:', context);

        if (!context) {
            throw new Error('Context is missing. Unable to save notes.');
        }

        const htmlContent = allContent[0]?.trim();
        const isEmpty = htmlContent === '' || htmlContent === '<p><br></p>';

        if (isEmpty) {
            console.log(`Note for context '${context}' is empty. Checking if context exists before deleting...`);

            // First, check if the context exists in the database
            const checkResponse = await fetch(`${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`);
            
            if (checkResponse.status === 404) {
                console.warn(`Context '${context}' not found in the database. Skipping delete.`);
                return; // Exit early to prevent unnecessary DELETE request
            } else if (!checkResponse.ok) {
                throw new Error(`Failed to verify context existence: ${checkResponse.statusText}`);
            }

            const existingNotes = await checkResponse.json();
            if (existingNotes.length === 0) {
                console.warn(`Context '${context}' already empty in the database. Skipping delete.`);
                return;
            }

            // If context exists and has no notes, proceed with deletion
            console.log(`Deleting context '${context}' as its note is empty.`);
            const deleteResponse = await fetch(`${BACKEND_BASE_URL}/api/context/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context }) 
            });

            if (!deleteResponse.ok) {
                throw new Error(`Failed to delete context: ${deleteResponse.statusText}`);
            }

            console.log(`Context '${context}' deleted successfully.`);
            return;
        }
 
        // Otherwise, save the note normally
        const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: allContent, context }) 
        });

        if (!response.ok) {
            throw new Error(`Failed to update notes: ${response.statusText}`);
        }

        console.log('Notes updated successfully for context:', context);
    } catch (error) {
        console.error('Error updating notes:', error);
    }
};

  // Listen for changes in the editor and save notes
  quill.on('text-change', () => {
    const content = quill.root.innerHTML.trim() // Get Quill content as HTML
    saveAllNotes([content]) // Pass the content as an array
  })

  // Handle context updates from the main process
  ipcRenderer.on('update-context', async (event, context) => {
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
        await fetchNotes(lastValidContext) // Use the last valid context
      } else {
        console.error('No valid context to fall back to.')
        quill.setText('')
      }
      return
    }

    if (context && context !== 'Error retrieving context') {
      await fetchNotes(context) // Fetch notes for the new context
      lastValidContext = context // Update the last valid context
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

      // Immediately fetch notes for the current active context
      const currentContext = await ipcRenderer.invoke('get-current-context')
      console.log(
        `Fetching notes for current context after unlocking: ${currentContext}`
      )
      if (currentContext) {
        await fetchNotes(currentContext) // Refresh notes for the current context
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

  // Add refresh button functionality
const refreshButton = document.getElementById('refresh-button');
refreshButton.addEventListener('click', async () => {
    console.log('Refresh button clicked. Re-fetching the last valid context...');

    try {
        const refreshedContext = await ipcRenderer.invoke('get-previous-context'); // Get previous context
        if (refreshedContext && refreshedContext !== 'Notes Window') {
            console.log(`Refreshing notes for previous valid context: ${refreshedContext}`);
            await fetchNotes(refreshedContext); // Fetch notes for the last valid context
        } else {
            console.warn('No valid previous context available.');
        }
    } catch (error) {
        console.error('Error refreshing to previous context:', error);
    }
});

  const alwaysOnTopButton = document.getElementById('always-on-top-button');
    let isAlwaysOnTop = true; // Default state
    alwaysOnTopButton.addEventListener('click', () => {
      isAlwaysOnTop = !isAlwaysOnTop;
      ipcRenderer.send('toggle-always-on-top', isAlwaysOnTop);
      alwaysOnTopButton.textContent = `Always on Top: ${isAlwaysOnTop ? 'On' : 'Off'}`;
  });

  // Load initial notes
  const initialContext = 'default'
  fetchNotes(initialContext)
})