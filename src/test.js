const activeWin = require('active-win');

(async () => {
    const result = await activeWin();
    console.log('Active Window Details:', result);
})();