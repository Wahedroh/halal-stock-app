// hash router: #/portfolio, #/stock/:sym, #/goals, #/guide, #/settings
export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0] || 'portfolio';
  if (name === 'stock') {
    let sym = '';
    try { sym = decodeURIComponent(parts[1] || ''); } catch { sym = parts[1] || ''; }
    return { name: 'stock', sym: sym.trim().toUpperCase() };
  }
  if (['portfolio', 'goals', 'guide', 'settings'].includes(name)) return { name };
  return { name: 'portfolio' };
}

export function startRouter(onRoute) {
  const run = () => onRoute(parseRoute(location.hash));
  window.addEventListener('hashchange', run);
  run();
  return () => window.removeEventListener('hashchange', run);
}

export const go = (hash) => { location.hash = hash; };
