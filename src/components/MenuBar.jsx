import React from 'react';

const MenuBar = () => {
    const handleShowNotes = () => {
        window.electron.ipcRenderer.send('show-notes');
    };

    const handleToggleOverlay = () => {
        window.electron.ipcRenderer.send('toggle-overlay');
    };

    return (
        <div>
            <button onClick={handleShowNotes}>Show Notes</button>
            <button onClick={handleToggleOverlay}>Toggle Overlay</button>
        </div>
    );
};

export default MenuBar;