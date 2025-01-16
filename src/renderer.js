const ipcRenderer = window.electron.ipcRenderer;
const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

let isLocked = false; // Track the lock state
let lastLockedContext = null; // Store the locked context
let lastValidContext = null; // Store the last valid context
const ignoredTitles = ["History", "Downloads", "Settings", "New Tab"];

document.addEventListener('DOMContentLoaded', () => {
    const notesContainer = document.getElementById('notes-container');

    // Create a textarea for notes
    const textarea = document.createElement('textarea');
    textarea.id = 'all-notes';
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    textarea.placeholder = 'Write your notes here...';
    notesContainer.appendChild(textarea);

    // Fetch notes from the backend
    const fetchNotes = async (context) => {
        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
            );
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`No existing notes found for context: ${context}`);
                    textarea.value = ''; // Initialize with an empty value for new contexts
                    textarea.dataset.context = context;
                    return;
                }
                throw new Error(`Failed to fetch notes: ${response.statusText}`);
            }

            const notes = await response.json();
            const combinedNotes = notes.map((note) => note.content).join('\n');
            textarea.value = combinedNotes;
            textarea.dataset.context = context;
            console.log(`Notes loaded for context: ${context}`);
        } catch (error) {
            console.error('Error fetching notes:', error);
            textarea.value = '';
        }
    };

    // Save notes to the backend
    const saveAllNotes = async (allContent) => {
        try {
            const context = textarea.dataset.context;
            if (!context) {
                throw new Error('Context is missing. Unable to save notes.');
            }

            const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ notes: allContent.split('\n'), context }),
            });

            if (!response.ok) {
                throw new Error(`Failed to update notes: ${response.statusText}`);
            }
            console.log('Notes updated successfully for context:', context);
        } catch (error) {
            console.error('Error updating notes:', error);
        }
    };

    // Handle textarea input events
    textarea.addEventListener('input', () => {
        const currentContent = textarea.value;
        saveAllNotes(currentContent);
    });

    // Handle context updates
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
                textarea.value = '';
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
            textarea.value = '';
        }
    });

    // Add lock button functionality
    const lockButton = document.getElementById('lock-button');
    lockButton.addEventListener('click', async () => {
        isLocked = !isLocked;
        if (isLocked) {
            lastLockedContext = textarea.dataset.context;
            lockButton.textContent = 'Unlock';
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
    const initialContext = 'default'; // Adjust as necessary
    fetchNotes(initialContext);
});