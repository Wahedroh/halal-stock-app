import { test, expect } from 'vitest';
import { buildStockView, buildPlanDoc, applyPlanSave, shouldSavePeak, errorMessage, peakPatch, planPatchFromForm, parseTxnForm, parseHalalForm, halalFormValues, halalPreview, halalFailText } from '../src/ui/stockView.js';
import { parseRoute } from '../src/ui/router.js';
import { mergeUser } from '../src/ui/userDoc.js';
import { DEFAULTS } from '../src/data/defaults.js';
import { FinnhubError } from '../src/lib/finnhub.js';

const quote = { price: 303.27, changePct: -3.28 };
const metrics = { high52: 495, low52: 289.77, pe: 38.81 };
const profile = { name: 'Broadcom', marketCapUsd: 1.4e12 };
const base = { symbol: 'avgo', quote, metrics, profile, txns: [], settings: DEFAULTS.settings };

test('AVGO numbers', () => {
  const v = buildStockView(base);
  expect(v.symbol).toBe('AVGO');
  expect(v.rangePos).toBeCloseTo(0.0657, 3);
  expect(v.drawdown).toBeCloseTo(-0.3873, 3);
  expect(v.support).toBe(289.77);
  expect(v.supportDistance).toBeCloseTo(0.0466, 3);
  expect(v.pe).toBe(38.81);
  expect(v.tranches.map((t) => t.price)).toEqual([288.11, 266.88, 242.62]);
  expect(v.tranches.every((t) => !t.edited)).toBe(true);
  expect(v.tp).toEqual({ price: 495, suggested: 495, edited: false });
  expect(v.halal.status).toBe('unchecked');
  expect(v.stale).toBe(false);
});

test('saved plan overrides suggestions; null entries fall back', () => {
  const v = buildStockView({ ...base, plan: { tranches: [290, null, 240], tp: 480 } });
  expect(v.tranches.map((t) => [t.price, t.edited])).toEqual([[290, true], [266.88, false], [240, true]]);
  expect(v.tp.price).toBe(480);
  expect(v.tp.edited).toBe(true);
});

test('null pe and missing metrics give nulls', () => {
  const v = buildStockView({ ...base, metrics: { high52: null, low52: null, pe: null } });
  expect(v.pe).toBeNull();
  expect(v.rangePos).toBeNull();
  expect(v.drawdown).toBeNull();
  expect(v.tp.price).toBeNull();
});

test('quote missing (not_found) does not throw', () => {
  const v = buildStockView({ ...base, quote: null, metrics: null, profile: null });
  expect(v.price).toBeNull();
  expect(v.tranches.map((t) => t.price)).toEqual([null, null, null]);
  expect(v.alerts).toEqual([]);
});

test('stale flag from any source', () => {
  expect(buildStockView({ ...base, quote: { ...quote, stale: true } }).stale).toBe(true);
});

test('position, peak update and trailing', () => {
  const txns = [{ type: 'buy', symbol: 'AVGO', date: '2026-01-02', shares: 10, price: 200 }];
  const v = buildStockView({ ...base, txns, plan: { peakSinceBuy: 250, peakHoldingStart: '2026-01-02' } });
  expect(v.position.held).toBe(true);
  expect(v.peakStart).toBe('2026-01-02');
  expect(v.peak).toBe(303.27);
  expect(v.peakChanged).toBe(true);
  expect(v.trailing.active).toBe(true);
  expect(v.trailing.stopPrice).toBe(266.88);
  const v2 = buildStockView({ ...base, txns, plan: { peakSinceBuy: 400, peakHoldingStart: '2026-01-02' } });
  expect(v2.peakChanged).toBe(false);
  expect(v2.trailing.hit).toBe(true);
  const none = buildStockView({ ...base, plan: { peakSinceBuy: 100 } });
  expect(none.peakChanged).toBe(false);
  expect(none.trailing.active).toBe(false);
});

test('oversell in history surfaces error text, ignores other symbols', () => {
  const txns = [{ type: 'sell', symbol: 'AVGO', date: '2026-01-02', shares: 1, price: 1 }, { type: 'buy', symbol: 'AAPL', date: '2026-01-01', shares: 1, price: 1 }];
  const v = buildStockView({ ...base, txns });
  expect(v.positionError).toBe('ขายเกินจำนวนที่ถือ');
  expect(v.txns).toHaveLength(1);
});

test('alerts near tranche', () => {
  const v = buildStockView({ ...base, plan: { tranches: [300, null, null] } });
  expect(v.alerts[0].label).toBe('ไม้ 1');
});

