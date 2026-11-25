const isPos = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** ตำแหน่งราคาในช่วง 52 สัปดาห์ (0–1); null ถ้าข้อมูลไม่ถูกต้อง */
export function rangePosition(price, low52, high52) {
  if (!isPos(price) || !isPos(low52) || !isPos(high52)) return null;
  const span = high52 - low52;
  if (span === 0) return null;
  return (price - low52) / span;
}

/** ระยะลงจากจุดสูงสุด 52 สัปดาห์ (ค่าติดลบ) */
export function drawdown(price, high52) {
  if (!isPos(price) || !isPos(high52)) return null;
  return price / high52 - 1;
}

/** ราคาอยู่เหนือแนวรับกี่ % (ค่าลบ = หลุดแนวรับ) */
export function distanceFromSupport(price, support) {
  if (!isPos(price) || !isPos(support)) return null;
  return price / support - 1;
}

export function fmtPct(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

export function fmtUsd(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
  const s = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${x < 0 ? '-' : ''}$${s}`;
}

/** จำนวนหุ้น (ทศนิยมไม่เกิน 6 ตำแหน่ง) */
export function fmtShares(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
  const v = Math.round(x * 1e6) / 1e6;
  return (Object.is(v, -0) ? 0 : v).toLocaleString('en-US', { maximumFractionDigits: 6 });
}
