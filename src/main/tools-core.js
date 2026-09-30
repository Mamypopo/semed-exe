'use strict';
// ส่วนที่ไม่ยุ่งกับ Electron ของหน้า "เครื่องมือ" (ทดสอบได้)

/**
 * รายการเครื่องมือ — เพิ่ม/แก้ที่นี่
 *  type 'github': ดาวน์โหลดตัวติดตั้ง .exe จาก Release ล่าสุดของ repo (ต้องเป็น public)
 *  type 'web'   : เปิดลิงก์ในเบราว์เซอร์
 *  installName  : (ไม่บังคับ) ชื่อโปรแกรมที่ Windows ลงทะเบียนไว้ ใช้บอกว่า "ติดตั้งแล้ว / มีเวอร์ชันใหม่"
 *                 ดูได้จาก Settings > Apps > Installed apps (ไม่ต้องใส่เลขเวอร์ชันต่อท้าย)
 */
const TOOLS = [
  { id: 'scanner', type: 'github', repo: 'Mamypopo/semed-scan-auto', name: 'SEMed Scanner', desc: 'โปรแกรมสแกนของ SEMed', installName: 'SEMed Scanner' },
  { id: 'qr', type: 'web', url: 'https://qr-gen-dun-gamma.vercel.app/', name: 'สร้าง QR Code', desc: 'เว็บสร้าง QR Code (เปิดในเบราว์เซอร์)' },
  // ตัวอย่างที่เพิ่มได้เมื่อพร้อม:
  // { id: 'printagent', type: 'github', repo: 'Mamypopo/<repo ที่มี Release ของ printagent>', name: 'Print Agent', desc: '...' },
];

/** เลือกไฟล์ตัวติดตั้งจาก assets ของ Release (ข้าม .blockmap / latest.yml) */
function pickInstaller(assets) {
  return (assets || []).find((a) => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name)) || null;
}

/** อนุญาตดาวน์โหลดเฉพาะไฟล์ Release ของ repo ที่กำหนดไว้เท่านั้น */
function isAllowedDownload(url, repo) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${repo}/releases/download/`);
  } catch {
    return false;
  }
}

/** GitHub ส่งค่า "sha256:abcd..." มาใน asset.digest (ถ้ามี) */
function parseDigest(digest) {
  const m = /^sha256:([0-9a-f]{64})$/i.exec(digest || '');
  return m ? m[1].toLowerCase() : null;
}

const verParts = (v) => String(v || '').replace(/^v/i, '').split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);

/** เทียบเลขเวอร์ชัน: >0 ถ้า a ใหม่กว่า b, 0 ถ้าเท่ากัน */
function compareVersions(a, b) {
  const x = verParts(a);
  const y = verParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

/**
 * หาโปรแกรมที่ติดตั้งแล้วจากรายการใน Registry ของ Windows
 * ชื่อที่ลงทะเบียนมักมีเลขเวอร์ชันต่อท้าย เช่น "SEMed Scanner 1.2.0" จึงจับแบบ ชื่อตรง หรือ "ชื่อ + ช่องว่าง"
 * ไม่จับชื่อที่แค่ขึ้นต้นเหมือนกัน เช่น "SEMed IT - Agent" ไม่ใช่ "SEMed"
 */
function findInstalled(entries, installName) {
  if (!installName) return null;
  const want = installName.trim().toLowerCase();
  const hits = (entries || []).filter((e) => {
    const n = String(e.DisplayName || '').trim().toLowerCase();
    return n === want || (n.startsWith(`${want} `) && /^v?\d/.test(n.slice(want.length + 1)));
  });
  if (!hits.length) return null;
  hits.sort((a, b) => compareVersions(b.DisplayVersion, a.DisplayVersion));
  return { version: String(hits[0].DisplayVersion || '') };
}

/** 'none' | 'current' | 'outdated' */
function installState(installed, latestTag) {
  if (!installed) return 'none';
  return compareVersions(latestTag, installed.version) > 0 ? 'outdated' : 'current';
}

module.exports = { TOOLS, pickInstaller, isAllowedDownload, parseDigest, compareVersions, findInstalled, installState };
