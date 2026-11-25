import './styles.css';
import { h, pageHeader } from './ui/components.js';
import { renderNav } from './ui/nav.js';
import { startRouter } from './ui/router.js';
import { renderSettings } from './ui/settings.js';
import { renderStock } from './ui/stock.js';
import { renderPortfolio } from './ui/portfolio.js';
import { renderGoals } from './ui/goals.js';
import { renderGuide } from './ui/guide.js';
import { mergeUser } from './ui/userDoc.js';
import { createFinnhub } from './lib/finnhub.js';
import { onUser, signIn, signOut, currentUser, ensureUserDoc, getUser } from './lib/store.js';
import { errorText } from './lib/errors.js';

const app = document.querySelector('#app');
let stopRouter = null;

const brandHeader = () => pageHeader({ sticker: 'หุ้นฮาลาล · AAOIFI', title: 'พอร์ตหุ้นฮาลาล', hand: 'แผนซื้อ 3 ไม้ · คัดกรองฮาลาล · เป้าปันผล' });

function signInScreen(error) {
  app.replaceChildren(h('main', { class: 'view gate' }, brandHeader(),
    h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'ยินดีต้อนรับ'),
      h('p', { class: 'sub' }, 'เข้าสู่ระบบเพื่อดูพอร์ตและบันทึกการซื้อขายของครู'),
      h('button', { type: 'button', class: 'btn block', onclick: () => signIn().catch((e) => signInScreen(errorText(e))) }, 'เข้าสู่ระบบด้วย Google'),
      error ? h('p', { class: 'msg err', role: 'alert' }, error) : null)));
}

/** ล็อกอินแล้วแต่โหลดข้อมูลบัญชีไม่สำเร็จ: ลองใหม่ / ออกจากระบบ */
function loadErrorScreen(e) {
  const msg = h('p', { class: 'msg err', role: 'alert' }, `โหลดข้อมูลบัญชีไม่สำเร็จ: ${errorText(e)}`);
  app.replaceChildren(h('main', { class: 'view gate' }, brandHeader(), h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'โหลดข้อมูลไม่สำเร็จ'), msg,
    h('button', { type: 'button', class: 'btn block', onclick: () => {
      const u = currentUser();
      if (!u) { signInScreen(); return; }
      loadingScreen();
      start(u).catch(loadErrorScreen);
    } }, 'ลองใหม่'),
    h('button', { type: 'button', class: 'btn ghost block', onclick: () => signOut().catch((err) => { msg.textContent = errorText(err); }) }, 'ออกจากระบบ'))));
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
    else if (route.name === 'stock') renderStock(view, ctx, route.sym, route.error);
    else if (route.name === 'goals') renderGoals(view, ctx);
    else if (route.name === 'guide') renderGuide(view);
    else renderPortfolio(view, ctx);
  });
}

function loadingScreen() {
  app.replaceChildren(h('main', { class: 'view gate' }, brandHeader(), h('p', { class: 'loading', role: 'status' }, 'กำลังโหลด…')));
}

loadingScreen();
onUser((user) => {
  if (!user) { stopRouter?.(); stopRouter = null; signInScreen(); return; }
  start(user).catch(loadErrorScreen);
});
