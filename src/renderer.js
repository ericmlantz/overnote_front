const ipcRenderer = window.electron.ipcRenderer;
const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

let isLocked = false;
let lastLockedContext = null;
let lastValidContext = null;
const ignoredTitles = ["History", "Downloads", "Settings", "New Tab"];

document.addEventListener('DOMContentLoaded', () => {
    console.log('Renderer process loaded.');

    const notesContainer = document.getElementById('notes-container');

    // Create a div for the Quill editor
    const editorDiv = document.createElement('div');
    editorDiv.id = 'quill-editor';
    notesContainer.appendChild(editorDiv);

    // Initialize Quill editor
    const quill = new Quill('#quill-editor', {
        theme: 'snow',
        placeholder: 'Write your notes here...',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline'], // Formatting options
                [{ list: 'ordered' }, { list: 'bullet' }], // Lists
                ['link', 'image'], // Links and images
            ],
        },
    });

    // Fetch notes for a given context and set them in Quill
    const fetchNotes = async (context) => {
        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`);
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`No existing notes found for context: ${context}`);
                    quill.setText(''); // Clear Quill editor for new contexts
                    editorDiv.dataset.context = context; // Set the context
                    return;
                }
                throw new Error(`Failed to fetch notes: ${response.statusText}`);
            }

            const notes = await response.json();
            const combinedNotes = notes.map((note) => note.content).join('\n');
            quill.root.innerHTML = combinedNotes; // Set notes as HTML in Quill editor
            editorDiv.dataset.context = context; // Store the context
            console.log(`Notes loaded for context: ${context}`);
        } catch (error) {
            console.error('Error fetching notes:', error);
            quill.setText(''); // Clear editor on error
        }
    };

    // Save all notes in Quill to the backend
    const saveAllNotes = async () => {
        try {
            const context = editorDiv.dataset.context; // Get the current context
            if (!context) {
                throw new Error('Context is missing. Unable to save notes.');
            }

            const content = quill.root.innerHTML; // Get HTML content from Quill editor
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ notes: [content], context }), // Send notes as an array
            });

            if (!response.ok) {
                throw new Error(`Failed to update notes: ${response.statusText}`);
            }
            console.log('Notes updated successfully for context:', context);
        } catch (error) {
            console.error('Error updating notes:', error);
        }
    };

    // Listen for changes in the Quill editor and save notes
    quill.on('text-change', () => {
        saveAllNotes();
    });

    // Handle context updates from the main process
    ipcRenderer.on('update-context', async (event, context) => {
        console.log(`Context updated to: ${context}`);

        if (isLocked) {
            console.log(`Notes are locked to context: ${lastLockedContext}. Ignoring updates.`);
            return;
        }

        if (ignoredTitles.some((title) => context.includes(title))) {
            console.warn(`Ignored context detected: ${context}. Falling back to last valid context.`);
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
            lastValidContext = context;
        } else if (lastValidContext) {
            console.warn('Current context unavailable. Falling back to last valid context.');
            await fetchNotes(lastValidContext);
        } else {
            console.error('No valid context available.');
            quill.setText('');
        }
    });

    // Add lock button functionality
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

    // Load initial notes
    const initialContext = 'default';
    fetchNotes(initialContext);
});