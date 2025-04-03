import { activeWindow } from 'get-windows';

/**
 * Detects and formats the active window's context (e.g., website, app, document, or search term).
 * This is used by Overnote to determine where annotations should be attached.
 */

let lastActiveContext = 'Unknown Context'; // Cache for last known good context

/**
 * Retrieves and formats the currently active window's context.
 * This could be a browser search, app name, document name, or fallback context.
 */
async function getActiveAppContext() {
  try {
    const { activeWindow } = await import('get-windows');
    const activeWin = await activeWindow();
    if (!activeWin) {
      console.warn('⚠️ No active window detected. Returning last known context.');
      return lastActiveContext;
    }

    const { title, url, owner } = activeWin;

    // ========================
    // ⛔ Ignore the Overnote app itself
    // ========================
    if (owner && owner.name === 'Electron') return 'Notes Window';

    // ========================
    // 📱 Special handling for Messages app
    // ========================
    if (owner?.name === 'Messages') {
      lastActiveContext = title;
      return lastActiveContext;
    }

    // ========================
    // 🌐 Search-based Sites
    // ========================
    let siteName = url
      ? new URL(url).hostname.replace('www.', '').split('.')[0]
      : 'Unknown';

    let searchQuery = '';

    if (url?.includes('google.com/search') || url?.includes('google.com/webhp')) {
      const match = title.match(/(.*?) - Google Search$/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (url?.includes('wikipedia.org') && title.includes('Search results')) {
      const match = title.match(/Search results for (.*?) - Wikipedia/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (url?.includes('youtube.com/results')) {
      const match = title.match(/"(.*?)" - YouTube/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (url?.includes('duckduckgo.com/')) {
      const match = title.match(/(.*?) at DuckDuckGo/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (url?.includes('bing.com/search')) {
      const match = title.match(/(.*?) - Bing/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (url?.includes('search.yahoo.com')) {
      const match = title.match(/(.*?) - Yahoo Search/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (url?.includes('amazon.com/s')) {
      const match = title.match(/Amazon.com : (.*?)/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (url?.includes('ebay.com/sch/')) {
      const match = title.match(/(.*?) | eBay/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (url?.includes('linkedin.com/search/results')) {
      const match = title.match(/(.*?) \| LinkedIn/);
      if (match?.[1]) searchQuery = match[1].trim();
    } else if (title.toLowerCase().includes('search')) {
      const match = title.match(/(.*?) - (.*)/);
      if (match?.[1]) searchQuery = match[1].trim();
    }

    // ========================
    // 🌐 Chrome-specific fallback
    // ========================
    if (owner?.name === 'Google Chrome' && url) {
      lastActiveContext = predefinedSiteContext(url, title) || url;
      return lastActiveContext;
    }

    // ========================
    // 📄 Detect file-based app contexts
    // ========================
    const fileBasedApps = [
      { app: 'Microsoft Word', format: 'Word' },
      { app: 'Preview', format: 'Preview' },
      { app: 'Adobe Acrobat', format: 'Acrobat' },
      { app: 'Google Docs', format: 'Google Docs' },
      { app: 'Notepad', format: 'Notepad' },
      { app: 'Sublime Text', format: 'Sublime' },
      { app: 'Visual Studio Code', format: 'VS Code' },
      { app: 'Pages', format: 'Pages' },
      { app: 'TextEdit', format: 'TextEdit' }
    ];

    const matchedApp = fileBasedApps.find(app => owner?.name.includes(app.app));

    if (matchedApp && title) {
      const documentName = title.replace(/\.[^/.]+$/, '').trim(); // Remove file extension
      lastActiveContext = `${documentName} | ${matchedApp.format}`;
      return lastActiveContext;
    }

    // ========================
    // 🧠 Final fallback formatting
    // ========================
    if (searchQuery) {
      lastActiveContext = `${searchQuery} | ${capitalize(siteName)}`;
    } else if (title && owner?.name) {
      if (owner.name.includes('Code')) {
        let fileName = title.split(' - ')[0].trim();
        if (!fileName.includes('.') || fileName.toLowerCase().includes('workspace')) {
          fileName = 'Untitled';
        }
        lastActiveContext = `${fileName} | VSCode`;
      } else if (owner.name.toLowerCase().includes('chatgpt')) {
        lastActiveContext = 'ChatGPT';
      } else {
        lastActiveContext = owner.name === 'Code' ? 'VSCode' : owner.name;
      }
    } else {
      lastActiveContext = title || url || 'Unknown Context';
    }

    return lastActiveContext;
  } catch (error) {
    console.error('❌ Error fetching active window context:', error.message);
    console.error('🔧 Ensure the "get-windows" package is installed and has the necessary permissions.');
    return lastActiveContext || 'Fallback Context';
  }
}

/**
 * Detects predefined site-specific context format overrides.
 * Used primarily for sites like Google Search or YouTube.
 */
function predefinedSiteContext(url, title) {
  if (url.includes('google.com/search')) {
    const match = title.match(/(.*?) - Google Search$/);
    return match?.[1] ? `${match[1]} | Google Search` : null;
  }
  if (url.includes('youtube.com')) return 'YouTube';
  return null;
}

/**
 * Capitalizes the first letter of a given string.
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { getActiveAppContext };