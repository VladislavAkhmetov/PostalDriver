import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// A standalone review copy also works from file:// without a development server.
const result = await build({
  entryPoints: ['src/previews/PazPreview.ts'], bundle: true, write: false,
  format: 'esm', minify: true, target: 'esnext', loader: { '.glb': 'dataurl' },
  plugins: [{ name: 'asset-url', setup(b) { b.onResolve({ filter: /\.glb\?url$/ }, args => ({ path: new URL(args.path.replace('?url', ''), `file:///${args.resolveDir.replaceAll('\\', '/')}/`).pathname.replace(/^\/([A-Z]:)/, '$1') })); } }],
});
const source = readFileSync('paz-preview.html', 'utf8');
const html = source.replace('<script type="module" src="/src/previews/PazPreview.ts"></script>', () => `<script type="module">${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
mkdirSync('reports/paz', { recursive: true });
writeFileSync('reports/paz/preview.html', html);
console.log('reports/paz/preview.html');
