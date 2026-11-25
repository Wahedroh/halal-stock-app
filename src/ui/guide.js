import { h, pageHeader, cardTitle } from './components.js';
import { GUIDE } from '../data/guide.js';

export function renderGuide(root) {
  root.replaceChildren(pageHeader({ sticker: 'คู่มือ', title: 'คู่มือตัวเลข', hand: 'คำอธิบายตัวเลขทุกตัวในแอป' }),
    Object.entries(GUIDE).map(([id, g]) => h('section', { class: 'card', id: `term-${id}` }, cardTitle(g.title), h('p', {}, g.body))));
}
