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

const SVG_NS = 'http://www.w3.org/2000/svg';
/** ไอคอนเส้น (SVG) สำหรับตกแต่ง: shapes = [['path', {d}], ['circle', {cx,cy,r}]] · ซ่อนจากโปรแกรมอ่านหน้าจอ */
export function icon(shapes) {
  if (typeof document.createElementNS !== 'function') return null; // DOM จำลองในเทสต์
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of shapes) {
    const s = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, String(v));
    svg.append(s);
  }
  return svg;
}

export function infoButton(termId) {
  return h('button', {
    type: 'button', class: 'info-btn', 'aria-label': 'คำอธิบาย',
    onclick: (ev) => {
      const opener = ev?.currentTarget;
      const g = GUIDE[termId] ?? { title: termId, body: 'ยังไม่มีคำอธิบาย' };
      const close = () => { dlg.remove(); opener?.focus?.(); };
      const closeBtn = h('button', { type: 'button', class: 'btn', onclick: () => close() }, 'ปิด');
      const dlg = h('div', {
        class: 'modal', onclick: (e) => { if (e.target === dlg) close(); },
        onkeydown: (e) => { if (e.key === 'Escape') close(); },
      }, h('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': g.title },
        h('span', { class: 'sticker' }, 'คำอธิบาย'), h('h3', {}, g.title), h('p', {}, g.body), closeBtn));
      document.body.append(dlg);
      closeBtn.focus?.();
    },
  }, 'i');
}

export const alertBadge = (a) => h('span', { class: 'badge alert' }, `ใกล้ ${a.label} ${(a.distance * 100).toFixed(1)}%`);

export const HALAL_LABELS = { pass: 'ผ่านเกณฑ์ AAOIFI', fail: 'ไม่ผ่าน', unchecked: 'ยังไม่ได้ตรวจ' };
export const halalBadge = (status) => h('span', { class: `badge halal-${HALAL_LABELS[status] ? status : 'unchecked'}` }, HALAL_LABELS[status] ?? HALAL_LABELS.unchecked);

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

/**
 * ช่องกรอกพร้อมป้ายชื่อ
 * opts.suffix = หน่วยท้ายช่อง (เช่น USD: แสดงด้วยตา ส่วนโปรแกรมอ่านหน้าจออ่านจากป้ายชื่อ)
 * opts.help = คำอธิบายใต้ช่อง (อยู่นอก <label> ผูกด้วย aria-describedby จึงไม่ถูกอ่านซ้ำ)
 */
export function field(label, input, opts = {}) {
  const { suffix, help } = opts;
  const box = suffix ? unitBox(input, suffix) : input;
  const name = h('span', { class: 'field-label' }, label, suffix ? h('span', { class: 'sr-only' }, ` (${suffix})`) : null);
  if (!help) return h('label', { class: 'field' }, name, box);
  return h('div', { class: 'field' }, h('label', { class: 'field-in' }, name, box), helpText(input, help));
}

/** ช่องกรอก + หน่วยท้ายช่อง (หน่วยซ่อนจากโปรแกรมอ่านหน้าจอ ให้ใส่หน่วยในป้ายชื่อแทน) */
export const unitBox = (input, unit) => h('span', { class: 'input-wrap' }, input, h('span', { class: 'suffix', 'aria-hidden': 'true' }, unit));

/** ข้อความช่วยใต้ช่อง ผูกกับช่องด้วย aria-describedby */
export function helpText(input, text) {
  const id = nextId('help');
  input.setAttribute('aria-describedby', id);
  return h('small', { class: 'help', id }, text);
}

/**
 * ปุ่มแบ่งส่วน (radio group) แทน select · ค่าที่เลือกอ่านจาก .value
 * options = [[value, label], ...]
 */
export function segmented(legend, options, initial, onChange) {
  const name = nextId('seg');
  let value = initial;
  const radios = options.map(([v]) => {
    const r = h('input', { type: 'radio', name, value: v, checked: v === initial });
    r.addEventListener('change', () => { value = v; onChange?.(v); });
    return r;
  });
  const opts = options.map(([, label], i) => h('label', { class: 'seg-opt' }, radios[i], h('span', {}, label)));
  const el = h('fieldset', { class: 'seg' }, h('legend', { class: 'field-label' }, legend), h('div', { class: 'seg-row' }, opts));
  return { el, radios, get value() { return value; } };
}

/** หัวหน้ากรมท่าโค้ง: สติกเกอร์ + หัวข้อ + บรรทัดลายมือ (+ ส่วนเสริม) */
export const pageHeader = ({ sticker, title, hand, extra } = {}) => h('header', { class: 'top' },
  sticker ? h('span', { class: 'sticker' }, sticker) : null,
  h('h1', {}, title), hand ? h('p', { class: 'hand' }, hand) : null, extra ?? null);

/** หัวการ์ดพร้อมจุดเหลือง */
export const cardTitle = (text, ...rest) => h('h2', { class: 'card-title' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), text, ...rest);

/** บรรทัดข้อความของฟอร์ม (วางไว้ข้างปุ่มบันทึกของฟอร์มนั้น) */
export function msgLine() {
  const el = h('p', { class: 'msg', 'aria-live': 'polite' });
  const say = (t, ok) => { el.className = ok ? 'msg ok' : 'msg err'; el.textContent = t; };
  return { el, say };
}

/** รอ promise โดยไม่ throw: { ok, v } | { ok:false, e } */
export const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };
