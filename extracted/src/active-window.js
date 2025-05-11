const isDev = process.env.NODE_ENV !== 'production';
const { execFile, execFileSync } = require('child_process');
const app = require('electron').app;
const path = require('path');

// Context aliases object for future use
let contextAliases = {};


function predefinedSiteContext(context, title) {
  return context;
}

async function getActiveAppContext() {
  const binaryPath = isDev
    ? path.join(__dirname, '../build-helpers/GetWindowInfo')
    : path.join(process.resourcesPath, 'build-helpers/GetWindowInfo');

  console.log('📍 Attempting to run GetWindowInfo at:', binaryPath);

  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile(binaryPath, [], (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Error running GetWindowInfo:', error);
          if (error.code === 'ENOENT') {
            console.error('🚫 GetWindowInfo binary not found at:', binaryPath);
          } else if (error.code === 'EACCES') {
            console.error('🔒 Permission denied for GetWindowInfo. Run chmod +x on it.');
          }
          return reject(error);
        }
        resolve(stdout);
      });
    });

    console.log('✅ GetWindowInfo output:', stdout);

    const windowInfo = JSON.parse(stdout);

    console.log('🪟 Full window info JSON:', windowInfo);

    let context;
    if (windowInfo.name === 'Silhouette Studio') {
      try {
        const script = `
          tell application "System Events"
            get name of every window of process "Silhouette Studio"
          end tell
        `;
        const fullTitle = execFileSync('osascript', ['-e', script], { encoding: 'utf-8' }).trim();
        const titleParts = fullTitle
          .split(', ')
          .filter((title) => title.includes('Silhouette Studio® Business Edition:'));

        if (titleParts.length > 0) {
          const fullDocTitle = titleParts[0];
          const docName = fullDocTitle.split(':')[1]?.trim();
          context = `Silhouette Studio - ${docName}`;
          console.log('🍎 Extracted Silhouette doc name via AppleScript:', context);
        } else {
          context = `Silhouette Studio - ${windowInfo.pid}`;
          console.log('⚠️ AppleScript fallback failed, using PID context:', context);
        }
      } catch (e) {
        context = `Silhouette Studio - ${windowInfo.pid}`;
        console.warn('⚠️ AppleScript execution failed:', e.message);
      }
    } else {
      context =
        windowInfo.url && windowInfo.url.trim() !== ''
          ? windowInfo.url
          : windowInfo.title || windowInfo.name;
    }

    lastActiveContext =
      predefinedSiteContext(context, windowInfo.title) || context;

    return lastActiveContext;
  } catch (error) {
    console.error('❌ Failed to parse context from GetWindowInfo:', error.message);
    throw new Error('Error retrieving context');
  }
}


module.exports = { getActiveAppContext, contextAliases };