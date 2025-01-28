import { activeWindow } from 'get-windows';

const options = {
    accessibilityPermission: true,
    screenRecordingPermission: true,
};

activeWindow(options).then(window => {
    console.log('Active Window:', window);
}).catch(error => {
    console.error('Error:', error);
});
/**
 * Fetches the current active window's context.
 * @returns {Promise<string>} The context of the active window (URL or title).
 */
export async function getActiveAppContext() {
    try {
        const activeWin = await activeWindow();
        if (activeWin) {
            // Prioritize URL if available, fallback to title
            return activeWin.url || activeWin.title || 'Unknown';
        }
        return 'Unknown';
    } catch (error) {
        if (error.stdout && error.stdout.includes('requires the screen recording permission')) {
            console.error(
                'Screen Recording permission is required for get-windows. Please enable it in System Settings > Privacy & Security > Screen Recording.'
            );
        } else {
            console.error('Error fetching active window context:', error);
        }
        return 'Error retrieving context'; // Fallback in case of failure
    }
}
/**
 * Compares two contexts to see if they are different.
 * @param {string} prevContext - The previous context.
 * @param {string} currentContext - The current context.
 * @returns {boolean} Whether the contexts differ.
 */
export function isContextChanged(prevContext, currentContext) {
    return prevContext !== currentContext;
}