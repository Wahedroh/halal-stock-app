import { test, expect } from 'vitest';
import { validateTxn } from '../src/lib/txn.js';

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
    { ...base, symbol: ' ' }, { type: 'dividend', symbol: 'A', date: '2026-01-05', amount: 0 },
    { ...base, shares: Infinity },
  ]) expect(() => validateTxn(bad)).toThrow(ERR);
});
