'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = path.join(__dirname, '..', 'logs');

// One file per process run (not a rolling/shared log), so a session's
// activity - and whatever it failed on - is easy to find and read in
// isolation without grepping through unrelated runs.
function createLogger({ dir = DEFAULT_DIR } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `app-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  // fs.createWriteStream() opens the fd asynchronously, so the file may not
  // exist on disk yet the moment this function returns. Create it
  // synchronously first so callers can rely on logger.filePath immediately.
  fs.closeSync(fs.openSync(filePath, 'a'));
  const stream = fs.createWriteStream(filePath, { flags: 'a' });
  stream.on('error', (err) => {
    // Don't let a logging failure (disk full, permissions...) crash the app.
    console.error(`[logger] khong the ghi log file: ${err.message}`);
  });

  function write(level, message) {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    stream.write(`${line}\n`);
    if (level === 'ERROR') {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    filePath,
    info: (message) => write('INFO', message),
    error: (message) => write('ERROR', message),
  };
}

module.exports = { createLogger };
