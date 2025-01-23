const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

document.addEventListener('DOMContentLoaded', async () => {
    const contextList = document.getElementById('contexts');
    const quillEditorContainer = document.getElementById('quill-editor');
    const currentContextDisplay = document.getElementById('current-context'); // Header element

    let quill = null; // Quill instance
    let currentContext = null; // Currently selected context
    let allContexts = []; // Stores all contexts fetched from the backend

    // Initialize Quill
    const initializeQuill = () => {
        quill = new Quill(quillEditorContainer, {
            theme: 'snow',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'], // Formatting options
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['link'],
                ],
            },
        });

        // Add listener for text changes
        quill.on('text-change', debounce(async () => {
            if (currentContext) {
                const htmlContent = quill.root.innerHTML.trim(); // Get the content
                console.log(`Saving notes for context: ${currentContext.context}`);
                await saveNotes(currentContext.context, htmlContent); // Save changes
            } else {
                console.warn('No context selected. Changes not saved.');
            }
        }, 500)); // Debounce to limit excessive calls
    };

    // Debounce function
    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    };

    // Save notes to the backend
    const saveNotes = async (context, content) => {
        try {
            console.log(`Attempting to save notes for context: ${context}`);
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    context,
                    notes: [content], // Save as a single combined note
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to save notes: ${response.statusText}`);
            }

            console.log(`Notes saved successfully for context: ${context}`);
        } catch (error) {
            console.error('Error saving notes:', error);
        }
    };

    // Fetch all contexts and notes
    const fetchAllNotes = async () => {
        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/all-notes`);
            if (!response.ok) {
                throw new Error(`Failed to fetch all notes: ${response.statusText}`);
            }
            allContexts = await response.json();
            renderContextList(allContexts);
        } catch (error) {
            console.error('Error fetching all notes:', error);
        }
    };

    // Fetch notes for a specific context
    const fetchNotesForContext = async (contextName) => {
        try {
            console.log(`Fetching notes for context: ${contextName}`);
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(contextName)}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch notes for context: ${response.statusText}`);
            }

            const notes = await response.json();
            console.log(`Fetched notes for context: ${contextName}`, notes);

            // Populate the Quill editor with the fetched notes
            const combinedNotes = notes.map((note) => note.content).join('<br>');
            quill.clipboard.dangerouslyPasteHTML(combinedNotes);
        } catch (error) {
            console.error('Error fetching notes for context:', error);
        }
    };

    // Render the list of contexts
    const renderContextList = (contexts) => {
        contextList.innerHTML = ''; // Clear the list

        contexts.forEach((context) => {
            const listItem = document.createElement('li');
            listItem.textContent = context.context; // Display the context name
            listItem.className = 'context-item';
            listItem.dataset.contextId = context.context;

            // Add a tooltip containing the full context name
            listItem.title = context.context;

            // Handle click to display notes
            listItem.addEventListener('click', async () => {
                if (currentContext) {
                    const htmlContent = quill.root.innerHTML.trim();
                    console.log(`Saving notes for context: ${currentContext.context}`);
                    await saveNotes(currentContext.context, htmlContent); // Save the current notes
                }

                // Highlight the selected context
                const selected = document.querySelector('.context-item.selected');
                if (selected) selected.classList.remove('selected');
                listItem.classList.add('selected');

                // Fetch and display the notes for the selected context
                currentContext = context; // Update the current context
                currentContextDisplay.textContent = context.context; // Update the header
                await fetchNotesForContext(context.context);
            });

            contextList.appendChild(listItem);
        });
    };

    // Initialize Quill and fetch all notes on page load
    initializeQuill();
    await fetchAllNotes();
});