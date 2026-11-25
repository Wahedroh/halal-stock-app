import { test, expect } from 'vitest';
import { buildPortfolioView, fmtSigned } from '../src/ui/portfolioView.js';

const txns = [
  { type: 'buy', symbol: 'AVGO', date: '2026-01-02', shares: 10, price: 100 },
  { type: 'buy', symbol: 'NVDA', date: '2026-01-03', shares: 5, price: 200 },
  { type: 'sell', symbol: 'NVDA', date: '2026-02-03', shares: 5, price: 220 },
  { type: 'dividend', symbol: 'AVGO', date: '2026-03-01', amount: 20 },
];
const settings = { tranchePcts: [0.05, 0.12, 0.2], trailActivate: 0.15, trailPct: 0.12, alertWithin: 0.03 };
const base = { txns, settings, watchlist: ['AVGO', 'MSFT'], quotes: { AVGO: { price: 120, changePct: 1 }, MSFT: { price: 400, changePct: -2 } } };

test('summary numbers', () => {
  const v = buildPortfolioView(base);
  expect(v.summary.invested).toBe(1000);
  expect(v.summary.marketValue).toBe(1200);
  expect(v.summary.unrealized).toBe(200);
  expect(v.summary.realized).toBe(100);
  expect(v.summary.dividends).toBe(20);
  expect(v.summary.totalPnl).toBe(320);
  expect(v.summary.returnPct).toBeCloseTo(0.32);
});

test('holdings only include held symbols with pnl', () => {
  const v = buildPortfolioView(base);
  expect(v.holdings.map((x) => x.symbol)).toEqual(['AVGO']);
  expect(v.holdings[0]).toMatchObject({ shares: 10, avgCost: 100, price: 120, marketValue: 1200, pnl: 200 });
  expect(v.holdings[0].pnlPct).toBeCloseTo(0.2);
});

test('watch rows exclude held, keep price; missing quote is null', () => {
  const v = buildPortfolioView({ ...base, watchlist: ['AVGO', 'MSFT', 'AMD'] });
  expect(v.watch.map((x) => x.symbol)).toEqual(['MSFT', 'AMD']);
  expect(v.watch[0].price).toBe(400);
  expect(v.watch[1].price).toBeNull();
});

test('alerts: plan tranche/tp override, else computed', () => {
  // price 120: suggested tranche1 = 114 (5% away), tp from high52 = 122 -> within 3%
  const v = buildPortfolioView({ ...base, metrics: { AVGO: { high52: 122 } } });
  expect(v.holdings[0].alerts.map((a) => a.label)).toEqual(['TP']);
  const v2 = buildPortfolioView({ ...base, metrics: { AVGO: { high52: 122 } }, plans: { AVGO: { tp: 300, tranches: [119, null, null] } } });
  expect(v2.holdings[0].alerts.map((a) => a.label)).toEqual(['ไม้ 1']);
});

test('trailing alert from stored peak', () => {
  // avg 100, peak 140 (>15%), stop 123.2, price 120 -> hit, within 3%
  const v = buildPortfolioView({ ...base, plans: { AVGO: { peakSinceBuy: 140, tp: 999, tranches: [1, 1, 1] } } });
  expect(v.holdings[0].alerts.map((a) => a.label)).toEqual(['Trailing']);
});

test('missing price falls back to cost and is flagged', () => {
  const v = buildPortfolioView({ ...base, quotes: {} });
  expect(v.summary.marketValue).toBe(1000);
  expect(v.summary.missingPrices).toEqual(['AVGO']);
  expect(v.holdings[0].price).toBeNull();
  expect(v.holdings[0].pnl).toBeNull();
  expect(v.holdings[0].alerts).toEqual([]);
});

test('empty portfolio -> returnPct null', () => {
  const v = buildPortfolioView({ ...base, txns: [] });
  expect(v.summary.returnPct).toBeNull();
  expect(v.holdings).toEqual([]);
});

test('oversell reports error, no throw', () => {
  const v = buildPortfolioView({ ...base, txns: [{ type: 'sell', symbol: 'AVGO', date: '2026-01-01', shares: 1, price: 1 }] });
  expect(v.error).toBeTruthy();
});

test('fmtSigned', () => {
  expect(fmtSigned(null)).toBe('—');
  expect(fmtSigned(12.5)).toBe('+$12.50');
  expect(fmtSigned(-3)).toBe('-$3.00');
});
