import { position, portfolioSummary, holdingStart, brokenSymbols } from '../lib/portfolio.js';
import { buyTranches, takeProfit, trailingState, nearAlerts, peakState } from '../lib/plan.js';
import { DEFAULTS } from '../data/defaults.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** +$12.50 / -$3.00 / — */
export function fmtSigned(x) {
  if (num(x) === null) return '—';
  return `${x < 0 ? '-' : '+'}$${Math.abs(x).toFixed(2)}`;
}

/** เศษส่วน -> +6.5% / -3.3% / — (มีเครื่องหมายเสมอ) */
export function fmtSignedPct(x) {
  if (num(x) === null) return '—';
  return `${x < 0 ? '-' : '+'}${Math.abs(x * 100).toFixed(1)}%`;
}

/** % การเปลี่ยนแปลงรายวัน (หน่วยเป็น % อยู่แล้ว เช่น -3.28) -> -3.28% / +1.20% / — */
export function fmtChangePct(x) {
  if (num(x) === null) return '—';
  return `${x < 0 ? '-' : '+'}${Math.abs(x).toFixed(2)}%`;
}

/** คำนำหน้ายอดกำไร/ขาดทุน */
export const pnlWord = (x) => (num(x) !== null && x < 0 ? 'ขาดทุน' : 'กำไร');

/** บาทแบบปัดเต็ม: 40000 -> 40,000 */
export const fmtThb = (x) => (num(x) === null ? '—' : Math.round(x).toLocaleString('en-US'));

/**
 * ข้อมูลหน้าพอร์ต (ฟังก์ชันล้วน)
 * quotes: {SYM:{price,changePct}} · metrics: {SYM:{high52}} · plans: {SYM:planDoc}
 */
export function buildPortfolioView({ txns = [], quotes = {}, metrics = {}, plans = {}, settings, watchlist = [] } = {}) {
  const s = { ...DEFAULTS.settings, ...(settings ?? {}) };
  const prices = {};
  for (const [sym, q] of Object.entries(quotes)) if (num(q?.price) !== null) prices[sym] = q.price;

  // หุ้นที่ประวัติเสีย (ขายเกินจำนวนที่ถือ) ไม่นับในพอร์ต แต่หน้าอื่นยังแสดงต่อได้
  const broken = brokenSymbols(txns);
  const good = broken.length ? txns.filter((t) => !broken.includes(t.symbol)) : txns;
  const error = broken.length ? `ประวัติซื้อขายของ ${broken.join(', ')} ขายเกินจำนวนที่ถือ จึงไม่นับในพอร์ต แก้ได้ที่หน้าหุ้น` : null;
  const summary = portfolioSummary(good, prices);

  const heldSyms = [...new Set(good.map((t) => t.symbol))];
  const holdings = [];
  const missingPrices = [];
  for (const sym of heldSyms) {
    const p = position(good, sym);
    if (p.shares <= 0) continue;
    const price = num(prices[sym]);
    if (price === null) missingPrices.push(sym);
    const cost = p.shares * p.avgCost;
    const marketValue = price === null ? null : p.shares * price;
    const plan = plans[sym];
    const suggested = buyTranches(price, s.tranchePcts);
    const levels = suggested.map((sg, i) => ({ label: `ไม้ ${i + 1}`, price: num(plan?.tranches?.[i]) ?? sg }));
    levels.push({ label: 'TP', price: num(plan?.tp) ?? takeProfit(num(metrics[sym]?.high52)) });
    // จุดสูงสุด = max(ที่เก็บของรอบถือนี้, ราคาปัจจุบัน)
    const peakStart = holdingStart(good, sym);
    const pk = peakState({ storedPeak: num(plan?.peakSinceBuy), storedStart: plan?.peakHoldingStart ?? null, start: peakStart, price });
    const tr = trailingState({ avgCost: p.avgCost, peakSinceBuy: pk.peak, price, activate: s.trailActivate, trail: s.trailPct });
    if (tr.active) levels.push({ label: 'Trailing', price: tr.stopPrice });
    holdings.push({
      symbol: sym, shares: p.shares, avgCost: p.avgCost, price, changePct: num(quotes[sym]?.changePct),
      marketValue, pnl: marketValue === null ? null : marketValue - cost,
      pnlPct: marketValue === null || cost === 0 ? null : (marketValue - cost) / cost,
      alerts: nearAlerts(price, levels, s.alertWithin),
      peak: pk.peak, peakChanged: pk.changed, peakStart,
    });
  }
  holdings.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));

  const heldSet = new Set(holdings.map((h) => h.symbol));
  const watch = watchlist.filter((sym) => !heldSet.has(sym)).map((sym) => ({
    symbol: sym, price: num(prices[sym]), changePct: num(quotes[sym]?.changePct),
  }));

  return {
    error, broken,
    summary: { ...summary, totalPnl: summary.unrealized + summary.realized + summary.dividends, missingPrices },
    holdings, watch,
  };
}

/** จุดสูงสุดที่ต้องบันทึก: เฉพาะหุ้นที่ peak เพิ่มขึ้น และโหลดแผนสำเร็จ (planOk[sym] === true) */
export function peakSaves(view, planOk = {}) {
  return (view?.holdings ?? []).filter((x) => x.peakChanged && x.peak !== null && planOk[x.symbol] === true)
    .map((x) => ({ symbol: x.symbol, patch: { peakSinceBuy: x.peak, peakHoldingStart: x.peakStart } }));
}
