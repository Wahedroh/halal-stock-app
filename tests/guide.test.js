import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { GUIDE } from '../src/data/guide.js';

const REQUIRED = ['price', 'range52', 'rangePos', 'drawdown', 'support', 'pe', 'tranches', 'tp', 'trailing', 'avgCost', 'halal', 'purification', 'wht', 'dca', 'drip'];
const dir = new URL('../src/ui/', import.meta.url);
const used = new Set();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const src = readFileSync(new URL(f, dir), 'utf8');
  for (const m of src.matchAll(/infoButton\(\s*['"]([^'"]+)['"]/g)) used.add(m[1]);
  for (const m of src.matchAll(/row\([^\n]*?,\s*['"]([A-Za-z0-9]+)['"]\)/g)) used.add(m[1]);
}

test('every infoButton termId exists in GUIDE with title+body', () => {
  expect(used.size).toBeGreaterThan(10);
  for (const t of used) expect(GUIDE[t]?.title && GUIDE[t]?.body, t).toBeTruthy();
});

test('required terms exist', () => {
  for (const t of REQUIRED) expect(GUIDE[t]?.title && GUIDE[t]?.body, t).toBeTruthy();
});
