import { ipcRenderer } from 'electron';
const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

let isLocked = false;
let lastLockedContext = null;
let lastValidContext = null;
const ignoredTitles = ['History', 'Downloads', 'Settings', 'New Tab'];

document.addEventListener('DOMContentLoaded', () => {
    console.log('Renderer process loaded.');

    const quillContainer = document.getElementById('quill-container'); // The parent div for the Quill editor

    // Initialize Quill editor
    const quill = new Quill('#quill-container', {
        theme: 'snow',
        placeholder: 'Write your notes here...',
        modules: {
            toolbar: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link', 'blockquote', 'code-block'],
                ['clean'],
            ],
        },
    });

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
                    quill.setText(''); // Clear the editor for empty contexts
                    quillContainer.dataset.context = context; // Update the editor's context
                    return;
                }
                throw new Error(`Failed to fetch notes: ${response.statusText}`);
            }

            const notes = await response.json();
            console.log('Fetched notes:', notes);

            const combinedNotes = notes.map((note) => note.content).join('');
            quill.root.innerHTML = combinedNotes; // Update the Quill editor
            quillContainer.dataset.context = context; // Store the current context
        } catch (error) {
            console.error('Error fetching notes:', error);
            quill.setText(''); // Clear the editor on error
        }
    };

    // Save notes when there are changes in the editor
    const saveAllNotes = async (allContent) => {
        try {
            const context = quillContainer.dataset.context; // Get the current context
            console.log('saveAllNotes called for context:', context);
            if (!context) {
                throw new Error('Context is missing. Unable to save notes.');
            }

            const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ notes: allContent, context }), // Send notes as an array
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
        const content = quill.root.innerHTML; // Get Quill content as HTML
        saveAllNotes([content]); // Pass the content as an array
    });

    // Handle context updates from the main process
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
                await fetchNotes(lastValidContext); // Use the last valid context
            } else {
                console.error('No valid context to fall back to.');
                quill.setText('');
            }
            return;
        }

        if (context && context !== 'Error retrieving context') {
            await fetchNotes(context); // Fetch notes for the new context
            lastValidContext = context; // Update the last valid context
        } else if (lastValidContext) {
            console.warn(
                'Current context unavailable. Falling back to last valid context.'
            );
            await fetchNotes(lastValidContext); // Fallback to the last valid context
        } else {
            console.error('No valid context available.');
            quill.setText(''); // Clear notes if no valid context exists
        }
    });

    // Add lock button functionality
    const lockButton = document.getElementById('lock-button');

    lockButton.addEventListener('click', async () => {
        isLocked = !isLocked; // Toggle the lock state

        if (isLocked) {
            // Lock the notes to the current context
            lastLockedContext = quillContainer.dataset.context; // Save the locked context
            lockButton.textContent = `Locked on ${lastLockedContext}`;
            console.log(`Notes locked to context: ${lastLockedContext}`);
        } else {
            // Unlock the notes and resume dynamic updates
            lastLockedContext = null;
            lockButton.textContent = 'Lock';
            console.log('Notes unlocked. Resuming dynamic updates.');

            // Immediately fetch notes for the current active context
            const currentContext = await ipcRenderer.invoke('get-current-context');
            console.log(
                `Fetching notes for current context after unlocking: ${currentContext}`
            );
            if (currentContext) {
                await fetchNotes(currentContext); // Refresh notes for the current context
            }
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
    const initialContext = 'default';
    fetchNotes(initialContext);
});