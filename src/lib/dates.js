const pad = (n) => String(n).padStart(2, '0');

/** วันที่ตามเวลาเครื่อง (ไม่ใช่ UTC) รูปแบบ YYYY-MM-DD */
export function todayLocal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
