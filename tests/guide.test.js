import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { GUIDE } from '../src/data/guide.js';

const REQUIRED = ['price', 'range52', 'rangePos', 'drawdown', 'support', 'pe', 'tranches', 'tp', 'trailing', 'avgCost', 'halal', 'purification', 'wht', 'dca', 'drip'];
const dir = new URL('../src/ui/', import.meta.url);
const srcs = readdirSync(dir).filter((x) => x.endsWith('.js')).map((f) => readFileSync(new URL(f, dir), 'utf8'));
// ตัวช่วยที่ส่งต่อ term ให้ infoButton: const NAME = (...term...) => ... infoButton(term)
const helpers = new Set(['infoButton']);
for (const src of srcs) {
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>[^\n]*infoButton\(\s*(\w+)/g)) {
    if (m[2].split(',').map((x) => x.trim().split('=')[0].trim()).includes(m[3])) helpers.add(m[1]);
  }
}
const used = new Set();
for (const src of srcs) {
  for (const line of src.split('\n')) {
    for (const name of helpers) {
      if (line.includes(`const ${name} =`)) continue;
      for (const m of line.matchAll(new RegExp(`\\b${name}\\(`, 'g'))) {
        for (const l of line.slice(m.index).matchAll(/(?<!\bh\()'([a-z][A-Za-z0-9]*)'/g)) if (!['neg', 'pos'].includes(l[1])) used.add(l[1]);
      }
    }
  }
}

test('helper detection covers kv/row and checked set includes their terms', () => {
  expect(helpers.has('kv')).toBe(true);
  expect(helpers.has('row')).toBe(true);
  for (const t of ['unrealized', 'returnPct', 'range52', 'investGoal']) expect(used.has(t), t).toBe(true);
});

test('every infoButton termId exists in GUIDE with title+body', () => {
  expect(used.size).toBeGreaterThan(10);
  for (const t of used) expect(GUIDE[t]?.title && GUIDE[t]?.body, t).toBeTruthy();
});

test('required terms exist', () => {
  for (const t of REQUIRED) expect(GUIDE[t]?.title && GUIDE[t]?.body, t).toBeTruthy();
});
