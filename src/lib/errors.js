// แปลง error จาก Firebase เป็นข้อความไทย (ฟังก์ชันล้วน)
const TEXT = {
  'permission-denied': 'ไม่มีสิทธิ์เข้าถึงฐานข้อมูล: ยังไม่ได้ deploy Security Rules (firestore.rules) หรือฐานข้อมูลยังไม่ได้ตั้งค่า',
  unavailable: 'ไม่มีอินเทอร์เน็ต หรือเชื่อมต่อฐานข้อมูลไม่ได้ ลองใหม่อีกครั้ง',
  'not-found': 'ไม่พบฐานข้อมูล Firestore: ยังไม่ได้สร้างฐานข้อมูลในโปรเจกต์ Firebase',
  unauthenticated: 'ยังไม่ได้เข้าสู่ระบบ ลองออกจากระบบแล้วเข้าใหม่',
  'deadline-exceeded': 'ฐานข้อมูลตอบช้าเกินไป ลองใหม่อีกครั้ง',
  'resource-exhausted': 'ใช้โควตาฐานข้อมูลเกินแล้ว รอสักครู่แล้วลองใหม่',
  'auth/popup-closed-by-user': 'ปิดหน้าต่างเข้าสู่ระบบก่อนเสร็จ กดเข้าสู่ระบบอีกครั้ง',
  'auth/cancelled-popup-request': 'ปิดหน้าต่างเข้าสู่ระบบก่อนเสร็จ กดเข้าสู่ระบบอีกครั้ง',
  'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ อนุญาตป๊อปอัปแล้วลองใหม่',
  'auth/network-request-failed': 'ไม่มีอินเทอร์เน็ต เข้าสู่ระบบไม่ได้ ลองใหม่อีกครั้ง',
  'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้รับอนุญาต: เพิ่มใน Firebase Authentication > Settings > Authorized domains',
  'auth/operation-not-allowed': 'ยังไม่ได้เปิดการเข้าสู่ระบบด้วย Google ใน Firebase Authentication',
  'auth/invalid-api-key': 'ค่า VITE_FIREBASE_* ในไฟล์ .env ไม่ถูกต้อง',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'ค่า VITE_FIREBASE_* ในไฟล์ .env ไม่ถูกต้อง',
  'auth/configuration-not-found': 'ยังไม่ได้ตั้งค่า Firebase Authentication ในโปรเจกต์',
  'auth/too-many-requests': 'ลองเข้าสู่ระบบถี่เกินไป รอสักครู่แล้วลองใหม่',
  'auth/user-disabled': 'บัญชีนี้ถูกปิดใช้งาน',
  'auth/internal-error': 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',
};
const GENERIC = 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';

/** ข้อความไทยสำหรับ error: รหัส Firebase ที่รู้จัก -> ข้อความไทย · error ของแอปเอง (ไม่มี code) -> message เดิม */
export function errorText(e) {
  const code = typeof e?.code === 'string' ? e.code.replace(/^firestore\//, '') : '';
  if (code && TEXT[code]) return TEXT[code];
  if (code === 'failed-precondition' && /offline/i.test(e?.message ?? '')) return TEXT.unavailable;
  if (/client is offline/i.test(e?.message ?? '')) return TEXT.unavailable;
  if (code) return `${GENERIC} (${code})`;
  return e?.message || GENERIC;
}
