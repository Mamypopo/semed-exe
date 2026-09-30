'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pickInstaller, isAllowedDownload, parseDigest } = require('../src/main/tools-core');

test('pickInstaller ข้าม blockmap และ latest.yml', () => {
  const a = [{ name: 'latest.yml' }, { name: 'X-Setup-1.exe.blockmap' }, { name: 'X-Setup-1.exe' }];
  assert.equal(pickInstaller(a).name, 'X-Setup-1.exe');
  assert.equal(pickInstaller([{ name: 'a.exe.blockmap' }]), null);
  assert.equal(pickInstaller(undefined), null);
});

test('isAllowedDownload อนุญาตเฉพาะ Release ของ repo นั้น', () => {
  const ok = 'https://github.com/Mamypopo/r/releases/download/v1/a.exe';
  assert.equal(isAllowedDownload(ok, 'Mamypopo/r'), true);
  assert.equal(isAllowedDownload(ok, 'Other/r'), false);
  assert.equal(isAllowedDownload('http://github.com/Mamypopo/r/releases/download/v1/a.exe', 'Mamypopo/r'), false);
  assert.equal(isAllowedDownload('https://evil.com/Mamypopo/r/releases/download/v1/a.exe', 'Mamypopo/r'), false);
  assert.equal(isAllowedDownload('not a url', 'Mamypopo/r'), false);
});

test('parseDigest', () => {
  const h = 'a'.repeat(64);
  assert.equal(parseDigest(`sha256:${h}`), h);
  assert.equal(parseDigest('md5:abc'), null);
  assert.equal(parseDigest(null), null);
});
