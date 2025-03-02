const BACKEND_BASE_URL = 'http://127.0.0.1:8000';
const MAX_CONTEXT_LENGTH = 50; // Maximum character length before replacing with title

let pendingDelete = false; // Flag to prevent saving immediately after deletion
let quill = null;
let currentContext = null;
let allContexts = [];

document.addEventListener('DOMContentLoaded', async () => {
  const contextList = document.getElementById('contexts');
  const quillEditorContainer = document.getElementById('quill-editor');
  const currentContextDisplay = document.getElementById('current-context');

  // Initialize Quill
  const initializeQuill = () => {
    quill = new Quill(quillEditorContainer, {
      theme: 'snow',
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

    // Add listener for text changes
    quill.on(
      'text-change',
      debounce(async () => {
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
            pendingDelete = true;

            try {
              const response = await fetch(`${BACKEND_BASE_URL}/api/context/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context: currentContext.context }),
              });

              if (!response.ok) throw new Error(`Failed to delete context: ${response.statusText}`);

              console.log(`Context '${currentContext.context}' deleted successfully.`);
              currentContext = null;
            } catch (error) {
              console.error(`Error deleting context '${currentContext.context}':`, error);
            }

            await fetchAllNotes();
            pendingDelete = false;
          }
        } else {
          console.warn('No context selected. Changes not saved.');
        }
      }, 500)
    );
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

        const response = await fetch(`${BACKEND_BASE_URL}/api/notes/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                context,
                notes: [cleanedContent], // Save only the cleaned-up content
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to save notes: ${response.statusText}`);
        }

        console.log(`✅ Notes saved successfully for context: ${context}`);
    } catch (error) {
        console.error('❌ Error saving notes:', error);
    }
};

  const fetchAllNotes = async () => {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/all-notes`);
      if (!response.ok) throw new Error(`Failed to fetch all notes: ${response.statusText}`);

      allContexts = await response.json();
      await renderContextList(allContexts);
    } catch (error) {
      console.error('Error fetching all notes:', error);
    }
  };

  const fetchNotesForContext = async (contextName) => {
    if (!contextName) {
        console.error('❌ Context name is undefined.');
        return;
    }

    try {
        console.log(`📥 Fetching notes for context: '${contextName}'`);
        const response = await fetch(`${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(contextName)}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch notes for context: ${response.statusText}`);
        }

        let notes = await response.json();
        console.log(`🔎 Retrieved notes:`, notes);

        quill.setText(''); // Clear editor before inserting

        let combinedNotes = notes.map((note) => note.content).join('');

        // Apply strict normalization before inserting
        combinedNotes = normalizeHtmlContent(combinedNotes);

        console.log('📝 Setting Quill editor content:', combinedNotes);
        quill.root.innerHTML = combinedNotes; // Use innerHTML instead of dangerouslyPasteHTML
    } catch (error) {
        console.error('❌ Error fetching notes for context:', error);
        quill.setContents([]);
    }
};

  const fetchPageTitle = async (url) => {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/get-page-title?context=${encodeURIComponent(url)}`);
      const data = await response.json();
      return data.title || url;
    } catch (error) {
      console.error(`Error fetching title for ${url}:`, error);
      return url;
    }
  };

const normalizeHtmlContent = (htmlContent) => {
    // Prevent auto-accumulation of empty paragraphs while preserving user-added ones
    let cleanedContent = htmlContent.replace(/(<p><br><\/p>\s*){3,}/g, '<p><br></p>');

    // Remove multiple <p><br></p> that appear directly before <pre>, allowing at most one
    cleanedContent = cleanedContent.replace(/(<p><br><\/p>\s*)+(?=<pre>)/g, '<p><br></p>');

    // Ensure at most one <p><br></p> follows a <pre> tag, but **do not add one automatically**
    cleanedContent = cleanedContent.replace(/(?<=<\/pre>\s*)(<p><br><\/p>\s*)+/g, '<p><br></p>');

    return cleanedContent.trim();
};

  const renderContextList = async (contexts) => {
    contextList.innerHTML = '';

    for (const context of contexts) {
      let displayName = context.context;

      if (displayName.length > MAX_CONTEXT_LENGTH) {
        displayName = await fetchPageTitle(context.context);
      }

      const listItem = document.createElement('li');
      listItem.textContent = displayName;
      listItem.className = 'context-item';
      listItem.dataset.contextId = context.context;
      listItem.title = displayName;

      listItem.addEventListener('click', async () => {
        console.log(`📥 Fetching notes for selected context: ${context.context}`);
      
        if (currentContext) {
          await saveNotes(currentContext.context, quill.root.innerHTML);
        }
      
        const selected = document.querySelector('.context-item.selected');
        if (selected) selected.classList.remove('selected');
        listItem.classList.add('selected');
      
        // ✅ Set currentContext first before using it
        currentContext = context;
      
        // ✅ Ensure the link is properly updated
        if (currentContext && currentContext.context) {
          currentContextDisplay.textContent = displayName;
          currentContextDisplay.href = currentContext.context.startsWith('http')
            ? currentContext.context
            : `https://${currentContext.context}`;
        } else {
          console.error("❌ Error: currentContext is null or undefined.");
        }
      
        await fetchNotesForContext(context.context);
      });

      contextList.appendChild(listItem);
    }
  };

  initializeQuill();
  await fetchAllNotes();
});