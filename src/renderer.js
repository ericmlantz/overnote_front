const { ipcRenderer } = require('electron');

ipcRenderer.on('show-notes', () => {
    console.log('Show notes triggered');
    // Call backend API to fetch notes and display them
});

ipcRenderer.on('toggle-overlay', () => {
    console.log('Toggle overlay triggered');
    // Open the overlay window or hide it
});