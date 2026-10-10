const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function checkDirectory(directory) {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) count += checkDirectory(filename);
    else if (entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
      count += 1;
    }
  }
  return count;
}

const count = checkDirectory(path.join(__dirname, '..', 'src'))
  + checkDirectory(__dirname);
console.log('Syntax OK: ' + count + ' JavaScript files checked.');
