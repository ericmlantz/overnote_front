const { app } = require('electron');
const isDev = !app.isPackaged;
const { execFile, execFileSync } = require('child_process');
const path = require('path');
const os = require('os');


function normalizeContext(context) {
  try {
    // Handle URLs
    if (context.startsWith('http')) {
      const urlObj = new URL(context);
      return `${urlObj.hostname}${urlObj.pathname}`;
    }

    // Handle file paths by extracting the absolute path
    if (context.startsWith('/') || context.includes(':\\')) {
      let absolutePath = path.resolve(context);

      // Get the user's home directory
      const homeDir = os.homedir();

      // Remove home directory to avoid user-specific paths
      absolutePath = absolutePath.replace(homeDir, '');

      // Extract filename and project name for Visual Studio Code and Visual Studio
      const vscodeMatch = absolutePath.match(/([^/]+) — ([^/]+) — [^/]+$/);
      const vsMatch = absolutePath.match(/([^/]+) — ([^/]+) — ([^/]+)$/);

      if (vscodeMatch) {
        const [, filename, project] = vscodeMatch;
        console.log(`Normalized file path (VSCode): ${filename} — ${project}`);
        return `${filename} — ${project}`;
      }

      if (vsMatch) {
        const [, filename, project] = vsMatch;
        console.log(`Normalized file path (Visual Studio): ${filename} — ${project}`);
        return `${filename} — ${project}`;
      }

      console.log(`Normalized file path (Absolute): ${absolutePath}`);
      return absolutePath;
    }

    return context;
  } catch (err) {
    console.warn(`Failed to normalize context: ${context}`, err);
    return context;
  }
}

async function getActiveAppContext() {
  const binaryPath = isDev
    ? path.join(__dirname, '../build-helpers/GetWindowInfo')
    : path.join(process.resourcesPath, 'build-helpers/GetWindowInfo');

  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile(binaryPath, [], (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout);
      });
    });

    const windowInfo = JSON.parse(stdout);
    let context;

    if (windowInfo.url) {
      context = windowInfo.url;
    } else if (windowInfo.filePath) {
      context = windowInfo.filePath;
    } else {
      context = windowInfo.title || windowInfo.name;
    }

    return normalizeContext(context);
  } catch (error) {
    console.error('Error retrieving context:', error.message);
    return 'Error retrieving context';
  }
}

module.exports = { getActiveAppContext, normalizeContext };