'use strict';
// ปล่อยเวอร์ชันขึ้น GitHub Releases แบบทีละขั้น (แทน electron-builder --publish ที่เคยสร้าง Release ซ้ำ)
//   node --env-file=.env scripts/release.js              build + อัปโหลด + ตรวจผล
//   node scripts/release.js --verify-only                 ตรวจ Release ของเวอร์ชันปัจจุบันเฉยๆ (ไม่ต้องมี token)
// ลำดับอัปโหลด: ตัวติดตั้ง → .blockmap → latest.yml (ท้ายสุด เพื่อไม่ให้แอปเห็นเวอร์ชันใหม่ก่อนไฟล์พร้อม)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { owner, repo } = pkg.build.publish[0];
const version = pkg.version;
const tag = `v${version}`;
const dist = path.join(root, 'dist');
const exeName = `semed-tools-setup-${version}.exe`;
const files = [exeName, `${exeName}.blockmap`, 'latest.yml'];
const verifyOnly = process.argv.includes('--verify-only');
const token = process.env.GH_TOKEN;

const log = (m) => console.log(m);
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

async function gh(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'semed-exe-release',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(20 * 60 * 1000),
  });
  return res;
}
const api = (p) => `https://api.github.com/repos/${owner}/${repo}${p}`;

async function releasesForTag() {
  const res = await gh(api('/releases?per_page=100'));
  if (!res.ok) fail(`อ่านรายการ Release ไม่ได้ (${res.status})`);
  return (await res.json()).filter((r) => r.tag_name === tag);
}

async function verify() {
  const list = await releasesForTag();
  if (list.length === 0) fail(`ไม่พบ Release ของ ${tag} บน GitHub`);
  if (list.length > 1) {
    fail(`พบ Release ซ้ำของ ${tag} จำนวน ${list.length} อัน (ไฟล์กระจายกัน)\n  ไปที่หน้า Releases แล้วลบอันที่ซ้ำออก เหลืออันเดียวที่มีไฟล์ครบ แล้วรันสคริปต์นี้ใหม่`);
  }
  const rel = list[0];
  const names = rel.assets.map((a) => a.name);
  const missing = files.filter((f) => !names.includes(f));
  if (missing.length) fail(`Release ${tag} ยังขาดไฟล์: ${missing.join(', ')}`);
  if (rel.draft || rel.prerelease) fail(`Release ${tag} เป็น draft/pre-release ผู้ใช้จะมองไม่เห็น`);
  const yml = await (await fetch(`https://github.com/${owner}/${repo}/releases/download/${tag}/latest.yml`, { redirect: 'follow' })).text();
  const m = /^version:\s*(\S+)/m.exec(yml);
  if (!m || m[1] !== version) fail(`latest.yml บน GitHub เป็นเวอร์ชัน "${m ? m[1] : '?'}" ไม่ตรงกับ ${version}`);
  log(`✓ ตรวจแล้ว: ${tag} มีไฟล์ครบ 3 ไฟล์ และ latest.yml ระบุเวอร์ชัน ${version}`);
}

function writeLatestYml() {
  const exe = path.join(dist, exeName);
  const buf = fs.readFileSync(exe);
  const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
  const yml = `version: ${version}\nfiles:\n  - url: ${exeName}\n    sha512: ${sha512}\n    size: ${buf.length}\npath: ${exeName}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\n`;
  fs.writeFileSync(path.join(dist, 'latest.yml'), yml, 'utf8');
}

async function upload(rel, name) {
  const existing = rel.assets.find((a) => a.name === name);
  if (existing) {
    const del = await gh(api(`/releases/assets/${existing.id}`), { method: 'DELETE' });
    if (!del.ok && del.status !== 404) fail(`ลบไฟล์เก่า ${name} ไม่ได้ (${del.status})`);
  }
  const body = fs.readFileSync(path.join(dist, name));
  log(`  อัปโหลด ${name} (${(body.length / 1048576).toFixed(1)} MB)...`);
  const res = await gh(`https://uploads.github.com/repos/${owner}/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) },
    body,
  });
  if (!res.ok) fail(`อัปโหลด ${name} ไม่สำเร็จ (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

(async () => {
  if (verifyOnly) return verify();
  if (!token) fail('ไม่พบ GH_TOKEN — ใส่ในไฟล์ .env (ดู .env.example)');

  // กันพลาด: ถ้า Release ซ้ำอยู่แล้ว ให้หยุดก่อนทำให้ยุ่งกว่าเดิม
  let list = await releasesForTag();
  if (list.length > 1) fail(`พบ Release ซ้ำของ ${tag} อยู่แล้ว ${list.length} อัน — ลบที่ซ้ำบน GitHub ให้เหลืออันเดียวก่อน`);

  log(`1/4 build ${exeName}`);
  const cli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
  execFileSync(process.execPath, [cli, '--win', '--publish', 'never'], { cwd: root, stdio: 'inherit' });
  if (!fs.existsSync(path.join(dist, exeName))) fail(`build แล้วไม่พบ dist/${exeName}`);
  writeLatestYml(); // สร้างเองจากไฟล์ที่ build จริง กัน latest.yml เก่าค้าง

  log(`2/4 เตรียม Release ${tag}`);
  let rel = list[0];
  if (!rel) {
    const res = await gh(api('/releases'), { method: 'POST', body: JSON.stringify({ tag_name: tag, name: version, draft: false, prerelease: false, generate_release_notes: false }) });
    if (!res.ok) fail(`สร้าง Release ไม่ได้ (${res.status}): ${(await res.text()).slice(0, 200)}`);
    rel = await res.json();
  } else {
    log('  มี Release นี้อยู่แล้ว จะใช้อันเดิมและแทนที่ไฟล์');
  }

  log('3/4 อัปโหลดไฟล์ (ทีละไฟล์)');
  for (const name of files) await upload(rel, name);

  log('4/4 ตรวจผลบน GitHub');
  await verify();
})().catch((e) => fail(e.message));
