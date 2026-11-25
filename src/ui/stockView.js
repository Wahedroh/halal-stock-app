import { rangePosition, drawdown, distanceFromSupport } from '../lib/metrics.js';
import { buyTranches, takeProfit, trailingState, nearAlerts, peakState } from '../lib/plan.js';
import { position, holdingStart } from '../lib/portfolio.js';
import { WHOLE_SHARES_ERR } from '../lib/txn.js';
import { halalCheck, purificationAmount } from '../lib/halal.js';
import { DEFAULTS } from '../data/defaults.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const SUGGEST_NOTE = 'คำนวณตามสูตรที่ครูตั้ง';

/**
 * คำนวณข้อมูลที่หน้าหุ้นแสดง (ฟังก์ชันล้วน ทดสอบได้)
 * quote/metrics/profile อาจเป็น null (ดึงไม่ได้) · stale=true ถ้าเป็นแคชเก่า
 */
export function buildStockView({ symbol, quote, metrics, profile, txns = [], plan, halal, settings } = {}) {
  const s = { ...DEFAULTS.settings, ...(settings ?? {}) };
  const sym = String(symbol ?? '').trim().toUpperCase();
  const price = num(quote?.price);
  const high52 = num(metrics?.high52);
  const low52 = num(metrics?.low52);
  const myTxns = txns.filter((t) => t.symbol === sym);

  let pos = { shares: 0, avgCost: 0, realized: 0, dividends: 0 };
  let positionError = null;
  try { pos = position(myTxns, sym); } catch (e) { positionError = e.message; }
  const held = pos.shares > 0;

  // แผนซื้อ 3 ไม้: ค่าที่ครูแก้ไว้ทับค่าที่คำนวณ
  const suggested = buyTranches(price, s.tranchePcts);
  const saved = Array.isArray(plan?.tranches) ? plan.tranches : [];
  const tranches = suggested.map((sg, i) => {
    const own = num(saved[i]);
    return { pct: s.tranchePcts[i], price: own ?? sg, suggested: sg, edited: own !== null };
  });
  const tpSuggested = takeProfit(high52);
  const tpOwn = num(plan?.tp);
  const tp = { price: tpOwn ?? tpSuggested, suggested: tpSuggested, edited: tpOwn !== null };

  // จุดสูงสุดหลังซื้อของรอบถือปัจจุบัน: อัปเดตเมื่อราคาสูงกว่าที่เก็บ (เฉพาะตอนถือหุ้น)
  const peakStart = held ? holdingStart(myTxns, sym) : null;
  const { peak, changed: peakChanged } = peakState({
    storedPeak: num(plan?.peakSinceBuy), storedStart: plan?.peakHoldingStart ?? null, start: peakStart, price,
  });
  const trailing = held
    ? trailingState({ avgCost: pos.avgCost, peakSinceBuy: peak, price, activate: s.trailActivate, trail: s.trailPct })
    : { active: false, stopPrice: null, hit: false };

  const levels = [
    ...tranches.map((t, i) => ({ label: `ไม้ ${i + 1}`, price: t.price })),
    { label: 'TP', price: tp.price },
    ...(trailing.active ? [{ label: 'Trailing', price: trailing.stopPrice }] : []),
  ];
  const alerts = nearAlerts(price, levels, s.alertWithin);

  const h = halalCheck({
    interestDebt: num(halal?.interestDebt), interestDeposits: num(halal?.interestDeposits),
    impermissiblePct: num(halal?.impermissiblePct), marketCap: num(profile?.marketCapUsd),
  });
  const purification = {
    pct: h.purificationPct,
    amount: h.purificationPct === null ? null : purificationAmount(pos.dividends, h.purificationPct),
    dividends: pos.dividends,
  };

  return {
    symbol: sym,
    name: profile?.name ?? null,
    price,
    changePct: num(quote?.changePct),
    high52, low52,
    rangePos: rangePosition(price, low52, high52),
    drawdown: drawdown(price, high52),
    support: low52,
    supportDistance: distanceFromSupport(price, low52),
    pe: num(metrics?.pe),
    position: { ...pos, held },
    positionError,
    tranches, tp,
    peak, peakChanged, peakStart,
    trailing, alerts,
    halal: { ...h, source: halal?.source ?? null, enteredAt: halal?.enteredAt ?? null, purification },
    note: typeof plan?.note === 'string' ? plan.note : '',
    stale: Boolean(quote?.stale || metrics?.stale || profile?.stale),
    txns: [...myTxns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  };
}

/** สร้างเอกสารแผนเต็มสำหรับ savePlan (ไม่มีคีย์ undefined) */
export function buildPlanDoc(plan, patch) {
  const defined = Object.fromEntries(Object.entries(patch ?? {}).filter(([, v]) => v !== undefined));
  const m = { ...(plan ?? {}), ...defined };
  const out = {};
  if (Array.isArray(m.tranches)) out.tranches = m.tranches.map((v) => num(v));
  if (num(m.tp) !== null) out.tp = m.tp;
  if (num(m.peakSinceBuy) !== null) out.peakSinceBuy = m.peakSinceBuy;
  if (typeof m.peakHoldingStart === 'string') out.peakHoldingStart = m.peakHoldingStart;
  if (typeof m.note === 'string') out.note = m.note;
  return out;
}

export const ERROR_TEXT = {
  not_found: 'ไม่พบหุ้นนี้',
  bad_key: 'API key ไม่ถูกต้อง ไปที่ตั้งค่า',
  no_key: 'ยังไม่ได้ใส่ API key ไปที่ตั้งค่า',
  forbidden: 'API key ไม่ถูกต้อง หรือแพ็กฟรีไม่รองรับหุ้นตัวนี้',
  rate_limit: 'เรียกข้อมูลถี่เกินไป รอ 1 นาที',
  network: 'เชื่อมต่อไม่ได้',
};
export const errorMessage = (e) => ERROR_TEXT[e?.code] ?? e?.message ?? ERROR_TEXT.network;

/** บันทึกจุดสูงสุดอัตโนมัติได้เฉพาะเมื่อโหลดแผนสำเร็จ (กันเขียนทับแผนเดิม) */
export const shouldSavePeak = (view, planOk) => Boolean(planOk && view?.peakChanged && view.peak !== null);

/** ฟิลด์จุดสูงสุดที่ต้องบันทึก (บันทึกคู่กับวันเริ่มรอบถือเสมอ) · {} ถ้าไม่เปลี่ยน */
export const peakPatch = (v) => (v?.peakChanged && v.peak !== null ? { peakSinceBuy: v.peak, peakHoldingStart: v.peakStart } : {});

const same = (a, b) => a !== null && b !== null && Math.abs(a - b) < 0.005;
const posNum = (t) => { const n = Number(String(t ?? '').trim()); return String(t ?? '').trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; };

/**
 * ฟอร์มแผน -> { patch } | { error }
 * เก็บเฉพาะราคาที่ต่างจากค่าที่แอปเสนอตอนนี้ (ค่าเท่ากับที่เสนอหรือเว้นว่าง -> null = ใช้สูตร)
 */
export function planPatchFromForm(view, form) {
  const tranches = [];
  for (let i = 0; i < view.tranches.length; i++) {
    const t = String(form.tranches?.[i] ?? '').trim();
    if (t === '') { tranches.push(null); continue; }
    const v = posNum(t);
    if (v === null) return { error: 'ราคาต้องมากกว่า 0' };
    tranches.push(same(v, view.tranches[i].suggested) ? null : v);
  }
  const tt = String(form.tp ?? '').trim();
  let tp = null;
  if (tt !== '') {
    const v = posNum(tt);
    if (v === null) return { error: 'ราคาต้องมากกว่า 0' };
    tp = same(v, view.tp.suggested) ? null : v;
  }
  return { patch: { tranches, tp } };
}

/** ฟอร์มซื้อ/ขาย/ปันผล -> { txn } | { error } (ซื้อขายเต็มหุ้นเท่านั้น) */
export function parseTxnForm(symbol, f) {
  const t = { symbol, type: f.type, date: f.date };
  if (t.type === 'dividend') {
    t.amount = posNum(f.amount);
    if (t.amount === null) return { error: 'จำนวนเงินต้องมากกว่า 0' };
    return { txn: t };
  }
  t.shares = posNum(f.shares); t.price = posNum(f.price);
  if (t.shares === null || t.price === null) return { error: 'จำนวนหุ้นและราคาต้องมากกว่า 0' };
  if (!Number.isInteger(t.shares)) return { error: WHOLE_SHARES_ERR };
  const fee = String(f.fee ?? '').trim();
  if (fee !== '') {
    const n = Number(fee);
    if (!Number.isFinite(n) || n < 0) return { error: 'ค่าธรรมเนียมต้องไม่ติดลบ' };
    t.fee = n;
  }
  return { txn: t };
}

// ---- ฮาลาล: หนี้/เงินฝากกรอกเป็น "ล้าน USD" แต่เก็บเป็น USD ----
const MILLION = 1e6;
const nonNeg = (t) => { const s = String(t ?? '').trim(); const n = Number(s); return s !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
const r6 = (x) => Math.round(x * 1e6) / 1e6;
export const HALAL_UNIT_WARN = 'ตรวจหน่วยอีกครั้ง: ตัวเลขควรเป็นล้าน USD';
export const HALAL_FAIL_TEXT = {
  debt: 'หนี้ดอกเบี้ยไม่ต่ำกว่า 30% ของ Market Cap',
  deposits: 'เงินฝากดอกเบี้ยไม่ต่ำกว่า 30% ของ Market Cap',
  impermissible: 'รายได้ต้องห้ามไม่ต่ำกว่า 5%',
};
export const halalFailText = (failed = []) => (failed.length ? `ไม่ผ่าน: ${failed.map((k) => HALAL_FAIL_TEXT[k]).join(' · ')}` : '');

/** ค่าเริ่มต้นของฟอร์มฮาลาลจากข้อมูลที่เก็บ (USD -> ล้าน USD, เศษส่วน -> %) */
export function halalFormValues(halal) {
  const v = (x, k) => (num(x) === null ? '' : String(r6(x / k)));
  return {
    debt: v(halal?.interestDebt, MILLION), dep: v(halal?.interestDeposits, MILLION),
    imp: num(halal?.impermissiblePct) === null ? '' : String(Math.round(halal.impermissiblePct * 1e6) / 1e4),
    src: halal?.source ?? '',
  };
}

/** ฟอร์มฮาลาล -> { doc } | { error } · doc เก็บหนี้/เงินฝากเป็น USD */
export function parseHalalForm(f, today) {
  const [d, dp, ip] = [nonNeg(f.debt), nonNeg(f.dep), nonNeg(f.imp)];
  if (d === null || dp === null || ip === null || ip > 100) return { error: 'กรอกตัวเลขหนี้ เงินฝาก และ % รายได้ต้องห้ามให้ครบ (ไม่ติดลบ)' };
  const source = String(f.src ?? '').trim();
  if (!source) return { error: 'ต้องระบุแหล่งที่มาของข้อมูลฮาลาล' };
  return { doc: { interestDebt: Math.round(d * MILLION), interestDeposits: Math.round(dp * MILLION), impermissiblePct: ip / 100, source, enteredAt: today } };
}

/** พรีวิวสัดส่วนก่อนบันทึก (ใช้ Market Cap ปัจจุบัน) */
export function halalPreview(f, marketCapUsd) {
  const [d, dp, ip] = [nonNeg(f.debt), nonNeg(f.dep), nonNeg(f.imp)];
  const mc = num(marketCapUsd);
  const ok = mc !== null && mc > 0;
  const debtRatio = ok && d !== null ? (d * MILLION) / mc : null;
  const depositRatio = ok && dp !== null ? (dp * MILLION) / mc : null;
  const warn = [debtRatio, depositRatio].some((r) => r !== null && r < 0.001) ? HALAL_UNIT_WARN : null;
  const check = halalCheck({ interestDebt: d === null ? null : d * MILLION, interestDeposits: dp === null ? null : dp * MILLION, impermissiblePct: ip === null ? null : ip / 100, marketCap: mc });
  return { debtRatio, depositRatio, warn, noMarketCap: !ok, status: check.status, failed: check.failed };
}

/** ผสมแผนที่เพิ่งบันทึกเข้าสถานะในเครื่อง เพื่อไม่ให้การบันทึกครั้งถัดไปทับกัน */
export const applyPlanSave = (plan, patch) => buildPlanDoc(plan, patch);
