'use strict';

const test = require('node:test');
const { after } = test;
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Realm = require('realm');
const { buildFixtureRealm } = require('./fixtures/buildFixture');
const realmService = require('../src/realmService');
const { createSnapshot, SNAPSHOT_DIR } = require('../src/snapshotService');

// buildFixtureRealm() luon dat ten file la "fixture.realm" (dung chung cho
// MOI test file trong repo), nen moi createSnapshot() o day deu tao ra
// "fixture_<timestamp>.realm". Timestamp chi chinh xac toi GIAY - cac test
// trong file nay chay tuan tu nhung rat nhanh (vai chuc ms/test), nen 2 test
// KHAC NHAU hoan toan co the roi vao dung 1 giay va tinh ra CUNG 1 ten file.
// Neu khong don dep ngay sau MOI test (khong doi tap trung don o cuoi file),
// test sau se ghi de len file .realm CHUA DONG cua test truoc - da gay crash
// native thuc su ("Decryption failed: page 0 ... write was begun") thay vi
// loi JS binh thuong, chu khong phai gia thuyet suong. Vi vay: don dep NGAY
// trong t.after() cua TUNG test, xoa ca file phu (.lock/.management/.note)
// ma Realm.open() tao them khi mo lai de verify - roi don tong ca thu muc 1
// lan nua sau khi HET file nay chay xong, phong truong hop sot lai gi do.
function cleanupSnapshotFile(filePath) {
  fs.rmSync(filePath, { force: true });
  fs.rmSync(`${filePath}.lock`, { force: true });
  fs.rmSync(`${filePath}.management`, { recursive: true, force: true });
  fs.rmSync(`${filePath}.note`, { force: true });
}

after(() => {
  fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
});

test('createSnapshot: dung ten file, dung thu muc, du lieu hien tai (ke ca thay doi moi nhat)', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);
  // Thay doi ngay truoc khi chup snapshot - phai co mat trong file snapshot,
  // khong phai du lieu tai thoi diem file .realm goc duoc tao.
  realmService.createObject('Person', { id: 'p3', name: 'Carol', age: 40, active: true });

  const result = createSnapshot();
  t.after(() => cleanupSnapshotFile(result.filePath));

  assert.match(result.fileName, /^fixture_\d{8}_\d{6}\.realm$/);
  assert.equal(path.dirname(result.filePath), SNAPSHOT_DIR);
  assert.ok(fs.existsSync(result.filePath));

  const reopened = await Realm.open({ path: result.filePath, encryptionKey: Buffer.from(encryptionKeyHex, 'hex') });
  try {
    assert.equal(reopened.objects('Person').length, 3);
    assert.equal(reopened.objects('Person').filtered("id == 'p3'").length, 1);
  } finally {
    reopened.close();
  }
});

test('createSnapshot: file snapshot ma hoa bang DUNG key cua file dang mo - key sai khong mo duoc', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const result = createSnapshot();
  t.after(() => cleanupSnapshotFile(result.filePath));

  const wrongKey = Buffer.alloc(64, 1);
  await assert.rejects(() => Realm.open({ path: result.filePath, encryptionKey: wrongKey }));
});

test('createSnapshot: chua mo file nao thi bao loi ro rang, khong tao file rac', async (t) => {
  realmService.closeRealm(); // dam bao khong co realm nao dang mo tu test truoc
  assert.throws(() => createSnapshot(), /Chưa mở file Realm nào/);
});

test('createSnapshot: 2 lan chup lien tiep tao 2 file khac ten nhau, khong ghi de nhau', async (t) => {
  const { filePath, encryptionKeyHex, dir } = await buildFixtureRealm();
  t.after(() => {
    realmService.closeRealm();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await realmService.openRealm(filePath, encryptionKeyHex);

  const first = createSnapshot();
  t.after(() => cleanupSnapshotFile(first.filePath));
  // Timestamp trong ten file chi chinh xac toi giay - doi it nhat 1 giay de
  // 2 lan chup lien tiep chac chan khac ten, tranh flaky test.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const second = createSnapshot();
  t.after(() => cleanupSnapshotFile(second.filePath));

  assert.notEqual(first.fileName, second.fileName);
  assert.ok(fs.existsSync(first.filePath));
  assert.ok(fs.existsSync(second.filePath));
});
