# พอร์ตหุ้นฮาลาล

แอปส่วนตัว (PWA) สำหรับวิเคราะห์หุ้นสหรัฐฯ บันทึกการซื้อขาย/ปันผล ตั้งเป้าหมาย และคัดกรองฮาลาลตามเกณฑ์ AAOIFI
ใช้ Vite + JavaScript + Firebase (Auth + Firestore + Hosting) + Finnhub (แพ็กฟรี)

ซื้อขายได้เป็นหุ้นเต็มเท่านั้น (ไม่รองรับเศษหุ้น)

## สิ่งที่ต้องมี

- **Node.js 24 LTS** (แนะนำบน Windows ให้ติดตั้งจาก nodejs.org) ขั้นต่ำ 22.12
- บัญชี Google สำหรับ Firebase
- Finnhub API key ฟรี

## ตั้งค่าครั้งแรก

1. **สร้างโปรเจกต์ Firebase** ที่ https://console.firebase.google.com → Add project
2. **เปิดการเข้าสู่ระบบด้วย Google**: Build → Authentication → Get started → Sign-in method → Google → Enable → Save
3. **สร้างฐานข้อมูล Firestore**: Build → Firestore Database → Create database (เลือก production mode และ location ที่ใกล้ เช่น asia-southeast1)
4. **เพิ่มเว็บแอป**: Project settings → General → Your apps → ไอคอน `</>` → ตั้งชื่อ → คัดลอกค่า config
5. **สร้างไฟล์ `.env`**: คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่า

   ```
   copy .env.example .env      (Windows)
   cp .env.example .env        (macOS/Linux)
   ```

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<project-id>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<project-id>
   VITE_FIREBASE_APP_ID=...
   ```

   ไฟล์ `.env` ไม่ถูก commit ขึ้น git
6. **ติดตั้งแพ็กเกจ**

   ```
   npm install
   npm i -g firebase-tools
   firebase login
   firebase use --add        (เลือกโปรเจกต์ที่สร้างในข้อ 1)
   ```

7. **Deploy Security Rules ก่อนเข้าสู่ระบบครั้งแรก** (ไม่งั้นแอปจะขึ้น "ไม่มีสิทธิ์เข้าถึงฐานข้อมูล")

   ```
   npm run build && firebase deploy --only hosting,firestore:rules
   ```

   เว็บจะอยู่ที่ `https://<project-id>.web.app`
8. **ขอ Finnhub API key ฟรี** ที่ https://finnhub.io/register แล้วเปิดแอป → หน้า **ตั้งค่า** → ใส่ key → บันทึก

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | เปิดแอปในเครื่องที่ http://localhost:5173 |
| `npm test` | รันเทสต์ทั้งหมด |
| `npm run build` | สร้างไฟล์สำหรับขึ้นเว็บในโฟลเดอร์ `dist/` |
| `npm run build && firebase deploy --only hosting,firestore:rules` | อัปเดตเว็บ + Security Rules |

## เช็กลิสต์หลังติดตั้งครั้งแรก

- [ ] เปิดเว็บบน iPhone → Safari → แชร์ → "เพิ่มไปยังหน้าจอโฮม" → เปิดแอปจากหน้าจอโฮม → เข้าสู่ระบบด้วย Google ได้
- [ ] เปิด `#/stock/AVGO` ตัวเลขราคา, 52W, P/E ตรงกับ Finnhub
- [ ] เปิด `#/stock/ZZZZ` เห็น "ไม่พบหุ้นนี้"
- [ ] ใส่ API key ผิดในหน้าตั้งค่า เห็น "API key ไม่ถูกต้อง ไปที่ตั้งค่า"
- [ ] หน้าเป้าหมายมีค่าเริ่มต้น เป้าปันผล 40,000 บาท/เดือน · ภายในอายุ 64 · ลงทุน 10,000 บาท/เดือน
- [ ] หน้าพอร์ตมีรายชื่อเฝ้าดู 11 ตัว: NVDA, AAPL, MSFT, GOOGL, AVGO, MU, TSLA, LLY, AMD, XOM, META

## หมายเหตุ

- API key ของ Finnhub เก็บในข้อมูลบัญชีของครูบน Firestore และมองเห็นได้ในเบราว์เซอร์ (แบบ A ไม่มีเซิร์ฟเวอร์ตัวกลาง)
- ข้อมูลฮาลาล: หนี้และเงินฝากที่มีดอกเบี้ยกรอกเป็น **ล้าน USD** ตามงบการเงิน
- ราคาที่แอปเสนอ (ไม้ซื้อ, TP, Trailing) คำนวณตามสูตรที่ครูตั้ง ไม่ใช่คำแนะนำการลงทุน
