const isPos = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const r2 = (x) => Math.round(x * 100) / 100;

/** ราคาซื้อ 3 ไม้ (ลดจากราคาปัจจุบัน); null ถ้าราคาไม่ถูกต้อง */
export function buyTranches(price, pcts = [0.05, 0.12, 0.2]) {
  if (!isPos(price)) return pcts.map(() => null);
  return pcts.map((p) => r2(price * (1 - p)));
}

/** เป้าขายทำกำไร = 52W High */
export function takeProfit(high52) {
  return isPos(high52) ? high52 : null;
}

/** Trailing stop: เปิดเมื่อกำไรจากต้นทุนถึงจุดสูงสุด > activate */
export function trailingState({ avgCost, peakSinceBuy, price, activate = 0.15, trail = 0.12 } = {}) {
  const off = { active: false, stopPrice: null, hit: false };
  if (!isPos(avgCost) || !isPos(peakSinceBuy) || !isPos(price)) return off;
  if ((peakSinceBuy - avgCost) / avgCost <= activate) return off;
  const stopPrice = r2(peakSinceBuy * (1 - trail));
  return { active: true, stopPrice, hit: price <= stopPrice };
}

/** ระดับที่ราคาอยู่ใกล้ (ภายใน within) เรียงจากใกล้สุด */
export function nearAlerts(price, levels, within = 0.03) {
  if (!isPos(price)) return [];
  return levels
    .filter((l) => l && isPos(l.price))
    .map((l) => ({ label: l.label, price: l.price, distance: Math.abs(price - l.price) / price }))
    .filter((a) => a.distance <= within)
    .sort((a, b) => a.distance - b.distance);
}
