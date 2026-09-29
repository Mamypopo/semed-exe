# ตรวจสอบไฟล์ผลตรวจปอด

แอป Electron ตรวจความสมบูรณ์ของไฟล์ผลตรวจปอด (Spirometry) — ตรวจในเครื่อง ไม่แก้ไฟล์ ไม่ส่งข้อมูลออกเน็ต

## คำสั่ง
- `npm start` — รันแอป (ถ้าเปิดจาก VS Code แล้วขึ้น `Cannot read properties of undefined (reading 'handle')` ให้ล้างตัวแปร `ELECTRON_RUN_AS_NODE` ก่อน)
- `npm test` — เทสต์ตรรกะตรวจ (ใช้ไฟล์ตัวอย่างในโฟลเดอร์ `ex/`)
- `npm run dist` — build ตัวติดตั้ง `.exe` ที่ `dist/`
- `npm run icon` — สร้างไอคอนใหม่ (`build/icon.ico`)

## โครงสร้าง
- `src/core/validator.js` — ตรรกะตรวจ (pure function: `validateFile(buffer, fileName)`, `validateFiles([...])`)
- `src/main/` — main process + preload (IPC)
- `src/renderer/` — UI ภาษาไทย

## ระบบอัปเดตผ่าน GitHub
1. แก้ `owner` / `repo` ใน `package.json` (ส่วน `build.publish`)
2. สร้าง Personal Access Token (สิทธิ์ repo) แล้วตั้ง `GH_TOKEN`
3. เพิ่มเลขเวอร์ชันใน `package.json` แล้วรัน `npm run release` — จะอัปโหลดตัวติดตั้งขึ้น GitHub Releases (draft; กด Publish release)
4. แอปที่ติดตั้งแล้วจะเช็ก/ดาวน์โหลดอัปเดตเองตอนเปิด และมีปุ่ม "ติดตั้งและรีสตาร์ท"

ถ้า repo เป็น private แอปที่ติดตั้งต้องมี token อ่าน release ด้วย — แนะนำให้ใช้ repo public สำหรับ release
