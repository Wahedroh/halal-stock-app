import { h, infoButton, settle, field, pageHeader, cardTitle } from './components.js';
import { buildGoalsView, parseGoalsForm, parseYieldPct, DEFAULT_YIELD_PCT } from './goalsView.js';
import { buildPortfolioView } from './portfolioView.js';
import { progressBar } from './portfolio.js';
import { fmtPct, fmtUsd } from '../lib/metrics.js';
import { listTxns, saveGoals } from '../lib/store.js';
import { todayLocal } from '../lib/dates.js';
import { errorText } from '../lib/errors.js';

const HEAD = { sticker: 'เป้าหมาย', title: 'เป้าหมายของฉัน', hand: 'ปันผล · เงินลงทุน · ผลตอบแทน' };
const thb = (x) => `฿${Math.round(x).toLocaleString('en-US')}`;

export async function renderGoals(root, ctx) {
  const token = (root._tok = (root._tok ?? 0) + 1);
  const stale = () => root._tok !== token;
  root.replaceChildren(pageHeader({ ...HEAD, hand: 'กำลังโหลด…' }));
  const r = await settle(listTxns(ctx.uid));
  if (stale()) return;
  if (!r.ok) { root.replaceChildren(pageHeader(HEAD), h('p', { class: 'msg err' }, 'โหลดประวัติซื้อขายไม่สำเร็จ ลองโหลดใหม่')); return; }
  const txns = r.v;
  const held = [...new Set(txns.map((t) => t.symbol))];
  const fh = ctx.finnhub();
  const qs = await Promise.all(held.map((s) => settle(fh.quote(s))));
  if (stale()) return;
  const quotes = Object.fromEntries(held.map((s, i) => [s, qs[i]]).filter(([, q]) => q.ok && q.v).map(([s, q]) => [s, q.v]));
  const quoteFailed = qs.some((q) => !q.ok);
  const pv = buildPortfolioView({ txns, quotes, settings: ctx.user.settings });

  const g = ctx.user.goals;
  const msg = h('p', { class: 'msg', 'aria-live': 'polite' });
  const say = (t, ok) => { msg.className = ok ? 'msg ok' : 'msg err'; msg.textContent = t; };
  const yieldIn = h('input', { inputmode: 'decimal', value: DEFAULT_YIELD_PCT });
  const calc = h('div', {});
  const progress = h('div', {});

  const show = () => {
    const v = buildGoalsView({ goals: ctx.user.goals, settings: ctx.user.settings, txns, summary: pv.summary, today: todayLocal(), yieldPct: parseYieldPct(yieldIn.value) });
    progress.replaceChildren(
      h('h2', {}, 'เป้าปันผล', infoButton('dividendGoal')),
      h('p', { class: 'sub' }, `${thb(v.dividend.currentMonthlyThb)} / ${thb(v.dividend.targetThb)} ต่อเดือน (${fmtPct(v.dividend.pct)}) · ภายในอายุ ${v.dividend.byAge}`),
      progressBar(v.dividend.pct, 'ความคืบหน้าเป้าปันผล'),
      h('h2', {}, 'เงินลงทุนรวม', infoButton('investGoal')),
      v.invest.pct === null ? h('p', { class: 'sub' }, `ลงทุนแล้ว ${fmtUsd(v.invest.invested)} · ยังไม่ได้ตั้งเป้า`)
        : h('div', {}, h('p', { class: 'sub' }, `${fmtUsd(v.invest.invested)} / ${fmtUsd(v.invest.target)} (${fmtPct(v.invest.pct)})`), progressBar(v.invest.pct, 'ความคืบหน้าเป้าเงินลงทุน')),
      h('h2', {}, 'ผลตอบแทน', infoButton('returnGoal')),
      v.returns.target === null ? h('p', { class: 'sub' }, `ตอนนี้ ${fmtPct(v.returns.current)} · ยังไม่ได้ตั้งเป้า`)
        : h('div', {}, h('p', { class: 'sub' }, `${fmtPct(v.returns.current)} / ${fmtPct(v.returns.target)}`), progressBar(v.returns.pct, 'ความคืบหน้าเป้าผลตอบแทน')),
      ...(quoteFailed || pv.summary.missingPrices.length ? [h('p', { class: 'msg warn' }, 'ดึงราคาบางตัวไม่ได้ ผลตอบแทนจึงใช้ต้นทุนแทนราคาตลาดของตัวนั้น')] : []));
    calc.replaceChildren(v.required === null
      ? h('p', { class: 'msg err' }, 'กรอกอัตราปันผลเฉลี่ยเป็นตัวเลขมากกว่า 0 ถึง 100')
      : h('div', {}, h('div', { class: 'kv' }, h('span', {}, 'ปันผลก่อนภาษีที่ต้องได้ต่อปี'), h('b', {}, fmtUsd(v.required.grossYearUsd))),
        h('div', { class: 'kv' }, h('span', {}, 'เงินต้นที่ต้องใช้'), h('b', {}, `${fmtUsd(v.required.capitalUsd)} (${thb(v.required.capitalThb)})`)),
        h('p', { class: 'sub' }, `ภาษีหัก ณ ที่จ่าย ${(ctx.user.settings.wht * 100).toFixed(0)}% · fx ${ctx.user.settings.fx} · ยังไม่รวมภาษีเงินได้ฝั่งไทย`)));
  };
  yieldIn.addEventListener('input', show);

  const f = {
    dividendMonthlyThb: h('input', { inputmode: 'decimal', value: g.dividendMonthlyThb ?? '' }),
    dividendByAge: h('input', { inputmode: 'numeric', value: g.dividendByAge ?? '' }),
    monthlyInvestThb: h('input', { inputmode: 'decimal', value: g.monthlyInvestThb ?? '' }),
    investTargetUsd: h('input', { inputmode: 'decimal', value: g.investTargetUsd ?? '', placeholder: 'เว้นว่าง = ไม่ตั้งเป้า' }),
    returnTargetPct: h('input', { inputmode: 'decimal', value: g.returnTargetPct == null ? '' : Math.round(g.returnTargetPct * 1e6) / 1e4, placeholder: 'เว้นว่าง = ไม่ตั้งเป้า' }),
  };
  async function save(e) {
    e.preventDefault();
    const res = parseGoalsForm(Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value])));
    if (res.error) return say(res.error, false);
    try { await saveGoals(ctx.uid, res.patch); Object.assign(ctx.user.goals, res.patch); say('บันทึกแล้ว', true); show(); } catch (err) { say(errorText(err), false); }
  }
  show();
  if (stale()) return;
  root.replaceChildren(pageHeader(HEAD),
    ...(pv.error ? [h('p', { class: 'msg err' }, pv.error)] : []),
    h('section', { class: 'card goals-progress' }, progress),
    h('section', { class: 'card' }, cardTitle('เครื่องคำนวณเงินต้น', infoButton('requiredCapital')),
      field('อัตราปันผลเฉลี่ยของพอร์ต', yieldIn, { suffix: '%' }), calc),
    h('form', { class: 'card', onsubmit: save }, cardTitle('ตั้งเป้าหมาย'),
      field('เป้าปันผล (หลังหักภาษี)', f.dividendMonthlyThb, { suffix: 'บาท/เดือน' }), field('ภายในอายุ', f.dividendByAge, { suffix: 'ปี' }),
      field('เงินลงทุนต่อเดือน', f.monthlyInvestThb, { suffix: 'บาท' }), field('เป้าเงินลงทุนรวม', f.investTargetUsd, { suffix: 'USD' }),
      field('เป้าผลตอบแทน', f.returnTargetPct, { suffix: '%' }), h('button', { type: 'submit', class: 'btn block' }, 'บันทึกเป้าหมาย'), msg));
}
