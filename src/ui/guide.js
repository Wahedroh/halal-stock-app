import { h } from './components.js';
import { GUIDE } from '../data/guide.js';

export function renderGuide(root) {
  root.replaceChildren(h('h1', {}, 'คู่มือ'), h('p', { class: 'sub' }, 'คำอธิบายตัวเลขทุกตัวในแอป'),
    Object.entries(GUIDE).map(([id, g]) => h('div', { class: 'card', id: `term-${id}` }, h('h2', {}, g.title), h('p', {}, g.body))));
}
