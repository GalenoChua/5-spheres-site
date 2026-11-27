/* A static server for the repository root, for the browser tests.
 *
 * WHY IT EXISTS. The tests used to open the page as a file:// URL, and under
 * file:// the site's own stylesheet never loads: every page links it as
 * /styles.css, which resolves to the filesystem root. The page therefore laid
 * out with browser defaults, which is nobody's experience of it, and a layout
 * assertion made against that measures nothing. It is not a harmless
 * difference: the feedback form appeared to overflow a 360px viewport by 4px,
 * and the overflow was the missing `box-sizing: border-box` rather than
 * anything in the page.
 *
 * So the tests serve the root over http on a free port and navigate to that.
 * Only the tests use it. Nothing here is deployed.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

export async function serveRoot() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    /* Resolved and then checked against the root, so a ../ in a path cannot
       serve something outside the repository. */
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end('no');
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((done) => server.close(done))
  };
}
