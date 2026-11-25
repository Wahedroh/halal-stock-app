import { test, expect } from 'vitest';
import { todayLocal } from '../src/lib/dates.js';
import { errorText } from '../src/lib/errors.js';

test('todayLocal uses local calendar date, not UTC', () => {
  expect(todayLocal(new Date(2026, 10, 25, 3, 0))).toBe('2026-11-25');
  expect(todayLocal(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  expect(todayLocal(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('todayLocal differs from UTC slice when local time is ahead of UTC', () => {
  // วันที่ 25 พ.ย. 06:00 ตามเวลาเครื่อง (ไทยจะเป็น 24 พ.ย. 23:00 UTC)
  const d = new Date(2026, 10, 25, 6, 0);
  expect(todayLocal(d)).toBe('2026-11-25');
  if (d.getTimezoneOffset() < -360) expect(d.toISOString().slice(0, 10)).toBe('2026-11-24');
});

test('errorText maps Firebase codes to Thai', () => {
  expect(errorText({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toContain('Security Rules');
  expect(errorText({ code: 'firestore/permission-denied' })).toContain('Security Rules');
  expect(errorText({ code: 'unavailable', message: 'Failed to get document because the client is offline.' })).toContain('ไม่มีอินเทอร์เน็ต');
  expect(errorText({ code: 'not-found', message: 'The database (default) does not exist' })).toContain('ฐานข้อมูล Firestore');
  expect(errorText({ code: 'auth/popup-closed-by-user' })).toBe('ปิดหน้าต่างเข้าสู่ระบบก่อนเสร็จ กดเข้าสู่ระบบอีกครั้ง');
  expect(errorText({ code: 'auth/popup-blocked' })).toContain('บล็อก');
  expect(errorText({ code: 'auth/network-request-failed' })).toContain('ไม่มีอินเทอร์เน็ต');
  expect(errorText({ message: 'Failed to get document because the client is offline.' })).toContain('ไม่มีอินเทอร์เน็ต');
});

test('errorText: unknown code -> generic Thai with code; own errors keep Thai message', () => {
  expect(errorText({ code: 'auth/weird', message: 'Firebase: Error (auth/weird).' })).toBe('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง (auth/weird)');
  expect(errorText(new Error('ขายเกินจำนวนที่ถือ'))).toBe('ขายเกินจำนวนที่ถือ');
  expect(errorText(null)).toBe('เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
});
