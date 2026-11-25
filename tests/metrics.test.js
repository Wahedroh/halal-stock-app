import { test, expect } from 'vitest';
import { rangePosition, drawdown, distanceFromSupport, fmtPct, fmtUsd } from '../src/lib/metrics.js';

test('AVGO example from screenshot', () => {
  expect(rangePosition(303.27, 289.77, 495)).toBeCloseTo(0.0658, 3);
  expect(drawdown(303.27, 495)).toBeCloseTo(-0.3873, 4);
  expect(distanceFromSupport(303.27, 289.77)).toBeCloseTo(0.0466, 4);
});

test('degenerate inputs return null', () => {
  expect(rangePosition(10, 10, 10)).toBeNull();
  expect(drawdown(10, 0)).toBeNull();
  expect(distanceFromSupport(10, null)).toBeNull();
  expect(fmtPct(null)).toBe('—');
});

test('formatters', () => {
  expect(fmtPct(0.0658)).toBe('6.6%');
  expect(fmtPct(-0.3873)).toBe('-38.7%');
  expect(fmtUsd(303.27)).toBe('$303.27');
  expect(fmtUsd(-5)).toBe('-$5.00');
  expect(fmtUsd(null)).toBe('—');
});
