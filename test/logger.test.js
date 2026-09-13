'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLogger } = require('../src/logger');

test('createLogger: tao thu muc + file log, ghi dung noi dung ra file va console', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-dev-tool-logger-test-'));
  const logDir = path.join(dir, 'logs');

  const logger = createLogger({ dir: logDir });
  assert.ok(fs.existsSync(logDir));
  assert.ok(fs.existsSync(logger.filePath));

  logger.info('hello info');
  logger.error('hello error');

  // fs.createWriteStream() writes are async - give it a tick to flush.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const content = fs.readFileSync(logger.filePath, 'utf8');
  assert.match(content, /\[INFO\] hello info/);
  assert.match(content, /\[ERROR\] hello error/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('createLogger: moi lan goi tao 1 file rieng (khong dung chung 1 file)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'realm-dev-tool-logger-test-'));
  const logDir = path.join(dir, 'logs');

  const first = createLogger({ dir: logDir });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = createLogger({ dir: logDir });

  assert.notEqual(first.filePath, second.filePath);
  assert.ok(fs.existsSync(first.filePath));
  assert.ok(fs.existsSync(second.filePath));

  fs.rmSync(dir, { recursive: true, force: true });
});
