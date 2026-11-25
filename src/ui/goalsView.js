import { dividendsLast12m } from '../lib/portfolio.js';
import { dividendGoalProgress, requiredCapital, investGoalProgress } from '../lib/goals.js';
import { DEFAULTS } from '../data/defaults.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const DEFAULT_YIELD_PCT = 4.5;

/** ช่องกรอกเป็น % -> เศษส่วน (0,1] ; ไม่ถูกต้อง -> null */
export function parseYieldPct(text) {
  const t = String(text ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n / 100 : null;
}

function nonNeg(text, { int = false, optional = false } = {}) {
  const t = String(text ?? '').trim();
  if (t === '') return optional ? { v: null } : { err: true };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || (int && !Number.isInteger(n))) return { err: true };
  return { v: n };
}

/** ตรวจฟอร์มเป้าหมาย -> { patch } | { error } */
export function parseGoalsForm(f) {
  const a = nonNeg(f.dividendMonthlyThb), b = nonNeg(f.dividendByAge, { int: true }), c = nonNeg(f.monthlyInvestThb);
  const d = nonNeg(f.investTargetUsd, { optional: true }), e = nonNeg(f.returnTargetPct, { optional: true });
  if (a.err || a.v <= 0) return { error: 'เป้าปันผลต่อเดือนต้องมากกว่า 0' };
  if (b.err || b.v < 1 || b.v > 120) return { error: 'อายุต้องเป็นจำนวนเต็ม 1–120' };
  if (c.err) return { error: 'เงินลงทุนต่อเดือนต้องไม่ติดลบ' };
  if (d.err || d.v === 0) return { error: 'เป้าเงินลงทุนรวมต้องมากกว่า 0 (หรือเว้นว่าง)' };
  if (e.err || e.v === 0) return { error: 'เป้าผลตอบแทนต้องมากกว่า 0 (หรือเว้นว่าง)' };
  return { patch: { dividendMonthlyThb: a.v, dividendByAge: b.v, monthlyInvestThb: c.v, investTargetUsd: d.v, returnTargetPct: e.v === null ? null : Math.round(e.v * 1e4) / 1e6 } };
}

/** ข้อมูลหน้าเป้าหมาย (ฟังก์ชันล้วน) · summary มาจาก buildPortfolioView().summary */
export function buildGoalsView({ goals, settings, txns = [], summary, today, yieldPct } = {}) {
  const g = { ...DEFAULTS.goals, ...(goals ?? {}) };
  const s = { ...DEFAULTS.settings, ...(settings ?? {}) };
  const dividends12m = dividendsLast12m(txns, today);
  const dividend = {
    ...dividendGoalProgress({ monthlyTargetThb: g.dividendMonthlyThb, dividendsLast12mUsd: dividends12m, fx: s.fx }),
    targetThb: g.dividendMonthlyThb, byAge: g.dividendByAge, dividends12m,
  };
  const required = requiredCapital({ monthlyTargetThb: g.dividendMonthlyThb, wht: s.wht, yieldPct, fx: s.fx });
  const invested = num(summary?.invested) ?? 0;
  const invest = { invested, target: num(g.investTargetUsd), pct: investGoalProgress({ targetUsd: g.investTargetUsd, investedUsd: invested }) };
  const cur = num(summary?.returnPct), tgt = num(g.returnTargetPct);
  const returns = { current: cur, target: tgt, pct: cur === null || tgt === null || tgt <= 0 ? null : clamp01(cur / tgt) };
  return { dividend, required, invest, returns, monthlyInvestThb: g.monthlyInvestThb };
}
