// ลำดับรายการ: วันที่ → seq (ลำดับที่บันทึก) → ลำดับใน array · รายการเก่าที่ไม่มี seq มาก่อนรายการที่มี seq ในวันเดียวกัน
const hasSeq = (x) => typeof x.seq === 'number' && Number.isFinite(x.seq);
export function compareTxn(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const sa = hasSeq(a), sb = hasSeq(b);
  if (sa !== sb) return sa ? 1 : -1;
  return sa ? a.seq - b.seq : 0;
}
export const sortTxns = (txns) =>
  txns.map((x, i) => [x, i]).sort((a, b) => compareTxn(a[0], b[0]) || a[1] - b[1]).map((p) => p[0]);
const sorted = sortTxns;

/** seq ของรายการใหม่: เวลาที่บันทึก แต่ต้องมากกว่า seq เดิมทุกตัว (เผื่อนาฬิกาเครื่องถอยหลัง) */
export function nextSeq(txns, now) {
  const max = txns.reduce((m, x) => (hasSeq(x) && x.seq > m ? x.seq : m), -Infinity);
  return Math.max(now, max + 1);
}

// ซื้อขายเต็มหุ้นเท่านั้น (validateTxn) · กันข้อมูลเก่าที่เป็นเศษหุ้น: ยอมคลาดเคลื่อน 1e-9 และปัดจำนวนหุ้นเป็น 8 ตำแหน่ง
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

/** วันที่ซื้อครั้งแรกของรอบถือปัจจุบัน (หลังจากขายหมดครั้งล่าสุด) · null ถ้าไม่ได้ถือ */
export function holdingStart(txns, symbol) {
  let shares = 0, start = null;
  for (const x of sorted(txns.filter((y) => y.symbol === symbol))) {
    if (x.type === 'buy') {
      if (shares < SHARE_EPS) start = x.date;
      shares = roundShares(shares + x.shares);
    } else if (x.type === 'sell') {
      shares = roundShares(shares - x.shares);
    }
    if (shares < SHARE_EPS) { shares = 0; start = null; }
  }
  return shares > 0 ? start : null;
}

const validHistory = (txns, symbol) => { try { position(txns, symbol); return true; } catch { return false; } };

/** ข้อความ error ถ้าประวัติของหุ้นตัวนั้นถูกต้องอยู่ แต่ลบรายการ id แล้วจะขายเกินจำนวนที่ถือ · null ถ้าลบได้
 *  (ถ้าประวัติเสียอยู่แล้ว ลบได้เสมอ เพื่อให้แก้ข้อมูลได้) */
export function deleteTxnError(txns, id) {
  const t = txns.find((x) => x.id === id);
  if (!t) return null;
  if (validHistory(txns, t.symbol) && !validHistory(txns.filter((x) => x.id !== id), t.symbol)) return 'ลบไม่ได้: จะทำให้ประวัติขายเกินจำนวนที่ถือ';
  return null;
}

/** หุ้นที่ประวัติขายเกินจำนวนที่ถือ (ข้อมูลเสีย) */
export function brokenSymbols(txns) {
  return [...new Set(txns.map((x) => x.symbol))].filter((s) => !validHistory(txns, s));
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
