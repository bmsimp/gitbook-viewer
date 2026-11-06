// Docs server core: serves a whole docs/ tree, rendering every .md through the
// GitBook plugin on the fly. Each page is served at a URL that mirrors its path
// on disk, so relative links between pages ([x](../other.md)), images, and
// {% include %} targets all resolve naturally — no <base href> rewriting.
//
// The CLI wrapper is scripts/serve-docs.mjs; this module holds the logic so it
// can be tested without spawning a process.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml } from './gitbook-render.mjs';

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8', '.yml': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
};

const DIR_INDEX = ['README.md', 'readme.md', 'index.md'];

// Changes under these never affect what a page looks like; ignoring them stops
// e.g. `git status` refreshing .git/index from reloading every open page.
const IGNORED_SEGMENTS = new Set(['.git', 'node_modules', '.DS_Store']);

// Pages are always re-rendered from disk; tell the browser never to reuse a
// stale copy, so a live reload (or a manual refresh) shows the current file.
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Work out which directory to serve and which page to open first.
 *
 * - A .md file: open that page, serving the docs root around it so links to
 *   sibling and parent pages work. That root is the nearest .gitbook.yaml
 *   root or SUMMARY.md folder above the page, else the current directory (if
 *   the page is inside it), else the page's own folder.
 * - A directory: serve it — or the `root:` its .gitbook.yaml points at.
 * - Nothing: the same, for the current directory.
 *
 * Returns { root, startPath } where startPath is the URL path to open.
 */
export function resolveServeTarget(target, cwd = process.cwd()) {
  const abs = path.resolve(cwd, target ?? '.');
  if (!fs.existsSync(abs)) {
    throw new Error(`not found: ${abs}`);
  }

  if (fs.statSync(abs).isFile()) {
    const here = path.resolve(cwd);
    const root = findDocsRoot(abs) ?? (isInside(here, abs) ? here : path.dirname(abs));
    return { root, startPath: toUrlPath(path.relative(root, abs)) };
  }

  return { root: gitbookRootOf(abs) ?? abs, startPath: '/' };
}

