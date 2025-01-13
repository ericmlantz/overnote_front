const activeWin = require('active-win');

async function getActiveAppContext() {
    try {
        const result = await activeWin();
        if (result) {
            const { title, owner } = result;
            // Ignore Electron app itself
            if (owner.name === 'Electron') {
                return 'Notes Window';
            }
            // Use the title or app name
            return title || owner.name || 'Unknown Context';
        }
        return 'Unknown Context';
    } catch (error) {
        console.error('Error fetching active window context:', error.message);
        return 'Error retrieving context';
    }
}

module.exports = { getActiveAppContext };