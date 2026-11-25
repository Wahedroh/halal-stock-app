const sorted = (txns) =>
  txns.map((x, i) => [x, i]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1])).map((p) => p[0]);

export function position(txns, symbol) {
  let shares = 0, totalCost = 0, avgCost = 0, realized = 0, dividends = 0;
  for (const x of sorted(txns.filter((y) => y.symbol === symbol))) {
    const fee = x.fee ?? 0;
    if (x.type === 'buy') {
      shares += x.shares;
      totalCost += x.shares * x.price + fee;
      avgCost = totalCost / shares;
    } else if (x.type === 'sell') {
      if (x.shares > shares) throw new Error('ขายเกินจำนวนที่ถือ');
      const proceeds = x.shares * x.price - fee;
      realized += proceeds - x.shares * avgCost;
      totalCost -= x.shares * avgCost;
      shares -= x.shares;
      if (shares === 0) { avgCost = 0; totalCost = 0; }
    } else if (x.type === 'dividend') {
      dividends += x.amount;
    }
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
