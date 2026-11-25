import { test, expect } from 'vitest';
import { buildPortfolioView, fmtSigned, peakSaves } from '../src/ui/portfolioView.js';

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
  const v = buildPortfolioView({ ...base, plans: { AVGO: { peakSinceBuy: 140, peakHoldingStart: '2026-01-02', tp: 999, tranches: [1, 1, 1] } } });
  expect(v.holdings[0].alerts.map((a) => a.label)).toEqual(['Trailing']);
  expect(v.holdings[0].peakChanged).toBe(false);
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

test('broken symbol is named and the rest of the portfolio still renders', () => {
  const bad = [...txns, { type: 'sell', symbol: 'MSFT', date: '2026-01-01', shares: 1, price: 1 }];
  const v = buildPortfolioView({ ...base, txns: bad });
  expect(v.broken).toEqual(['MSFT']);
  expect(v.error).toContain('MSFT');
  expect(v.error).toContain('ขายเกินจำนวนที่ถือ');
  expect(v.summary.invested).toBe(1000);
  expect(v.summary.realized).toBe(100);
  expect(v.holdings.map((x) => x.symbol)).toEqual(['AVGO']);
  expect(buildPortfolioView(base).error).toBeNull();
});

test('portfolio trailing uses max(stored peak, price) and reports peak to save', () => {
  // avg 100, stored peak 110 (<15%) but price 120 -> peak 120 (>15%) -> trailing on, stop 105.6
  const plans = { AVGO: { peakSinceBuy: 110, peakHoldingStart: '2026-01-02', tp: 999, tranches: [1, 1, 1] } };
  const v = buildPortfolioView({ ...base, plans });
  expect(v.holdings[0]).toMatchObject({ peak: 120, peakChanged: true, peakStart: '2026-01-02' });
  expect(peakSaves(v, { AVGO: true })).toEqual([{ symbol: 'AVGO', patch: { peakSinceBuy: 120, peakHoldingStart: '2026-01-02' } }]);
  expect(peakSaves(v, { AVGO: false })).toEqual([]);
  expect(peakSaves(v, {})).toEqual([]);
});

test('portfolio ignores peak from an earlier holding period', () => {
  // ถือรอบเก่า peak 200 -> ขายหมด -> ซื้อใหม่ 2026-04-01 ที่ 100, ราคา 120: ไม่ควรขึ้น Trailing จาก 200
  const t2 = [
    { type: 'buy', symbol: 'AVGO', date: '2026-01-02', shares: 10, price: 100 },
    { type: 'sell', symbol: 'AVGO', date: '2026-02-02', shares: 10, price: 190 },
    { type: 'buy', symbol: 'AVGO', date: '2026-04-01', shares: 10, price: 100 },
  ];
  const v = buildPortfolioView({ ...base, txns: t2, plans: { AVGO: { peakSinceBuy: 200, peakHoldingStart: '2026-01-02', tp: 999, tranches: [1, 1, 1] } } });
  expect(v.holdings[0].peak).toBe(120);
  expect(v.holdings[0].peakStart).toBe('2026-04-01');
  expect(v.holdings[0].alerts).toEqual([]);
});

test('fmtSigned', () => {
  expect(fmtSigned(null)).toBe('—');
  expect(fmtSigned(12.5)).toBe('+$12.50');
  expect(fmtSigned(-3)).toBe('-$3.00');
});

test('display formatting helpers', async () => {
  const { fmtSignedPct, fmtChangePct, pnlWord, fmtThb } = await import('../src/ui/portfolioView.js');
  expect(fmtSignedPct(0.065)).toBe('+6.5%');
  expect(fmtSignedPct(-0.0333)).toBe('-3.3%');
  expect(fmtSignedPct(0)).toBe('+0.0%');
  expect(fmtSignedPct(null)).toBe('—');
  expect(fmtChangePct(-3.28)).toBe('-3.28%');
  expect(fmtChangePct(1.2)).toBe('+1.20%');
  expect(fmtChangePct(undefined)).toBe('—');
  expect(pnlWord(-1)).toBe('ขาดทุน');
  expect(pnlWord(5)).toBe('กำไร');
  expect(pnlWord(null)).toBe('กำไร');
  expect(fmtThb(40000)).toBe('40,000');
  expect(fmtThb(3199.6)).toBe('3,200');
  expect(fmtThb(NaN)).toBe('—');
});
