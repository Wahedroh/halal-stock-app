import { h, infoButton, alertBadge, halalBadge } from './components.js';
import { buildStockView, applyPlanSave, shouldSavePeak, errorMessage, SUGGEST_NOTE } from './stockView.js';
import { fmtPct, fmtUsd } from '../lib/metrics.js';
import { listTxns, addTxn, deleteTxn, getHalal, saveHalal, getPlan, savePlan, setWatchlist } from '../lib/store.js';
import { cleanSymbol } from './userDoc.js';

const today = () => new Date().toISOString().slice(0, 10);
const row = (label, value, term) => h('div', { class: 'kv' }, h('span', {}, label, term ? infoButton(term) : null), h('b', {}, value));
const posNum = (v) => { const n = Number(String(v).trim()); return Number.isFinite(n) && n > 0 ? n : null; };
const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };

export async function renderStock(root, ctx, rawSym) {
  const sym = cleanSymbol(rawSym) || ctx.user.watchlist[0] || '';
  if (sym) localStorage.setItem('lastSym', sym);
  const token = (root._tok = (root._tok ?? 0) + 1);
  const stale = () => root._tok !== token;
  root.replaceChildren(h('p', {}, 'กำลังโหลด…'));
  if (!sym) { root.replaceChildren(searchBox(ctx), h('p', {}, 'ยังไม่มีหุ้นในรายชื่อเฝ้าดู')); return; }

  const fh = ctx.finnhub();
  const [q, m, p, txns, plan, halal] = await Promise.all([
    settle(fh.quote(sym)), settle(fh.metrics(sym)), settle(fh.profile(sym)),
    settle(listTxns(ctx.uid)), settle(getPlan(ctx.uid, sym)), settle(getHalal(ctx.uid, sym)),
  ]);
  if (stale()) return;
  const view = buildStockView({
    symbol: sym, quote: q.v, metrics: m.v, profile: p.v, txns: txns.v ?? [], plan: plan.v, halal: halal.v, settings: ctx.user.settings,
  });
  const errors = [q, m, p].filter((r) => !r.ok).map((r) => errorMessage(r.e));
  const rerender = () => renderStock(root, ctx, sym);
  const loadErrors = [[txns, 'ประวัติซื้อขาย'], [plan, 'แผน'], [halal, 'ข้อมูลฮาลาล']].filter(([r]) => !r.ok).map(([, n]) => `โหลด${n}ไม่สำเร็จ`);
  const planOk = plan.ok;
  let curPlan = plan.v ?? null; // สถานะแผนล่าสุดในเครื่อง
  const persistPlan = async (patch) => {
    if (!planOk) throw new Error('โหลดแผนไม่สำเร็จ จึงยังบันทึกไม่ได้ ลองโหลดใหม่');
    const doc = applyPlanSave(curPlan, patch);
    await savePlan(ctx.uid, sym, doc);
    curPlan = doc;
  };

  // จดจุดสูงสุดหลังซื้อเมื่อราคาทำสถิติใหม่ (เฉพาะเมื่อโหลดแผนสำเร็จ)
  if (shouldSavePeak(view, planOk)) persistPlan({ peakSinceBuy: view.peak }).catch(() => {});

  const msg = h('p', { class: 'msg' });
  const say = (t, ok) => { msg.className = ok ? 'msg ok' : 'msg err'; msg.textContent = t; };
  const stockErr = !q.ok ? errorMessage(q.e) : null;

  const header = h('div', { class: 'card' },
    searchBox(ctx, sym),
    h('div', { class: 'title' }, h('h1', {}, view.symbol), view.name ? h('span', { class: 'sub' }, view.name) : null,
      halalBadge(view.halal.status)),
    q.ok ? h('div', { class: 'price' }, h('b', {}, fmtUsd(view.price)),
      h('span', { class: view.changePct < 0 ? 'neg' : 'pos' }, view.changePct === null ? '—' : `${view.changePct.toFixed(2)}%`), infoButton('price'), infoButton('changePct')) : null,
    view.stale ? h('p', { class: 'msg warn' }, 'ข้อมูลเก่า (แสดงจากแคช)') : null,
    errors.length ? h('p', { class: 'msg err' }, [...new Set(errors)].join(' · ')) : null,
    loadErrors.length ? h('p', { class: 'msg err' }, loadErrors.join(' · ')) : null,
    view.alerts.length ? h('div', {}, view.alerts.map(alertBadge)) : null);
  if (stockErr && q.e?.code === 'not_found') { if (!stale()) root.replaceChildren(header); return; }

  const bar = h('div', { class: 'bar' }, h('i', { style: `left:${Math.min(100, Math.max(0, (view.rangePos ?? 0) * 100))}%` }));
  const metricsCard = h('div', { class: 'card' },
    row('52W Low – High', `${fmtUsd(view.low52)} – ${fmtUsd(view.high52)}`, 'range52'), view.rangePos === null ? null : bar,
    row('ตำแหน่งในช่วง 52W', fmtPct(view.rangePos), 'rangePos'),
    row('Drawdown', fmtPct(view.drawdown), 'drawdown'),
    row('แนวรับ (52W Low)', fmtUsd(view.support), 'support'),
    row('ห่างแนวรับ', fmtPct(view.supportDistance), 'support'),
    row('P/E', view.pe === null ? '—' : view.pe.toFixed(2), 'pe'));

  // แผนซื้อ + TP + Trailing
  const trInputs = view.tranches.map((t) => h('input', { inputmode: 'decimal', value: t.price ?? '' }));
  const tpInput = h('input', { inputmode: 'decimal', value: view.tp.price ?? '' });
  async function savePlanForm(e) {
    e.preventDefault();
    const tr = trInputs.map((i) => (i.value.trim() === '' ? null : posNum(i.value)));
    const tp = tpInput.value.trim() === '' ? null : posNum(tpInput.value);
    if (tr.some((v, i) => v === null && trInputs[i].value.trim() !== '') || (tp === null && tpInput.value.trim() !== '')) return say('ราคาต้องมากกว่า 0', false);
    try {
      await persistPlan({ tranches: tr, tp: tp ?? undefined, peakSinceBuy: view.peak ?? undefined });
      say('บันทึกแผนแล้ว', true);
    } catch (err) { say(err.message, false); }
  }
  const planCard = h('form', { class: 'card', onsubmit: savePlanForm },
    h('h2', {}, 'แผนซื้อ 3 ไม้', infoButton('tranches')),
    h('p', { class: 'sub' }, SUGGEST_NOTE, ' · แก้ราคาได้'),
    view.tranches.map((t, i) => h('label', { class: 'field' }, h('span', {}, `ไม้ ${i + 1} (−${((t.pct ?? 0) * 100).toFixed(0)}%)${t.edited ? ' · แก้เอง' : ''}`), trInputs[i])),
    h('h2', {}, 'TP', infoButton('tp')),
    h('p', { class: 'sub' }, SUGGEST_NOTE, ' (52W High)'),
    h('label', { class: 'field' }, h('span', {}, `เป้าขาย${view.tp.edited ? ' · แก้เอง' : ''}`), tpInput),
    h('h2', {}, 'Trailing', infoButton('trailing')),
    view.position.held
      ? h('div', {}, row('ต้นทุนเฉลี่ย', fmtUsd(view.position.avgCost), 'avgCost'), row('จุดสูงสุดหลังซื้อ', fmtUsd(view.peak), 'peak'),
        row('สถานะ Trailing', view.trailing.active ? `เปิด · ขายเมื่อ ≤ ${fmtUsd(view.trailing.stopPrice)}${view.trailing.hit ? ' · ถึงจุดแล้ว' : ''}` : 'ยังไม่เปิด', 'trailing'))
      : h('p', { class: 'sub' }, 'ยังไม่ได้ถือหุ้นตัวนี้'),
    h('button', { type: 'submit' }, 'บันทึกแผน'));

  // ฟอร์มซื้อ/ขาย/ปันผล
  const type = h('select', {}, h('option', { value: 'buy' }, 'ซื้อ'), h('option', { value: 'sell' }, 'ขาย'), h('option', { value: 'dividend' }, 'ปันผล'));
  const date = h('input', { type: 'date', value: today() });
  const shares = h('input', { inputmode: 'decimal', placeholder: 'จำนวนหุ้น' });
  const price = h('input', { inputmode: 'decimal', placeholder: 'ราคาต่อหุ้น (USD)' });
  const fee = h('input', { inputmode: 'decimal', placeholder: 'ค่าธรรมเนียม (ไม่บังคับ)' });
  const amount = h('input', { inputmode: 'decimal', placeholder: 'ปันผลที่ได้รับ (USD)' });
  const sync = () => { const d = type.value === 'dividend'; [shares, price, fee].forEach((e) => (e.hidden = d)); amount.hidden = !d; };
  type.addEventListener('change', sync); amount.hidden = true;
  async function addForm(e) {
    e.preventDefault();
    const t = { symbol: sym, type: type.value, date: date.value };
    if (t.type === 'dividend') {
      t.amount = posNum(amount.value);
      if (t.amount === null) return say('จำนวนเงินต้องมากกว่า 0', false);
    } else {
      t.shares = posNum(shares.value); t.price = posNum(price.value);
      if (t.shares === null || t.price === null) return say('จำนวนหุ้นและราคาต้องมากกว่า 0', false);
      if (fee.value.trim() !== '') {
        const f = Number(fee.value);
        if (!Number.isFinite(f) || f < 0) return say('ค่าธรรมเนียมต้องไม่ติดลบ', false);
        t.fee = f;
      }
    }
    try { await addTxn(ctx.uid, t); await rerender(); } catch (err) { say(err.message, false); }
  }
  const txnCard = h('div', { class: 'card' }, h('h2', {}, 'ประวัติซื้อขาย'),
    view.positionError ? h('p', { class: 'msg err' }, view.positionError) : null,
    view.txns.length === 0 ? h('p', { class: 'sub' }, 'ยังไม่มีรายการ') : view.txns.map((t) => h('div', { class: 'kv' },
      h('span', {}, `${t.date} ${{ buy: 'ซื้อ', sell: 'ขาย', dividend: 'ปันผล' }[t.type]}`),
      h('span', {}, t.type === 'dividend' ? fmtUsd(t.amount) : `${t.shares} @ ${fmtUsd(t.price)}`,
        h('button', { type: 'button', class: 'link', onclick: async () => { if (confirm('ลบรายการนี้?')) { await deleteTxn(ctx.uid, t.id); rerender(); } } }, 'ลบ')))),
    h('form', { onsubmit: addForm }, type, date, shares, price, fee, amount, h('button', { type: 'submit' }, 'เพิ่มรายการ')));

  // ฮาลาล
  const hv = view.halal;
  const hf = {
    debt: h('input', { inputmode: 'decimal', value: halal.v?.interestDebt ?? '', placeholder: 'หนี้ที่มีดอกเบี้ย (USD)' }),
    dep: h('input', { inputmode: 'decimal', value: halal.v?.interestDeposits ?? '', placeholder: 'เงินฝาก/หลักทรัพย์ดอกเบี้ย (USD)' }),
    imp: h('input', { inputmode: 'decimal', value: halal.v?.impermissiblePct != null ? Math.round(halal.v.impermissiblePct * 1e6) / 1e4 : '', placeholder: 'รายได้ต้องห้าม (%)' }),
    src: h('input', { value: halal.v?.source ?? '', placeholder: 'แหล่งที่มา (เช่น เว็บคัดกรอง)' }),
  };
  async function halalForm(e) {
    e.preventDefault();
    const nn = (v) => { const n = Number(String(v).trim()); return String(v).trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null; };
    const [d, dp, ip] = [nn(hf.debt.value), nn(hf.dep.value), nn(hf.imp.value)];
    if (d === null || dp === null || ip === null || ip > 100) return say('กรอกตัวเลขหนี้ เงินฝาก และ % รายได้ต้องห้ามให้ครบ (ไม่ติดลบ)', false);
    if (!hf.src.value.trim()) return say('ต้องระบุแหล่งที่มาของข้อมูลฮาลาล', false);
    try {
      await saveHalal(ctx.uid, sym, { interestDebt: d, interestDeposits: dp, impermissiblePct: ip / 100, source: hf.src.value.trim(), enteredAt: today() });
      await rerender();
    } catch (err) { say(err.message, false); }
  }
  const halalCard = h('form', { class: 'card', onsubmit: halalForm },
    h('h2', {}, 'ฮาลาล', infoButton('halal')), h('div', {}, halalBadge(hv.status)),
    hv.source || hv.enteredAt ? h('p', { class: 'sub' }, `แหล่งที่มา: ${hv.source ?? '—'} · กรอกเมื่อ ${hv.enteredAt ?? '—'}`) : h('p', { class: 'sub' }, 'ยังไม่มีข้อมูล ไม่มีแหล่งที่มา'),
    hv.status !== 'unchecked' ? h('div', {}, row('หนี้ดอกเบี้ย ÷ Market Cap', fmtPct(hv.debtRatio), 'debtRatio'), row('เงินฝากดอกเบี้ย ÷ Market Cap', fmtPct(hv.depositRatio), 'depositRatio'),
      row('ยอดชำระล้าง', fmtUsd(hv.purification.amount), 'purification'),
      h('p', { class: 'sub' }, `ปันผลรวมของตัวนี้ ${fmtUsd(hv.purification.dividends)} × ${fmtPct(hv.purification.pct)}`)) : null,
    hf.debt, hf.dep, hf.imp, hf.src, h('button', { type: 'submit' }, 'บันทึกข้อมูลฮาลาล'));

  // บันทึกความเห็น
  const note = h('textarea', { rows: '4', placeholder: 'ความเห็นของครู' }, view.note);
  const noteCard = h('div', { class: 'card' }, h('h2', {}, 'บันทึกความเห็น'), note,
    h('button', { type: 'button', onclick: async () => {
      try { await persistPlan({ note: note.value, peakSinceBuy: view.peak ?? undefined }); say('บันทึกแล้ว', true); } catch (err) { say(err.message, false); }
    } }, 'บันทึกความเห็น'));

  if (stale()) return;
  root.replaceChildren(header, metricsCard, planCard, txnCard, halalCard, noteCard, msg);
}

function searchBox(ctx, current) {
  const input = h('input', { placeholder: 'พิมพ์สัญลักษณ์หุ้น เช่น AVGO', value: '', autocapitalize: 'characters' });
  const goSym = () => { const s = cleanSymbol(input.value); if (s) location.hash = `#/stock/${encodeURIComponent(s)}`; };
  const inList = current && ctx.user.watchlist.includes(current);
  return h('div', { class: 'search' },
    h('form', { onsubmit: (e) => { e.preventDefault(); goSym(); } }, input, h('button', { type: 'submit' }, 'ดู')),
    h('div', { class: 'chips' }, ctx.user.watchlist.map((s) => h('a', { href: `#/stock/${s}`, class: s === current ? 'chip on' : 'chip' }, s))),
    current ? h('button', { type: 'button', class: 'link', onclick: async () => {
      const list = inList ? ctx.user.watchlist.filter((x) => x !== current) : [...ctx.user.watchlist, current];
      await setWatchlist(ctx.uid, list); ctx.user.watchlist = list; location.reload();
    } }, inList ? 'เอาออกจากรายชื่อเฝ้าดู' : 'เพิ่มในรายชื่อเฝ้าดู') : null);
}
