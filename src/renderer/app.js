'use strict';
const MAX_FILES = 20;
const MAX_BYTES = 10 * 1024 * 1024;
const PREVIEW_ROWS = 50;

const $ = (id) => document.getElementById(id);
const drop = $('drop'), picker = $('picker'), picked = $('picked'), fileList = $('fileList');
const pickNote = $('pickNote'), checkBtn = $('checkBtn'), clearBtn = $('clearBtn');
const resultsEl = $('results'), summaryEl = $('summary'), cardsEl = $('cards'), exportBtn = $('exportBtn'), toastEl = $('toast');

let files = [];
let lastResults = [];

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n[k] = v;
  }
  for (const k of kids) if (k) n.append(k);
  return n;
}

const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function clearResults() {
  lastResults = [];
  resultsEl.hidden = true;
  cardsEl.replaceChildren();
  summaryEl.replaceChildren();
}

function setFiles(list) {
  clearResults(); // เปลี่ยนไฟล์แล้วผลเก่าหายทันที
  const all = [...list];
  files = all.slice(0, MAX_FILES);
  const notes = [];
  if (all.length > MAX_FILES) notes.push(`เลือกได้สูงสุด ${MAX_FILES} ไฟล์ — ตัดไฟล์ที่เกินออก ${all.length - MAX_FILES} ไฟล์`);
  const big = files.filter((f) => f.size > MAX_BYTES);
  if (big.length) notes.push(`ไฟล์ที่เกิน 10MB จะถูกรายงานว่าไม่สมบูรณ์: ${big.map((f) => f.name).join(', ')}`);
  pickNote.hidden = !notes.length;
  pickNote.textContent = notes.join(' • ');
  fileList.replaceChildren(...files.map((f) => el('li', {}, el('span', { class: 'name', text: f.name }), el('span', { class: 'size', text: fmtSize(f.size) }))));
  picked.hidden = !files.length;
}

drop.addEventListener('click', () => picker.click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); picker.click(); } });
picker.addEventListener('change', () => { if (picker.files.length) setFiles(picker.files); picker.value = ''; });
for (const t of ['dragenter', 'dragover']) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const t of ['dragleave', 'drop']) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); });
drop.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) setFiles(e.dataTransfer.files); });
// กันเปิดไฟล์ทับหน้าต่างเมื่อลากพลาดที่
for (const t of ['dragover', 'drop']) window.addEventListener(t, (e) => e.preventDefault());

clearBtn.addEventListener('click', () => { files = []; setFiles([]); });

checkBtn.addEventListener('click', async () => {
  if (!files.length) return;
  checkBtn.disabled = true;
  checkBtn.textContent = 'กำลังตรวจ...';
  clearResults();
  try {
    const payload = [];
    for (const f of files) {
      // ไฟล์ใหญ่เกินไม่ต้องอ่านเข้าหน่วยความจำ ส่งชื่ออย่างเดียวให้ตัวตรวจรายงาน
      payload.push({ name: f.name, data: f.size > MAX_BYTES ? new Uint8Array(0) : new Uint8Array(await f.arrayBuffer()), size: f.size });
    }
    const results = await window.api.validateFiles(payload);
    payload.forEach((p, i) => { if (p.size > MAX_BYTES) { results[i].fileErrors = ['ไฟล์ใหญ่เกิน 10MB']; results[i].ok = false; } });
    render(results);
  } catch (err) {
    render([{ fileName: '(ทั้งหมด)', ok: false, fileErrors: [`อ่านไฟล์ไม่ได้: ${err.message}`], rowCount: 0, cnCount: 0, cnPassed: 0, cnFailed: 0, errors: [], warnings: [] }]);
  } finally {
    checkBtn.disabled = false;
    checkBtn.textContent = 'ตรวจสอบ';
  }
});

