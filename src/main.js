import './styles.css';
import { h } from './ui/components.js';
import { renderNav } from './ui/nav.js';
import { startRouter } from './ui/router.js';
import { renderSettings } from './ui/settings.js';
import { renderStock } from './ui/stock.js';
import { renderPortfolio } from './ui/portfolio.js';
import { renderGoals } from './ui/goals.js';
import { renderGuide } from './ui/guide.js';
import { mergeUser } from './ui/userDoc.js';
import { createFinnhub } from './lib/finnhub.js';
import { onUser, signIn, ensureUserDoc, getUser } from './lib/store.js';

const app = document.querySelector('#app');
let stopRouter = null;

function signInScreen(error) {
  app.replaceChildren(h('main', { class: 'center' }, h('h1', {}, 'พอร์ตหุ้นฮาลาล'),
    h('button', { type: 'button', onclick: () => signIn().catch((e) => signInScreen(e.message)) }, 'เข้าสู่ระบบด้วย Google'),
    error ? h('p', { class: 'msg err' }, error) : null));
}

async function start(user) {
  const ctx = { uid: user.uid, user: null, _fh: null, _key: null };
  await ensureUserDoc(ctx.uid);
  ctx.user = mergeUser(await getUser(ctx.uid));
  ctx.finnhub = () => {
    const key = ctx.user.settings.finnhubKey;
    if (!ctx._fh || ctx._key !== key) { ctx._fh = createFinnhub({ key }); ctx._key = key; }
    return ctx._fh;
  };
  ctx.refreshClient = () => { ctx._fh = null; };

  const view = h('main', { class: 'view' });
  const navHolder = h('div', {});
  app.replaceChildren(view, navHolder);
  stopRouter?.();
  stopRouter = startRouter((route) => {
    const last = localStorage.getItem('lastSym') || ctx.user.watchlist[0] || '';
    navHolder.replaceChildren(renderNav(route.name, last ? `#/stock/${encodeURIComponent(last)}` : '#/stock/'));
    window.scrollTo(0, 0);
    view._tok = (view._tok ?? 0) + 1; // ยกเลิกหน้าเดิมที่ยังโหลดค้าง
    if (route.name === 'settings') renderSettings(view, ctx);
    else if (route.name === 'stock') renderStock(view, ctx, route.sym);
    else if (route.name === 'goals') renderGoals(view, ctx);
    else if (route.name === 'guide') renderGuide(view);
    else renderPortfolio(view, ctx);
  });
}

app.textContent = 'กำลังโหลด…';
onUser((user) => {
  if (!user) { stopRouter?.(); stopRouter = null; signInScreen(); return; }
  start(user).catch((e) => signInScreen(e.message));
});
