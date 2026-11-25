import { test, expect } from 'vitest';
import { DEFAULTS } from '../src/data/defaults.js';

test('settings defaults', () => {
  expect(DEFAULTS.settings).toEqual({ fx: 34, tranchePcts: [0.05, 0.12, 0.20], trailActivate: 0.15, trailPct: 0.12, alertWithin: 0.03, wht: 0.15, finnhubKey: '' });
});
test('goals defaults', () => {
  expect(DEFAULTS.goals).toEqual({ dividendMonthlyThb: 40000, dividendByAge: 64, monthlyInvestThb: 10000, investTargetUsd: null });
});
test('watchlist defaults in order', () => {
  expect(DEFAULTS.watchlist).toEqual(['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AVGO', 'MU', 'TSLA', 'LLY', 'AMD', 'XOM', 'META']);
});
