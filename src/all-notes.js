const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

document.addEventListener('DOMContentLoaded', async () => {
    const contextList = document.getElementById('context-list');
    const notesContainer = document.getElementById('notes-container');
    const searchBar = document.getElementById('search-bar');

    let allContexts = [];

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
            const item = document.createElement('div');
            item.textContent = context.context;
            item.className = 'context-item';
            item.addEventListener('click', () => displayNotes(context));
            contextList.appendChild(item);
        });
    };

    // Display notes for a selected context
    const displayNotes = (context) => {
        notesContainer.innerHTML = ''; // Clear the notes container
        context.notes.forEach((note) => {
            const noteDiv = document.createElement('div');
            noteDiv.contentEditable = true; // Allow editing
            noteDiv.textContent = note.content;
            noteDiv.dataset.noteId = note.id; // Store note ID for reference

            // Save changes on input
            noteDiv.addEventListener('input', async () => {
                const updatedContent = noteDiv.textContent.trim();
            
                if (updatedContent === '') {
                    await deleteNote(context.context, note.id);
                
                    // Check if all notes are cleared for the context
                    const remainingNotes = context.notes.filter((note) => note.id !== note.id);
                    if (remainingNotes.length === 0) {
                        await deleteAllNotesForContext(context.context);
                        await fetchAllNotes();
                    } else {
                        displayNotes(allContexts.find((c) => c.context === context.context));
                    }
                }
            });

            notesContainer.appendChild(noteDiv);
        });
    };

    // Update a note dynamically
    const updateNote = async (context, noteId, content) => {
        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ context, noteId, content }),
            });

            if (!response.ok) {
                throw new Error(`Failed to update note: ${response.statusText}`);
            }

            console.log('Note updated successfully');
        } catch (error) {
            console.error('Error updating note:', error);
        }
    };

    // Delete a note
    const deleteNote = async (context, noteId) => {
        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes/delete`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ context, noteId }),
            });

            if (!response.ok) {
                throw new Error(`Failed to delete note: ${response.statusText}`);
            }

            console.log('Note deleted successfully');
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    };

    // Filter contexts based on the search input
    searchBar.addEventListener('input', (e) => {
        const searchValue = e.target.value.toLowerCase();
        const filteredContexts = allContexts.filter((context) =>
            context.context.toLowerCase().includes(searchValue)
        );
        renderContextList(filteredContexts);
    });

    // Refresh notes on window close
    window.addEventListener('beforeunload', async () => {
        console.log('Refreshing notes before closing.');
        await fetchAllNotes(); // Refresh notes for all contexts
    });

    const deleteAllNotesForContext = async (context) => {
        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ context, notes: [] }), // Send empty notes array
            });
    
            if (!response.ok) {
                throw new Error(`Failed to delete context: ${response.statusText}`);
            }
    
            console.log(`Context '${context}' deleted successfully`);
        } catch (error) {
            console.error('Error deleting context:', error);
        }
    };
    // Fetch all notes on page load
    fetchAllNotes();
});