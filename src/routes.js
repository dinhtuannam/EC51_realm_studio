'use strict';

const express = require('express');
const realmService = require('./realmService');
const exportService = require('./exportService');
const importService = require('./importService');

const router = express.Router();

function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(err.statusCode || 500).json({ ok: false, error: err.message });
    }
  };
}

router.post('/open', handle(async (req) => {
  const { filePath, encryptionKeyHex } = req.body || {};
  return realmService.openRealm(filePath, encryptionKeyHex);
}));

router.post('/close', handle(async () => {
  realmService.closeRealm();
  return {};
}));

router.get('/schema', handle(async () => ({ schema: realmService.getSchema() })));

router.get('/objects/:className', handle(async (req) => {
  const filter = req.query.filter || '';
  const offsetRaw = parseInt(req.query.offset, 10);
  const offset = Number.isNaN(offsetRaw) ? 0 : offsetRaw;
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isNaN(limitRaw) ? undefined : limitRaw;
  return realmService.listObjects(req.params.className, filter, offset, limit);
}));

router.get('/objects/:className/count', handle(async (req) => {
  return realmService.countObjects(req.params.className);
}));

router.post('/objects/:className/export', handle(async (req) => {
  const { filter, format } = req.body || {};
  return exportService.exportObjects(req.params.className, filter || '', format);
}));

router.post('/objects/:className/import', handle(async (req) => {
  const { csvContent, mode } = req.body || {};
  return importService.importCsv(req.params.className, csvContent, mode);
}));

router.post('/objects/:className', handle(async (req) => {
  return realmService.createObject(req.params.className, req.body || {});
}));

router.put('/objects/:className/:ref', handle(async (req) => {
  const filter = req.query.filter || '';
  return realmService.updateObject(req.params.className, req.params.ref, req.body || {}, filter);
}));

router.delete('/objects/:className/:ref', handle(async (req) => {
  const filter = req.query.filter || '';
  realmService.deleteObject(req.params.className, req.params.ref, filter);
  return {};
}));

module.exports = router;
