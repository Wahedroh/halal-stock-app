import { test, expect } from 'vitest';
import { buyTranches, takeProfit, trailingState, nearAlerts } from '../src/lib/plan.js';

test('tranches at -5/-12/-20%', () => {
  expect(buyTranches(100)).toEqual([95, 88, 80]);
});
test('tranches rounded to 2 decimals', () => {
  expect(buyTranches(123.456)).toEqual([117.28, 108.64, 98.76]);
});
test('tranches invalid price -> nulls', () => {
  expect(buyTranches(0)).toEqual([null, null, null]);
  expect(buyTranches(NaN)).toEqual([null, null, null]);
  expect(buyTranches(null)).toEqual([null, null, null]);
});
test('takeProfit = 52W high; invalid -> null', () => {
  expect(takeProfit(150)).toBe(150);
  expect(takeProfit(0)).toBeNull();
  expect(takeProfit(undefined)).toBeNull();
});
test('trailing inactive until profit > 15%', () => {
  expect(trailingState({avgCost:100, peakSinceBuy:114, price:114}).active).toBe(false);
  const s = trailingState({avgCost:100, peakSinceBuy:130, price:114});
  expect(s.active).toBe(true); expect(s.stopPrice).toBeCloseTo(114.4); expect(s.hit).toBe(true);
});
test('trailing exactly 15% is not active; inactive has null stop', () => {
  const s = trailingState({avgCost:100, peakSinceBuy:115, price:115});
  expect(s).toEqual({active:false, stopPrice:null, hit:false});
});
test('trailing active but price above stop is not hit', () => {
  const s = trailingState({avgCost:100, peakSinceBuy:130, price:125});
  expect(s.active).toBe(true); expect(s.hit).toBe(false);
});
test('trailing invalid inputs', () => {
  const off = {active:false, stopPrice:null, hit:false};
  expect(trailingState({avgCost:0, peakSinceBuy:130, price:100})).toEqual(off);
  expect(trailingState({avgCost:100, peakSinceBuy:NaN, price:100})).toEqual(off);
  expect(trailingState({avgCost:100, peakSinceBuy:130, price:null})).toEqual(off);
});
test('near alerts within 3%', () => {
  expect(nearAlerts(97, [{label:'ไม้ 1', price:95},{label:'TP', price:120}]).map(a=>a.label)).toEqual(['ไม้ 1']);
});
test('near alerts sorted by distance, skip invalid levels', () => {
  const r = nearAlerts(100, [
    {label:'A', price:102}, {label:'B', price:99.5}, {label:'C', price:null}, {label:'D', price:0},
  ]);
  expect(r.map(a=>a.label)).toEqual(['B','A']);
  expect(r[0].distance).toBeCloseTo(0.005);
});