test('halal pass with purification from this symbol dividends', () => {
  const txns = [{ type: 'dividend', symbol: 'AVGO', date: '2026-03-01', amount: 100 }, { type: 'dividend', symbol: 'AAPL', date: '2026-03-01', amount: 999 }];
  const halal = { interestDebt: 1e10, interestDeposits: 1e9, impermissiblePct: 0.02, source: 'Musaffa', enteredAt: '2026-11-25' };
  const v = buildStockView({ ...base, txns, halal });
  expect(v.halal.status).toBe('pass');
  expect(v.halal.source).toBe('Musaffa');
  expect(v.halal.enteredAt).toBe('2026-11-25');
  expect(v.halal.purification.amount).toBe(2);
  expect(buildStockView({ ...base, halal: { ...halal, impermissiblePct: 0.06 } }).halal.status).toBe('fail');
  expect(buildStockView({ ...base, halal, profile: { name: 'x', marketCapUsd: null } }).halal.status).toBe('unchecked');
});

test('buildPlanDoc omits undefined/null', () => {
  const d = buildPlanDoc({ tp: 400 }, { tranches: [1, null, 3], note: 'x', peakSinceBuy: undefined });
  expect(d).toEqual({ tranches: [1, null, 3], tp: 400, note: 'x' });
  expect(Object.values(d).includes(undefined)).toBe(false);
});

test('buildPlanDoc keeps stored value when patch is undefined', () => {
  expect(buildPlanDoc({ peakSinceBuy: 300, tp: 5 }, { peakSinceBuy: undefined, tp: undefined }).peakSinceBuy).toBe(300);
});

test('errorMessage by code', () => {
  expect(errorMessage(new FinnhubError('not_found'))).toBe('ไม่พบหุ้นนี้');
  expect(errorMessage(new FinnhubError('bad_key'))).toBe('API key ไม่ถูกต้อง ไปที่ตั้งค่า');
  expect(errorMessage(new FinnhubError('rate_limit'))).toBe('เรียกข้อมูลถี่เกินไป รอ 1 นาที');
  expect(errorMessage(new FinnhubError('no_key'))).toBe('ยังไม่ได้ใส่ API key ไปที่ตั้งค่า');
  expect(errorMessage(new FinnhubError('forbidden'))).toBe('API key ไม่ถูกต้อง หรือแพ็กฟรีไม่รองรับหุ้นตัวนี้');
});

test('parseRoute', () => {
  expect(parseRoute('')).toEqual({ name: 'portfolio' });
  expect(parseRoute('#/stock/avgo ')).toEqual({ name: 'stock', sym: 'AVGO' });
  expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  expect(parseRoute('#/zzz')).toEqual({ name: 'portfolio' });
  expect(parseRoute('#/stock/')).toEqual({ name: 'stock', sym: '' });
  expect(parseRoute('#/stock/brk.b')).toEqual({ name: 'stock', sym: 'BRK.B' });
  expect(parseRoute('#/stock/%3Cscript%3E')).toEqual({ name: 'stock', sym: '', error: 'สัญลักษณ์หุ้นไม่ถูกต้อง' });
  expect(parseRoute('#/stock/ABCDEFGHIJK')).toEqual({ name: 'stock', sym: '', error: 'สัญลักษณ์หุ้นไม่ถูกต้อง' });
});

test('mergeUser fills defaults without mutating DEFAULTS', () => {
  const u = mergeUser({ settings: { fx: 36 }, watchlist: ['A'] });
  expect(u.settings.fx).toBe(36);
  expect(u.settings.tranchePcts).toEqual([0.05, 0.12, 0.2]);
  expect(u.goals.dividendByAge).toBe(64);
  expect(u.watchlist).toEqual(['A']);
  u.settings.tranchePcts.push(1);
  expect(DEFAULTS.settings.tranchePcts).toHaveLength(3);
  expect(mergeUser(null).watchlist).toHaveLength(11);
});

test('shouldSavePeak only when plan loaded and peak changed', () => {
  const txns = [{ type: 'buy', symbol: 'AVGO', date: '2026-01-02', shares: 10, price: 200 }];
  const v = buildStockView({ ...base, txns, plan: undefined });
  expect(v.peakChanged).toBe(true);
  expect(shouldSavePeak(v, false)).toBe(false);
  expect(shouldSavePeak(v, true)).toBe(true);
  expect(shouldSavePeak(buildStockView(base), true)).toBe(false);
});

test('sequential plan saves keep earlier fields (note then tranches)', () => {
  let cur = { tp: 400, peakSinceBuy: 300 };
  cur = applyPlanSave(cur, { note: 'hello' });
  cur = applyPlanSave(cur, { tranches: [1, null, 3], tp: undefined });
  expect(cur).toEqual({ tp: 400, peakSinceBuy: 300, note: 'hello', tranches: [1, null, 3] });
  cur = applyPlanSave(cur, { note: 'x' });
  expect(cur.tranches).toEqual([1, null, 3]);
});