/** The `root:` a directory's .gitbook.yaml names, if it has one that exists. */
function gitbookRootOf(dir) {
  const config = path.join(dir, '.gitbook.yaml');
  if (!fs.existsSync(config)) {
    return undefined;
  }
  const match = /^root:\s*['"]?([^'"#\r\n]+?)['"]?\s*(?:#.*)?$/m.exec(fs.readFileSync(config, 'utf8'));
  const root = path.resolve(dir, match ? match[1].trim() : '.');
  return fs.existsSync(root) && fs.statSync(root).isDirectory() ? root : dir;
}

/**
 * Walk up from a page to the nearest folder that marks a GitBook docs root:
 * a .gitbook.yaml whose root contains the page, or a SUMMARY.md. Stops at the
 * repository root.
 */
function findDocsRoot(file) {
  let current = path.dirname(file);
  for (;;) {
    const root = gitbookRootOf(current);
    if (root && isInside(root, file)) {
      return root;
    }
    if (fs.existsSync(path.join(current, 'SUMMARY.md'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current || fs.existsSync(path.join(current, '.git'))) {
      return undefined;
    }
    current = parent;
  }
}

function isInside(root, abs) {
  const rel = path.relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function toUrlPath(relPath) {
  return '/' + relPath.split(path.sep).map(encodeURIComponent).join('/');
}

/**
 * Create the docs server. Call `listen()` to start it and `close()` to stop it
 * (which also ends live-reload streams and the file watcher).
 *
 * options: { root, renderer, scheme = 'auto', liveReload = true, log = () => {} }
 */
export function createDocsServer({ root, renderer, scheme = 'auto', liveReload = true, log = () => {} }) {
  const docsRoot = fs.realpathSync(path.resolve(root));
  const { renderBody, wrapHtml } = renderer;
  const reloadClients = new Set();
  let watcher;
  let heartbeat;
  let loopbackOnly = true;

  const page = (body, title, urlPath) =>
    wrapHtml({ body, title, scheme, topbar: breadcrumb(urlPath), liveReload });

  // -------------------------------------------------------------------------
  // Resolve a request URL path to a file on disk, confined to the docs root.
  // -------------------------------------------------------------------------
  function resolveRequest(rawPath) {
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      return { kind: 'notfound' };
    }
    if (decoded.includes('\0')) {
      return { kind: 'notfound' };
    }

    const segments = decoded.split(/[\\/]/).filter((s) => s && s !== '.');
    let absPath = path.join(docsRoot, ...segments);
    if (!isInside(docsRoot, absPath)) {
      return { kind: 'notfound' };
    }

    // Extensionless link fallback: [x](setup) -> setup.md.
    if (!fs.existsSync(absPath) && !path.extname(absPath) && fs.existsSync(`${absPath}.md`)) {
      absPath = `${absPath}.md`;
    }
    if (!fs.existsSync(absPath)) {
      return { kind: 'notfound' };
    }

    // Symlinks must not lead out of the docs root either.
    const real = fs.realpathSync(absPath);
    if (!isInside(docsRoot, real)) {
      return { kind: 'notfound' };
    }

    if (fs.statSync(real).isDirectory()) {
      // Relative links inside a directory index resolve against the directory,
      // so a directory URL needs a trailing slash.
      if (!rawPath.endsWith('/')) {
        // Collapse leading slashes so `//host` can never become an off-site redirect.
        return { kind: 'redirect', location: '/' + rawPath.replace(/^[\\/]+/, '') + '/' };
      }
      return { kind: 'dir', absPath: real };
    }
    return { kind: 'file', absPath: real };
  }

  // -------------------------------------------------------------------------
  // Directory index: the folder's README (if any) plus a listing of its pages
  // and subfolders, so every page in the tree is reachable by clicking.
  // -------------------------------------------------------------------------
  function renderDirectory(absPath, urlPath) {
    const indexFile = DIR_INDEX.map((n) => path.join(absPath, n)).find((p) => fs.existsSync(p));
    let body = indexFile ? renderBody(fs.readFileSync(indexFile, 'utf8'), indexFile) : '';

    const entries = fs.readdirSync(absPath, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && !IGNORED_SEGMENTS.has(e.name))
      .filter((e) => e.isDirectory() || e.name.toLowerCase().endsWith('.md'))
      .filter((e) => !DIR_INDEX.includes(e.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    if (entries.length) {
      const items = entries.map((e) => {
        const href = encodeURIComponent(e.name) + (e.isDirectory() ? '/' : '');
        const cls = e.isDirectory() ? ' class="gbv-dir"' : '';
        return `<li><a${cls} href="${href}">${escapeHtml(e.name)}</a></li>`;
      });
      body += `\n<hr>\n<h2>In this folder</h2>\n<ul class="gbv-listing">\n${items.join('\n')}\n</ul>\n`;
    } else if (!indexFile) {
      body += '<p>Empty folder.</p>';
    }
    return page(body, lastSegment(urlPath) || 'docs', urlPath);
  }

  // -------------------------------------------------------------------------
  // Request handling.
  // -------------------------------------------------------------------------
  function send(req, res, status, headers, body) {
    res.writeHead(status, { ...NO_STORE, ...headers });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function handle(req, res) {
    const rawPath = (req.url || '/').split('?')[0].split('#')[0] || '/';

    // DNS-rebinding guard: while bound to loopback, only answer requests that
    // were addressed to a loopback name, so a hostile web page can't read the
    // docs through a domain it points at 127.0.0.1.
    if (loopbackOnly && !isLoopbackHost(req.headers.host)) {
      send(req, res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, 'forbidden host');
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(req, res, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'method not allowed');
      return;
    }

    if (rawPath === '/__livereload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      reloadClients.add(res);
      req.on('close', () => reloadClients.delete(res));
      return;
    }

    const resolved = resolveRequest(rawPath);

    if (resolved.kind === 'redirect') {
      send(req, res, 301, { Location: resolved.location });
      return;
    }

    if (resolved.kind === 'notfound') {
      const body = `<h1>404</h1><p>Not found: <code>${escapeHtml(safeDecode(rawPath))}</code></p>`;
      send(req, res, 404, { 'Content-Type': 'text/html; charset=utf-8' }, page(body, '404', rawPath));
      return;
    }

    if (resolved.kind === 'dir') {
      send(req, res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, renderDirectory(resolved.absPath, rawPath));
      return;
    }

    const ext = path.extname(resolved.absPath).toLowerCase();
    if (ext === '.md') {
      const body = renderBody(fs.readFileSync(resolved.absPath, 'utf8'), resolved.absPath);
      send(req, res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, page(body, path.basename(resolved.absPath), rawPath));
      return;
    }

    // Static asset.
    const size = fs.statSync(resolved.absPath).size;
    res.writeHead(200, {
      ...NO_STORE,
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': size,
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(resolved.absPath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  const server = http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      // A bad file (unreadable, mid-save, plugin bug) must never take the
      // server down. Show the error in the page; live reload brings the real
      // page back as soon as the file is fixed.
      const message = err instanceof Error ? err.stack || err.message : String(err);
      log(`error serving ${req.url}: ${err instanceof Error ? err.message : String(err)}`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const body = `<h1>Render error</h1><pre class="gbv-error">${escapeHtml(message)}</pre>`;
      send(req, res, 500, { 'Content-Type': 'text/html; charset=utf-8' }, page(body, 'error', (req.url || '/').split('?')[0]));
    }
  });

  // -------------------------------------------------------------------------
  // Live reload: watch the tree, tell every open page to reload. Editors often
  // write a file several times in quick succession, so bursts are coalesced.
  // -------------------------------------------------------------------------
  function startWatching() {
    let timer = null;
    const broadcast = () => {
      timer = null;
      for (const client of reloadClients) {
        client.write('data: reload\n\n');
      }
    };
    try {
      watcher = fs.watch(docsRoot, { recursive: true }, (_event, filename) => {
        if (filename && String(filename).split(/[\\/]/).some((s) => IGNORED_SEGMENTS.has(s))) {
          return;
        }
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeout(broadcast, 120);
      });
      watcher.on('error', (err) => log(`live reload stopped (watch error): ${err.message}`));
    } catch (err) {
      log(`live reload unavailable (file watch failed): ${err.message}`);
    }
    // Keep idle event streams from being dropped.
    heartbeat = setInterval(() => {
      for (const client of reloadClients) {
        client.write(': ping\n\n');
      }
    }, 25_000);
    heartbeat.unref();
  }

  /**
   * Start listening on `port` (0 = any free port). If the port is busy, try up
   * to 10 ports above it. Resolves to { port, url }.
   */
  function listen(port = 4100, host = '127.0.0.1') {
    loopbackOnly = isLoopbackHost(host);
    return new Promise((resolve, reject) => {
      let attempt = 0;
      const tryListen = () => {
        const onError = (err) => {
          if (err.code === 'EADDRINUSE' && port !== 0 && attempt < 10) {
            attempt += 1;
            tryListen();
          } else {
            reject(err);
          }
        };
        server.once('error', onError);
        server.listen(port === 0 ? 0 : port + attempt, host, () => {
          server.off('error', onError);
          if (liveReload) {
            startWatching();
          }
          const actual = server.address().port;
          const urlHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
          resolve({ port: actual, url: `http://${urlHost}:${actual}` });
        });
      };
      tryListen();
    });
  }

  function close() {
    watcher?.close();
    clearInterval(heartbeat);
    for (const client of reloadClients) {
      client.end();
    }
    reloadClients.clear();
    return new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
  }

  return { server, listen, close, root: docsRoot };
}

function isLoopbackHost(hostHeader) {
  if (!hostHeader) {
    return false;
  }
  // Strip the port: "[::1]:4100" -> "::1", "localhost:4100" -> "localhost".
  const host = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':').length === 2 ? hostHeader.split(':')[0] : hostHeader;
  return host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host) || host.endsWith('.localhost');
}

function breadcrumb(urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  const crumbs = ['<a href="/">home</a>'];
  let acc = '';
  parts.forEach((part, i) => {
    acc += '/' + part;
    const label = escapeHtml(safeDecode(part));
    crumbs.push(i === parts.length - 1 ? `<span class="gbv-current">${label}</span>` : `<a href="${escapeHtml(acc)}/">${label}</a>`);
  });
  return `<header class="gbv-topbar">${crumbs.join('<span class="gbv-sep">/</span>')}</header>\n`;
}

function lastSegment(urlPath) {
  const parts = urlPath.split('/').filter(Boolean);
  return parts.length ? safeDecode(parts[parts.length - 1]) : '';
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
