'use strict';
// ส่วนที่ไม่ยุ่งกับ Electron ของหน้า "เครื่องมือ" (ทดสอบได้)

/**
 * รายการเครื่องมือ — เพิ่ม/แก้ที่นี่
 *  type 'github': ดาวน์โหลดตัวติดตั้ง .exe จาก Release ล่าสุดของ repo (ต้องเป็น public)
 *  type 'web'   : เปิดลิงก์ในเบราว์เซอร์
 */
const TOOLS = [
  { id: 'scanner', type: 'github', repo: 'Mamypopo/semed-scan-auto', name: 'SEMed Scanner', desc: 'โปรแกรมสแกนของ SEMed' },
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

module.exports = { TOOLS, pickInstaller, isAllowedDownload, parseDigest };
