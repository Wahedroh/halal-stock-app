import { h, infoButton, alertBadge, halalBadge, settle, field, msgLine } from './components.js';
import {
  buildStockView, applyPlanSave, shouldSavePeak, peakPatch, errorMessage, SUGGEST_NOTE,
  planPatchFromForm, parseTxnForm, parseHalalForm, halalFormValues, halalPreview, halalFailText,
} from './stockView.js';
import { fmtPct, fmtUsd, fmtShares } from '../lib/metrics.js';
import { listTxns, addTxn, deleteTxn, getHalal, saveHalal, getPlan, savePlan, setWatchlist } from '../lib/store.js';
import { normalizeSymbol, SYMBOL_ERR } from '../lib/symbol.js';
import { todayLocal } from '../lib/dates.js';
import { errorText } from '../lib/errors.js';

const row = (label, value, term) => h('div', { class: 'kv' }, h('span', {}, label, term ? infoButton(term) : null), h('b', {}, value));

export async function renderStock(root, ctx, rawSym, symError) {
  if (symError) { root._tok = (root._tok ?? 0) + 1; root.replaceChildren(searchBox(ctx), h('p', { class: 'msg err' }, symError)); return; }
  const sym = normalizeSymbol(rawSym) || normalizeSymbol(ctx.user.watchlist[0]) || '';
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
  const rerender = () => (stale() ? undefined : renderStock(root, ctx, sym)); // ข้ามถ้าผู้ใช้ย้ายหน้าแล้ว
  const loadErrors = [[txns, 'ประวัติซื้อขาย'], [plan, 'แผน'], [halal, 'ข้อมูลฮาลาล']].filter(([r]) => !r.ok).map(([, n]) => `โหลด${n}ไม่สำเร็จ`);
  const planOk = plan.ok;
  let curPlan = plan.v ?? null; // สถานะแผนล่าสุดในเครื่อง
  const persistPlan = async (patch) => {
    if (!planOk) throw new Error('โหลดแผนไม่สำเร็จ จึงยังบันทึกไม่ได้ ลองโหลดใหม่');
    const doc = applyPlanSave(curPlan, patch);
    await savePlan(ctx.uid, sym, doc);
    curPlan = doc;
  };

  // จดจุดสูงสุดหลังซื้อ (คู่กับวันเริ่มรอบถือ) เมื่อราคาทำสถิติใหม่ (เฉพาะเมื่อโหลดแผนสำเร็จ)
  if (shouldSavePeak(view, planOk)) persistPlan(peakPatch(view)).catch(() => {});

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
  const planMsg = msgLine();
  const trInputs = view.tranches.map((t) => h('input', { inputmode: 'decimal', value: t.price ?? '' }));
  const tpInput = h('input', { inputmode: 'decimal', value: view.tp.price ?? '', placeholder: 'เว้นว่าง = ใช้ 52W High' });
  const trLabel = (i, edited) => `ไม้ ${i + 1} (−${((view.tranches[i].pct ?? 0) * 100).toFixed(0)}%)${edited ? ' · แก้เอง' : ''}`;
  const tpLabel = (edited) => `เป้าขาย${edited ? ' · แก้เอง' : ''}`;
  const trSpans = view.tranches.map((t, i) => h('span', {}, trLabel(i, t.edited)));
  const tpSpan = h('span', {}, tpLabel(view.tp.edited));
  async function savePlanForm(e) {
    e.preventDefault();
    const r = planPatchFromForm(view, { tranches: trInputs.map((i) => i.value), tp: tpInput.value });
    if (r.error) return planMsg.say(r.error, false);
    try {
      await persistPlan({ ...r.patch, ...peakPatch(view) });
      r.patch.tranches.forEach((v, i) => { trSpans[i].textContent = trLabel(i, v !== null); if (v === null) trInputs[i].value = view.tranches[i].suggested ?? ''; });
      tpSpan.textContent = tpLabel(r.patch.tp !== null);
      if (r.patch.tp === null) tpInput.value = view.tp.suggested ?? '';
      planMsg.say('บันทึกแผนแล้ว', true);
    } catch (err) { planMsg.say(errorText(err), false); }
  }
  const planCard = h('form', { class: 'card', onsubmit: savePlanForm },
    h('h2', {}, 'แผนซื้อ 3 ไม้', infoButton('tranches')),
    h('p', { class: 'sub' }, SUGGEST_NOTE, ' · แก้ราคาได้'),
    view.tranches.map((t, i) => h('label', { class: 'field' }, trSpans[i], trInputs[i])),
    h('h2', {}, 'TP', infoButton('tp')),
    h('p', { class: 'sub' }, SUGGEST_NOTE, ' (52W High)'),
    h('label', { class: 'field' }, tpSpan, tpInput),
    h('h2', {}, 'Trailing', infoButton('trailing')),
    view.position.held
      ? h('div', {}, row('ต้นทุนเฉลี่ย', fmtUsd(view.position.avgCost), 'avgCost'), row('จุดสูงสุดหลังซื้อ', fmtUsd(view.peak), 'peak'),
        row('สถานะ Trailing', view.trailing.active ? `เปิด · ขายเมื่อ ≤ ${fmtUsd(view.trailing.stopPrice)}${view.trailing.hit ? ' · ถึงจุดแล้ว' : ''}` : 'ยังไม่เปิด', 'trailing'))
      : h('p', { class: 'sub' }, 'ยังไม่ได้ถือหุ้นตัวนี้'),
    h('button', { type: 'submit' }, 'บันทึกแผน'), planMsg.el);

  // ฟอร์มซื้อ/ขาย/ปันผล (ซื้อขายเต็มหุ้นเท่านั้น)
  const txnMsg = msgLine();
  const type = h('select', {}, h('option', { value: 'buy' }, 'ซื้อ'), h('option', { value: 'sell' }, 'ขาย'), h('option', { value: 'dividend' }, 'ปันผล'));
  const date = h('input', { type: 'date', value: todayLocal() });
  const shares = h('input', { type: 'number', step: '1', min: '1', inputmode: 'numeric' });
  const price = h('input', { inputmode: 'decimal' });
  const fee = h('input', { inputmode: 'decimal', placeholder: 'ไม่บังคับ' });
  const amount = h('input', { inputmode: 'decimal' });
  const fShares = field('จำนวนหุ้น (เต็มหุ้น)', shares), fPrice = field('ราคาต่อหุ้น (USD)', price);
  const fFee = field('ค่าธรรมเนียม (USD)', fee), fAmount = field('ปันผลที่ได้รับ (USD หลังหักภาษี)', amount);
  const sync = () => {
    const d = type.value === 'dividend';
    [fShares, fPrice, fFee].forEach((e) => (e.hidden = d)); fAmount.hidden = !d;
    // ช่องที่ซ่อน: ล้างค่าและปิดไว้ ไม่ให้ค่าค้าง (เช่น 1.5) บล็อกการส่งฟอร์มแบบเงียบ ๆ
    [shares, price].forEach((i) => { if (d) i.value = ''; i.disabled = d; });
  };
  type.addEventListener('change', sync); sync();
  async function addForm(e) {
    e.preventDefault();
    const r = parseTxnForm(sym, { type: type.value, date: date.value, shares: shares.value, price: price.value, fee: fee.value, amount: amount.value });
    if (r.error) return txnMsg.say(r.error, false);
    try { await addTxn(ctx.uid, r.txn); await rerender(); } catch (err) { txnMsg.say(errorText(err), false); }
  }
  const delTxn = async (t) => {
    if (!confirm('ลบรายการนี้?')) return;
    try { await deleteTxn(ctx.uid, t.id); await rerender(); } catch (err) { txnMsg.say(errorText(err), false); }
  };
  const txnCard = h('div', { class: 'card' }, h('h2', {}, 'ประวัติซื้อขาย'),
    view.positionError ? h('p', { class: 'msg err' }, view.positionError) : null,
    view.txns.length === 0 ? h('p', { class: 'sub' }, 'ยังไม่มีรายการ') : view.txns.map((t) => h('div', { class: 'kv' },
      h('span', {}, `${t.date} ${{ buy: 'ซื้อ', sell: 'ขาย', dividend: 'ปันผล' }[t.type]}`),
      h('span', {}, t.type === 'dividend' ? fmtUsd(t.amount) : `${fmtShares(t.shares)} @ ${fmtUsd(t.price)}`,
        h('button', { type: 'button', class: 'link', onclick: () => delTxn(t) }, 'ลบ')))),
    h('form', { onsubmit: addForm }, field('ประเภท', type), field('วันที่', date), fShares, fPrice, fFee, fAmount,
      h('button', { type: 'submit' }, 'เพิ่มรายการ'), txnMsg.el));

  // ฮาลาล: หนี้/เงินฝากกรอกเป็นล้าน USD
  const hv = view.halal;
  const halalMsg = msgLine();
  const init = halalFormValues(halal.v);
  const hf = {
    debt: h('input', { inputmode: 'decimal', value: init.debt }),
    dep: h('input', { inputmode: 'decimal', value: init.dep }),
    imp: h('input', { inputmode: 'decimal', value: init.imp }),
    src: h('input', { value: init.src, placeholder: 'เช่น ชื่อเว็บคัดกรองหุ้น' }),
  };
  const formValues = () => ({ debt: hf.debt.value, dep: hf.dep.value, imp: hf.imp.value, src: hf.src.value });
  const preview = h('div', {});
  const showPreview = () => {
    const pv = halalPreview(formValues(), p.v?.marketCapUsd);
    preview.replaceChildren(h('div', {}, // h() ข้าม null (replaceChildren จะแสดงเป็นข้อความ "null")
      h('p', { class: 'sub' }, 'ตัวอย่างก่อนบันทึก (Market Cap ปัจจุบัน)'),
      pv.noMarketCap ? h('p', { class: 'msg warn' }, 'ไม่มี Market Cap จาก Finnhub จึงคำนวณสัดส่วนไม่ได้')
        : h('div', {}, row('หนี้ดอกเบี้ย ÷ Market Cap', fmtPct(pv.debtRatio), 'debtRatio'), row('เงินฝากดอกเบี้ย ÷ Market Cap', fmtPct(pv.depositRatio), 'depositRatio')),
      pv.warn ? h('p', { class: 'msg warn' }, pv.warn) : null,
      pv.status === 'fail' ? h('p', { class: 'msg err' }, halalFailText(pv.failed)) : null));
  };
  [hf.debt, hf.dep, hf.imp].forEach((i) => i.addEventListener('input', showPreview));
  showPreview();
  async function halalForm(e) {
    e.preventDefault();
    const r = parseHalalForm(formValues(), todayLocal());
    if (r.error) return halalMsg.say(r.error, false);
    try { await saveHalal(ctx.uid, sym, r.doc); await rerender(); } catch (err) { halalMsg.say(errorText(err), false); }
  }
  const halalCard = h('form', { class: 'card', onsubmit: halalForm },
    h('h2', {}, 'ฮาลาล', infoButton('halal')), h('div', {}, halalBadge(hv.status)),
    hv.status === 'fail' ? h('p', { class: 'msg err' }, halalFailText(hv.failed)) : null,
    hv.source || hv.enteredAt ? h('p', { class: 'sub' }, `แหล่งที่มา: ${hv.source ?? '—'} · กรอกเมื่อ ${hv.enteredAt ?? '—'}`) : h('p', { class: 'sub' }, 'ยังไม่มีข้อมูล ไม่มีแหล่งที่มา'),
    hv.status !== 'unchecked' ? h('div', {}, row('หนี้ดอกเบี้ย ÷ Market Cap', fmtPct(hv.debtRatio), 'debtRatio'), row('เงินฝากดอกเบี้ย ÷ Market Cap', fmtPct(hv.depositRatio), 'depositRatio'),
      row('ยอดชำระล้าง', fmtUsd(hv.purification.amount), 'purification'),
      h('p', { class: 'sub' }, `ปันผลรวมของตัวนี้ ${fmtUsd(hv.purification.dividends)} × ${fmtPct(hv.purification.pct)}`)) : null,
    h('h2', {}, 'กรอกข้อมูลฮาลาล'),
    field('หนี้ที่มีดอกเบี้ย (ล้าน USD)', hf.debt),
    field('เงินฝาก/หลักทรัพย์ที่มีดอกเบี้ย (ล้าน USD)', hf.dep),
    field('รายได้ต้องห้าม (% ของรายได้รวม)', hf.imp),
    field('แหล่งที่มา', hf.src),
    preview,
    h('button', { type: 'submit' }, 'บันทึกข้อมูลฮาลาล'), halalMsg.el);

  // บันทึกความเห็น
  const noteMsg = msgLine();
  const note = h('textarea', { rows: '4', placeholder: 'ความเห็นของครู' }, view.note);
  const noteCard = h('div', { class: 'card' }, h('h2', {}, 'บันทึกความเห็น'), note,
    h('button', { type: 'button', onclick: async () => {
      try { await persistPlan({ note: note.value, ...peakPatch(view) }); noteMsg.say('บันทึกแล้ว', true); } catch (err) { noteMsg.say(errorText(err), false); }
    } }, 'บันทึกความเห็น'), noteMsg.el);

  if (stale()) return;
  root.replaceChildren(header, metricsCard, planCard, txnCard, halalCard, noteCard);
}

