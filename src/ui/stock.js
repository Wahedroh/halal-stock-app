import { h, infoButton, alertBadge, halalBadge, settle, field, msgLine, segmented, pageHeader, cardTitle, unitBox, helpText } from './components.js';
import { fmtChangePct } from './portfolioView.js';
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
const stat = (label, value, term) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label, term ? infoButton(term) : null), h('b', {}, value));
const TXN_LABEL = { buy: 'ซื้อ', sell: 'ขาย', dividend: 'ปันผล' };
const usdName = () => h('span', { class: 'sr-only' }, ' (USD)');

export async function renderStock(root, ctx, rawSym, symError) {
  if (symError) {
    root._tok = (root._tok ?? 0) + 1;
    root.replaceChildren(pageHeader({ sticker: 'ค้นหาหุ้น', title: 'หุ้น', extra: searchBox(ctx) }), h('p', { class: 'msg err' }, symError));
    return;
  }
  const sym = normalizeSymbol(rawSym) || normalizeSymbol(ctx.user.watchlist[0]) || '';
  if (sym) localStorage.setItem('lastSym', sym);
  const token = (root._tok = (root._tok ?? 0) + 1);
  const stale = () => root._tok !== token;
  root.replaceChildren(pageHeader({ sticker: 'หุ้น', title: sym || 'หุ้น', hand: 'กำลังโหลด…' }));
  if (!sym) { root.replaceChildren(pageHeader({ sticker: 'ค้นหาหุ้น', title: 'หุ้น', extra: searchBox(ctx) }), h('p', { class: 'sub' }, 'ยังไม่มีหุ้นในรายชื่อเฝ้าดู')); return; }

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

  // ---- หัวกรมท่า: สัญลักษณ์ ชื่อบริษัท สติกเกอร์สถานะ + ค้นหา ----
  const inList = ctx.user.watchlist.includes(sym);
  const status = view.position.held ? `ถืออยู่ · ${fmtShares(view.position.shares)} หุ้น` : inList ? 'อยู่ในรายชื่อเฝ้าดู' : 'ยังไม่ได้เฝ้าดู';
  const header = pageHeader({ sticker: status, title: view.symbol, hand: view.name, extra: searchBox(ctx, sym) });

  // ---- การ์ดราคา ----
  const notices = [
    view.stale ? h('p', { class: 'msg warn' }, 'ข้อมูลเก่า (แสดงจากแคช)') : null,
    errors.length ? h('p', { class: 'msg err' }, [...new Set(errors)].join(' · ')) : null,
    loadErrors.length ? h('p', { class: 'msg err' }, loadErrors.join(' · ')) : null,
  ];
  const chgCls = view.changePct === null ? 'chg' : view.changePct < 0 ? 'chg neg' : 'chg pos';
  const dotLeft = Math.min(100, Math.max(0, (view.rangePos ?? 0) * 100));
  const priceCard = h('section', { class: 'card price-card', 'aria-label': 'ราคา' }, notices,
    q.ok ? h('div', { class: 'price-row' },
      h('span', { class: 'big' }, fmtUsd(view.price), infoButton('price')),
      h('span', { class: 'chg-wrap' }, h('span', { class: chgCls }, fmtChangePct(view.changePct)), infoButton('changePct'))) : null,
    h('div', { class: 'badges' }, halalBadge(view.halal.status), view.alerts.map(alertBadge)),
    q.ok || m.ok ? h('div', { class: 'range-box' },
      h('div', { class: 'range-head' }, h('span', {}, 'ช่วงราคา 52 สัปดาห์'), infoButton('range52')),
      view.rangePos === null ? null : h('div', { class: 'range', role: 'img', 'aria-label': `ราคาอยู่ที่ ${fmtPct(view.rangePos)} ของช่วง 52 สัปดาห์` }, h('i', { style: `left:${dotLeft}%` })),
      h('div', { class: 'rl' }, h('span', {}, `ต่ำสุด/แนวรับ ${fmtUsd(view.low52)}`), h('span', {}, `สูงสุด ${fmtUsd(view.high52)}`))) : null);
  if (stockErr && q.e?.code === 'not_found') { if (!stale()) root.replaceChildren(header, priceCard); return; }

  // ---- ตัวเลขสำคัญ 2×2 ----
  const metricsCard = h('section', { class: 'card' }, cardTitle('ตัวเลขสำคัญ'),
    h('div', { class: 'stats' },
      stat('ตำแหน่งในช่วง 52W', fmtPct(view.rangePos), 'rangePos'),
      stat('ลงจากจุดสูงสุด', fmtPct(view.drawdown), 'drawdown'),
      stat('ห่างแนวรับ (52W Low)', fmtPct(view.supportDistance), 'support'),
      stat('P/E', view.pe === null ? '—' : view.pe.toFixed(2), 'pe')));

  // ---- แผนซื้อ 3 ไม้ + TP + Trailing ----
  const planMsg = msgLine();
  const trInputs = view.tranches.map((t) => h('input', { inputmode: 'decimal', value: t.price ?? '' }));
  const tpInput = h('input', { inputmode: 'decimal', value: view.tp.price ?? '', placeholder: 'เว้นว่าง = 52W High' });
  const trLabel = (i, edited) => `ไม้ ${i + 1} (−${((view.tranches[i].pct ?? 0) * 100).toFixed(0)}%)${edited ? ' · แก้เอง' : ''}`;
  const tpLabel = (edited) => `เป้าขาย${edited ? ' · แก้เอง' : ''}`;
  const trSpans = view.tranches.map((t, i) => h('span', { class: 'field-label' }, trLabel(i, t.edited)));
  const tpSpan = h('span', { class: 'field-label' }, tpLabel(view.tp.edited));
  const tile = (label, price, edited, cls, info) => {
    const value = h('b', {}, fmtUsd(price));
    const mark = h('small', { class: 'edited' }, 'แก้เอง');
    mark.hidden = !edited;
    return { el: h('div', { class: cls }, h('small', {}, label, info ?? null), value, mark), value, mark };
  };
  const trTiles = view.tranches.map((t, i) => tile(`ไม้ ${i + 1} · −${((t.pct ?? 0) * 100).toFixed(0)}%`, t.price, t.edited, 'tranche-tile'));
  const tpTile = tile('เป้าขาย (TP)', view.tp.price, view.tp.edited, 'mini-tile', infoButton('tp'));
  async function savePlanForm(e) {
    e.preventDefault();
    const r = planPatchFromForm(view, { tranches: trInputs.map((i) => i.value), tp: tpInput.value });
    if (r.error) return planMsg.say(r.error, false);
    try {
      await persistPlan({ ...r.patch, ...peakPatch(view) });
      r.patch.tranches.forEach((v, i) => {
        trSpans[i].textContent = trLabel(i, v !== null);
        if (v === null) trInputs[i].value = view.tranches[i].suggested ?? '';
        trTiles[i].value.textContent = fmtUsd(v ?? view.tranches[i].suggested); trTiles[i].mark.hidden = v === null;
      });
      tpSpan.textContent = tpLabel(r.patch.tp !== null);
      if (r.patch.tp === null) tpInput.value = view.tp.suggested ?? '';
      tpTile.value.textContent = fmtUsd(r.patch.tp ?? view.tp.suggested); tpTile.mark.hidden = r.patch.tp === null;
      planMsg.say('บันทึกแผนแล้ว', true);
    } catch (err) { planMsg.say(errorText(err), false); }
  }
  const tr = view.trailing;
  const trailText = !view.position.held ? 'ยังไม่ได้ถือ' : tr.active ? `เปิด · ขายเมื่อ ≤ ${fmtUsd(tr.stopPrice)}${tr.hit ? ' · ถึงจุดแล้ว' : ''}` : 'ยังไม่เปิด';
  const planForm = h('form', { class: 'plan-form', onsubmit: savePlanForm },
    h('div', { class: 'row3' }, view.tranches.map((t, i) => h('label', { class: 'field' }, trSpans[i], usdName(), unitBox(trInputs[i], 'USD')))),
    h('div', { class: 'field' }, h('label', { class: 'field-in' }, tpSpan, usdName(), unitBox(tpInput, 'USD')),
      helpText(tpInput, `${SUGGEST_NOTE} (52W High) · เว้นว่างเพื่อใช้สูตร`)),
    h('button', { type: 'submit', class: 'btn block' }, 'บันทึกแผน'), planMsg.el);
  const planCard = h('section', { class: 'card' },
    cardTitle('แผนซื้อ 3 ไม้', infoButton('tranches')),
    h('div', { class: 'tranche' }, trTiles.map((t) => t.el)),
    h('div', { class: 'tp-row' }, tpTile.el,
      h('div', { class: 'mini-tile' }, h('b', { class: 'trail-text' }, trailText),
        h('small', {}, 'Trailing', infoButton('trailing')))),
    view.position.held ? h('div', { class: 'kv-list' }, row('ต้นทุนเฉลี่ย', fmtUsd(view.position.avgCost), 'avgCost'), row('จุดสูงสุดหลังซื้อ', fmtUsd(view.peak), 'peak')) : null,
    h('p', { class: 'note' }, SUGGEST_NOTE, ' · แก้ราคาได้'),
    h('details', { class: 'more' }, h('summary', {}, 'แก้ราคาแผน (ไม้ 1–3 และเป้าขาย)'), planForm));

  // ---- ฟอร์มซื้อ/ขาย/ปันผล (ซื้อขายเต็มหุ้นเท่านั้น) ----
  const txnMsg = msgLine();
  const date = h('input', { type: 'date', value: todayLocal() });
  const shares = h('input', { type: 'number', step: '1', min: '1', inputmode: 'numeric' });
  const price = h('input', { inputmode: 'decimal' });
  const fee = h('input', { inputmode: 'decimal', placeholder: 'ไม่บังคับ' });
  const amount = h('input', { inputmode: 'decimal' });
  const fShares = field('จำนวนหุ้น (เต็มหุ้น)', shares, { suffix: 'หุ้น' }), fPrice = field('ราคาต่อหุ้น', price, { suffix: 'USD' });
  const fFee = field('ค่าธรรมเนียม', fee, { suffix: 'USD', help: 'ไม่บังคับ เว้นว่างได้' });
  const fAmount = field('ปันผลที่ได้รับ', amount, { suffix: 'USD', help: 'ยอดที่เข้าบัญชีจริง หลังหักภาษี ณ ที่จ่าย' });
  const sync = () => {
    const d = type.value === 'dividend';
    [fShares, fPrice, fFee].forEach((e) => (e.hidden = d)); fAmount.hidden = !d;
    // ช่องที่ซ่อน: ล้างค่าและปิดไว้ ไม่ให้ค่าค้าง (เช่น 1.5) บล็อกการส่งฟอร์มแบบเงียบ ๆ
    [shares, price].forEach((i) => { if (d) i.value = ''; i.disabled = d; });
  };
  const type = segmented('ประเภท', Object.entries(TXN_LABEL), 'buy', sync);
  sync();
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
  const txnRows = view.txns.map((t) => h('div', { class: 'txn-row' },
    h('div', {}, h('span', { class: `tag t-${t.type}` }, TXN_LABEL[t.type]), h('small', {}, t.date)),
    h('div', { class: 'txn-right' }, h('b', {}, t.type === 'dividend' ? fmtUsd(t.amount) : `${fmtShares(t.shares)} @ ${fmtUsd(t.price)}`),
      h('button', { type: 'button', class: 'ghost small', 'aria-label': `ลบรายการ${TXN_LABEL[t.type]} ${t.date}`, onclick: () => delTxn(t) }, 'ลบ'))));
  const txnCard = h('section', { class: 'card' }, cardTitle('ประวัติซื้อขาย'),
    view.positionError ? h('p', { class: 'msg err' }, view.positionError) : null,
    h('details', { class: 'add-txn' }, h('summary', { class: 'btn y block' }, '+ บันทึกการซื้อ/ขาย/ปันผล'),
      h('form', { class: 'txn-form', onsubmit: addForm }, type.el, field('วันที่', date), fShares, fPrice, fFee, fAmount,
        h('button', { type: 'submit', class: 'btn block' }, 'เพิ่มรายการ'))),
    txnMsg.el,
    view.txns.length === 0 ? h('p', { class: 'sub' }, 'ยังไม่มีรายการ') : h('div', { class: 'txn-list' }, txnRows));

  // ---- ฮาลาล: หนี้/เงินฝากกรอกเป็นล้าน USD ----
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
  const preview = h('div', { class: 'preview' });
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
  const halalCard = h('section', { class: 'card' },
    cardTitle('ฮาลาล', infoButton('halal')),
    h('div', { class: 'badges' }, halalBadge(hv.status)),
    hv.status === 'fail' ? h('p', { class: 'msg err' }, halalFailText(hv.failed)) : null,
    hv.source || hv.enteredAt ? h('p', { class: 'sub' }, `แหล่งที่มา: ${hv.source ?? '—'} · กรอกเมื่อ ${hv.enteredAt ?? '—'}`) : h('p', { class: 'sub' }, 'ยังไม่มีข้อมูล ไม่มีแหล่งที่มา'),
    hv.status !== 'unchecked' ? h('div', { class: 'kv-list' }, row('หนี้ดอกเบี้ย ÷ Market Cap', fmtPct(hv.debtRatio), 'debtRatio'), row('เงินฝากดอกเบี้ย ÷ Market Cap', fmtPct(hv.depositRatio), 'depositRatio'),
      row('ยอดชำระล้าง', fmtUsd(hv.purification.amount), 'purification'),
      h('p', { class: 'sub' }, `ปันผลรวมของตัวนี้ ${fmtUsd(hv.purification.dividends)} × ${fmtPct(hv.purification.pct)}`)) : null,
    h('details', { class: 'more' }, h('summary', {}, hv.status === 'unchecked' ? 'กรอกข้อมูลฮาลาล' : 'แก้ข้อมูลฮาลาล'),
      h('form', { class: 'halal-form', onsubmit: halalForm },
        field('หนี้ที่มีดอกเบี้ย', hf.debt, { suffix: 'ล้าน USD', help: 'จากงบดุล: เงินกู้และหุ้นกู้ระยะสั้น + ระยะยาว (หน่วยล้าน USD)' }),
        field('เงินฝาก/หลักทรัพย์ที่มีดอกเบี้ย', hf.dep, { suffix: 'ล้าน USD', help: 'เงินสด เงินฝาก และหลักทรัพย์ที่ได้ดอกเบี้ย (หน่วยล้าน USD)' }),
        field('รายได้ต้องห้าม', hf.imp, { suffix: '%', help: 'เป็น % ของรายได้รวม เช่น 1.5 (เกณฑ์ต้องต่ำกว่า 5%)' }),
        field('แหล่งที่มา', hf.src, { help: 'ระบุเว็บหรือรายงานที่ใช้ เพื่อกลับมาตรวจซ้ำได้' }),
        preview,
        h('button', { type: 'submit', class: 'btn block' }, 'บันทึกข้อมูลฮาลาล'), halalMsg.el)));

  // ---- บันทึกความเห็น ----
  const noteMsg = msgLine();
  const note = h('textarea', { rows: '4', placeholder: 'ความเห็นของครู' }, view.note);
  const noteShow = h('p', { class: view.note ? 'note-text' : 'sub' }, view.note || 'ยังไม่มีความเห็น');
  const noteSummary = h('summary', {}, view.note ? 'แก้ความเห็น' : 'เขียนความเห็น');
  const noteCard = h('section', { class: 'card' }, cardTitle('บันทึกความเห็น'), noteShow,
    h('details', { class: 'more' }, noteSummary,
      field('ความเห็นของครู', note),
      h('button', { type: 'button', class: 'btn block', onclick: async () => {
        try {
          await persistPlan({ note: note.value, ...peakPatch(view) });
          noteShow.className = note.value ? 'note-text' : 'sub'; noteShow.textContent = note.value || 'ยังไม่มีความเห็น';
          noteSummary.textContent = note.value ? 'แก้ความเห็น' : 'เขียนความเห็น';
          noteMsg.say('บันทึกแล้ว', true);
        } catch (err) { noteMsg.say(errorText(err), false); }
      } }, 'บันทึกความเห็น'), noteMsg.el));

  if (stale()) return;
  root.replaceChildren(header, priceCard, metricsCard, planCard, txnCard, halalCard, noteCard);
}

