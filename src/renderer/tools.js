'use strict';
// แท็บเมนู + หน้า "เครื่องมือ" (ใช้ el(), toast() จาก app.js)
const pages = { check: document.getElementById('page-check'), tools: document.getElementById('page-tools') };
const toolList = document.getElementById('toolList');
let toolsLoaded = false;

function showPage(name) {
  for (const [k, node] of Object.entries(pages)) node.hidden = k !== name;
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.page === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-current', on ? 'page' : 'false');
  });
  if (name === 'tools' && !toolsLoaded) loadTools(false);
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showPage(t.dataset.page)));

const fmtMB = (b) => `${(b / 1048576).toFixed(1)} MB`;
// ปุ่มที่มีไอคอนนำหน้า (textContent จะลบไอคอน จึงใช้ตัวช่วยนี้แทน)
function setBtn(btn, iconName, text) { btn.replaceChildren(icon(iconName), text); }
const idleLabel = (t) => (t.state === 'outdated' ? [`download`, `อัปเดตเป็น ${t.version}`] : t.state === 'current' ? ['refresh-cw', 'ติดตั้งใหม่'] : ['download', 'ดาวน์โหลด']);
const buttons = new Map(); // id -> ปุ่ม (ไว้อัปเดตเปอร์เซ็นต์)

function toolRow(t) {
  const meta = el('div', { class: 'tool-meta' });
  const btn = el('button', { class: 'btn primary' });
  if (t.type === 'web') {
    setBtn(btn, 'external-link', 'เปิดเว็บ');
    btn.onclick = () => window.api.openWeb(t.id);
  } else if (!t.available) {
    meta.append(el('span', { class: 'off', text: t.reason || 'ยังไม่พร้อมให้ดาวน์โหลด' }));
    btn.textContent = 'ไม่พร้อมใช้งาน'; // ไม่มีไอคอน
    btn.disabled = true;
  } else {
    const info = `ล่าสุด ${t.version} · ${fmtMB(t.size)}${t.verified ? ' · ตรวจ SHA-256' : ''}`;
    meta.textContent = info;
    if (t.installed) {
      const outdated = t.state === 'outdated';
      meta.append(' · ', el('span', { class: `inst ${outdated ? 'old' : 'ok'}`, text: outdated ? `ติดตั้งอยู่ v${t.installed.version} · มีเวอร์ชันใหม่` : `ติดตั้งแล้ว v${t.installed.version}` }));
    }
    setBtn(btn, ...idleLabel(t));
    if (t.state === 'current') btn.className = 'btn';
    btn.onclick = () => startDownload(t, btn);
    buttons.set(t.id, btn);
  }
  return el('div', { class: 'tool' }, el('div', { class: 'tool-name', text: t.name }), t.desc && el('div', { class: 'tool-desc', text: t.desc }), meta, btn);
}

async function startDownload(t, btn) {
  btn.disabled = true;
  setBtn(btn, 'download', 'กำลังโหลด 0%');
  const res = await window.api.downloadTool(t.id);
  btn.disabled = false;
  if (res.error) {
    setBtn(btn, ...idleLabel(t));
    toast(`ดาวน์โหลดไม่สำเร็จ: ${res.error}`, { bad: true });
    return;
  }
  setBtn(btn, 'external-link', 'เปิดตัวติดตั้ง');
  const open = async () => {
    const r = await window.api.openDownloaded(res.filePath);
    if (r.error) toast(`เปิดไฟล์ไม่ได้: ${r.error}`, { bad: true });
  };
  btn.onclick = open; // ปุ่มเดิมเปลี่ยนหน้าที่เป็น "เปิดตัวติดตั้ง"
  toast(`ดาวน์โหลดสำเร็จ: ${res.filePath.split(/[\\/]/).pop()}`, { action: { label: 'แสดงในโฟลเดอร์', run: () => window.api.showInFolder(res.filePath) } });
}

window.api.onToolProgress(({ id, percent }) => {
  const b = buttons.get(id);
  if (b && b.disabled) setBtn(b, 'download', `กำลังโหลด ${percent}%`);
});

async function loadTools(force) {
  toolList.replaceChildren(el('div', { class: 'tool-empty', text: 'กำลังโหลดรายการ...' }));
  buttons.clear();
  try {
    const items = await window.api.listTools(force);
    toolsLoaded = !items.some((i) => i.error);
    toolList.replaceChildren(...(items.length ? items.map(toolRow) : [el('div', { class: 'tool-empty', text: 'ยังไม่มีเครื่องมือในรายการ' })]));
  } catch (e) {
    toolList.replaceChildren(el('div', { class: 'tool-empty', text: `โหลดรายการไม่สำเร็จ: ${e.message}` }));
  }
}
document.getElementById('toolsRefresh').addEventListener('click', () => loadTools(true));

hydrateIcons();
