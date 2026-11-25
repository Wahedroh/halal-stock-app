// AAOIFI screening. impermissiblePct is a fraction (0.01 = 1%).
const okNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function halalCheck({ interestDebt, interestDeposits, impermissiblePct, marketCap } = {}) {
  const unchecked = { status: 'unchecked', debtRatio: null, depositRatio: null, purificationPct: null, failed: [] };
  if (typeof marketCap !== 'number' || !Number.isFinite(marketCap) || marketCap <= 0) return unchecked;
  if (!okNum(interestDebt) || !okNum(interestDeposits) || !okNum(impermissiblePct)) return unchecked;
  const debtRatio = interestDebt / marketCap;
  const depositRatio = interestDeposits / marketCap;
  // failed: เกณฑ์ที่ไม่ผ่าน ('debt' | 'deposits' | 'impermissible')
  const failed = [];
  if (!(debtRatio < 0.3)) failed.push('debt');
  if (!(depositRatio < 0.3)) failed.push('deposits');
  if (!(impermissiblePct < 0.05)) failed.push('impermissible');
  return { status: failed.length ? 'fail' : 'pass', debtRatio, depositRatio, purificationPct: impermissiblePct, failed };
}

export function purificationAmount(dividendUsd, purificationPct) {
  if (!okNum(dividendUsd) || !okNum(purificationPct)) return 0;
  return Math.round(dividendUsd * purificationPct * 100) / 100;
}