test('old peak ignored after selling everything and re-buying (no false trailing hit)', () => {
  const txns = [
    { type: 'buy', symbol: 'AVGO', date: '2026-01-02', shares: 10, price: 200 },
    { type: 'sell', symbol: 'AVGO', date: '2026-03-01', shares: 10, price: 390 },
    { type: 'buy', symbol: 'AVGO', date: '2026-06-01', shares: 5, price: 290 },
  ];
  const v = buildStockView({ ...base, txns, plan: { peakSinceBuy: 400, peakHoldingStart: '2026-01-02' } });
  expect(v.peakStart).toBe('2026-06-01');
  expect(v.peak).toBe(303.27);
  expect(v.peakChanged).toBe(true);
  expect(v.trailing.hit).toBe(false);
  expect(peakPatch(v)).toEqual({ peakSinceBuy: 303.27, peakHoldingStart: '2026-06-01' });
  const same = buildStockView({ ...base, txns, plan: { peakSinceBuy: 400, peakHoldingStart: '2026-06-01' } });
  expect(same.peak).toBe(400);
  expect(peakPatch(same)).toEqual({});
});

test('buildPlanDoc: null clears stored tp/tranches; keeps peakHoldingStart', () => {
  const d = buildPlanDoc({ tp: 400, tranches: [1, 2, 3], peakSinceBuy: 300, peakHoldingStart: '2026-01-02' }, { tp: null, tranches: [null, null, null] });
  expect(d).toEqual({ tranches: [null, null, null], peakSinceBuy: 300, peakHoldingStart: '2026-01-02' });
  expect('tp' in d).toBe(false);
});

test('planPatchFromForm: suggestion -> null, edited -> value, empty TP -> null', () => {
  const v = buildStockView(base); // tranches 288.11/266.88/242.62, tp 495
  expect(planPatchFromForm(v, { tranches: ['288.11', '266.88', '242.62'], tp: '495' })).toEqual({ patch: { tranches: [null, null, null], tp: null } });
  expect(planPatchFromForm(v, { tranches: ['280', '266.88', ''], tp: '' })).toEqual({ patch: { tranches: [280, null, null], tp: null } });
  expect(planPatchFromForm(v, { tranches: ['', '', ''], tp: '480' })).toEqual({ patch: { tranches: [null, null, null], tp: 480 } });
  expect(planPatchFromForm(v, { tranches: ['-1', '', ''], tp: '' }).error).toBe('ราคาต้องมากกว่า 0');
  expect(planPatchFromForm(v, { tranches: ['', '', ''], tp: 'abc' }).error).toBe('ราคาต้องมากกว่า 0');
  // เมื่อแอปเสนอไม่ได้ (ไม่มีราคา) ค่าที่กรอกถือว่าแก้เอง
  const nv = buildStockView({ ...base, quote: null, metrics: null });
  expect(planPatchFromForm(nv, { tranches: ['100', '', ''], tp: '200' }).patch).toEqual({ tranches: [100, null, null], tp: 200 });
});

test('plan saved from untouched form shows no "edited" and TP returns to 52W High', () => {
  const v = buildStockView({ ...base, plan: { tp: 480, tranches: [290, null, null] } });
  const { patch } = planPatchFromForm(v, { tranches: ['288.11', '266.88', '242.62'], tp: '' });
  const v2 = buildStockView({ ...base, plan: applyPlanSave({ tp: 480, tranches: [290, null, null] }, patch) });
  expect(v2.tranches.every((t) => !t.edited)).toBe(true);
  expect(v2.tp).toEqual({ price: 495, suggested: 495, edited: false });
});

test('parseTxnForm: whole shares only, optional fee, dividend amount', () => {
  expect(parseTxnForm('AVGO', { type: 'buy', date: '2026-01-02', shares: '3', price: '10', fee: '' })).toEqual({ txn: { symbol: 'AVGO', type: 'buy', date: '2026-01-02', shares: 3, price: 10 } });
  expect(parseTxnForm('AVGO', { type: 'buy', date: '2026-01-02', shares: '1.5', price: '10' }).error).toBe('จำนวนหุ้นต้องเป็นจำนวนเต็ม');
  expect(parseTxnForm('AVGO', { type: 'sell', date: '2026-01-02', shares: '0', price: '10' }).error).toBe('จำนวนหุ้นและราคาต้องมากกว่า 0');
  expect(parseTxnForm('AVGO', { type: 'buy', date: '2026-01-02', shares: '2', price: '10', fee: '-1' }).error).toBe('ค่าธรรมเนียมต้องไม่ติดลบ');
  expect(parseTxnForm('AVGO', { type: 'buy', date: '2026-01-02', shares: '2', price: '10', fee: '0.5' }).txn.fee).toBe(0.5);
  expect(parseTxnForm('AVGO', { type: 'dividend', date: '2026-01-02', amount: '1.25', shares: '1.5' })).toEqual({ txn: { symbol: 'AVGO', type: 'dividend', date: '2026-01-02', amount: 1.25 } });
  expect(parseTxnForm('AVGO', { type: 'dividend', date: '2026-01-02', amount: '' }).error).toBe('จำนวนเงินต้องมากกว่า 0');
});

