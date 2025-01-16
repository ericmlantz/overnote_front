const ipcRenderer = window.electron.ipcRenderer;
const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

let lastValidContext = null; // Store the last valid context
const ignoredTitles = ["History", "Downloads", "Settings", "New Tab"]; // Add titles or patterns to ignore
let previousContent = ''; // Track the previous state of the textarea

document.addEventListener('DOMContentLoaded', () => {
    const notesContainer = document.getElementById('notes-container');

    // Create a single textarea for all notes
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Write new notes here...';
    textarea.id = 'all-notes';
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    textarea.style.resize = 'none'; // Prevent resizing for a cleaner UI
    notesContainer.appendChild(textarea);

    // Fetch notes from the backend for the given context
    const fetchNotes = async (context) => {
        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
            );
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`No existing notes found for context: ${context}`);
                    textarea.value = ''; // Initialize with an empty value for new contexts
                    textarea.dataset.context = context; // Ensure context is set
                    return;
                }
                throw new Error(`Failed to fetch notes: ${response.statusText}`);
            }
    
            const notes = await response.json();
    
            // Combine all notes into a single string
            const combinedNotes = notes.map((note) => note.content).join('\n');
            textarea.value = combinedNotes;
    
            // Store the current context in the textarea for later use
            textarea.dataset.context = context;
            console.log(`Notes loaded for context: ${context}`);
        } catch (error) {
            console.error('Error fetching notes:', error);
            textarea.value = ''; // Clear notes if fetch fails
        }
    };
    // const fetchNotes = async (context) => {
    //     try {
    //         const response = await fetch(
    //             `${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`
    //         );
    //         if (!response.ok) {
    //             throw new Error(`Failed to fetch notes: ${response.statusText}`);
    //         }
    //         const notes = await response.json();

    //         // Combine all notes into a single string
    //         const combinedNotes = notes.map((note) => note.content).join('\n');
    //         textarea.value = combinedNotes;

    //         // Store the current context in the textarea for later use
    //         textarea.dataset.context = context;

    //         // Update the last valid context and the previous content
    //         lastValidContext = context;
    //         previousContent = combinedNotes;
    //     } catch (error) {
    //         console.error('Error fetching notes:', error);
    //     }
    // };

    // Save all notes in real-time when the textarea is modified
    const saveAllNotes = async (allContent) => {
        try {
            console.log('saveAllNotes called with content:', allContent); // Debug log
    
            const context = textarea.dataset.context; // Get the current context
            if (!context) {
                throw new Error('Context is missing. Unable to save notes.');
            }
    
            // Send the full textarea content to replace all notes for the current context
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
    // const saveAllNotes = async (allContent) => {
    //     try {
    //         const context = textarea.dataset.context; // Use a dataset attribute to store the current context
    //         if (!context) {
    //             throw new Error('Context is missing. Unable to save notes.');
    //         }
    
    //         const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
    //             method: 'PUT',
    //             headers: {
    //                 'Content-Type': 'application/json',
    //             },
    //             body: JSON.stringify({ notes: allContent, context }), // Send the entire content as an array of lines
    //         });
    
    //         if (!response.ok) {
    //             throw new Error(`Failed to update notes: ${response.statusText}`);
    //         }
    //         console.log('Notes updated successfully for context:', context);
    //     } catch (error) {
    //         console.error('Error updating notes:', error);
    //     }
    // };

    // Add an event listener to handle textarea input changes
    textarea.addEventListener('input', () => {
        const currentContent = textarea.value;
    
        // Save the entire textarea content to the backend
        saveAllNotes(currentContent.split('\n')); // Split content into lines and save
    });

    // Listen for context updates from the main process
    ipcRenderer.on('update-context', async (event, context) => {
        console.log(`Context updated to: ${context}`);

        // Check if the context is in the ignored list
        if (ignoredTitles.some((title) => context.includes(title))) {
            console.warn(`Ignored context detected: ${context}. Falling back to last valid context.`);
            if (lastValidContext) {
                await fetchNotes(lastValidContext); // Use the last valid context
            } else {
                console.error('No valid context to fall back to.');
                textarea.value = ''; // Clear notes if no valid context exists
            }
            return;
        }

        // If the context is valid, fetch notes for it
        if (context && context !== 'Error retrieving context') {
            await fetchNotes(context); // Fetch notes for the new context
        } else if (lastValidContext) {
            // If no valid context, fallback to the last valid one
            console.warn('Current context unavailable. Falling back to last valid context.');
            await fetchNotes(lastValidContext);
        } else {
            console.error('No valid context available.');
            textarea.value = ''; // Clear notes if no valid context exists
        }
    });

    // Load initial notes
    const initialContext = 'default'; // Replace with actual logic to determine the default context
    fetchNotes(initialContext);
});