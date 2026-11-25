// AAOIFI screening. impermissiblePct is a fraction (0.01 = 1%).
const okNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function halalCheck({ interestDebt, interestDeposits, impermissiblePct, marketCap } = {}) {
  const unchecked = { status: 'unchecked', debtRatio: null, depositRatio: null, purificationPct: null };
  if (typeof marketCap !== 'number' || !Number.isFinite(marketCap) || marketCap <= 0) return unchecked;
  if (!okNum(interestDebt) || !okNum(interestDeposits) || !okNum(impermissiblePct)) return unchecked;
  const debtRatio = interestDebt / marketCap;
  const depositRatio = interestDeposits / marketCap;
  const pass = debtRatio < 0.3 && depositRatio < 0.3 && impermissiblePct < 0.05;
  return { status: pass ? 'pass' : 'fail', debtRatio, depositRatio, purificationPct: impermissiblePct };
}

export function purificationAmount(dividendUsd, purificationPct) {
  if (!okNum(dividendUsd) || !okNum(purificationPct)) return 0;
  return Math.round(dividendUsd * purificationPct * 100) / 100;
}
