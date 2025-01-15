const ipcRenderer = window.electron.ipcRenderer
const BACKEND_BASE_URL = 'http://127.0.0.1:8000'

document.addEventListener('DOMContentLoaded', () => {
  const notesContainer = document.getElementById('notes-container')

  // Create a single textarea for all notes
  const textarea = document.createElement('textarea')
  textarea.id = 'all-notes'
  textarea.style.width = '100%'
  textarea.style.height = '300px'
  notesContainer.appendChild(textarea)

  // Fetch notes from the backend for the given context
  const fetchNotes = async (context) => {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
      )
      if (!response.ok) {
        throw new Error(`Failed to fetch notes: ${response.statusText}`)
      }
      const notes = await response.json()

      // Combine all notes into a single string
      const combinedNotes = notes.map((note) => note.content).join('\n')
      textarea.value = combinedNotes

      // Store the current context in the textarea for later use
      textarea.dataset.context = context
    } catch (error) {
      console.error('Error fetching notes:', error)
    }
  }

  // Save all notes in real-time when the textarea is modified
  const saveAllNotes = async (content) => {
    try {
        const notes = content.split('\n'); // Split combined notes back into individual notes
        const context = textarea.dataset.context; // Use a dataset attribute to store the current context
        if (!context) {
            throw new Error('Context is missing. Unable to save notes.');
        }

        const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ notes, context }), // Send notes and context
        });

        if (!response.ok) {
            throw new Error(`Failed to update notes: ${response.statusText}`);
        }
        console.log('Notes updated successfully.');
    } catch (error) {
        console.error('Error updating notes:', error);
    }
};

  // Add an event listener to handle textarea input changes
  textarea.addEventListener('input', (event) => {
    const content = event.target.value.trim()
    saveAllNotes(content) // Save combined notes
  })

  // Listen for context updates from the main process
  ipcRenderer.on('update-context', async (event, context) => {
    console.log(`Context updated to: ${context}`)
    await fetchNotes(context) // Send the context identifier to the backend
  })

  // Load initial notes
  const initialContext = 'default' // Replace with actual logic to determine the default context
  fetchNotes(initialContext)
})
