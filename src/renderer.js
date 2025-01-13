const ipcRenderer = window.electron.ipcRenderer;

// Listen for context updates
ipcRenderer.on('update-context', async (event, context) => {
    console.log(`Context updated to: ${context}`);

    // Fetch and display notes for the new context
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/notes?context=${encodeURIComponent(context)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch notes for context: ${context}`);
        }
        const notes = await response.json();
        console.log('Notes fetched:', notes);

        // Update the UI with the new notes
        displayNotes(notes, context);
    } catch (error) {
        console.error('Error fetching notes for updated context:', error);
    }
});

// Function to display notes dynamically
function displayNotes(notes, context) {
    const notesContainer = document.getElementById('notes-container');
    notesContainer.innerHTML = `<h2>Notes for: ${context}</h2>`;
    notes.forEach(note => {
        const noteElement = document.createElement('div');
        noteElement.textContent = note.content;
        notesContainer.appendChild(noteElement);
    });
}

// Listen for "toggle-overlay" event from the menu bar
ipcRenderer.on('toggle-overlay', () => {
    console.log('Toggle overlay triggered');
    // Implement overlay logic here
});

// Function to save a new note for the current context
async function saveNoteForContext(noteContent) {
    try {
        const context = await ipcRenderer.invoke('get-current-context');
        console.log('Fetched context for saving note:', context);

        const payload = { context, content: noteContent };
        console.log('Payload:', payload); // Debugging: Log the payload

        const response = await fetch('http://127.0.0.1:8000/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Failed to save note: ${response.statusText}`);
        }

        console.log('Note saved successfully:', noteContent);
    } catch (error) {
        console.error('Error saving note:', error);
    }
}

// Attach event listener to the "Save Note" button
document.getElementById('save-note-button').addEventListener('click', async () => {
    const noteContent = document.getElementById('note-input').value.trim();

    if (!noteContent) {
        console.log('No note content provided.');
        return;
    }

    console.log('Saving note:', noteContent); // Debugging: Check if the event fires
    await saveNoteForContext(noteContent);
});

// Fetch and display notes for a context
async function fetchNotes(context) {
    try {
        const response = await fetch(`http://127.0.0.1:8000/api/notes?context=${encodeURIComponent(context)}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch notes: ${response.statusText}`);
        }
        const notes = await response.json();
        console.log('Fetched notes:', notes);

        // Update UI with the fetched notes
        displayNotes(notes, context);
    } catch (error) {
        console.error('Error fetching notes:', error);
    }
}

// Listen for "update-context" event from the main process
ipcRenderer.on('update-context', (event, context) => {
    console.log(`Context updated to: ${context}`);

    // Optionally, update the UI if needed
    const notesContainer = document.getElementById('notes-container');
    if (notesContainer) {
        notesContainer.innerHTML = `<h2>Notes for: ${context}</h2>`;
    }
});




// Fetch the current context and update the UI
async function fetchCurrentContext() {
    try {
        const context = await ipcRenderer.invoke('get-current-context');
        console.log('Fetched context in renderer:', context);

        // Example: Update an HTML element with the context
        const contextDisplay = document.getElementById('context-display');
        if (contextDisplay) {
            contextDisplay.textContent = `Current Context: ${context}`;
        }
    } catch (error) {
        console.error('Error fetching context in renderer:', error);
    }
}

// Fetch the context when the page loads
window.onload = () => {
    fetchCurrentContext();
};