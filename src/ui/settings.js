import { h } from './components.js';
import { saveSettings, signOut } from '../lib/store.js';

const pctToFraction = (s) => Number(String(s).trim()) / 100;
const validPct = (f) => Number.isFinite(f) && f > 0 && f < 1;
const round = (x) => Math.round(x * 1e6) / 1e6;

export function renderSettings(root, ctx) {
  const s = ctx.user.settings;
  const msg = h('p', { class: 'msg' });
  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const inp = (value, extra = {}) => h('input', { value: value ?? '', inputmode: 'decimal', ...extra });

  const key = inp(s.finnhubKey, { type: 'password', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Finnhub API key' });
  const fx = inp(s.fx);
  const t = s.tranchePcts.map((p) => inp(round(p * 100)));
  const act = inp(round(s.trailActivate * 100));
  const trail = inp(round(s.trailPct * 100));
  const near = inp(round(s.alertWithin * 100));
  const wht = inp(round(s.wht * 100));

  async function save(e) {
    e.preventDefault();
    const fxN = Number(fx.value);
    const tranchePcts = t.map((i) => pctToFraction(i.value));
    const [trailActivate, trailPct, alertWithin, whtF] = [act, trail, near, wht].map((i) => pctToFraction(i.value));
    if (!Number.isFinite(fxN) || fxN <= 0) return fail('อัตราแลกเปลี่ยนต้องมากกว่า 0');
    if (!tranchePcts.every(validPct)) return fail('% ไม้ซื้อต้องอยู่ระหว่าง 0–100');
    if (![trailActivate, trailPct, alertWithin].every(validPct)) return fail('% ต้องอยู่ระหว่าง 0–100');
    if (!Number.isFinite(whtF) || whtF < 0 || whtF >= 1) return fail('ภาษีหัก ณ ที่จ่ายต้องอยู่ระหว่าง 0–100');
    const patch = { finnhubKey: key.value.trim(), fx: fxN, tranchePcts: tranchePcts.map(round), trailActivate: round(trailActivate), trailPct: round(trailPct), alertWithin: round(alertWithin), wht: round(whtF) };
    try {
      await saveSettings(ctx.uid, patch);
      Object.assign(ctx.user.settings, patch);
      ctx.refreshClient();
      msg.className = 'msg ok'; msg.textContent = 'บันทึกแล้ว';
    } catch (err) { fail(err.message || 'บันทึกไม่สำเร็จ'); }
  }
  function fail(text) { msg.className = 'msg err'; msg.textContent = text; }

  root.replaceChildren(
    h('h1', {}, 'ตั้งค่า'),
    h('form', { class: 'card', onsubmit: save },
      field('Finnhub API key', key),
      field('อัตราแลกเปลี่ยน (บาทต่อ USD)', fx),
      h('div', { class: 'row3' }, field('ไม้ 1 (ลด %)', t[0]), field('ไม้ 2 (ลด %)', t[1]), field('ไม้ 3 (ลด %)', t[2])),
      field('Trailing เริ่มเมื่อกำไรเกิน (%)', act),
      field('Trailing ขายเมื่อย่อจากจุดสูงสุด (%)', trail),
      field('เตือนเมื่อราคาห่างไม่เกิน (%)', near),
      field('ภาษีหัก ณ ที่จ่ายปันผล (%)', wht),
      h('button', { type: 'submit' }, 'บันทึก'), msg),
    h('button', { type: 'button', class: 'secondary', onclick: () => signOut() }, 'ออกจากระบบ'));
}
