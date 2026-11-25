import { test, expect } from 'vitest';
import { createFinnhub, FinnhubError } from '../src/lib/finnhub.js';

const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const okResp = (body) => ({ ok: true, status: 200, json: async () => body });
const statusResp = (status) => ({ ok: false, status, json: async () => ({}) });
const counting = (impl) => {
  const f = async (...a) => { f.calls.push(a); return impl(...a); };
  f.calls = [];
  return f;
};
const QUOTE = { c: 150.5, d: 1, dp: 0.67, pc: 149.5 };

test('unknown symbol -> not_found', async () => {
  const fh = createFinnhub({ key: 'k', fetchFn: async () => okResp({ c: 0, d: null, dp: null, pc: 0 }), storage: memStore() });
  await expect(fh.quote('ZZZZ')).rejects.toMatchObject({ code: 'not_found' });
});

test('401 -> bad_key, 403 -> forbidden, 429 -> rate_limit, 500 -> network', async () => {
  const mk = (s) => createFinnhub({ key: 'k', fetchFn: async () => statusResp(s), storage: memStore() });
  await expect(mk(401).quote('AAPL')).rejects.toMatchObject({ code: 'bad_key' });
  await expect(mk(403).quote('AAPL')).rejects.toMatchObject({ code: 'forbidden', message: 'API key ไม่ถูกต้อง หรือแพ็กฟรีไม่รองรับหุ้นตัวนี้' });
  await expect(mk(429).quote('AAPL')).rejects.toMatchObject({ code: 'rate_limit' });
  await expect(mk(500).quote('AAPL')).rejects.toMatchObject({ code: 'network' });
});

test('fetch rejection -> network', async () => {
  const fh = createFinnhub({ key: 'k', fetchFn: async () => { throw new TypeError('x'); }, storage: memStore() });
  await expect(fh.quote('AAPL')).rejects.toMatchObject({ code: 'network' });
});

test('quote cached 60s', async () => {
  let t = 1_000_000;
  const f = counting(() => okResp(QUOTE));
  const fh = createFinnhub({ key: 'k', fetchFn: f, storage: memStore(), now: () => t });
  const a = await fh.quote('AAPL');
  t += 59_000;
  const b = await fh.quote('AAPL');
  expect(f.calls.length).toBe(1);
  expect(b).toEqual(a);
  expect(b).not.toHaveProperty('stale');
  t += 2_000; // 61s after first
  await fh.quote('AAPL');
  expect(f.calls.length).toBe(2);
});

test('metrics and profile cached 24h', async () => {
  let t = 0;
  const f = counting((url) => okResp(url.includes('/stock/metric') ? { metric: { '52WeekHigh': 2 } } : { name: 'Apple', marketCapitalization: 1 }));
  const fh = createFinnhub({ key: 'k', fetchFn: f, storage: memStore(), now: () => t });
  await fh.metrics('AAPL'); await fh.profile('AAPL');
  t = 24 * 3600_000 - 1000;
  await fh.metrics('AAPL'); await fh.profile('AAPL');
  expect(f.calls.length).toBe(2);
  t = 24 * 3600_000 + 1000;
  await fh.metrics('AAPL'); await fh.profile('AAPL');
  expect(f.calls.length).toBe(4);
});

test('stale cache returned on 429', async () => {
  let t = 0; let mode = 'ok';
  const f = async () => (mode === 'ok' ? okResp(QUOTE) : statusResp(429));
  const fh = createFinnhub({ key: 'k', fetchFn: f, storage: memStore(), now: () => t });
  await fh.quote('AAPL');
  t = 120_000; mode = 'fail';
  const r = await fh.quote('AAPL');
  expect(r.stale).toBe(true);
  expect(r.price).toBe(150.5);
});

test('stale cache returned on network error; not on bad_key or not_found', async () => {
  let t = 0; let resp = okResp(QUOTE); let boom = false;
  const f = async () => { if (boom) throw new Error('offline'); return resp; };
  const fh = createFinnhub({ key: 'k', fetchFn: f, storage: memStore(), now: () => t });
  await fh.quote('AAPL');
  t = 120_000; boom = true;
  expect((await fh.quote('AAPL')).stale).toBe(true);
  boom = false; resp = statusResp(401);
  await expect(fh.quote('AAPL')).rejects.toMatchObject({ code: 'bad_key' });
  resp = okResp({ c: 0 });
  await expect(fh.quote('AAPL')).rejects.toMatchObject({ code: 'not_found' });
});

test('error without cache rejects', async () => {
  const fh = createFinnhub({ key: 'k', fetchFn: async () => statusResp(429), storage: memStore() });
  await expect(fh.quote('AAPL')).rejects.toBeInstanceOf(FinnhubError);
});

test('missing peTTM -> pe null', async () => {
  const fh = createFinnhub({ key: 'k', fetchFn: async () => okResp({ metric: { '52WeekHigh': 1, '52WeekLow': 0.5 } }), storage: memStore() });
  expect(await fh.metrics('AAPL')).toEqual({ high52: 1, low52: 0.5, pe: null });
});

test('metrics full, empty and non-finite', async () => {
  const mk = (body) => createFinnhub({ key: 'k', fetchFn: async () => okResp(body), storage: memStore() });
  expect(await mk({ metric: { '52WeekHigh': 200, '52WeekLow': 100, peTTM: 28.5 } }).metrics('AAPL')).toEqual({ high52: 200, low52: 100, pe: 28.5 });
  expect(await mk({ metric: {} }).metrics('AAPL')).toEqual({ high52: null, low52: null, pe: null });
  expect(await mk({}).metrics('AAPL')).toEqual({ high52: null, low52: null, pe: null });
  expect((await mk({ metric: { peTTM: 'abc', '52WeekHigh': null } }).metrics('AAPL'))).toEqual({ high52: null, low52: null, pe: null });
});

