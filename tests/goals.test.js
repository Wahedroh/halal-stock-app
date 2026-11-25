import { test, expect } from 'vitest';
import { dividendGoalProgress, requiredCapital, investGoalProgress } from '../src/lib/goals.js';

test('required capital matches chat calc (40,000 THB, 4.5%, fx 34)', () => {
  const r = requiredCapital({monthlyTargetThb:40000, yieldPct:0.045, fx:34});
  expect(r.capitalThb).toBeCloseTo(12549020, -3);
  expect(requiredCapital({monthlyTargetThb:40000, yieldPct:0, fx:34})).toBeNull();
  expect(requiredCapital({monthlyTargetThb:40000, yieldPct:0.045, fx:34, wht:1})).toBeNull();
});
test('dividend progress in THB', () => {
  expect(dividendGoalProgress({monthlyTargetThb:40000, dividendsLast12mUsd:1200, fx:34}).currentMonthlyThb).toBe(3400);
});
test('dividend pct clamps at 1 and null target', () => {
  expect(dividendGoalProgress({monthlyTargetThb:1000, dividendsLast12mUsd:1200, fx:34}).pct).toBe(1);
  expect(dividendGoalProgress({monthlyTargetThb:0, dividendsLast12mUsd:1200, fx:34}).pct).toBeNull();
});
test('investGoalProgress', () => {
  expect(investGoalProgress({targetUsd:1000, investedUsd:250})).toBe(0.25);
  expect(investGoalProgress({targetUsd:1000, investedUsd:2000})).toBe(1);
  expect(investGoalProgress({targetUsd:null, investedUsd:250})).toBeNull();
});
