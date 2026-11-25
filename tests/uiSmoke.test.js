// ทดสอบหน้าจอแบบคร่าว ๆ ด้วย DOM จำลองขั้นต่ำ (ไม่มี jsdom) + store จำลอง
import { test, expect, vi } from 'vitest';
class Node { constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {}; this.className = ''; this._text = ''; this.hidden = false; this.value = ''; }
  append(...k) { this.children.push(...k); } replaceChildren(...k) { this.children = k; }
  addEventListener(n, f) { (this.listeners[n] ??= []).push(f); } setAttribute(k, v) { this.attrs[k] = v; if (k === 'value') this.value = v; }
  remove() {} set textContent(t) { this._text = t; this.children = []; } get textContent() { return this._text + this.children.map((c) => (c instanceof Node ? c.textContent : String(c))).join(''); } }
globalThis.Node = Node;
globalThis.document = { createElement: (t) => new Node(t), createTextNode: (t) => { const n = new Node('#text'); n._text = t; return n; }, body: new Node('body') };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = { hash: '#/stock/AVGO', reload: () => {} };
globalThis.confirm = () => true;
const saved = [];
vi.mock('../src/lib/store.js', () => ({
  listTxns: async () => [{ id: 'b1', type: 'buy', symbol: 'AVGO', date: '2026-01-02', shares: 10, price: 200 }, { id: 's1', type: 'sell', symbol: 'MSFT', date: '2026-01-02', shares: 1, price: 1 }],
  addTxn: async () => {}, deleteTxn: async () => { throw new Error('ลบไม่ได้: จะทำให้ประวัติขายเกินจำนวนที่ถือ'); },
  getHalal: async () => ({ interestDebt: 67e9, interestDeposits: 9e9, impermissiblePct: 0.01, source: 'x', enteredAt: '2026-11-25' }),
  saveHalal: async () => {}, getPlan: async () => ({ peakSinceBuy: 400, peakHoldingStart: '2025-01-01' }),
  savePlan: async (uid, s, d) => { saved.push([s, d]); }, setWatchlist: async () => { throw { code: 'unavailable' }; },
}));
const { renderStock } = await import('../src/ui/stock.js');
const { renderPortfolio } = await import('../src/ui/portfolio.js');
const fh = { quote: async () => ({ price: 303.27, changePct: -3 }), metrics: async () => ({ high52: 495, low52: 289.77, pe: 30 }), profile: async () => ({ name: 'Broadcom', marketCapUsd: 1.4e12 }) };
const ctx = { uid: 'u', user: { settings: { tranchePcts: [0.05, 0.12, 0.2], trailActivate: 0.15, trailPct: 0.12, alertWithin: 0.03, wht: 0.15, fx: 34 }, goals: { dividendMonthlyThb: 40000, dividendByAge: 64, monthlyInvestThb: 10000 }, watchlist: ['AVGO', 'MSFT'] }, finnhub: () => fh };
const find = (n, pred, out = []) => { if (n instanceof Node) { if (pred(n)) out.push(n); n.children.forEach((c) => find(c, pred, out)); } return out; };
test('stock page renders and per-form messages work', async () => {
  const root = new Node('main');
  await renderStock(root, ctx, 'AVGO');
  const txt = root.textContent;
  expect(txt).toContain('ล้าน USD');
  expect(txt).toContain('ตัวอย่างก่อนบันทึก');
  expect(txt).not.toContain('null');
  expect(saved[0]).toEqual(['AVGO', { peakSinceBuy: 303.27, peakHoldingStart: '2026-01-02' }]);
  const del = find(root, (n) => n.tag === 'button' && n.textContent === 'ลบ')[0];
  await del.listeners.click[0]();
  expect(root.textContent).toContain('ลบไม่ได้: จะทำให้ประวัติขายเกินจำนวนที่ถือ');
  const forms = find(root, (n) => n.tag === 'form');
  const planForm = forms.find((f) => f.textContent.includes('บันทึกแผน'));
  await planForm.listeners.submit[0]({ preventDefault() {} });
  expect(planForm.textContent).toContain('บันทึกแผนแล้ว');
  expect(planForm.textContent).not.toContain('แก้เอง');
  expect(saved.at(-1)[1].tranches).toEqual([null, null, null]);
  const toggle = find(root, (n) => n.tag === 'button' && n.textContent.includes('รายชื่อเฝ้าดู'))[0];
  await toggle.listeners.click[0]();
  expect(root.textContent).toContain('ไม่มีอินเทอร์เน็ต');
  const shares = find(root, (n) => n.tag === 'input' && n.attrs.step === '1')[0];
  expect(shares.attrs).toMatchObject({ type: 'number', min: '1', inputmode: 'numeric' });
  // เปลี่ยนเป็นปันผล: ล้างและปิดช่องจำนวนหุ้น/ราคา (ค่าค้างเช่น 1.5 จะไม่บล็อกการส่งฟอร์ม) · เปลี่ยนกลับแล้วเปิดใหม่
  // ประเภทรายการเป็นปุ่มแบ่งส่วน (radio) ค่าเดิม buy/sell/dividend
  const radios = find(root, (n) => n.tag === 'input' && n.attrs.type === 'radio');
  expect(radios.map((r) => r.attrs.value)).toEqual(['buy', 'sell', 'dividend']);
  const pick = (v) => radios.find((r) => r.attrs.value === v).listeners.change[0]();
  const priceField = find(root, (n) => n.tag === 'label' && n.textContent.startsWith('ราคาต่อหุ้นUSD'))[0];
  const price = find(priceField, (n) => n.tag === 'input')[0];
  shares.value = '1.5'; price.value = '10';
  pick('dividend');
  expect([shares.value, shares.disabled, price.value, price.disabled]).toEqual(['', true, '', true]);
  pick('buy');
  expect([shares.disabled, price.disabled]).toEqual([false, false]);
});
test('portfolio renders with broken symbol named', async () => {
  const root = new Node('main');
  await renderPortfolio(root, ctx);
  expect(root.textContent).toContain('MSFT ขายเกินจำนวนที่ถือ');
  expect(root.textContent).toContain('AVGO');
  expect(root.textContent).not.toContain('null');
});
test('invalid route symbol', async () => {
  const root = new Node('main');
  await renderStock(root, ctx, '', 'สัญลักษณ์หุ้นไม่ถูกต้อง');
  expect(root.textContent).toContain('สัญลักษณ์หุ้นไม่ถูกต้อง');
});
test('goals page', async () => {
  const { renderGoals } = await import('../src/ui/goals.js');
  const root = new Node('main');
  await renderGoals(root, ctx);
  expect(root.textContent).toContain('MSFT');
  expect(root.textContent).toContain('เป้าปันผล');
  expect(root.textContent).not.toContain('null');
});