test('quote mapping with null dp/pc', async () => {
  const fh = createFinnhub({ key: 'k', fetchFn: async () => okResp({ c: 10 }), storage: memStore() });
  expect(await fh.quote('X')).toEqual({ price: 10, changePct: null, prevClose: null });
  const fh2 = createFinnhub({ key: 'k', fetchFn: async () => okResp(QUOTE), storage: memStore() });
  expect(await fh2.quote('X')).toEqual({ price: 150.5, changePct: 0.67, prevClose: 149.5 });
});

test('profile mapping, market cap x1e6, empty -> not_found', async () => {
  const fh = createFinnhub({ key: 'k', fetchFn: async () => okResp({ name: 'Apple Inc', marketCapitalization: 3000000 }), storage: memStore() });
  expect(await fh.profile('AAPL')).toEqual({ name: 'Apple Inc', marketCapUsd: 3e12 });
  const fh2 = createFinnhub({ key: 'k', fetchFn: async () => okResp({ name: 'NoCap' }), storage: memStore() });
  expect(await fh2.profile('X')).toEqual({ name: 'NoCap', marketCapUsd: null });
  const fh3 = createFinnhub({ key: 'k', fetchFn: async () => okResp({}), storage: memStore() });
  await expect(fh3.profile('ZZZ')).rejects.toMatchObject({ code: 'not_found' });
});

test('symbol trimmed/upper-cased; URL and cache key', async () => {
  const f = counting(() => okResp(QUOTE));
  const st = memStore();
  const fh = createFinnhub({ key: 'KEY1', fetchFn: f, storage: st, now: () => 5 });
  await fh.quote('  aapl ');
  expect(f.calls[0][0]).toBe('https://finnhub.io/api/v1/quote?symbol=AAPL&token=KEY1');
  expect(JSON.parse(st.getItem('fh:quote:AAPL'))).toEqual({ t: 5, data: { price: 150.5, changePct: 0.67, prevClose: 149.5 } });
  const g = counting(() => okResp({ metric: {} }));
  await createFinnhub({ key: 'K', fetchFn: g, storage: memStore() }).metrics('msft');
  expect(g.calls[0][0]).toBe('https://finnhub.io/api/v1/stock/metric?symbol=MSFT&metric=all&token=K');
  const h = counting(() => okResp({ name: 'M' }));
  await createFinnhub({ key: 'K', fetchFn: h, storage: memStore() }).profile('msft');
  expect(h.calls[0][0]).toBe('https://finnhub.io/api/v1/stock/profile2?symbol=MSFT&token=K');
});

test('empty symbol -> not_found without fetching', async () => {
  const f = counting(() => okResp(QUOTE));
  const fh = createFinnhub({ key: 'k', fetchFn: f, storage: memStore() });
  await expect(fh.quote('   ')).rejects.toMatchObject({ code: 'not_found' });
  await expect(fh.profile('')).rejects.toMatchObject({ code: 'not_found' });
  expect(f.calls.length).toBe(0);
});

test('missing key -> no_key without fetching', async () => {
  const f = counting(() => okResp(QUOTE));
  for (const key of [undefined, '', '  ']) {
    const fh = createFinnhub({ key, fetchFn: f, storage: memStore() });
    await expect(fh.quote('AAPL')).rejects.toMatchObject({ code: 'no_key', message: 'ยังไม่ได้ใส่ API key ไปที่ตั้งค่า' });
  }
  expect(f.calls.length).toBe(0);
});

test('Thai messages and key never in message', async () => {
  const msgs = { not_found: 'ไม่พบหุ้นนี้', bad_key: 'API key ไม่ถูกต้อง ไปที่ตั้งค่า', no_key: 'ยังไม่ได้ใส่ API key ไปที่ตั้งค่า', forbidden: 'API key ไม่ถูกต้อง หรือแพ็กฟรีไม่รองรับหุ้นตัวนี้', rate_limit: 'เรียกข้อมูลถี่เกินไป รอ 1 นาที', network: 'เชื่อมต่อไม่ได้' };
  for (const [code, message] of Object.entries(msgs)) {
    const e = new FinnhubError(code);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(code);
    expect(e.message).toBe(message);
  }
  const fh = createFinnhub({ key: 'SECRETKEY', fetchFn: async () => { throw new Error('fail https://x?token=SECRETKEY'); }, storage: memStore() });
  const err = await fh.quote('AAPL').catch((e) => e);
  expect(err.message).not.toContain('SECRETKEY');
});

test('corrupt cache entry is ignored', async () => {
  const st = memStore();
  st.setItem('fh:quote:AAPL', '{not json');
  const fh = createFinnhub({ key: 'k', fetchFn: async () => okResp(QUOTE), storage: st });
  expect((await fh.quote('AAPL')).price).toBe(150.5);
});

test('403 does not fall back to stale cache', async () => {
  let t = 0; let resp = okResp(QUOTE);
  const fh = createFinnhub({ key: 'k', fetchFn: async () => resp, storage: memStore(), now: () => t });
  await fh.quote('AAPL');
  t = 120_000; resp = statusResp(403);
  await expect(fh.quote('AAPL')).rejects.toMatchObject({ code: 'forbidden' });
});
