const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

document.addEventListener('DOMContentLoaded', async () => {
    const contextList = document.getElementById('contexts');
    const quillEditorContainer = document.getElementById('quill-editor');
    const currentContextDisplay = document.getElementById('current-context'); // Header element

    let quill = null; // Quill instance
    let currentContext = null; // Currently selected context
    let allContexts = [];

    // Debounce function to limit API calls
    const debounce = (func, delay) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func(...args), delay);
        };
    };

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

        // Add listener for content changes
        quill.on('text-change', debounce(async () => {
            if (!currentContext) {
                console.warn('No context selected. Skipping save.');
                return;
            }

            const htmlContent = quill.root.innerHTML.trim(); // Get Quill's HTML content
            console.log(`Auto-saving notes for context: ${currentContext.context}`);
            await saveNotes(currentContext.context, htmlContent);
        }, 500)); // Debounce time in milliseconds
    };

    // Save notes to the backend
    const saveNotes = async (context, content) => {
        try {
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
            listItem.addEventListener('click', () => {
                // Highlight the selected context
                const selected = document.querySelector('.context-item.selected');
                if (selected) selected.classList.remove('selected');
                listItem.classList.add('selected');

                // Display the notes for the selected context
                displayNotes(context);
            });

            contextList.appendChild(listItem);
        });
    };

    // Display notes for a selected context in the Quill editor
    const displayNotes = (context) => {
        currentContext = context; // Set the current context
        currentContextDisplay.textContent = context.context; // Update the header

        quill.setContents([]); // Clear the editor

        // Populate the Quill editor with the context's notes
        if (context.notes.length > 0) {
            const combinedNotes = context.notes.map((note) => note.content).join('<br>');
            quill.clipboard.dangerouslyPasteHTML(combinedNotes);
        } else {
            quill.setText(''); // Clear the editor if no notes exist
        }
    };

    // Initialize and fetch all notes on page load
    initializeQuill();
    fetchAllNotes();
});