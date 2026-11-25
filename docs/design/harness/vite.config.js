// dev only: npx vite --config docs/design/harness/vite.config.js → http://localhost:5174/?screen=stock
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: here('.'),
  server: { port: 5174, strictPort: true, fs: { allow: [here('../../..')] } },
  resolve: { alias: [{ find: /^\.\.\/lib\/store\.js$/, replacement: here('./fakeStore.js') }] },
});
