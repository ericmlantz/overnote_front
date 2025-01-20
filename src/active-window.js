const activeWin = require('active-win');

let lastActiveContext = 'Unknown Context'; // Cache for the last successful context

async function getActiveAppContext() {
    try {
        const activeWindow = await activeWin();
        if (activeWindow) {
            const { title, url, owner } = activeWindow;

            // Ignore Electron app itself
            if (owner.name === 'Electron') {
                return 'Notes Window';
            }
            // Use the title or app name
            // return title || owner.name || 'Unknown Context';
            lastActiveContext = url || title || 'Unknown Context';
            return lastActiveContext
        }
        return 'lastActiveContext';
    } catch (error) {
        console.error('Error fetching active window context:', error.message);
        return lastActiveContext;
    }
}

module.exports = { getActiveAppContext };