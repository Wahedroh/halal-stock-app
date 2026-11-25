import { h, icon } from './components.js';

const ICONS = {
  portfolio: [['path', { d: 'M3 11.5 12 4l9 7.5' }], ['path', { d: 'M5.5 10v10h13V10' }], ['path', { d: 'M10 20v-5h4v5' }]],
  stock: [['path', { d: 'M3 17l6-6 4 4 8-8' }], ['path', { d: 'M15 7h6v6' }]],
  goals: [['circle', { cx: 12, cy: 12, r: 9 }], ['circle', { cx: 12, cy: 12, r: 4.5 }], ['circle', { cx: 12, cy: 12, r: 0.8 }]],
  guide: [['path', { d: 'M4 5.5c3-1 5.5-.6 8 1.2V20c-2.5-1.8-5-2.2-8-1.2z' }], ['path', { d: 'M20 5.5c-3-1-5.5-.6-8 1.2V20c2.5-1.8 5-2.2 8-1.2z' }]],
  settings: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1' }]],
};

export function renderNav(active, stockHash) {
  const items = [
    ['portfolio', '#/portfolio', 'พอร์ต'],
    ['stock', stockHash, 'หุ้น'],
    ['goals', '#/goals', 'เป้าหมาย'],
    ['guide', '#/guide', 'คู่มือ'],
    ['settings', '#/settings', 'ตั้งค่า'],
  ];
  return h('nav', { class: 'nav', 'aria-label': 'เมนูหลัก' }, items.map(([id, href, label]) =>
    h('a', { href, class: id === active ? 'active' : '', 'aria-current': id === active ? 'page' : null }, icon(ICONS[id]), h('span', {}, label))));
}
