import { h, infoButton, alertBadge, settle, msgLine } from './components.js';
import { buildPortfolioView, fmtSigned, peakSaves } from './portfolioView.js';
import { buildPlanDoc } from './stockView.js';
import { buildGoalsView } from './goalsView.js';
import { errorMessage } from './stockView.js';
import { fmtPct, fmtUsd, fmtShares } from '../lib/metrics.js';
import { listTxns, getPlan, savePlan, setWatchlist } from '../lib/store.js';
import { normalizeSymbol, SYMBOL_ERR } from '../lib/symbol.js';
import { todayLocal } from '../lib/dates.js';
import { errorText } from '../lib/errors.js';

const kv = (label, value, term, cls) => h('div', { class: 'kv' }, h('span', {}, label, term ? infoButton(term) : null), h('b', { class: cls }, value));
const signCls = (x) => (typeof x !== 'number' ? '' : x < 0 ? 'neg' : 'pos');
export const progressBar = (pct) => h('div', { class: 'progress' }, h('i', { style: `width:${Math.round((pct ?? 0) * 100)}%` }));

export async function renderPortfolio(root, ctx) {
  const token = (root._tok = (root._tok ?? 0) + 1);
  const stale = () => root._tok !== token;
  root.replaceChildren(h('h1', {}, 'พอร์ต'), h('p', {}, 'กำลังโหลด…'));

  const txnsR = await settle(listTxns(ctx.uid));
  if (stale()) return;
  if (!txnsR.ok) { root.replaceChildren(h('h1', {}, 'พอร์ต'), h('p', { class: 'msg err' }, 'โหลดประวัติซื้อขายไม่สำเร็จ ลองโหลดใหม่')); return; }
  const txns = txnsR.v;
  const held = [...new Set(txns.map((t) => t.symbol))];
  const quoteSyms = [...new Set([...held, ...ctx.user.watchlist])];

  const fh = ctx.finnhub();
  const [qs, ms, ps] = await Promise.all([
    Promise.all(quoteSyms.map((s) => settle(fh.quote(s)))),
    Promise.all(held.map((s) => settle(fh.metrics(s)))),
    Promise.all(held.map((s) => settle(getPlan(ctx.uid, s)))),
  ]);
  if (stale()) return;
  const pick = (syms, rs) => Object.fromEntries(syms.map((s, i) => [s, rs[i]]).filter(([, r]) => r.ok && r.v).map(([s, r]) => [s, r.v]));
  const quotes = pick(quoteSyms, qs), metrics = pick(held, ms), plans = pick(held, ps);
  const failed = qs.filter((r) => !r.ok);

  const view = buildPortfolioView({ txns, quotes, metrics, plans, settings: ctx.user.settings, watchlist: ctx.user.watchlist });
  const { summary } = view;

  // จดจุดสูงสุดหลังซื้อที่สูงขึ้น (เฉพาะหุ้นที่โหลดแผนสำเร็จ กันเขียนทับแผนเดิม)
  const planOk = Object.fromEntries(held.map((s, i) => [s, ps[i].ok]));
  const planOf = Object.fromEntries(held.map((s, i) => [s, ps[i].ok ? ps[i].v : null]));
  for (const { symbol, patch } of peakSaves(view, planOk)) savePlan(ctx.uid, symbol, buildPlanDoc(planOf[symbol], patch)).catch(() => {});
  const goals = buildGoalsView({ goals: ctx.user.goals, settings: ctx.user.settings, txns, summary, today: todayLocal(), yieldPct: null });

  const { el: msg, say: sayMsg } = msgLine();
  const say = (t) => sayMsg(t, false);

  const summaryCard = h('div', { class: 'card' },
    view.error ? h('p', { class: 'msg err' }, view.error) : null,
    kv('มูลค่ารวม', fmtUsd(summary.marketValue), 'price'),
    kv('เงินลงทุนรวม', fmtUsd(summary.invested), 'investGoal'),
    kv('กำไร/ขาดทุนที่ยังไม่ขาย', fmtSigned(summary.unrealized), 'unrealized', signCls(summary.unrealized)),
    kv('กำไรที่ขายแล้ว', fmtSigned(summary.realized), null, signCls(summary.realized)),
    kv('ปันผลที่ได้รับ', fmtSigned(summary.dividends), null, signCls(summary.dividends)),
    kv('รวมกำไร/ขาดทุน', fmtSigned(summary.totalPnl), null, signCls(summary.totalPnl)),
    kv('ผลตอบแทน', fmtPct(summary.returnPct), 'returnPct', signCls(summary.returnPct)),
    goals.invest.pct === null ? h('p', { class: 'sub' }, 'ยังไม่ได้ตั้งเป้าเงินลงทุนรวม (ตั้งในหน้าเป้าหมาย)')
      : h('div', {}, h('p', { class: 'sub' }, `เป้าเงินลงทุน ${fmtUsd(goals.invest.invested)} / ${fmtUsd(goals.invest.target)} (${fmtPct(goals.invest.pct)})`, infoButton('investGoal')), progressBar(goals.invest.pct)),
    summary.missingPrices.length ? h('p', { class: 'msg warn' }, `ดึงราคาไม่ได้: ${summary.missingPrices.join(', ')} (ใช้ต้นทุนแทน)`) : null,
    failed.length ? h('p', { class: 'msg err' }, [...new Set(failed.map((r) => errorMessage(r.e)))].join(' · ')) : null);

  const holdRows = view.holdings.map((x) => h('a', { class: 'row-link', href: `#/stock/${encodeURIComponent(x.symbol)}` },
    h('div', { class: 'kv' }, h('b', {}, x.symbol), h('span', {}, x.price === null ? '—' : fmtUsd(x.price),
      x.changePct === null ? null : h('span', { class: signCls(x.changePct) }, ` ${x.changePct.toFixed(2)}%`))),
    h('div', { class: 'sub' }, `${fmtShares(x.shares)} หุ้น · ต้นทุน ${fmtUsd(x.avgCost)} · มูลค่า ${x.marketValue === null ? '—' : fmtUsd(x.marketValue)} · `,
      h('span', { class: signCls(x.pnl) }, `${fmtSigned(x.pnl)} (${fmtPct(x.pnlPct)})`)),
    x.alerts.length ? h('div', {}, x.alerts.map(alertBadge)) : null));
  const holdCard = h('div', { class: 'card' }, h('h2', {}, 'หุ้นที่ถือ'),
    holdRows.length ? holdRows : h('p', { class: 'sub' }, 'ยังไม่มีหุ้นที่ถือ บันทึกรายการซื้อในหน้าหุ้น'));

  const setList = async (list) => {
    try { await setWatchlist(ctx.uid, list); ctx.user.watchlist = list; if (!stale()) renderPortfolio(root, ctx); } catch (e) { say(errorText(e)); }
  };
  const input = h('input', { placeholder: 'เพิ่มหุ้นเฝ้าดู เช่น AVGO', autocapitalize: 'characters' });
  const watchRows = view.watch.map((x) => h('div', { class: 'kv' },
    h('a', { href: `#/stock/${encodeURIComponent(x.symbol)}` }, h('b', {}, x.symbol), ' ', x.price === null ? '—' : fmtUsd(x.price),
      x.changePct === null ? null : h('span', { class: signCls(x.changePct) }, ` ${x.changePct.toFixed(2)}%`)),
    h('button', { type: 'button', class: 'link', onclick: () => setList(ctx.user.watchlist.filter((s) => s !== x.symbol)) }, 'เอาออก')));
  const watchCard = h('div', { class: 'card' }, h('h2', {}, 'รายชื่อเฝ้าดู'),
    watchRows.length ? watchRows : h('p', { class: 'sub' }, 'ไม่มีหุ้นเฝ้าดูที่ยังไม่ได้ถือ'),
    h('form', { class: 'search', onsubmit: (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      const s = normalizeSymbol(input.value);
      if (!s) return say(SYMBOL_ERR);
      if (ctx.user.watchlist.includes(s)) return say(`${s} อยู่ในรายชื่อแล้ว`);
      setList([...ctx.user.watchlist, s]);
    } }, input, h('button', { type: 'submit' }, 'เพิ่ม')), msg);

  root.replaceChildren(h('h1', {}, 'พอร์ต'), summaryCard, holdCard, watchCard);
}
