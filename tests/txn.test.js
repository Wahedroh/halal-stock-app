import { test, expect } from 'vitest';
import { validateTxn } from '../src/lib/txn.js';
import { normalizeSymbol } from '../src/lib/symbol.js';

const ERR = 'ข้อมูลไม่ครบหรือไม่ถูกต้อง';
test('valid buy normalizes symbol', () => {
  const t = validateTxn({ type: 'buy', symbol: ' nvda ', date: '2026-01-05', shares: 2, price: 100, fee: 1 });
  expect(t.symbol).toBe('NVDA');
  expect(t.shares).toBe(2);
  expect(t.fee).toBe(1);
});
test('valid sell without fee', () => {
  const t = validateTxn({ type: 'sell', symbol: 'aapl', date: '2026-01-06', shares: 1, price: 50 });
  expect(t.symbol).toBe('AAPL');
  expect(t.type).toBe('sell');
});
test('valid dividend', () => {
  const t = validateTxn({ type: 'dividend', symbol: 'xom', date: '2026-02-01', amount: 3.5 });
  expect(t).toMatchObject({ type: 'dividend', symbol: 'XOM', amount: 3.5 });
});
test('invalid inputs throw', () => {
  const base = { type: 'buy', symbol: 'A', date: '2026-01-05', shares: 1, price: 1 };
  for (const bad of [
    { ...base, shares: 0 }, { ...base, price: -1 }, { ...base, date: '2026-13-40' },
    { ...base, date: '05/01/2026' }, { ...base, type: 'split' }, { ...base, fee: -1 },
    { type: 'dividend', symbol: 'A', date: '2026-01-05', amount: 0 },
    { ...base, shares: Infinity },
  ]) expect(() => validateTxn(bad)).toThrow(ERR);
});
test('invalid symbol -> Thai symbol error', () => {
  const base = { type: 'buy', date: '2026-01-05', shares: 1, price: 1 };
  for (const symbol of [' ', '', 'TOOLONGSYMBOL', 'A B', '<x>', 'ก', 7]) {
    expect(() => validateTxn({ ...base, symbol })).toThrow('สัญลักษณ์หุ้นไม่ถูกต้อง');
  }
  expect(validateTxn({ ...base, symbol: ' brk.b ' }).symbol).toBe('BRK.B');
});
test('normalizeSymbol', () => {
  expect(normalizeSymbol(' avgo ')).toBe('AVGO');
  expect(normalizeSymbol('BRK-B')).toBe('BRK-B');
  expect(normalizeSymbol('1234567890')).toBe('1234567890');
  expect(normalizeSymbol('12345678901')).toBeNull();
  expect(normalizeSymbol('')).toBeNull();
  expect(normalizeSymbol(null)).toBeNull();
  expect(normalizeSymbol('AV/GO')).toBeNull();
  expect(normalizeSymbol('%3Cb%3E')).toBeNull();
});
test('whole shares only for buy/sell', () => {
  const base = { type: 'buy', symbol: 'A', date: '2026-01-05', price: 10 };
  expect(() => validateTxn({ ...base, shares: 1.5 })).toThrow('จำนวนหุ้นต้องเป็นจำนวนเต็ม');
  expect(() => validateTxn({ ...base, shares: 0.3 })).toThrow('จำนวนหุ้นต้องเป็นจำนวนเต็ม');
  expect(() => validateTxn({ ...base, type: 'sell', shares: 0.3 })).toThrow('จำนวนหุ้นต้องเป็นจำนวนเต็ม');
  expect(validateTxn({ ...base, shares: 3 }).shares).toBe(3);
  expect(validateTxn({ ...base, type: 'sell', shares: 3 }).shares).toBe(3);
});
test('seq passes through only when it is a finite number', () => {
  const base = { type: 'buy', symbol: 'A', date: '2026-01-05', shares: 1, price: 1 };
  expect(validateTxn({ ...base, seq: 1764000000000 }).seq).toBe(1764000000000);
  expect(validateTxn({ type: 'dividend', symbol: 'A', date: '2026-01-05', amount: 1, seq: 3 }).seq).toBe(3);
  for (const seq of [undefined, null, NaN, Infinity, '5']) expect('seq' in validateTxn({ ...base, seq })).toBe(false);
});