function searchBox(ctx, current) {
  const msg = msgLine();
  const input = h('input', { placeholder: 'พิมพ์สัญลักษณ์ เช่น AVGO', value: '', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  const goSym = () => {
    if (!input.value.trim()) return;
    const s = normalizeSymbol(input.value);
    if (s) location.hash = `#/stock/${encodeURIComponent(s)}`; else msg.say(SYMBOL_ERR, false);
  };
  const inList = current && ctx.user.watchlist.includes(current);
  return h('div', { class: 'search' },
    h('form', { class: 'search-form', role: 'search', onsubmit: (e) => { e.preventDefault(); goSym(); } },
      h('label', { class: 'search-label' }, h('span', { class: 'sr-only' }, 'ค้นหาหุ้น'), input), h('button', { type: 'submit', class: 'btn y' }, 'ดู')),
    h('div', { class: 'chips' }, ctx.user.watchlist.map((s) => h('a', { href: `#/stock/${encodeURIComponent(s)}`, class: s === current ? 'chip on' : 'chip', 'aria-current': s === current ? 'page' : null }, s))),
    current ? h('button', { type: 'button', class: 'ghost on-navy', onclick: async () => {
      const list = inList ? ctx.user.watchlist.filter((x) => x !== current) : [...ctx.user.watchlist, current];
      const hash = location.hash;
      try {
        await setWatchlist(ctx.uid, list); ctx.user.watchlist = list;
        if (location.hash === hash) location.reload(); // ยังอยู่หน้าเดิมเท่านั้น
      } catch (err) { msg.say(errorText(err), false); }
    } }, inList ? 'เอาออกจากรายชื่อเฝ้าดู' : '+ เพิ่มในรายชื่อเฝ้าดู') : null,
    msg.el);
}
