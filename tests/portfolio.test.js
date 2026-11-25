import { test, expect } from 'vitest';
import { position, portfolioSummary, dividendsLast12m } from '../src/lib/portfolio.js';

const t = [
  {type:'buy',symbol:'SPUS',date:'2026-01-05',shares:10,price:50,fee:1},
  {type:'buy',symbol:'SPUS',date:'2026-02-05',shares:10,price:60,fee:1},
  {type:'sell',symbol:'SPUS',date:'2026-03-05',shares:5,price:70,fee:1},
  {type:'dividend',symbol:'SPUS',date:'2026-03-31',amount:2.55},
];
test('weighted avg cost and realized', () => {
  const p = position(t,'SPUS');
  expect(p.shares).toBe(15); expect(p.avgCost).toBeCloseTo(55.1); expect(p.realized).toBeCloseTo(73.5);
  expect(p.dividends).toBeCloseTo(2.55);
});
test('oversell rejected', () => {
  expect(() => position([...t,{type:'sell',symbol:'SPUS',date:'2026-04-01',shares:99,price:1}],'SPUS')).toThrow('ขายเกินจำนวนที่ถือ');
});
test('empty portfolio return is null', () => {
  expect(portfolioSummary([], {}).returnPct).toBeNull();
});
test('dividends last 12 months', () => {
  expect(dividendsLast12m(t,'2027-03-30')).toBeCloseTo(2.55);
  expect(dividendsLast12m(t,'2027-04-01')).toBe(0);
});
test('fee defaults to 0', () => {
  const p = position([{type:'buy',symbol:'A',date:'2026-01-01',shares:4,price:25}],'A');
  expect(p.avgCost).toBe(25);
  const q = position([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:4,price:25},
    {type:'sell',symbol:'A',date:'2026-01-02',shares:2,price:30},
  ],'A');
  expect(q.realized).toBeCloseTo(10);
});
test('sell to zero resets avgCost', () => {
  const p = position([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:4,price:25,fee:1},
    {type:'sell',symbol:'A',date:'2026-01-02',shares:4,price:30},
  ],'A');
  expect(p.shares).toBe(0); expect(p.avgCost).toBe(0); expect(p.realized).toBeCloseTo(19);
});
test('processes in date order and ignores other symbols', () => {
  const p = position([
    {type:'sell',symbol:'A',date:'2026-01-02',shares:1,price:30},
    {type:'buy',symbol:'B',date:'2026-01-01',shares:100,price:1},
    {type:'buy',symbol:'A',date:'2026-01-01',shares:2,price:20},
  ],'A');
  expect(p.shares).toBe(1); expect(p.realized).toBeCloseTo(10);
});
test('summary with missing price treats value as cost', () => {
  const s = portfolioSummary([{type:'buy',symbol:'A',date:'2026-01-01',shares:2,price:10}], {});
  expect(s.invested).toBe(20); expect(s.marketValue).toBe(20); expect(s.unrealized).toBe(0);
  expect(s.returnPct).toBe(0);
});
test('multi-symbol summary', () => {
  const s = portfolioSummary([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:10,price:10},
    {type:'buy',symbol:'B',date:'2026-01-01',shares:5,price:20},
    {type:'sell',symbol:'B',date:'2026-01-02',shares:5,price:30},
    {type:'buy',symbol:'B',date:'2026-01-03',shares:5,price:40},
    {type:'dividend',symbol:'A',date:'2026-02-01',amount:5},
  ], {A:12, B:30});
  expect(s.invested).toBeCloseTo(300);
  expect(s.marketValue).toBeCloseTo(270);
  expect(s.unrealized).toBeCloseTo(-30);
  expect(s.realized).toBeCloseTo(50);
  expect(s.dividends).toBeCloseTo(5);
  expect(s.returnPct).toBeCloseTo(25/300);
});
test('fractional shares: 0.1 + 0.2 - 0.3 is flat', () => {
  const p = position([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:0.1,price:10},
    {type:'buy',symbol:'A',date:'2026-01-02',shares:0.2,price:10},
    {type:'sell',symbol:'A',date:'2026-01-03',shares:0.3,price:12},
  ],'A');
  expect(p.shares).toBe(0); expect(p.avgCost).toBe(0); expect(p.realized).toBeCloseTo(0.6);
  expect(portfolioSummary([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:0.1,price:10},
    {type:'buy',symbol:'A',date:'2026-01-02',shares:0.2,price:10},
    {type:'sell',symbol:'A',date:'2026-01-03',shares:0.3,price:12},
  ], {A: 12}).invested).toBe(0);
});
test('fractional shares: 0.3 - 0.1 - 0.2 is allowed and flat', () => {
  const p = position([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:0.3,price:10},
    {type:'sell',symbol:'A',date:'2026-01-02',shares:0.1,price:10},
    {type:'sell',symbol:'A',date:'2026-01-03',shares:0.2,price:10},
  ],'A');
  expect(p.shares).toBe(0); expect(p.avgCost).toBe(0);
});
test('fractional oversell beyond tolerance still rejected; shares rounded to 8 dp', () => {
  expect(() => position([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:0.3,price:10},
    {type:'sell',symbol:'A',date:'2026-01-02',shares:0.300001,price:10},
  ],'A')).toThrow('ขายเกินจำนวนที่ถือ');
  const p = position([{type:'buy',symbol:'A',date:'2026-01-01',shares:0.1,price:1},{type:'buy',symbol:'A',date:'2026-01-01',shares:0.2,price:1}],'A');
  expect(p.shares).toBe(0.3);
});
