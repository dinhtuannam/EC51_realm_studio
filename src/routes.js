'use strict';

const express = require('express');
const realmService = require('./realmService');

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
  return realmService.listObjects(req.params.className, filter);
}));

router.get('/objects/:className/count', handle(async (req) => {
  return realmService.countObjects(req.params.className);
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
