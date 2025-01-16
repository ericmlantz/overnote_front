const lockButton = document.getElementById('lock-button');
    lockButton.addEventListener('click', async () => {
        isLocked = !isLocked;
        if (isLocked) {
            lastLockedContext = editorDiv.dataset.context;
            lockButton.textContent = `Locked on ${lastLockedContext}`;
            console.log(`Notes locked to context: ${lastLockedContext}`);
        } else {
            lastLockedContext = null;
            lockButton.textContent = 'Lock';
            console.log('Notes unlocked. Resuming dynamic updates.');

            const currentContext = await ipcRenderer.invoke('get-current-context');
            if (currentContext) {
                await fetchNotes(currentContext);
            }
        }
    });
    
# ------------------------------------------
const fetchNotes = async (context) => {
    console.log(`Fetching notes for context: ${context}`)
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
      )
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`No notes found for context: ${context}`)
          quill.setText('') // Clear the editor for empty contexts
          editorDiv.dataset.context = context
          return
        }
        throw new Error(`Failed to fetch notes: ${response.statusText}`)
      }

      const notes = await response.json()
      console.log('Fetched notes:', notes)

      const combinedNotes = notes.map((note) => note.content).join('')
      quill.root.innerHTML = combinedNotes // Load notes into the Quill editor
      editorDiv.dataset.context = context // Store the context
    } catch (error) {
      console.error('Error fetching notes:', error)
      quill.setText('') // Clear the editor on error
    }
  }
    
# -------------------------------------
  ipcRenderer.on('update-context', async (event, context) => {
    console.log(`Context updated to: ${context}`)

    if (isLocked) {
      console.log(
        `Notes are locked to context: ${lastLockedContext}. Ignoring updates.`
      )
      return
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
      lastValidContext = context
    } else if (lastValidContext) {
      console.warn(
        'Current context unavailable. Falling back to last valid context.'
      )
      await fetchNotes(lastValidContext)
    } else {
      console.error('No valid context available.')
      quill.setText('')
    }
  })
