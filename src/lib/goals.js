const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function dividendGoalProgress({ monthlyTargetThb, dividendsLast12mUsd, fx }) {
  const currentMonthlyThb = Math.round((dividendsLast12mUsd * fx) / 12) || 0;
  const pct = fin(monthlyTargetThb) && monthlyTargetThb > 0 ? clamp01(currentMonthlyThb / monthlyTargetThb) : null;
  return { currentMonthlyThb, pct };
}

export function requiredCapital({ monthlyTargetThb, wht = 0.15, yieldPct, fx }) {
  if (!fin(yieldPct) || yieldPct <= 0 || !fin(fx) || fx <= 0 || !fin(wht) || wht < 0 || wht >= 1) return null;
  const grossYearUsd = (monthlyTargetThb * 12) / (1 - wht) / fx;
  const capitalUsd = grossYearUsd / yieldPct;
  return { grossYearUsd, capitalUsd, capitalThb: capitalUsd * fx };
}

export function investGoalProgress({ targetUsd, investedUsd }) {
  if (!fin(targetUsd) || targetUsd <= 0) return null;
  return clamp01((Number(investedUsd) || 0) / targetUsd);
}
