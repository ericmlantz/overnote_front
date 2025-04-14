const backendPort = window.electron?.backendPort || '8000';
const BACKEND_BASE_URL = `http://127.0.0.1:${backendPort}`;
let quillInstances = {};
let contextList = [];
let isAlwaysOnTop = false; // Added variable to track always on top state

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('contexts');
  contextList = await fetchAllNotes();

  renderContexts(container, contextList);
});

// IPC listener for updating always on top state
ipcRenderer.on('update-always-on-top', (event, isOnTop) => {
  isAlwaysOnTop = isOnTop;
  const alwaysOnTopButton = document.getElementById('always-on-top-button');
  if (alwaysOnTopButton) {
    alwaysOnTopButton.textContent = `Always on Top: ${isOnTop ? 'On' : 'Off'}`;
  }
});

// Fetch all notes
async function fetchAllNotes() {
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/all-notes`);
    if (!response.ok) throw new Error('Failed to fetch all notes');
    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching all notes:', error);
    return [];
  }
}

// Save note for a context
async function saveNotes(context, htmlContent) {
  try {
    const cleanedContent = htmlContent.trim();

    if (cleanedContent === '' || ['<p><br></p>', '<p><br/></p>', '<p></p>'].includes(cleanedContent)) {
      console.log(`🗑 Deleting empty note for context: ${context}`);
      await fetch(`${BACKEND_BASE_URL}/api/notes/delete-context/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      removeContextCard(context);
      return;
    }

    const requestData = JSON.stringify({ notes: [cleanedContent], context });

    const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: requestData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update notes: ${errorText}`);
    }

    console.log(`✅ Notes saved successfully for context: ${context}`);
    // Update the in-memory contextList so we don't re-render stale notes
    const updatedContext = contextList.find(c => c.context === context);
    if (updatedContext) {
      updatedContext.notes = [{ content: htmlContent }];
    }
  } catch (error) {
    console.error("❌ Error saving notes:", error);
  }
}

function renderContexts(container, contexts) {
  container.innerHTML = '';

  const editorElement = document.getElementById('quill-editor');
  const contextLabel = document.getElementById('current-context');

  const quill = new Quill(editorElement, {
    theme: 'snow',
    placeholder: 'Select a context to view notes...',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'blockquote', 'code-block'],
        ['clean']
      ]
    }
  });

  let currentContext = '';
  let saveTimeout;

  contexts.forEach((contextObj) => {
    const li = document.createElement('li');
    li.classList.add('context-item');
    li.textContent = contextObj.context;
    li.dataset.context = contextObj.context;

    li.addEventListener('click', () => {
      // Save existing note before switching
      if (currentContext) {
        const existingContent = quill.root.innerHTML;
        saveNotes(currentContext, existingContent); // Save immediately without waiting
      }

      // Highlight selected context
      document.querySelectorAll('.context-item').forEach(item => {
        item.classList.remove('selected');
      });
      li.classList.add('selected');

      currentContext = contextObj.context;
      contextLabel.textContent = currentContext;

      const notesHtml = contextObj.notes.map(n => n.content).join('');
      quill.root.innerHTML = notesHtml;

      quill.off('text-change');
      quill.on('text-change', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          const content = quill.root.innerHTML;
          saveNotes(currentContext, content);
        }, 500);
      });
    });

    container.appendChild(li);
  });

  // Always on Top button listener
  const alwaysOnTopButton = document.getElementById('always-on-top-button');
  if (alwaysOnTopButton) {
    alwaysOnTopButton.addEventListener('click', () => {
      ipcRenderer.send('request-toggle-always-on-top');
    });
  }
}

// Remove a card from DOM and update focus
function removeContextCard(context) {
  const card = document.querySelector(`[data-context="${context}"]`);
  if (card) {
    const previousCard = card.previousElementSibling;
    const nextCard = card.nextElementSibling;
    card.remove();

    const targetCard = previousCard || nextCard;
    if (targetCard) {
      const targetContext = targetCard.dataset.context;
      const targetContextData = contextList.find(c => c.context === targetContext);

      if (targetContextData) {
        // Simulate click on the new context
        targetCard.click();
      }
    } else {
      // No remaining context cards
      document.getElementById('current-context').textContent = 'Select a context';
      const editorElement = document.querySelector('.ql-editor');
      if (editorElement) editorElement.innerHTML = '';
    }
  }
}