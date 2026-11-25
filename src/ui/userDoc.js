import { DEFAULTS } from '../data/defaults.js';

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = isObj(base[k]) ? merge(base[k], over[k]) : over[k];
  return out;
}

/** ผสมข้อมูลที่เก็บไว้ทับสำเนาของ DEFAULTS (คีย์ที่ขาดได้ค่าเริ่มต้น) */
export const mergeUser = (stored) => merge(JSON.parse(JSON.stringify(DEFAULTS)), stored ?? {});
