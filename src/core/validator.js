'use strict';
// ตรรกะตรวจไฟล์ผลตรวจปอด — pure function ไม่ยุ่งกับ UI / Electron
const XLSX = require('xlsx');

const ALLOWED_EXT = ['xls', 'xlsx', 'csv'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const REQUIRED = ['Code', 'BestTrial', 'FVC', 'FEV1'];
const NUM_RE = /^-?\d+(\.\d+)?$/;
const CN_RE = /^\d+$/;
// ค่าใน BestTrial ที่ถือว่าเป็น "ครั้งที่ดีที่สุด": X หรือ BEST (ไม่สนตัวพิมพ์)
const isBestMark = (v) => /^(x|best)$/i.test(v);

function getExt(fileName) {
  const m = /\.([^.\\/]+)$/.exec(fileName || '');
  return m ? m[1].toLowerCase() : '';
}

/** [3,4,5,6,9] -> "3–6, 9" */
function formatRanges(rows) {
  const nums = [...new Set(rows)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < nums.length; ) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    parts.push(j > i ? `${nums[i]}–${nums[j]}` : `${nums[i]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

function decodeText(buf) {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-874').decode(b); // ไฟล์ภาษาไทยเก่า
  }
}

function detectDelimiter(text) {
  const nl = text.search(/[\r\n]/);
  const first = nl === -1 ? text : text.slice(0, nl);
  let best = ';';
  let bestCount = -1;
  for (const d of [';', ',', '\t']) {
    const c = first.split(d).length - 1;
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return bestCount > 0 ? best : ',';
}

/** CSV parser รองรับ "..." และ "" ภายใน, ขึ้นบรรทัดใหม่ได้ทั้ง CRLF/LF/CR */
function parseCsv(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQ = true;
    } else if (ch === delim) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readTable(buf, ext) {
  if (ext === 'csv') {
    if (buf.includes(0)) throw new Error('ไม่ใช่ไฟล์ CSV จริง (พบข้อมูลไบนารี)');
    const text = decodeText(buf);
    return parseCsv(text, detectDelimiter(text));
  }
  const isXlsx = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const isXls = buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  if (!isXlsx && !isXls) throw new Error(`เนื้อหาไม่ใช่ไฟล์ .${ext} จริง (อาจเปลี่ยนแค่นามสกุล)`);
  const wb = XLSX.read(buf, { type: 'buffer', raw: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('ไม่พบชีตในไฟล์');
  const offset = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
  // แถวแรกของชีต = แถว 1 เสมอ; ถ้าช่วงข้อมูลเริ่มช้ากว่านั้นให้เติมแถวว่างนำหน้า
  return offset ? [...Array(offset).fill([]), ...rows] : rows;
}

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

/**
 * @param {Buffer|Uint8Array} buffer
 * @param {string} fileName
 */
function validateFile(buffer, fileName) {
  const result = {
    fileName, ok: false, fileErrors: [], rowCount: 0, cnCount: 0,
    cnPassed: 0, cnFailed: 0, errors: [], warnings: [], cns: [],
  };
  const fail = (msg) => { result.fileErrors.push(msg); return result; };

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const ext = getExt(fileName);

  // 1.1
  if (!ALLOWED_EXT.includes(ext)) {
    return fail(ext
      ? `ไม่รองรับไฟล์ .${ext} (รองรับเฉพาะ .xls, .xlsx, .csv)`
      : 'ไม่รองรับไฟล์ที่ไม่มีนามสกุล (รองรับเฉพาะ .xls, .xlsx, .csv)');
  }
  if (buf.length > MAX_FILE_BYTES) return fail('ไฟล์ใหญ่เกิน 10MB');
  if (buf.length === 0) return fail('ไฟล์ไม่มีข้อมูล');

  // 1.2
  let table;
  try { table = readTable(buf, ext); } catch (e) { return fail(`อ่านไฟล์ไม่ได้: ${e.message}`); }

  // 1.3
  if (!table.length || table.every((r) => r.every((c) => str(c) === ''))) return fail('ไฟล์ไม่มีข้อมูล');
  const header = table[0].map((h) => str(h).replace(/^﻿/, '').toLowerCase());
  const dataRows = [];
  for (let i = 1; i < table.length; i++) {
    if (table[i].some((c) => str(c) !== '')) dataRows.push({ no: i + 1, cells: table[i] });
  }
  if (!dataRows.length) return fail('ไฟล์ไม่มีข้อมูล (มีแต่หัวคอลัมน์)');
  result.rowCount = dataRows.length;

  // 1.4
  const idx = {};
  const missing = [];
  for (const col of REQUIRED) {
    const k = header.indexOf(col.toLowerCase());
    if (k === -1) missing.push(col); else idx[col] = k;
  }
  if (missing.length) result.fileErrors.push(`ไม่พบคอลัมน์: ${missing.join(', ')}`);
  if (missing.includes('Code')) return result;

  const get = (r, col) => (idx[col] === undefined ? '' : str(r.cells[idx[col]]));

  // 2. ระดับแถว
  const cnRows = new Map(); // cn -> [{no, isX}]
  const failedCn = new Set();
  for (const r of dataRows) {
    const code = get(r, 'Code');
    const best = get(r, 'BestTrial');
    const fvc = get(r, 'FVC');
    const fev1 = get(r, 'FEV1');
    const errs = [];
    if (code === '') errs.push('Code ว่าง');
    if (!missing.includes('FVC') && fvc === '') errs.push('FVC ว่าง');
    if (!missing.includes('FEV1') && fev1 === '') errs.push('FEV1 ว่าง');
    if (best !== '' && !isBestMark(best)) errs.push(`BestTrial "${best}" ต้องเป็น X, BEST หรือเว้นว่าง`);
    if (fvc !== '' && !NUM_RE.test(fvc)) errs.push(`FVC "${fvc}" ไม่ใช่ตัวเลข`);
    if (fev1 !== '' && !NUM_RE.test(fev1)) errs.push(`FEV1 "${fev1}" ไม่ใช่ตัวเลข`);
    let cn = '';
    if (code !== '') {
      const head = code.split('.')[0];
      if (CN_RE.test(head)) cn = head;
      else errs.push(`Code "${code}" ไม่ใช่รูปแบบ CN ที่ถูกต้อง`);
    }
    if (cn) {
      if (!cnRows.has(cn)) cnRows.set(cn, []);
      cnRows.get(cn).push({ no: r.no, isX: isBestMark(best) });
    }
    if (errs.length) {
      if (cn) failedCn.add(cn);
      result.errors.push({ rows: [r.no], rowsText: String(r.no), cn, message: errs.join(', ') });
    }
  }

  // 3. ระดับ CN
  if (!missing.includes('BestTrial')) {
    for (const [cn, rows] of cnRows) {
      const xs = rows.filter((x) => x.isX).map((x) => x.no);
      let msg = '';
      let list = [];
      if (xs.length === 0) { msg = `ไม่มี BestTrial (X) จาก ${rows.length} แถว`; list = rows.map((x) => x.no); }
      else if (xs.length > 1) { msg = `มี BestTrial (X) ${xs.length} แถว — ต้องมีแค่ 1`; list = xs; }
      if (msg) {
        failedCn.add(cn);
        result.errors.push({ rows: list, rowsText: formatRanges(list), cn, message: msg });
      }
    }
  }

  result.errors.sort((a, b) => a.rows[0] - b.rows[0]);
  result.cns = [...cnRows.keys()];
  result.cnCount = cnRows.size;
  result.cnFailed = missing.length ? result.cnCount : failedCn.size;
  result.cnPassed = result.cnCount - result.cnFailed;
  result.ok = result.fileErrors.length === 0 && result.errors.length === 0;
  return result;
}

/** ตรวจหลายไฟล์ + คำเตือน CN ซ้ำข้ามไฟล์ (3.3) */
function validateFiles(inputs) {
  const results = inputs.map((f) => validateFile(f.data, f.name));
  const owners = new Map(); // cn -> [ผลไฟล์]
  for (const r of results) {
    for (const cn of r.cns) {
      if (!owners.has(cn)) owners.set(cn, []);
      owners.get(cn).push(r);
    }
  }
  for (const r of results) {
    for (const cn of r.cns) {
      const others = owners.get(cn).filter((o) => o !== r).map((o) => o.fileName);
      if (others.length) {
        r.warnings.push({ cn, rows: [], rowsText: '', message: `พบ CN นี้ในไฟล์อื่นด้วย: ${others.join(', ')}` });
      }
    }
  }
  return results;
}

module.exports = { validateFile, validateFiles, formatRanges, parseCsv, detectDelimiter, MAX_FILE_BYTES };
