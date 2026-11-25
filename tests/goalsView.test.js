import { test, expect } from 'vitest';
import { buildGoalsView, parseGoalsForm, parseYieldPct } from '../src/ui/goalsView.js';

const goals = { dividendMonthlyThb: 40000, dividendByAge: 64, monthlyInvestThb: 10000, investTargetUsd: 10000, returnTargetPct: 0.1 };
const settings = { fx: 30, wht: 0.15 };
const summary = { invested: 2500, returnPct: 0.05 };
const txns = [{ type: 'dividend', symbol: 'A', date: '2026-06-01', amount: 400 }, { type: 'dividend', symbol: 'A', date: '2024-06-01', amount: 999 }];

test('dividend progress uses last 12m', () => {
  const v = buildGoalsView({ goals, settings, txns, summary, today: '2026-11-25', yieldPct: 0.045 });
  expect(v.dividend.currentMonthlyThb).toBe(1000);
  expect(v.dividend.pct).toBeCloseTo(0.025);
  expect(v.dividend.targetThb).toBe(40000);
});

test('required capital with yield 4.5%', () => {
  const v = buildGoalsView({ goals, settings, txns, summary, today: '2026-11-25', yieldPct: 0.045 });
  // 40000*12/0.85/30/0.045
  expect(v.required.capitalUsd).toBeCloseTo((480000 / 0.85 / 30) / 0.045, 4);
  expect(v.required.capitalThb).toBeCloseTo(v.required.capitalUsd * 30, 4);
});

test('required capital null when yield invalid', () => {
  expect(buildGoalsView({ goals, settings, txns, summary, today: '2026-11-25', yieldPct: null }).required).toBeNull();
  expect(buildGoalsView({ goals, settings, txns, summary, today: '2026-11-25', yieldPct: 0 }).required).toBeNull();
});

test('invest and return progress', () => {
  const v = buildGoalsView({ goals, settings, txns, summary, today: '2026-11-25', yieldPct: 0.045 });
  expect(v.invest).toEqual({ invested: 2500, target: 10000, pct: 0.25 });
  expect(v.returns.current).toBe(0.05);
  expect(v.returns.pct).toBeCloseTo(0.5);
});

test('unset targets -> null pct; negative return -> 0', () => {
  const g = { ...goals, investTargetUsd: null, returnTargetPct: null };
  const v = buildGoalsView({ goals: g, settings, txns, summary, today: '2026-11-25', yieldPct: 0.045 });
  expect(v.invest.pct).toBeNull();
  expect(v.returns.pct).toBeNull();
  const v2 = buildGoalsView({ goals, settings, txns, summary: { invested: 1, returnPct: -0.2 }, today: '2026-11-25', yieldPct: 0.045 });
  expect(v2.returns.pct).toBe(0);
  const v3 = buildGoalsView({ goals, settings, txns, summary: { invested: 0, returnPct: null }, today: '2026-11-25', yieldPct: 0.045 });
  expect(v3.returns.pct).toBeNull();
});

test('parseYieldPct: percent input -> fraction', () => {
  expect(parseYieldPct('4.5')).toBeCloseTo(0.045);
  expect(parseYieldPct('')).toBeNull();
  expect(parseYieldPct('abc')).toBeNull();
  expect(parseYieldPct('0')).toBeNull();
  expect(parseYieldPct('150')).toBeNull();
});

test('parseGoalsForm validates and converts', () => {
  const ok = parseGoalsForm({ dividendMonthlyThb: '50000', dividendByAge: '60', monthlyInvestThb: '12000', investTargetUsd: '', returnTargetPct: '8' });
  expect(ok.patch).toEqual({ dividendMonthlyThb: 50000, dividendByAge: 60, monthlyInvestThb: 12000, investTargetUsd: null, returnTargetPct: 0.08 });
  expect(parseGoalsForm({ dividendMonthlyThb: '-1', dividendByAge: '60', monthlyInvestThb: '1', investTargetUsd: '', returnTargetPct: '' }).error).toBeTruthy();
  expect(parseGoalsForm({ dividendMonthlyThb: '1', dividendByAge: '1.5', monthlyInvestThb: '1', investTargetUsd: '', returnTargetPct: '' }).error).toBeTruthy();
  expect(parseGoalsForm({ dividendMonthlyThb: '1', dividendByAge: '60', monthlyInvestThb: '1', investTargetUsd: 'x', returnTargetPct: '' }).error).toBeTruthy();
});