function table(items, cols, limit = PREVIEW_ROWS) {
  const wrap = el('div');
  const tbody = el('tbody');
  const addRows = (from, to) => items.slice(from, to).forEach((it) => tbody.append(el('tr', {},
    el('td', { class: 'num', text: it.rowsText || '-' }), el('td', { class: 'num', text: it.cn || '-' }), el('td', { class: 'msg', text: it.message }))));
  addRows(0, limit);
  wrap.append(el('div', { class: 'tbl-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...cols.map((c) => el('th', { text: c })))), tbody)));
  if (items.length > limit) {
    const btn = el('button', { class: 'btn more', text: `แสดงทั้งหมด (${items.length} รายการ)` });
    btn.addEventListener('click', () => { addRows(limit, items.length); btn.remove(); });
    wrap.append(btn);
  }
  return wrap;
}

function metric(label, value, cls = '') {
  return el('div', {}, el('dt', { text: label }), el('dd', { class: value === 0 ? 'zero' : cls, text: String(value) }));
}

function card(r) {
  const bad = !r.ok;
  const d = el('details', { class: `file ${bad ? 'bad' : 'good'}` });
  d.append(el('summary', {},
    el('span', { class: `status ${bad ? 'bad' : 'ok'}` }, icon(bad ? 'x' : 'check'), bad ? 'ไม่สมบูรณ์' : 'สมบูรณ์'),
    el('span', { class: 'fname', text: r.fileName }),
    el('dl', { class: 'metrics' },
      metric('แถว', r.rowCount), metric('CN', r.cnCount), metric('ผ่าน', r.cnPassed),
      metric('ผิด', r.cnFailed, 'hot'), metric('คำเตือน', r.warnings.length))));
  const body = el('div', { class: 'body' });
  r.fileErrors.forEach((m) => body.append(el('div', { class: 'file-err', text: m })));
  if (r.errors.length) {
    body.append(el('div', { class: 'sec-title', text: `รายการผิดพลาด ${r.errors.length} รายการ` }));
    body.append(table(r.errors, ['แถว', 'CN', 'สาเหตุ']));
  }
  if (r.warnings.length) {
    body.append(el('div', { class: 'sec-title warn', text: `คำเตือน ${r.warnings.length} รายการ` }));
    body.append(table(r.warnings, ['แถว', 'CN', 'คำเตือน']));
  }
  if (!bad && !r.warnings.length) body.append(el('div', { class: 'clean', text: 'ไม่พบปัญหา' }));
  d.append(body);
  return d;
}

function render(results) {
  lastResults = results;
  const okCount = results.filter((r) => r.ok).length;
  const part = (label, n, cls) => el('span', {}, `${label} `, el('b', { class: cls || '', text: String(n) }));
  const sep = () => el('span', { class: 'sep', text: '|' });
  summaryEl.replaceChildren(part('ไฟล์ทั้งหมด', results.length), sep(), part('สมบูรณ์', okCount, 'ok'), sep(), part('ไม่สมบูรณ์', results.length - okCount, results.length - okCount ? 'bad' : ''));
  const sorted = [...results].sort((a, b) => Number(a.ok) - Number(b.ok)); // ไม่สมบูรณ์ขึ้นก่อน (sort เสถียร)
  cardsEl.replaceChildren(...sorted.map(card));
  resultsEl.hidden = false;
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let toastTimer;
function toast(text, { bad = false, action } = {}) {
  clearTimeout(toastTimer);
  toastEl.className = `toast ${bad ? 'bad' : ''}`;
  toastEl.replaceChildren(el('span', { text }));
  if (action) {
    const b = el('button', { text: action.label });
    b.addEventListener('click', action.run);
    toastEl.append(b);
  }
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 6000);
}

exportBtn.addEventListener('click', async () => {
  const res = await window.api.exportResults(lastResults);
  if (res.error) toast(`ส่งออกไม่สำเร็จ: ${res.error}`, { bad: true });
  else if (res.saved) {
    const name = res.filePath.split(/[\\/]/).pop();
    toast(`ส่งออกสำเร็จ: ${name}`, { action: { label: 'เปิดโฟลเดอร์', run: () => window.api.showInFolder(res.filePath) } });
  }
});

// อัปเดต: ผู้ใช้เลือกเองว่าจะโหลด/ติดตั้งตอนไหน
const bar = $('updateBar');
let manualCheck = false;
$('updateCheck').addEventListener('click', async () => {
  manualCheck = true;
  const r = await window.api.checkUpdate();
  if (!r.supported) { manualCheck = false; toast('ตรวจอัปเดตได้เฉพาะแอปที่ติดตั้งแล้ว'); }
});
function barButton(label, run) { const b = el('button', { text: label }); b.addEventListener('click', run); return b; }
window.api.onUpdateStatus((s) => {
  if (s.state === 'none' || s.state === 'error') {
    if (manualCheck) toast(s.state === 'none' ? 'เป็นเวอร์ชันล่าสุดแล้ว' : `ตรวจอัปเดตไม่สำเร็จ${s.detail ? `: ${s.detail}` : ''}`, { bad: s.state === 'error' });
    manualCheck = false;
    return;
  }
  manualCheck = false;
  bar.hidden = false;
  const later = barButton('ไว้ทีหลัง', () => { bar.hidden = true; });
  if (s.state === 'available') {
    bar.replaceChildren(el('span', { text: `มีเวอร์ชันใหม่ ${s.version}` }),
      barButton('อัปเดตเลย', () => { bar.replaceChildren(el('span', { text: 'กำลังเริ่มดาวน์โหลด...' })); window.api.downloadUpdate(); }), later);
  } else if (s.state === 'downloading') {
    bar.replaceChildren(el('span', { text: `กำลังดาวน์โหลดอัปเดต ${s.percent}%` }));
  } else if (s.state === 'ready') {
    bar.replaceChildren(el('span', { text: `ดาวน์โหลดเวอร์ชัน ${s.version} เรียบร้อยแล้ว` }), barButton('ติดตั้งและรีสตาร์ท', () => window.api.installUpdate()), later);
  }
});

window.api.getVersion().then((v) => { $('appVersion').textContent = `v${v}`; });

hydrateIcons();
