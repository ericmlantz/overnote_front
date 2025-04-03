// =======================
// 🔧 Renderer Setup
// =======================
const Quill = window.Quill;
const ipcRenderer = window.electron.ipcRenderer;
const BACKEND_BASE_URL = 'http://127.0.0.1:8000';

// App state flags
let isLocked = false;
let lastLockedContext = null;
let lastValidContext = null;
let isProgrammaticChange = false; // Prevents looped updates from fetch -> save

// Contexts to ignore
const ignoredTitles = ['History', 'Downloads', 'Settings', 'New Tab'];
const notesMap = new Map(); // Cache for notes per context

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🟢 Renderer process loaded.');

  // =======================
  // ✏️ Editor Initialization
  // =======================
  const quillEditor = document.getElementById('quill-editor');
  const editorDiv = document.createElement('div');
  editorDiv.id = 'quill-editor';
  quillEditor.appendChild(editorDiv);

  const quill = new Quill('#quill-editor', {
    theme: 'snow',
    placeholder: 'Write your notes here...',
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

  // =======================
  // 📥 Fetch Notes
  // =======================
  const fetchNotes = async (context) => {
    try {
      isProgrammaticChange = true;
      quill.setText('');
      editorDiv.dataset.context = context;

      const response = await fetch(`${BACKEND_BASE_URL}/api/notes?context=${encodeURIComponent(context)}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`⚠️ No notes found for context: ${context}`);
          return;
        }
        throw new Error(`Failed to fetch notes: ${response.statusText}`);
      }

      const notes = await response.json();
      console.log('🔎 Fetched notes:', notes);

      const combinedNotes = notes.map(note => note.content).join('');
      quill.root.innerHTML = combinedNotes;

      setTimeout(() => { isProgrammaticChange = false; }, 200);
      lastValidContext = context;
    } catch (error) {
      console.error('❌ Error fetching notes:', error);
    }
  };

  // =======================
  // 💾 Save Notes
  // =======================
  const saveAllNotes = async (allContent) => {
    try {
      const context = editorDiv.dataset.context;
      if (!context) throw new Error('❌ Context is missing. Unable to save notes.');

      const htmlContent = allContent[0]?.trim();
      const payload = JSON.stringify({ notes: [htmlContent], context });

      const response = await fetch(`${BACKEND_BASE_URL}/api/notes/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update notes: ${errorText}`);
      }

      console.log(`✅ Notes updated for context: ${context}`);
    } catch (error) {
      console.error('❌ Error saving notes:', error);
    }
  };

  // =======================
  // 🗑 Delete Empty Context
  // =======================
  const maybeDeleteContext = async (context) => {
    const content = quill.root.innerHTML.trim();
    const isEmpty = !content || ['<p><br></p>', '<p><br/></p>', '<p></p>'].includes(content);

    if (isEmpty) {
      console.log(`🗑 maybeDeleteContext: '${context}' is empty. Deleting...`);
      await fetch(`${BACKEND_BASE_URL}/api/notes/delete-context/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      notesMap.delete(context);
    }
  };

  // =======================
  // 🖊 Editor Change Listener
  // =======================
  let saveTimeout;
  quill.on('text-change', () => {
    if (isProgrammaticChange) return;

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const content = quill.root.innerHTML.trim();
      saveAllNotes([content]);
    }, 500); // Debounce
  });

  // =======================
  // 🔄 IPC Context Update
  // =======================
  ipcRenderer.on('update-context', async (_event, context) => {
    console.log(`📡 Context updated to: ${context}`);
    await maybeDeleteContext(editorDiv.dataset.context);

    if (isLocked) {
      console.log(`🔒 Notes locked to context: ${lastLockedContext}`);
      return;
    }

    if (ignoredTitles.some(title => context.includes(title))) {
      console.warn(`🚫 Ignored context detected: ${context}`);
      if (lastValidContext) {
        await fetchNotes(lastValidContext);
      } else {
        console.error('⚠️ No valid context to fall back to.');
        quill.setText('');
      }
      return;
    }

    if (context && context !== 'Error retrieving context') {
      await fetchNotes(context);
    } else if (lastValidContext) {
      console.warn('⚠️ Fallback to last valid context.');
      await fetchNotes(lastValidContext);
    } else {
      quill.setText('');
    }
  });

  // =======================
  // 🔐 Lock Button
  // =======================
  const lockButton = document.getElementById('lock-button');
  lockButton.addEventListener('click', async () => {
    isLocked = !isLocked;

    if (isLocked) {
      lastLockedContext = editorDiv.dataset.context;
      lockButton.textContent = `Locked on ${lastLockedContext}`;
      console.log(`🔒 Notes locked to context: ${lastLockedContext}`);
    } else {
      lastLockedContext = null;
      lockButton.textContent = 'Lock';
      console.log('🔓 Notes unlocked. Resuming updates.');

      try {
        quill.setText('');
        const currentContext = await ipcRenderer.invoke('get-current-context');
        if (currentContext) {
          await fetchNotes(currentContext);
          lastValidContext = currentContext;
        } else {
          console.warn('⚠️ No context available after unlock.');
          quill.setText('');
        }
      } catch (error) {
        console.error('❌ Error unlocking and updating context:', error);
      }
    }
  });

  // =======================
  // 📌 Always on Top Button
  // =======================
  const alwaysOnTopButton = document.getElementById('always-on-top-button');
  let isAlwaysOnTop = true;
  alwaysOnTopButton.addEventListener('click', () => {
    isAlwaysOnTop = !isAlwaysOnTop;
    ipcRenderer.send('toggle-always-on-top', isAlwaysOnTop);
    alwaysOnTopButton.textContent = `Always on Top: ${isAlwaysOnTop ? 'On' : 'Off'}`;
  });

  // =======================
  // 🚀 Initial Context Load
  // =======================
  try {
    const initialContext = await ipcRenderer.invoke('get-current-context');
    if (initialContext) {
      await fetchNotes(initialContext);
      lastValidContext = initialContext;
    } else {
      console.warn('⚠️ No valid context available on load.');
    }
  } catch (error) {
    console.error('❌ Failed to fetch initial context:', error);
  }

  // =======================
  // ❌ Cleanup on Close
  // =======================
  window.addEventListener('beforeunload', async () => {
    const context = editorDiv.dataset.context;
    if (context) await maybeDeleteContext(context);
  });
});