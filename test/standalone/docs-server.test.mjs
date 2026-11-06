import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGitbookRenderer, stripFrontMatter } from '../../scripts/lib/gitbook-render.mjs';
import { createDocsServer, resolveServeTarget } from '../../scripts/lib/docs-server.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const renderer = createGitbookRenderer(projectRoot);

/** Write a tree of { 'rel/path': 'content' } under a fresh temp dir. */
function makeTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gbv-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return fs.realpathSync(dir);
}

/** Raw HTTP request, so tests control the Host header and unnormalized paths. */
function request(port, rawPath, { method = 'GET', host = `localhost:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path: rawPath, method, headers: { host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('stripFrontMatter', () => {
  it('removes a leading front-matter block', () => {
    expect(stripFrontMatter('---\ndescription: hi\n---\n# Title\n')).toBe('# Title\n');
  });

  it('handles a BOM and CRLF line endings', () => {
    expect(stripFrontMatter('﻿---\r\ntitle: x\r\n---\r\nbody')).toBe('body');
  });

  it('leaves a mid-document --- divider alone', () => {
    const src = '# Title\n\nOne\n\n---\n\nTwo\n';
    expect(stripFrontMatter(src)).toBe(src);
  });
});

describe('standalone renderer', () => {
  it('renders GitBook blocks and keeps mid-document dividers', () => {
    const html = renderer.renderBody(
      '---\ndescription: Sub\n---\n# Page\n\n{% hint style="info" %}\nNote\n{% endhint %}\n\nA\n\n---\n\nB\n',
      path.join(os.tmpdir(), 'page.md'),
    );
    expect(html).not.toContain('{%');
    expect(html).toContain('<hr>');
    expect(html).not.toContain('description:');
  });

  it('gives headings unique GitBook-style anchor ids', () => {
    const html = renderer.renderBody('# Getting Started\n\n## 2. Install it\n\n## Setup\n\n## Setup\n', 'x.md');
    expect(html).toContain('<h1 id="getting-started">');
    expect(html).toContain('<h2 id="id-2.-install-it">');
    expect(html).toContain('<h2 id="setup">');
    expect(html).toContain('<h2 id="setup-1">');
  });

  it('only injects the live-reload client when asked', () => {
    expect(renderer.wrapHtml({ body: '', title: 't' })).not.toContain('__livereload');
    expect(renderer.wrapHtml({ body: '', title: 't', liveReload: true })).toContain('__livereload');
  });
});

describe('resolveServeTarget', () => {
  it('serves a folder as-is', () => {
    const dir = makeTree({ 'README.md': '# Hi' });
    expect(resolveServeTarget(dir)).toEqual({ root: dir, startPath: '/' });
  });

  it('follows the root named in .gitbook.yaml', () => {
    const dir = makeTree({ '.gitbook.yaml': "root: ./docs/\n", 'docs/README.md': '# Hi' });
    expect(resolveServeTarget(dir).root).toBe(path.join(dir, 'docs'));
  });

  it('serves a page from its GitBook root and opens that page', () => {
    const dir = makeTree({ '.gitbook.yaml': 'root: docs\n', 'docs/guides/my page.md': '# Hi' });
    const result = resolveServeTarget(path.join(dir, 'docs', 'guides', 'my page.md'));
    expect(result.root).toBe(path.join(dir, 'docs'));
    expect(result.startPath).toBe('/guides/my%20page.md');
  });

  it("serves a page without a GitBook root from the page's folder", () => {
    const dir = makeTree({ '.git/HEAD': '', 'notes/page.md': '# Hi' });
    const result = resolveServeTarget(path.join(dir, 'notes', 'page.md'));
    expect(result).toEqual({ root: path.join(dir, 'notes'), startPath: '/page.md' });
  });

  it('serves a page from the nearest SUMMARY.md folder above it', () => {
    const dir = makeTree({ '.git/HEAD': '', 'docs/SUMMARY.md': '', 'docs/guides/auth.md': '# Hi' });
    const result = resolveServeTarget(path.join(dir, 'docs', 'guides', 'auth.md'));
    expect(result).toEqual({ root: path.join(dir, 'docs'), startPath: '/guides/auth.md' });
  });

  it('falls back to the current folder when the page is inside it', () => {
    const dir = makeTree({ '.git/HEAD': '', 'guides/auth.md': '# Hi' });
    expect(resolveServeTarget('guides/auth.md', dir)).toEqual({ root: dir, startPath: '/guides/auth.md' });
  });

  it('throws for a missing path', () => {
    expect(() => resolveServeTarget(path.join(os.tmpdir(), 'gbv-does-not-exist'))).toThrow(/not found/);
  });
});

describe('docs server', () => {
  let root;
  let docs;
  let port;

  beforeAll(async () => {
    const outside = makeTree({ 'secret.md': '# Secret' });
    root = makeTree({
      'README.md': '---\ndescription: Home page\n---\n# Home\n\n[Guide](guides/auth.md)\n',
      'guides/auth.md': '# Auth\n\n[Back](../README.md)\n',
      'setup.md': '# Setup\n',
      'img/logo.png': 'PNGDATA',
      '.git/config': '',
    });
    // A symlink that points outside the root must not be followed. Creating
    // symlinks can need elevated rights on Windows; skip that check if so.
    try {
      fs.symlinkSync(path.join(outside, 'secret.md'), path.join(root, 'escape.md'));
    } catch {
      /* no symlink permission */
    }
    docs = createDocsServer({ root, renderer, scheme: 'light', liveReload: true });
    ({ port } = await docs.listen(0));
  });

  afterAll(async () => {
    await docs?.close();
  });

  it('renders a folder README with a listing of its pages', async () => {
    const res = await request(port, '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toContain('Home page');
    expect(res.body).toContain('In this folder');
    expect(res.body).toContain('href="guides/"');
    expect(res.body).not.toContain('.git');
  });

  it('redirects a folder URL to its trailing-slash form', async () => {
    const res = await request(port, '/guides');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/guides/');
  });

  it('never redirects off-site', async () => {
    fs.mkdirSync(path.join(root, 'evil.com'), { recursive: true });
    for (const raw of ['//evil.com', '/\\evil.com']) {
      const res = await request(port, raw);
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/evil.com/');
    }
  });

  it('renders nested pages and extensionless links', async () => {
    expect((await request(port, '/guides/auth.md')).body).toContain('<h1 id="auth">');
    expect((await request(port, '/setup')).body).toContain('<h1 id="setup">');
  });

  it('serves static assets with their MIME type', async () => {
    const res = await request(port, '/img/logo.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body).toBe('PNGDATA');
  });

  it('blocks path traversal, including encoded and backslash forms', async () => {
    for (const raw of ['/../package.json', '/%2e%2e/%2e%2e/package.json', '/..%5c..%5cpackage.json', '/a%00.md']) {
      expect((await request(port, raw)).status).toBe(404);
    }
  });

  it('does not follow symlinks out of the root', async () => {
    if (!fs.existsSync(path.join(root, 'escape.md'))) {
      return; // symlink could not be created on this machine
    }
    expect((await request(port, '/escape.md')).status).toBe(404);
  });

  it('rejects requests addressed to a non-local host (DNS rebinding)', async () => {
    expect((await request(port, '/', { host: 'evil.example:4100' })).status).toBe(403);
    expect((await request(port, '/', { host: `127.0.0.1:${port}` })).status).toBe(200);
  });

  it('only allows GET and HEAD', async () => {
    expect((await request(port, '/', { method: 'POST' })).status).toBe(405);
    const head = await request(port, '/setup.md', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
  });

  it('returns a 404 page for a missing file', async () => {
    const res = await request(port, '/nope.md');
    expect(res.status).toBe(404);
    expect(res.body).toContain('Not found');
  });

  it('shows a render error in the page instead of crashing', async () => {
    const failing = createDocsServer({
      root,
      renderer: { ...renderer, renderBody: () => { throw new Error('plugin blew up'); } },
      liveReload: false,
    });
    const { port: failPort } = await failing.listen(0);
    try {
      const res = await request(failPort, '/setup.md');
      expect(res.status).toBe(500);
      expect(res.body).toContain('plugin blew up');
      // Still serving afterwards.
      expect((await request(failPort, '/img/logo.png')).status).toBe(200);
    } finally {
      await failing.close();
    }
  });

  it('pushes a reload event when a file changes, ignoring .git', async () => {
    const event = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('no reload event')), 5000);
      const req = http.get({ port, path: '/__livereload', headers: { host: `localhost:${port}` } }, (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (chunk.includes('data: reload')) {
            clearTimeout(timeout);
            req.destroy();
            resolve(chunk);
          }
        });
        // Give the watcher a moment, then make a change.
        setTimeout(() => fs.writeFileSync(path.join(root, 'setup.md'), '# Setup (edited)\n'), 200);
      });
      req.on('error', () => {});
    });
    expect(event).toContain('data: reload');
  });
});
