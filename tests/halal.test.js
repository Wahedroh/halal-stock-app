import { test, expect } from 'vitest';
import { halalCheck, purificationAmount } from '../src/lib/halal.js';

test('AAOIFI thresholds', () => {
  expect(halalCheck({interestDebt:29, interestDeposits:10, impermissiblePct:0.01, marketCap:100}).status).toBe('pass');
  expect(halalCheck({interestDebt:30, interestDeposits:10, impermissiblePct:0.01, marketCap:100}).status).toBe('fail');
  expect(halalCheck({interestDebt:1, interestDeposits:1, impermissiblePct:0.05, marketCap:100}).status).toBe('fail');
  expect(halalCheck({interestDebt:1, marketCap:0}).status).toBe('unchecked');
});
test('deposits at 30% fail; ratios returned', () => {
  const r = halalCheck({interestDebt:10, interestDeposits:30, impermissiblePct:0.01, marketCap:100});
  expect(r.status).toBe('fail');
  expect(r.debtRatio).toBeCloseTo(0.1);
  expect(r.depositRatio).toBeCloseTo(0.3);
  expect(r.purificationPct).toBe(0.01);
});
test('missing deposits -> unchecked with null ratios', () => {
  const r = halalCheck({interestDebt:10, impermissiblePct:0.01, marketCap:100});
  expect(r).toEqual({status:'unchecked', debtRatio:null, depositRatio:null, purificationPct:null});
});
test('purificationAmount', () => {
  expect(purificationAmount(100, 0.0123)).toBe(1.23);
  expect(purificationAmount(33.333, 0.01)).toBe(0.33);
  expect(purificationAmount(100, null)).toBe(0);
  expect(purificationAmount(NaN, 0.01)).toBe(0);
});
