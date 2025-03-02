const activeWin = require('active-win')

let lastActiveContext = 'Unknown Context' // Cache for last successful context

async function getActiveAppContext() {
  try {
    const activeWindow = await activeWin()
    if (!activeWindow) return lastActiveContext

    const { title, url, owner } = activeWindow

    // Ignore the Electron app itself (Overnote app)
    if (owner && owner.name === 'Electron') {
      return 'Notes Window'
    }

    // Extract the site name from the URL
    let siteName = url
      ? new URL(url).hostname.replace('www.', '').split('.')[0]
      : 'Unknown'

    // Check if the title suggests a search query format
    let searchQuery = ''

    // 🔍 Google Search
    if (
      url?.includes('google.com/search') ||
      url?.includes('google.com/webhp')
    ) {
      const match = title.match(/(.*?) - Google Search$/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 Wikipedia Search
    else if (
      url?.includes('wikipedia.org') &&
      title.includes('Search results')
    ) {
      const match = title.match(/Search results for (.*?) - Wikipedia/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 YouTube Search
    else if (url?.includes('youtube.com/results')) {
      const match = title.match(/"(.*?)" - YouTube/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 DuckDuckGo Search
    else if (url?.includes('duckduckgo.com/')) {
      const match = title.match(/(.*?) at DuckDuckGo/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 Bing Search
    else if (url?.includes('bing.com/search')) {
      const match = title.match(/(.*?) - Bing/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 Yahoo Search
    else if (url?.includes('search.yahoo.com')) {
      const match = title.match(/(.*?) - Yahoo Search/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 Amazon Search
    else if (url?.includes('amazon.com/s')) {
      const match = title.match(/Amazon.com : (.*?)/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 eBay Search
    else if (url?.includes('ebay.com/sch/')) {
      const match = title.match(/(.*?) | eBay/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 LinkedIn Search
    else if (url?.includes('linkedin.com/search/results')) {
      const match = title.match(/(.*?) \| LinkedIn/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🔍 Generic case for other search-based sites
    else if (title.toLowerCase().includes('search')) {
      const match = title.match(/(.*?) - (.*)/)
      if (match && match[1]) {
        searchQuery = match[1].trim()
      }
    }

    // 🗂 Detect if the active window is a document/file-based application
    if (!searchQuery && title && owner && owner.name) {
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
      ]

      const matchedApp = fileBasedApps.find((app) =>
        owner.name.includes(app.app)
      )

      if (matchedApp) {
        // Extract document name by removing file extension if present
        const documentName = title.replace(/\.[^/.]+$/, '').trim()
        lastActiveContext = `${documentName} | ${matchedApp.format}`
        return lastActiveContext
      }
    }

// 📌 Final Formatting:
if (searchQuery) {
    // Search query detected: Format as "Search Term | Site Name"
    lastActiveContext = `${searchQuery} | ${capitalize(siteName)}`;
} else if (title && owner && owner.name) {
    // 🖥 Detect VS Code: Format as "FileName | VSCode"
    if (owner.name.includes('Code')) {
        // Extract file name (before the first " - " separator)
        let fileName = title.split(' - ')[0].trim();

        // Ensure the extracted name is not the workspace/project name
        if (!fileName.includes('.') || fileName.toLowerCase().includes('workspace')) {
            fileName = "Untitled"; // Default for unsaved/new files
        }

        lastActiveContext = `${fileName} | VSCode`;
    }
    // 🖥 Handle ChatGPT or other Electron-based apps safely
    else if (owner.name.toLowerCase().includes('chatgpt')) {
        lastActiveContext = "ChatGPT";
    }
    // 🖥 Regular applications: Use "App Name"
    else {
        lastActiveContext = owner.name === "Code" ? "VSCode" : owner.name; // Rename "Code" to "VSCode"
    }
} else {
    // 🌐 Websites that aren't search results: Use the page title or URL
    lastActiveContext = title || url || 'Unknown Context';
}

    return lastActiveContext
  } catch (error) {
    console.error('Error fetching active window context:', error.message)
    return lastActiveContext
  }
}

// Utility function to capitalize the site name
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

module.exports = { getActiveAppContext }
