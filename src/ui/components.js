import { GUIDE } from '../data/guide.js';

/** สร้าง element: h('div', {class:'x', onclick}, child, 'text') */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === undefined || kid === null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function infoButton(termId) {
  return h('button', {
    type: 'button', class: 'info-btn', 'aria-label': 'คำอธิบาย',
    onclick: () => {
      const g = GUIDE[termId] ?? { title: termId, body: 'ยังไม่มีคำอธิบาย' };
      const dlg = h('div', { class: 'modal', onclick: (e) => { if (e.target === dlg) dlg.remove(); } },
        h('div', { class: 'modal-card' }, h('h3', {}, g.title), h('p', {}, g.body),
          h('button', { type: 'button', onclick: () => dlg.remove() }, 'ปิด')));
      document.body.append(dlg);
    },
  }, 'ⓘ');
}

export const alertBadge = (a) => h('span', { class: 'badge alert' }, `ใกล้${a.label} ${(a.distance * 100).toFixed(1)}%`);

export const HALAL_LABELS = { pass: 'ผ่านเกณฑ์ AAOIFI', fail: 'ไม่ผ่าน', unchecked: 'ยังไม่ได้ตรวจ' };
export const halalBadge = (status) => h('span', { class: `badge halal-${status}` }, HALAL_LABELS[status] ?? HALAL_LABELS.unchecked);

/** ช่องกรอกพร้อมป้ายชื่อ */
export const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

/** บรรทัดข้อความของฟอร์ม (วางไว้ข้างปุ่มบันทึกของฟอร์มนั้น) */
export function msgLine() {
  const el = h('p', { class: 'msg', 'aria-live': 'polite' });
  const say = (t, ok) => { el.className = ok ? 'msg ok' : 'msg err'; el.textContent = t; };
  return { el, say };
}

/** รอ promise โดยไม่ throw: { ok, v } | { ok:false, e } */
export const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };
