'use strict';

const { exec } = require('child_process');
const { createApp } = require('./src/app');
const { createLogger } = require('./src/logger');

const PORT = process.env.PORT || 4848;
const logger = createLogger();
const app = createApp({ logger });

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.stack || err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
  logger.error(`Unhandled rejection: ${message}`);
  process.exit(1);
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  logger.info(`Realm Studio dang chay tai ${url}`);
  logger.info(`Log file: ${logger.filePath}`);
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${opener} ${url}`, () => {});
});