test('halal form: million USD in, USD stored, round-trip prefill', () => {
  const r = parseHalalForm({ debt: '67000', dep: '9348.5', imp: '1.2', src: ' Musaffa ' }, '2026-11-25');
  expect(r.doc).toEqual({ interestDebt: 67e9, interestDeposits: 9348.5e6, impermissiblePct: 0.012, source: 'Musaffa', enteredAt: '2026-11-25' });
  expect(halalFormValues(r.doc)).toEqual({ debt: '67000', dep: '9348.5', imp: '1.2', src: 'Musaffa' });
  expect(halalFormValues(null)).toEqual({ debt: '', dep: '', imp: '', src: '' });
  expect(parseHalalForm({ debt: '', dep: '1', imp: '1', src: 'x' }, 'd').error).toBeTruthy();
  expect(parseHalalForm({ debt: '1', dep: '1', imp: '101', src: 'x' }, 'd').error).toBeTruthy();
  expect(parseHalalForm({ debt: '1', dep: '1', imp: '1', src: ' ' }, 'd').error).toBe('ต้องระบุแหล่งที่มาของข้อมูลฮาลาล');
});

test('halal preview: live ratios, unit warning < 0.1%, failed rule', () => {
  const p = halalPreview({ debt: '67000', dep: '9348', imp: '1' }, 1.4e12);
  expect(p.debtRatio).toBeCloseTo(0.04786, 4);
  expect(p.depositRatio).toBeCloseTo(0.00668, 4);
  expect(p.warn).toBeNull();
  expect(p.status).toBe('pass');
  // กรอกเป็นพันล้าน (67) แทนล้าน -> สัดส่วนเล็กผิดปกติ
  expect(halalPreview({ debt: '67', dep: '9348', imp: '1' }, 1.4e12).warn).toBe('ตรวจหน่วยอีกครั้ง: ตัวเลขควรเป็นล้าน USD');
  const f = halalPreview({ debt: '500000', dep: '9348', imp: '6' }, 1.4e12);
  expect(f.status).toBe('fail');
  expect(f.failed).toEqual(['debt', 'impermissible']);
  expect(halalFailText(f.failed)).toBe('ไม่ผ่าน: หนี้ดอกเบี้ยไม่ต่ำกว่า 30% ของ Market Cap · รายได้ต้องห้ามไม่ต่ำกว่า 5%');
  // ไม่มีหนี้/เงินฝากเลย (0) ไม่ใช่ปัญหาหน่วย
  expect(halalPreview({ debt: '0', dep: '0', imp: '0' }, 1.4e12).warn).toBeNull();
  expect(halalPreview({ debt: '0', dep: '67', imp: '0' }, 1.4e12).warn).toBe('ตรวจหน่วยอีกครั้ง: ตัวเลขควรเป็นล้าน USD');
  const nm = halalPreview({ debt: '1', dep: '1', imp: '1' }, null);
  expect(nm).toMatchObject({ noMarketCap: true, debtRatio: null, depositRatio: null, warn: null, status: 'unchecked' });
});

test('buildStockView halal exposes failed rules', () => {
  const halal = { interestDebt: 5e11, interestDeposits: 1e9, impermissiblePct: 0.01, source: 's', enteredAt: '2026-11-25' };
  expect(buildStockView({ ...base, halal }).halal.failed).toEqual(['debt']);
});

test('history list is newest first, same-day ordered by seq', () => {
  const txns = [
    { id: 'b2', type: 'buy', symbol: 'AVGO', date: '2026-03-01', shares: 3, price: 11, seq: 300 },
    { id: 'b1', type: 'buy', symbol: 'AVGO', date: '2026-01-02', shares: 5, price: 10, seq: 100 },
    { id: 's1', type: 'sell', symbol: 'AVGO', date: '2026-03-01', shares: 5, price: 12, seq: 200 },
  ];
  const v = buildStockView({ ...base, txns });
  expect(v.txns.map((t) => t.id)).toEqual(['b2', 's1', 'b1']);
  expect(v.peakStart).toBe('2026-03-01');
  expect(v.positionError ?? null).toBeNull();
});
