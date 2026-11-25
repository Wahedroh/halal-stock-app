import { rangePosition, drawdown, distanceFromSupport } from '../lib/metrics.js';
import { buyTranches, takeProfit, trailingState, nearAlerts } from '../lib/plan.js';
import { position } from '../lib/portfolio.js';
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

  // จุดสูงสุดหลังซื้อ: อัปเดตเมื่อราคาสูงกว่าที่เก็บ (เฉพาะตอนถือหุ้น)
  const storedPeak = num(plan?.peakSinceBuy);
  let peak = storedPeak;
  let peakChanged = false;
  if (held && price !== null && (storedPeak === null || price > storedPeak)) { peak = price; peakChanged = true; }
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
    peak, peakChanged,
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
  if (typeof m.note === 'string') out.note = m.note;
  return out;
}

export const ERROR_TEXT = {
  not_found: 'ไม่พบหุ้นนี้',
  bad_key: 'API key ไม่ถูกต้อง ไปที่ตั้งค่า',
  rate_limit: 'เรียกข้อมูลถี่เกินไป รอ 1 นาที',
  network: 'เชื่อมต่อไม่ได้',
};
export const errorMessage = (e) => ERROR_TEXT[e?.code] ?? e?.message ?? ERROR_TEXT.network;

/** บันทึกจุดสูงสุดอัตโนมัติได้เฉพาะเมื่อโหลดแผนสำเร็จ (กันเขียนทับแผนเดิม) */
export const shouldSavePeak = (view, planOk) => Boolean(planOk && view?.peakChanged && view.peak !== null);

/** ผสมแผนที่เพิ่งบันทึกเข้าสถานะในเครื่อง เพื่อไม่ให้การบันทึกครั้งถัดไปทับกัน */
export const applyPlanSave = (plan, patch) => buildPlanDoc(plan, patch);
