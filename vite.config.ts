import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { STATIONS } from './src/audio/stations';

/**
 * Same-origin relay for the van's FM radio: /radio/<id> streams the station
 * through the dev (or preview) server. Embedded previews often block media from
 * other hosts; a stream from our own origin always plays and stays readable by
 * Web Audio. Static builds have no relay and the deck falls back to direct URLs.
 */
function radioRelay(): Plugin {
  const handler: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next) => {
    const id = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0]);
    const st = STATIONS.find((s) => s.id === id);
    if (!st) { next(); return; }
    const ac = new AbortController();
    req.on('close', () => ac.abort());
    fetch(st.url, { signal: ac.signal, headers: { 'Icy-MetaData': '0', 'User-Agent': 'Mozilla/5.0 UAZ-radio' } })
      .then((up) => {
        if (!up.ok || !up.body) { res.statusCode = 502; res.end(); return; }
        res.writeHead(200, {
          'Content-Type': up.headers.get('content-type') ?? 'audio/mpeg',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        });
        Readable.fromWeb(up.body as import('node:stream/web').ReadableStream).on('error', () => res.end()).pipe(res);
      })
      .catch(() => { if (!res.headersSent) res.statusCode = 502; res.end(); });
  };
  return {
    name: 'radio-relay',
    configureServer(server) { server.middlewares.use('/radio', handler); },
    configurePreviewServer(server) { server.middlewares.use('/radio', handler); },
  };
}

export default defineConfig({
  plugins: [radioRelay()],
  server: {
    port: 3000,
    open: false
  },
  build: {
    target: 'esnext'
  }
});
