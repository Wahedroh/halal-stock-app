const sorted = (txns) =>
  txns.map((x, i) => [x, i]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1])).map((p) => p[0]);

// หุ้นเศษส่วน: ยอมคลาดเคลื่อนทศนิยม 1e-9 และปัดจำนวนหุ้นเป็น 8 ตำแหน่ง
export const SHARE_EPS = 1e-9;
export const roundShares = (x) => Math.round(x * 1e8) / 1e8;
export const OVERSELL = 'ขายเกินจำนวนที่ถือ';

export function position(txns, symbol) {
  let shares = 0, totalCost = 0, avgCost = 0, realized = 0, dividends = 0;
  for (const x of sorted(txns.filter((y) => y.symbol === symbol))) {
    const fee = x.fee ?? 0;
    if (x.type === 'buy') {
      shares = roundShares(shares + x.shares);
      totalCost += x.shares * x.price + fee;
      avgCost = totalCost / shares;
    } else if (x.type === 'sell') {
      if (x.shares > shares + SHARE_EPS) throw new Error(OVERSELL);
      const proceeds = x.shares * x.price - fee;
      realized += proceeds - x.shares * avgCost;
      totalCost -= x.shares * avgCost;
      shares = roundShares(shares - x.shares);
    } else if (x.type === 'dividend') {
      dividends += x.amount;
    }
    if (Math.abs(shares) < SHARE_EPS) { shares = 0; avgCost = 0; totalCost = 0; }
  }
  return { shares, avgCost, realized, dividends };
}

export function portfolioSummary(txns, prices) {
  const symbols = [...new Set(txns.map((x) => x.symbol))];
  let invested = 0, marketValue = 0, realized = 0, dividends = 0;
  for (const s of symbols) {
    const p = position(txns, s);
    const cost = p.shares * p.avgCost;
    invested += cost;
    const px = prices?.[s];
    marketValue += typeof px === 'number' ? p.shares * px : cost;
    realized += p.realized;
    dividends += p.dividends;
  }
  const unrealized = marketValue - invested;
  const returnPct = invested === 0 ? null : (realized + unrealized + dividends) / invested;
  return { invested, marketValue, unrealized, realized, dividends, returnPct };
}

export function dividendsLast12m(txns, today) {
  const [y, m, d] = today.split('-');
  const cutoff = `${Number(y) - 1}-${m}-${d}`;
  return txns
    .filter((x) => x.type === 'dividend' && x.date > cutoff && x.date <= today)
    .reduce((s, x) => s + x.amount, 0);
}