function searchBox(ctx, current) {
  const msg = msgLine();
  const input = h('input', { placeholder: 'พิมพ์สัญลักษณ์หุ้น เช่น AVGO', value: '', autocapitalize: 'characters' });
  const goSym = () => {
    if (!input.value.trim()) return;
    const s = normalizeSymbol(input.value);
    if (s) location.hash = `#/stock/${encodeURIComponent(s)}`; else msg.say(SYMBOL_ERR, false);
  };
  const inList = current && ctx.user.watchlist.includes(current);
  return h('div', { class: 'search' },
    h('form', { onsubmit: (e) => { e.preventDefault(); goSym(); } }, input, h('button', { type: 'submit' }, 'ดู')),
    h('div', { class: 'chips' }, ctx.user.watchlist.map((s) => h('a', { href: `#/stock/${encodeURIComponent(s)}`, class: s === current ? 'chip on' : 'chip' }, s))),
    current ? h('button', { type: 'button', class: 'link', onclick: async () => {
      const list = inList ? ctx.user.watchlist.filter((x) => x !== current) : [...ctx.user.watchlist, current];
      const hash = location.hash;
      try {
        await setWatchlist(ctx.uid, list); ctx.user.watchlist = list;
        if (location.hash === hash) location.reload(); // ยังอยู่หน้าเดิมเท่านั้น
      } catch (err) { msg.say(errorText(err), false); }
    } }, inList ? 'เอาออกจากรายชื่อเฝ้าดู' : 'เพิ่มในรายชื่อเฝ้าดู') : null,
    msg.el);
}
