'use strict';

const express = require('express');
const path = require('path');
const routes = require('./routes');

function noopLogger() {
  return { filePath: null, info: () => {}, error: () => {} };
}

function redactBody(body) {
  if (!body || typeof body !== 'object') return undefined;
  const clone = { ...body };
  if ('encryptionKeyHex' in clone) {
    clone.encryptionKeyHex = '[REDACTED]';
  }
  if (typeof clone.csvContent === 'string') {
    // Import bodies can carry a whole CSV file (now up to ~50mb, see the
    // express.json() limit below) - logging it verbatim on every request
    // would bloat the log file for no diagnostic benefit.
    clone.csvContent = `[CSV content, ${clone.csvContent.length} ký tự]`;
  }
  return clone;
}

// Logs every /api request with its outcome, so a failure (especially a raw
// realm-core error message) can be traced later from the log file instead
// of having to reproduce it live. The encryption key is never written to
// disk. Mounted only on /api - static file requests aren't logged, since
// they carry no diagnostic value for this tool's purpose.
function requestLogger(logger) {
  return (req, res, next) => {
    const start = Date.now();
    const originalJson = res.json.bind(res);
    let responseBody;
    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };
    res.on('finish', () => {
      const ms = Date.now() - start;
      const bodySummary = redactBody(req.body);
      const bodyPart = bodySummary ? ` body=${JSON.stringify(bodySummary)}` : '';
      const base = `${req.method} ${req.originalUrl}${bodyPart} -> ${res.statusCode} (${ms}ms)`;
      if (responseBody && responseBody.ok === false) {
        logger.error(`${base} | error: ${responseBody.error}`);
      } else {
        logger.info(base);
      }
    });
    next();
  };
}

function createApp({ logger } = {}) {
  const activeLogger = logger || noopLogger();
  const app = express();
  // Default express.json() limit is 100kb - way too small once CSV import
  // sends the whole file's content as a JSON string field (see importCsv).
  app.use(express.json({ limit: '50mb' }));
  app.use('/api', requestLogger(activeLogger), routes);
  // This tool's whole workflow is "edit public/*, then look at the browser" -
  // any caching of index.html/app.js/style.css means a refresh can silently
  // keep showing stale markup alongside fresh JS (or vice versa), which
  // looks exactly like "the button is there but does nothing". Disabling
  // etag/last-modified and forcing Cache-Control: no-store means every
  // request always re-reads the current file from disk, no exceptions.
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store');
    },
  }));
  return app;
}

module.exports = { createApp };
