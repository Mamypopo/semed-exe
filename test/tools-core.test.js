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

const { compareVersions, findInstalled, installState } = require('../src/main/tools-core');

test('compareVersions', () => {
  assert.ok(compareVersions('v1.3.0', '1.2.9') > 0);
  assert.ok(compareVersions('1.2.0', 'v1.2') === 0);
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0); // ไม่เทียบเป็นข้อความ
  assert.ok(compareVersions('1.0.1', '1.0.2') < 0);
});

test('findInstalled จับชื่อที่ Windows ต่อเลขเวอร์ชันท้าย และไม่จับชื่อคล้าย', () => {
  const apps = [
    { DisplayName: 'SEMed IT - Agent Computers', DisplayVersion: '1.3.0' },
    { DisplayName: 'SEMed Scanner 1.2.0', DisplayVersion: '1.2.0' },
    { DisplayName: 'PrintAgent 2.1.2', DisplayVersion: '2.1.2' },
  ];
  assert.equal(findInstalled(apps, 'SEMed Scanner').version, '1.2.0');
  assert.equal(findInstalled(apps, 'printagent').version, '2.1.2');
  assert.equal(findInstalled(apps, 'SEMed'), null); // "SEMed IT - ..." ไม่ใช่ "SEMed 1.x"
  assert.equal(findInstalled(apps, 'Nope'), null);
  assert.equal(findInstalled(apps, undefined), null);
});

test('installState', () => {
  assert.equal(installState(null, 'v1.2.0'), 'none');
  assert.equal(installState({ version: '1.2.0' }, 'v1.2.0'), 'current');
  assert.equal(installState({ version: '1.1.0' }, 'v1.2.0'), 'outdated');
  assert.equal(installState({ version: '1.3.0' }, 'v1.2.0'), 'current');
});
