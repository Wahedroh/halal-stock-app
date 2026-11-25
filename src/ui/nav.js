import { h } from './components.js';

export function renderNav(active, stockHash) {
  const items = [
    ['portfolio', '#/portfolio', 'พอร์ต'],
    ['stock', stockHash, 'หุ้น'],
    ['goals', '#/goals', 'เป้าหมาย'],
    ['guide', '#/guide', 'คู่มือ'],
    ['settings', '#/settings', 'ตั้งค่า'],
  ];
  return h('nav', { class: 'nav' }, items.map(([id, href, label]) =>
    h('a', { href, class: id === active ? 'active' : '' }, label)));
}
