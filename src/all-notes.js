const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

let pendingDelete = false; // Flag to prevent saving immediately after deletion

document.addEventListener('DOMContentLoaded', async () => {
    const contextList = document.getElementById('contexts');
    const quillEditorContainer = document.getElementById('quill-editor');
    const currentContextDisplay = document.getElementById('current-context');

    let quill = null;
    let currentContext = null;
    let allContexts = [];

    // Initialize Quill
    const initializeQuill = () => {
        quill = new Quill(quillEditorContainer, {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['link', 'blockquote', 'code-block',],
                    ['clean']
                ],
            },
        });

        // Add listener for text changes
        quill.on('text-change', debounce(async () => {
            if (pendingDelete) {
                console.log('Skipping save due to pending delete.');
                return;
            }

            if (currentContext) {
                const htmlContent = quill.root.innerHTML.trim();

                console.log(`Saving notes for context: ${currentContext.context}`);
                await saveNotes(currentContext.context, htmlContent);

                // If the note is empty or placeholder, delete the context and refresh the context list
                if (htmlContent === '' || htmlContent === '<p><br></p>') {
                    console.log(`Note for context '${currentContext.context}' is empty. Deleting context...`);

                    // Set pendingDelete to true to prevent immediate resaving
                    pendingDelete = true;

                    try {
                        // Call the delete endpoint for the current context
                        const response = await fetch(`${BACKEND_BASE_URL}/api/context/delete`, {
                            method: 'DELETE',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ context: currentContext.context }),
                        });

                        if (!response.ok) {
                            throw new Error(`Failed to delete context: ${response.statusText}`);
                        }

                        console.log(`Context '${currentContext.context}' deleted successfully.`);
                        currentContext = null; // Reset the current context
                    } catch (error) {
                        console.error(`Error deleting context '${currentContext.context}':`, error);
                    }

                    await fetchAllNotes(); // Refresh the context list after deletion
                    pendingDelete = false; // Reset pendingDelete after deletion and refresh
                }
            } else {
                console.warn('No context selected. Changes not saved.');
            }
        }, 500)); // Debounce to limit excessive calls
    };

    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    };

    const saveNotes = async (context, content) => {
        try {
            if (pendingDelete) {
                console.log('Save aborted due to pending delete.');
                return;
            }

            console.log(`Attempting to save notes for context: ${context}`);

            const cleanedContent = normalizeHtmlContent(content);
            
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    context,
                    notes: [cleanedContent], // Save the cleaned-up content
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

    // Clean up HTML content while preserving user-added blank lines
    const normalizeHtmlContent = (htmlContent) => {
    return htmlContent
        .replace(/<p><br><\/p>(\s*<p><br><\/p>)+/g, '<p><br></p>') // Collapse multiple blank lines into one
        .trim(); // Remove leading and trailing whitespace
    };

    const fetchNotesForContext = async (contextName) => {
        if (!contextName) {
            console.error("❌ Context name is undefined.");
            return;
        }
    
        try {
            console.log(`📥 Fetching notes for context: '${contextName}'`);
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(contextName)}`);
    
            if (!response.ok) {
                throw new Error(`Failed to fetch notes for context: ${response.statusText}`);
            }
    
            const notes = await response.json();
            console.log(`🔎 Retrieved notes:`, notes);
    
            // ✅ Clear editor before updating to prevent duplication
            quill.setText('');
    
            const combinedNotes = notes.map((note) => note.content).join('');
            console.log("📝 Setting Quill editor content:", combinedNotes);
            quill.clipboard.dangerouslyPasteHTML(combinedNotes);
    
        } catch (error) {
            console.error("❌ Error fetching notes for context:", error);
            quill.setContents([]); // Clear editor on error
        }
    };
 
    const renderContextList = (contexts) => {
        contextList.innerHTML = '';

        contexts.forEach((context) => {
            const listItem = document.createElement('li');
            listItem.textContent = context.context;
            listItem.className = 'context-item';
            listItem.dataset.contextId = context.context;

            listItem.title = context.context;

            listItem.addEventListener('click', async () => {
                if (pendingDelete) {
                    console.log('Skipping save due to pending delete.');
                    return;
                }

                if (currentContext) {
                    const htmlContent = quill.root.innerHTML.trim();
                    console.log(`Saving notes for context: ${currentContext.context}`);
                    await saveNotes(currentContext.context, htmlContent);
                }

                const selected = document.querySelector('.context-item.selected');
                if (selected) selected.classList.remove('selected');
                listItem.classList.add('selected');

                currentContext = context;
                currentContextDisplay.textContent = context.context;
                await fetchNotesForContext(context.context);
            });

            contextList.appendChild(listItem);
        });
    };

    initializeQuill();
    await fetchAllNotes();
});