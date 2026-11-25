// หน้าทดลองดีไซน์: เรนเดอร์หน้าจอจริงด้วยข้อมูลตัวอย่าง (ไม่อยู่ใน bundle จริง)
// ฟอนต์จาก npm (devDependency) เฉพาะหน้าทดลอง เผื่อเครื่องที่โหลด Google Fonts ไม่ได้ · แอปจริงใช้ Google Fonts ใน index.html
import '@fontsource/kanit/500.css';
import '@fontsource/kanit/600.css';
import '@fontsource/sarabun/400.css';
import '@fontsource/sarabun/600.css';
import '@fontsource/itim/400.css';
import '../../../src/styles.css';
import { renderNav } from '../../../src/ui/nav.js';
import { renderStock } from '../../../src/ui/stock.js';
import { renderPortfolio } from '../../../src/ui/portfolio.js';
import { renderGoals } from '../../../src/ui/goals.js';
import { renderGuide } from '../../../src/ui/guide.js';
import { renderSettings } from '../../../src/ui/settings.js';
import { mergeUser } from '../../../src/ui/userDoc.js';

const Q = { AVGO: { price: 303.27, changePct: -3.28 }, SPUS: { price: 57.04, changePct: 0.42 }, MSFT: { price: 512.3, changePct: 1.1 }, NVDA: { price: 182.4, changePct: -0.8 } };
const M = { AVGO: { high52: 495, low52: 289.77, pe: 38.81 }, SPUS: { high52: 58.2, low52: 44.1, pe: 31.2 } };
const P = { AVGO: { name: 'Broadcom Inc.', marketCapUsd: 1.43e12 }, SPUS: { name: 'SP Funds S&P 500 Sharia ETF', marketCapUsd: 1.5e9 } };
const fh = {
  quote: async (s) => Q[s] ?? { price: 100, changePct: 0 },
  metrics: async (s) => M[s] ?? { high52: 120, low52: 80, pe: 20 },
  profile: async (s) => P[s] ?? { name: s, marketCapUsd: 1e10 },
};
const ctx = { uid: 'demo', user: mergeUser({ watchlist: ['AVGO', 'SPUS', 'MSFT', 'NVDA'], settings: { finnhubKey: 'demo' } }), finnhub: () => fh, refreshClient() {} };

const app = document.querySelector('#app');
const screen = new URLSearchParams(location.search).get('screen') || 'portfolio';
const view = document.createElement('main');
view.className = 'view';
app.replaceChildren(view, renderNav(screen, '#/stock/AVGO'));
const open = new URLSearchParams(location.search).get('open');
const after = () => { if (open) document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.body.dataset.ready = '1'; };
if (screen === 'stock') renderStock(view, ctx, new URLSearchParams(location.search).get('sym') || 'AVGO').then(after);
else if (screen === 'goals') renderGoals(view, ctx).then(after);
else if (screen === 'guide') { renderGuide(view); after(); }
else if (screen === 'settings') { renderSettings(view, ctx); after(); }
else renderPortfolio(view, ctx).then(after);
