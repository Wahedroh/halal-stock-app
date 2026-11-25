const BASE = 'https://finnhub.io/api/v1';
const QUOTE_TTL = 60 * 1000;
const DAY_TTL = 24 * 60 * 60 * 1000;

const MESSAGES = {
  not_found: 'ไม่พบหุ้นนี้',
  bad_key: 'API key ไม่ถูกต้อง ไปที่ตั้งค่า',
  rate_limit: 'เรียกข้อมูลถี่เกินไป รอ 1 นาที',
  network: 'เชื่อมต่อไม่ได้',
};

export class FinnhubError extends Error {
  constructor(code) {
    super(MESSAGES[code] ?? MESSAGES.network);
    this.name = 'FinnhubError';
    this.code = code;
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function createFinnhub({ key, fetchFn = (...a) => fetch(...a), storage = globalThis.localStorage, now = Date.now } = {}) {
  const readCache = (ck) => {
    try {
      const raw = storage.getItem(ck);
      if (!raw) return null;
      const e = JSON.parse(raw);
      return e && typeof e.t === 'number' && e.data ? e : null;
    } catch {
      return null;
    }
  };
  const writeCache = (ck, data) => {
    try { storage.setItem(ck, JSON.stringify({ t: now(), data })); } catch { /* ignore quota */ }
  };

  async function request(kind, sym, ttl, path, map) {
    const symbol = String(sym ?? '').trim().toUpperCase();
    if (!symbol) throw new FinnhubError('not_found');
    if (!key || !String(key).trim()) throw new FinnhubError('bad_key');
    const ck = `fh:${kind}:${symbol}`;
    const cached = readCache(ck);
    if (cached && now() - cached.t < ttl) return cached.data;
    try {
      let res;
      try {
        res = await fetchFn(`${BASE}${path(encodeURIComponent(symbol))}&token=${encodeURIComponent(key)}`);
      } catch {
        throw new FinnhubError('network');
      }
      if (res.status === 401 || res.status === 403) throw new FinnhubError('bad_key');
      if (res.status === 429) throw new FinnhubError('rate_limit');
      if (!res.ok) throw new FinnhubError('network');
      let body;
      try { body = await res.json(); } catch { throw new FinnhubError('network'); }
      const data = map(body ?? {});
      writeCache(ck, data);
      return data;
    } catch (err) {
      if (err instanceof FinnhubError && err.code !== 'not_found' && err.code !== 'bad_key' && cached) {
        return { ...cached.data, stale: true };
      }
      throw err;
    }
  }

  return {
    quote: (sym) =>
      request('quote', sym, QUOTE_TTL, (s) => `/quote?symbol=${s}`, (b) => {
        if (!b.c) throw new FinnhubError('not_found');
        return { price: b.c, changePct: num(b.dp), prevClose: num(b.pc) };
      }),
    metrics: (sym) =>
      request('metric', sym, DAY_TTL, (s) => `/stock/metric?symbol=${s}&metric=all`, (b) => {
        const m = b.metric ?? {};
        return { high52: num(m['52WeekHigh']), low52: num(m['52WeekLow']), pe: num(m.peTTM) };
      }),
    profile: (sym) =>
      request('profile', sym, DAY_TTL, (s) => `/stock/profile2?symbol=${s}`, (b) => {
        if (!b.name) throw new FinnhubError('not_found');
        const mc = num(b.marketCapitalization);
        return { name: b.name, marketCapUsd: mc === null ? null : mc * 1e6 };
      }),
  };
}
