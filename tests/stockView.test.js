import { test, expect } from 'vitest';
import { buildStockView, buildPlanDoc, errorMessage } from '../src/ui/stockView.js';
import { parseRoute } from '../src/ui/router.js';
import { mergeUser } from '../src/ui/userDoc.js';
import { DEFAULTS } from '../src/data/defaults.js';
import { GUIDE } from '../src/data/guide.js';
import { FinnhubError } from '../src/lib/finnhub.js';

const quote = { price: 303.27, changePct: -3.28 };
const metrics = { high52: 495, low52: 289.77, pe: 38.81 };
const profile = { name: 'Broadcom', marketCapUsd: 1.4e12 };
const base = { symbol: 'avgo', quote, metrics, profile, txns: [], settings: DEFAULTS.settings };

test('AVGO numbers', () => {
  const v = buildStockView(base);
  expect(v.symbol).toBe('AVGO');
  expect(v.rangePos).toBeCloseTo(0.0657, 3);
  expect(v.drawdown).toBeCloseTo(-0.3873, 3);
  expect(v.support).toBe(289.77);
  expect(v.supportDistance).toBeCloseTo(0.0466, 3);
  expect(v.pe).toBe(38.81);
  expect(v.tranches.map((t) => t.price)).toEqual([288.11, 266.88, 242.62]);
  expect(v.tranches.every((t) => !t.edited)).toBe(true);
  expect(v.tp).toEqual({ price: 495, suggested: 495, edited: false });
  expect(v.halal.status).toBe('unchecked');
  expect(v.stale).toBe(false);
});

test('saved plan overrides suggestions; null entries fall back', () => {
  const v = buildStockView({ ...base, plan: { tranches: [290, null, 240], tp: 480 } });
  expect(v.tranches.map((t) => [t.price, t.edited])).toEqual([[290, true], [266.88, false], [240, true]]);
  expect(v.tp.price).toBe(480);
  expect(v.tp.edited).toBe(true);
});

test('null pe and missing metrics give nulls', () => {
  const v = buildStockView({ ...base, metrics: { high52: null, low52: null, pe: null } });
  expect(v.pe).toBeNull();
  expect(v.rangePos).toBeNull();
  expect(v.drawdown).toBeNull();
  expect(v.tp.price).toBeNull();
});

test('quote missing (not_found) does not throw', () => {
  const v = buildStockView({ ...base, quote: null, metrics: null, profile: null });
  expect(v.price).toBeNull();
  expect(v.tranches.map((t) => t.price)).toEqual([null, null, null]);
  expect(v.alerts).toEqual([]);
});

test('stale flag from any source', () => {
  expect(buildStockView({ ...base, quote: { ...quote, stale: true } }).stale).toBe(true);
});

test('position, peak update and trailing', () => {
  const txns = [{ type: 'buy', symbol: 'AVGO', date: '2026-01-02', shares: 10, price: 200 }];
  const v = buildStockView({ ...base, txns, plan: { peakSinceBuy: 250 } });
  expect(v.position.held).toBe(true);
  expect(v.peak).toBe(303.27);
  expect(v.peakChanged).toBe(true);
  expect(v.trailing.active).toBe(true);
  expect(v.trailing.stopPrice).toBe(266.88);
  const v2 = buildStockView({ ...base, txns, plan: { peakSinceBuy: 400 } });
  expect(v2.peakChanged).toBe(false);
  expect(v2.trailing.hit).toBe(true);
  const none = buildStockView({ ...base, plan: { peakSinceBuy: 100 } });
  expect(none.peakChanged).toBe(false);
  expect(none.trailing.active).toBe(false);
});

test('oversell in history surfaces error text, ignores other symbols', () => {
  const txns = [{ type: 'sell', symbol: 'AVGO', date: '2026-01-02', shares: 1, price: 1 }, { type: 'buy', symbol: 'AAPL', date: '2026-01-01', shares: 1, price: 1 }];
  const v = buildStockView({ ...base, txns });
  expect(v.positionError).toBe('ขายเกินจำนวนที่ถือ');
  expect(v.txns).toHaveLength(1);
});

test('alerts near tranche', () => {
  const v = buildStockView({ ...base, plan: { tranches: [300, null, null] } });
  expect(v.alerts[0].label).toBe('ไม้ 1');
});

test('halal pass with purification from this symbol dividends', () => {
  const txns = [{ type: 'dividend', symbol: 'AVGO', date: '2026-03-01', amount: 100 }, { type: 'dividend', symbol: 'AAPL', date: '2026-03-01', amount: 999 }];
  const halal = { interestDebt: 1e10, interestDeposits: 1e9, impermissiblePct: 0.02, source: 'Musaffa', enteredAt: '2026-11-25' };
  const v = buildStockView({ ...base, txns, halal });
  expect(v.halal.status).toBe('pass');
  expect(v.halal.source).toBe('Musaffa');
  expect(v.halal.enteredAt).toBe('2026-11-25');
  expect(v.halal.purification.amount).toBe(2);
  expect(buildStockView({ ...base, halal: { ...halal, impermissiblePct: 0.06 } }).halal.status).toBe('fail');
  expect(buildStockView({ ...base, halal, profile: { name: 'x', marketCapUsd: null } }).halal.status).toBe('unchecked');
});

test('buildPlanDoc omits undefined/null', () => {
  const d = buildPlanDoc({ tp: 400 }, { tranches: [1, null, 3], note: 'x', peakSinceBuy: undefined });
  expect(d).toEqual({ tranches: [1, null, 3], tp: 400, note: 'x' });
  expect(Object.values(d).includes(undefined)).toBe(false);
});

test('buildPlanDoc keeps stored value when patch is undefined', () => {
  expect(buildPlanDoc({ peakSinceBuy: 300, tp: 5 }, { peakSinceBuy: undefined, tp: undefined }).peakSinceBuy).toBe(300);
});

test('errorMessage by code', () => {
  expect(errorMessage(new FinnhubError('not_found'))).toBe('ไม่พบหุ้นนี้');
  expect(errorMessage(new FinnhubError('bad_key'))).toBe('API key ไม่ถูกต้อง ไปที่ตั้งค่า');
  expect(errorMessage(new FinnhubError('rate_limit'))).toBe('เรียกข้อมูลถี่เกินไป รอ 1 นาที');
});

test('parseRoute', () => {
  expect(parseRoute('')).toEqual({ name: 'portfolio' });
  expect(parseRoute('#/stock/avgo ')).toEqual({ name: 'stock', sym: 'AVGO' });
  expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  expect(parseRoute('#/zzz')).toEqual({ name: 'portfolio' });
});

test('mergeUser fills defaults without mutating DEFAULTS', () => {
  const u = mergeUser({ settings: { fx: 36 }, watchlist: ['A'] });
  expect(u.settings.fx).toBe(36);
  expect(u.settings.tranchePcts).toEqual([0.05, 0.12, 0.2]);
  expect(u.goals.dividendByAge).toBe(64);
  expect(u.watchlist).toEqual(['A']);
  u.settings.tranchePcts.push(1);
  expect(DEFAULTS.settings.tranchePcts).toHaveLength(3);
  expect(mergeUser(null).watchlist).toHaveLength(11);
});

test('guide covers required terms', () => {
  for (const t of ['price', 'range52', 'rangePos', 'drawdown', 'support', 'pe', 'tranches', 'tp', 'trailing', 'avgCost', 'halal', 'purification']) {
    expect(GUIDE[t]?.title && GUIDE[t]?.body).toBeTruthy();
  }
});
