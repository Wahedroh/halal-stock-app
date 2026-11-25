import { position, portfolioSummary } from '../lib/portfolio.js';
import { buyTranches, takeProfit, trailingState, nearAlerts } from '../lib/plan.js';
import { DEFAULTS } from '../data/defaults.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** +$12.50 / -$3.00 / — */
export function fmtSigned(x) {
  if (num(x) === null) return '—';
  return `${x < 0 ? '-' : '+'}$${Math.abs(x).toFixed(2)}`;
}

/**
 * ข้อมูลหน้าพอร์ต (ฟังก์ชันล้วน)
 * quotes: {SYM:{price,changePct}} · metrics: {SYM:{high52}} · plans: {SYM:planDoc}
 */
export function buildPortfolioView({ txns = [], quotes = {}, metrics = {}, plans = {}, settings, watchlist = [] } = {}) {
  const s = { ...DEFAULTS.settings, ...(settings ?? {}) };
  const prices = {};
  for (const [sym, q] of Object.entries(quotes)) if (num(q?.price) !== null) prices[sym] = q.price;

  let summary;
  try { summary = portfolioSummary(txns, prices); } catch (e) {
    return { error: e.message, summary: null, holdings: [], watch: [] };
  }

  const heldSyms = [...new Set(txns.map((t) => t.symbol))];
  const holdings = [];
  const missingPrices = [];
  for (const sym of heldSyms) {
    const p = position(txns, sym);
    if (p.shares <= 0) continue;
    const price = num(prices[sym]);
    if (price === null) missingPrices.push(sym);
    const cost = p.shares * p.avgCost;
    const marketValue = price === null ? null : p.shares * price;
    const plan = plans[sym];
    const suggested = buyTranches(price, s.tranchePcts);
    const levels = suggested.map((sg, i) => ({ label: `ไม้ ${i + 1}`, price: num(plan?.tranches?.[i]) ?? sg }));
    levels.push({ label: 'TP', price: num(plan?.tp) ?? takeProfit(num(metrics[sym]?.high52)) });
    const tr = trailingState({ avgCost: p.avgCost, peakSinceBuy: num(plan?.peakSinceBuy), price, activate: s.trailActivate, trail: s.trailPct });
    if (tr.active) levels.push({ label: 'Trailing', price: tr.stopPrice });
    holdings.push({
      symbol: sym, shares: p.shares, avgCost: p.avgCost, price, changePct: num(quotes[sym]?.changePct),
      marketValue, pnl: marketValue === null ? null : marketValue - cost,
      pnlPct: marketValue === null || cost === 0 ? null : (marketValue - cost) / cost,
      alerts: nearAlerts(price, levels, s.alertWithin),
    });
  }
  holdings.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0));

  const heldSet = new Set(holdings.map((h) => h.symbol));
  const watch = watchlist.filter((sym) => !heldSet.has(sym)).map((sym) => ({
    symbol: sym, price: num(prices[sym]), changePct: num(quotes[sym]?.changePct),
  }));

  return {
    error: null,
    summary: { ...summary, totalPnl: summary.unrealized + summary.realized + summary.dividends, missingPrices },
    holdings, watch,
  };
}
