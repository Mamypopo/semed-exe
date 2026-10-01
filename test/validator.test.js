'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { validateFile, validateFiles, formatRanges } = require('../src/core/validator');

const EX = path.join(__dirname, '..', 'ex');
const load = (part) => {
  const f = fs.readdirSync(EX).find((n) => n.includes(part));
  return { name: f, data: fs.readFileSync(path.join(EX, f)) };
};
const csv = (rows) => Buffer.from(rows.map((r) => r.join(';')).join('\r\n'), 'utf8');
const H = ['Code', 'BestTrial', 'FVC', 'FEV1'];

test('formatRanges', () => {
  assert.equal(formatRanges([3, 4, 5, 6, 9]), '3–6, 9');
  assert.equal(formatRanges([2]), '2');
});

test('ไฟล์จริง: mind-สมบูรณ์', () => {
  const f = load('mind');
  const r = validateFile(f.data, f.name);
  assert.deepEqual([r.ok, r.rowCount, r.cnCount, r.cnPassed, r.cnFailed], [true, 519, 215, 215, 0]);
  assert.equal(r.errors.length, 0);
});

test('ไฟล์จริง: ขาด FEV1', () => {
  for (const [part, rows, cns] of [['14685', 99, 84], ['C182', 440, 213]]) {
    const f = load(part);
    const r = validateFile(f.data, f.name);
    assert.equal(r.ok, false);
    assert.deepEqual(r.fileErrors, ['ไม่พบคอลัมน์: FEV1']);
    assert.deepEqual([r.rowCount, r.cnCount, r.cnFailed, r.cnPassed], [rows, cns, cns, 0]);
  }
});

test('.pdf', () => {
  const r = validateFile(Buffer.from('x'), 'a.pdf');
  assert.deepEqual(r.fileErrors, ['ไม่รองรับไฟล์ .pdf (รองรับเฉพาะ .xls, .xlsx, .csv)']);
});

test('xlsx ปลอม / csv ไบนารี', () => {
  assert.match(validateFile(csv([H, ['1.17', 'X', '1', '1']]), 'a.xlsx').fileErrors[0], /^อ่านไฟล์ไม่ได้:/);
  assert.match(validateFile(Buffer.from([65, 0, 66]), 'a.csv').fileErrors[0], /^อ่านไฟล์ไม่ได้:/);
});

test('ว่าง / มีแต่หัวคอลัมน์', () => {
  assert.deepEqual(validateFile(Buffer.alloc(0), 'a.csv').fileErrors, ['ไฟล์ไม่มีข้อมูล']);
  assert.deepEqual(validateFile(csv([H]), 'a.csv').fileErrors, ['ไฟล์ไม่มีข้อมูล (มีแต่หัวคอลัมน์)']);
});

test('ขาดหลายคอลัมน์ / ขาด Code หยุดตรวจ', () => {
  const r = validateFile(csv([['code', 'bestTRIAL'], ['1.17', 'X']]), 'a.csv');
  assert.deepEqual(r.fileErrors, ['ไม่พบคอลัมน์: FVC, FEV1']);
  assert.equal(r.cnFailed, 1);
  const r2 = validateFile(csv([['FVC', 'FEV1'], ['1', '1']]), 'a.csv');
  assert.deepEqual(r2.fileErrors, ['ไม่พบคอลัมน์: Code, BestTrial']);
  assert.equal(r2.cnCount, 0);
});

test('กติกาแถวและ CN', () => {
  const r = validateFile(csv([
    H,
    ['100.17', '', '1', '1'],       // 2: CN100 ไม่มี X
    ['100.17', '', '1', '1'],       // 3
    ['200.17', 'X', '1', '1'],      // 4: CN200 X สองแถว
    ['', '', '', ''],               // 5 ว่างทั้งแถว (ข้าม)
    ['200.17', 'x', '1', '1'],      // 6
    ['300.17', 'X', '', '1'],       // 7: FVC ว่าง
    ['400.17', 'X', '1', 'abc'],    // 8
    ['', 'X', '1', '1'],            // 9: Code ว่าง
    ['500.17', 'Y', '1', '1'],      // 10
    ['abc.17', 'X', '1', '1'],      // 11
    ['600.17', 'X', '1', '1'],
  ]), 'a.csv');
  const byRow = (n) => r.errors.find((e) => e.rows.includes(n) && e.rows.length === 1);
  assert.equal(r.rowCount, 10);
  assert.equal(r.ok, false);
  assert.equal(byRow(7).message, 'FVC ว่าง');
  assert.equal(byRow(8).message, 'FEV1 "abc" ไม่ใช่ตัวเลข');
  assert.equal(byRow(9).message, 'Code ว่าง');
  assert.equal(byRow(10).message, 'BestTrial "Y" ต้องเป็น X, BEST หรือเว้นว่าง');
  assert.equal(byRow(11).message, 'Code "abc.17" ไม่ใช่รูปแบบ CN ที่ถูกต้อง');
  assert.ok(r.errors.some((e) => e.cn === '100' && e.message === 'ไม่มี BestTrial (X) จาก 2 แถว' && e.rowsText === '2–3'));
  assert.ok(r.errors.some((e) => e.cn === '200' && e.message === 'มี BestTrial (X) 2 แถว — ต้องมีแค่ 1' && e.rowsText === '4, 6'));
  assert.equal(r.cnCount, 6);
  assert.equal(r.cnPassed, 1); // เหลือแค่ 600
});

test('xlsx จริง + ตัวเลขใน Code', () => {
  const ws = XLSX.utils.aoa_to_sheet([H, ['100000001.17', 'X', 3.78, 3.04]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'S');
  const r = validateFile(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), 'ผล.xlsx');
  assert.equal(r.ok, true);
});

test('CN ซ้ำข้ามไฟล์ = คำเตือน ไม่ทำให้ผิด', () => {
  const d = csv([H, ['1.17', 'X', '1', '1']]);
  const [a, b] = validateFiles([{ name: 'a.csv', data: d }, { name: 'b.csv', data: d }]);
  assert.equal(a.ok, true);
  assert.equal(a.warnings[0].message, 'พบ CN นี้ในไฟล์อื่นด้วย: b.csv');
  assert.equal(b.warnings.length, 1);
});

test('BestTrial รับ X, x, best, BEST (ไม่สนตัวพิมพ์) และปฏิเสธค่าอื่น', () => {
  const r = validateFile(csv([
    H,
    ['1.17', 'best', '1', '1'], ['1.17', '', '1', '1'],
    ['2.17', 'BEST', '1', '1'],
    ['3.17', ' Best ', '1', '1'],
    ['4.17', 'x', '1', '1'],
    ['5.17', 'bests', '1', '1'],
  ]), 'a.csv');
  assert.equal(r.cnPassed, 4);
  assert.equal(r.errors.filter((e) => e.message.startsWith('BestTrial "bests"')).length, 1);
  // CN ที่มี best 2 แถว (ผสม X/best) ต้องนับเป็น 2
  const d = validateFile(csv([H, ['9.17', 'X', '1', '1'], ['9.17', 'best', '1', '1']]), 'a.csv');
  assert.ok(d.errors.some((e) => e.message === 'มี BestTrial (X) 2 แถว — ต้องมีแค่ 1'));
});
