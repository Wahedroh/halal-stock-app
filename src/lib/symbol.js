export const SYMBOL_ERR = 'สัญลักษณ์หุ้นไม่ถูกต้อง';
const RE = /^[A-Z0-9.\-]{1,10}$/;

/** ตัดช่องว่าง + ตัวพิมพ์ใหญ่ แล้วตรวจรูปแบบ -> สัญลักษณ์ หรือ null ถ้าไม่ถูกต้อง */
export function normalizeSymbol(s) {
  const t = String(s ?? '').trim().toUpperCase();
  return RE.test(t) ? t : null;
}
