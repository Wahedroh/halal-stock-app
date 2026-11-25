const ERR = 'ข้อมูลไม่ครบหรือไม่ถูกต้อง';
const pos = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateTxn(txn) {
  if (!txn || typeof txn !== 'object') throw new Error(ERR);
  const symbol = typeof txn.symbol === 'string' ? txn.symbol.trim().toUpperCase() : '';
  if (!symbol || !validDate(txn.date)) throw new Error(ERR);
  if (txn.type === 'buy' || txn.type === 'sell') {
    if (!pos(txn.shares) || !pos(txn.price)) throw new Error(ERR);
    const out = { ...txn, symbol };
    if (txn.fee !== undefined && txn.fee !== null) {
      if (typeof txn.fee !== 'number' || !Number.isFinite(txn.fee) || txn.fee < 0) throw new Error(ERR);
    } else delete out.fee;
    return out;
  }
  if (txn.type === 'dividend') {
    if (!pos(txn.amount)) throw new Error(ERR);
    return { ...txn, symbol };
  }
  throw new Error(ERR);
}
