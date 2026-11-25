import { test, expect } from 'vitest';
import { position, portfolioSummary, dividendsLast12m, holdingStart, deleteTxnError, brokenSymbols, sortTxns, nextSeq } from '../src/lib/portfolio.js';

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
test('legacy fractional data (defence): 0.1 + 0.2 - 0.3 is flat', () => {
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
test('legacy fractional data (defence): 0.3 - 0.1 - 0.2 is allowed and flat', () => {
  const p = position([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:0.3,price:10},
    {type:'sell',symbol:'A',date:'2026-01-02',shares:0.1,price:10},
    {type:'sell',symbol:'A',date:'2026-01-03',shares:0.2,price:10},
  ],'A');
  expect(p.shares).toBe(0); expect(p.avgCost).toBe(0);
});
test('legacy fractional data (defence): oversell beyond tolerance still rejected; shares rounded to 8 dp', () => {
  expect(() => position([
    {type:'buy',symbol:'A',date:'2026-01-01',shares:0.3,price:10},
    {type:'sell',symbol:'A',date:'2026-01-02',shares:0.300001,price:10},
  ],'A')).toThrow('ขายเกินจำนวนที่ถือ');
  const p = position([{type:'buy',symbol:'A',date:'2026-01-01',shares:0.1,price:1},{type:'buy',symbol:'A',date:'2026-01-01',shares:0.2,price:1}],'A');
  expect(p.shares).toBe(0.3);
});
test('holdingStart = first buy after last flat; null when not held', () => {
  const tx = [
    {type:'buy',symbol:'A',date:'2026-01-01',shares:2,price:10},
    {type:'buy',symbol:'A',date:'2026-01-05',shares:1,price:10},
    {type:'sell',symbol:'A',date:'2026-02-01',shares:3,price:12},
    {type:'buy',symbol:'B',date:'2026-02-02',shares:1,price:1},
  ];
  expect(holdingStart(tx.slice(0, 2),'A')).toBe('2026-01-01');
  expect(holdingStart(tx,'A')).toBeNull();
  const rebuy = [...tx, {type:'buy',symbol:'A',date:'2026-03-01',shares:1,price:9}, {type:'buy',symbol:'A',date:'2026-03-02',shares:1,price:9}];
  expect(holdingStart(rebuy,'A')).toBe('2026-03-01');
  expect(holdingStart(rebuy,'B')).toBe('2026-02-02');
  expect(holdingStart([],'A')).toBeNull();
  // ขายบางส่วนไม่เปลี่ยนวันเริ่ม
  expect(holdingStart([...tx.slice(0, 2), {type:'sell',symbol:'A',date:'2026-01-10',shares:1,price:12}],'A')).toBe('2026-01-01');
});
test('deleteTxnError refuses delete that would oversell', () => {
  const tx = [
    {id:'b1',type:'buy',symbol:'A',date:'2026-01-01',shares:2,price:10},
    {id:'s1',type:'sell',symbol:'A',date:'2026-02-01',shares:2,price:12},
    {id:'d1',type:'dividend',symbol:'A',date:'2026-01-15',amount:1},
  ];
  expect(deleteTxnError(tx,'b1')).toBe('ลบไม่ได้: จะทำให้ประวัติขายเกินจำนวนที่ถือ');
  expect(deleteTxnError(tx,'s1')).toBeNull();
  expect(deleteTxnError(tx,'d1')).toBeNull();
  expect(deleteTxnError(tx,'nope')).toBeNull();
});
test('brokenSymbols names oversold histories', () => {
  expect(brokenSymbols([
    {type:'sell',symbol:'X',date:'2026-01-01',shares:1,price:1},
    {type:'buy',symbol:'A',date:'2026-01-01',shares:1,price:1},
  ])).toEqual(['X']);
});

// ลำดับรายการวันเดียวกัน: เรียงตาม seq (ลำดับที่บันทึก) ไม่ขึ้นกับลำดับที่ Firestore คืนมา
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
test('same-day sell-all then rebuy: holdingStart is rebuy date in any input order', () => {
  const txns = [
    { id: 'b1', type: 'buy', symbol: 'A', date: '2026-01-02', shares: 5, price: 10, seq: 100 },
    { id: 's1', type: 'sell', symbol: 'A', date: '2026-03-01', shares: 5, price: 12, seq: 200 },
    { id: 'b2', type: 'buy', symbol: 'A', date: '2026-03-01', shares: 3, price: 11, seq: 300 },
  ];
  for (const p of perms(txns)) {
    expect(holdingStart(p, 'A')).toBe('2026-03-01');
    expect(position(p, 'A')).toMatchObject({ shares: 3, avgCost: 11 });
  }
});
test('same-day buy then sell from zero is valid in any input order', () => {
  const txns = [
    { id: 'b1', type: 'buy', symbol: 'A', date: '2026-03-01', shares: 4, price: 10, seq: 1 },
    { id: 's1', type: 'sell', symbol: 'A', date: '2026-03-01', shares: 4, price: 12, seq: 2 },
  ];
  for (const p of perms(txns)) {
    expect(position(p, 'A').shares).toBe(0);
    expect(brokenSymbols(p)).toEqual([]);
    expect(deleteTxnError(p, 's1')).toBeNull();
    expect(deleteTxnError(p, 'b1')).toBe('ลบไม่ได้: จะทำให้ประวัติขายเกินจำนวนที่ถือ');
    expect(holdingStart(p, 'A')).toBeNull();
  }
});
test('legacy txns without seq keep input order on same date and sort before seq txns', () => {
  const buy = { type: 'buy', symbol: 'A', date: '2026-03-01', shares: 4, price: 10 };
  const sell = { type: 'sell', symbol: 'A', date: '2026-03-01', shares: 4, price: 12 };
  expect(position([buy, sell], 'A').shares).toBe(0);
  expect(() => position([sell, buy], 'A')).toThrow('ขายเกินจำนวนที่ถือ'); // เหมือนเดิม: ไม่มี seq ใช้ลำดับใน array
  expect(sortTxns([sell, buy])).toEqual([sell, buy]);
  const newer = { ...buy, shares: 1, seq: 5 };
  expect(sortTxns([newer, buy, sell])).toEqual([buy, sell, newer]);
  expect(sortTxns([{ ...buy, date: '2026-03-02' }, newer])[0]).toBe(newer); // วันที่มาก่อน seq
});
test('nextSeq is Date.now() but always above existing seq', () => {
  expect(nextSeq([], 1000)).toBe(1000);
  expect(nextSeq([{ seq: 500 }, { date: 'x' }], 1000)).toBe(1000);
  expect(nextSeq([{ seq: 2000 }], 1000)).toBe(2001);
  expect(Number.isFinite(nextSeq([{ seq: NaN }, { seq: '9' }], 7))).toBe(true);
});
test('already-broken history: deletions are allowed', () => {
  const txns = [
    { id: 'b1', type: 'buy', symbol: 'A', date: '2026-01-01', shares: 2, price: 10 },
    { id: 's1', type: 'sell', symbol: 'A', date: '2026-01-02', shares: 5, price: 10 },
    { id: 'd1', type: 'dividend', symbol: 'A', date: '2026-01-03', amount: 1 },
  ];
  expect(brokenSymbols(txns)).toEqual(['A']);
  expect(deleteTxnError(txns, 'd1')).toBeNull();
  expect(deleteTxnError(txns, 's1')).toBeNull();
});
