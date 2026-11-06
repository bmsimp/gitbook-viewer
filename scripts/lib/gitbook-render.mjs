// Shared GitBook rendering core for the standalone tools (one-shot CLI and the
// local docs server). It compiles the extension's markdown-it plugin on the fly
// — the same trick scripts/corpus-check.mjs uses — so the tools always track
// the current source and never depend on dist/extension.js (which bundles
// vscode). Nothing here imports vscode; it reuses src/markdownit/* and media/*
// exactly as the extension contributes them to VS Code's preview.

import { buildSync } from 'esbuild';
import Module, { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Compile src/markdownit in memory and load it as a CommonJS module. Nothing is
 * written to disk, so several servers (or tests) can start at once without
 * racing on a shared output file.
 */
function loadPlugin(projectRoot) {
  const srcDir = path.join(projectRoot, 'src', 'markdownit');
  const result = buildSync({
    stdin: {
      contents:
        "export { gitbookPlugin } from './plugin';\nexport { gitbookSlug } from './mention';\n",
      resolveDir: srcDir,
      sourcefile: 'standalone-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  });
  const filename = path.join(srcDir, 'standalone-entry.cjs');
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(srcDir);
  mod._compile(result.outputFiles[0].text, filename);
  return mod.exports;
}

/**
 * Give every heading a GitBook-style anchor id so `page.md#section` links and
 * mentions scroll to the right place. VS Code's preview adds its own heading
 * ids; a plain browser has nothing, so the standalone renderer supplies them.
 * Repeated headings get `-1`, `-2`… suffixes so each id stays unique.
 */
function headingIdsPlugin(md, slugify) {
  md.core.ruler.push('gbv_heading_ids', (state) => {
    const seen = new Map();
    const { tokens } = state;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== 'heading_open' || token.attrGet('id')) {
        continue;
      }
      const inline = tokens[i + 1];
      const text = (inline?.children ?? [])
        .filter((t) => t.type === 'text' || t.type === 'code_inline')
        .map((t) => t.content)
        .join('');
      const base = slugify(text);
      if (!base) {
        continue;
      }
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      token.attrSet('id', count ? `${base}-${count}` : base);
    }
  });
}

/**
 * Build the plugin, create one markdown-it instance, and load the media assets
 * once. The returned renderer is reusable across many pages: the plugin is
 * idempotent and all per-page state (include budget/stack) lives on the env
 * passed to each render call, so a single instance is safe to share.
 */
export function createGitbookRenderer(projectRoot) {
  const { gitbookPlugin, gitbookSlug } = loadPlugin(projectRoot);
  const MarkdownIt = require('markdown-it');
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  gitbookPlugin(md);
  headingIdsPlugin(md, gitbookSlug);

  const fontsCss = fs.readFileSync(path.join(projectRoot, 'media', 'fonts.css'), 'utf8');
  const gitbookCss = fs.readFileSync(path.join(projectRoot, 'media', 'gitbook.css'), 'utf8');
  const previewJs = fs.readFileSync(path.join(projectRoot, 'media', 'preview.js'), 'utf8');
  const baseCss = fs.readFileSync(path.join(projectRoot, 'scripts', 'lib', 'standalone-base.css'), 'utf8');

  /**
   * Render a markdown source string to the GitBook body HTML. `fsPath` is the
   * on-disk path of the source, used to resolve {% include %} targets and the
   * front-matter page header. VS Code tokenizes with an env that has no
   * currentDocument and only hands the real env to the renderer; mirror that
   * split so include/header resolution behaves as it does in VS Code.
   */
  function renderBody(source, fsPath) {
    const tokens = md.parse(stripFrontMatter(source), { currentDocument: undefined });
    return md.renderer.render(tokens, md.options, { currentDocument: { fsPath } });
  }

  /** Wrap body HTML in a self-contained document with the media assets inlined. */
  function wrapHtml({ body, title, scheme = 'auto', baseHref, topbar = '', liveReload = false }) {
    // Scheme handling mirrors the extension: a forced light/dark scheme travels
    // as a hidden marker element that preview.js reads and stamps onto the body.
    // For 'auto' in a plain browser there's no VS Code theme class, so a tiny
    // probe maps the OS preference onto the same .vscode-dark selector the CSS
    // already keys dark mode off.
    const schemeMarker =
      scheme === 'light' || scheme === 'dark'
        ? `<div data-gb-scheme-marker="${scheme}" style="display:none"></div>\n`
        : '';
    const autoProbe =
      scheme === 'auto'
        ? `<script>if(matchMedia('(prefers-color-scheme: dark)').matches){document.body.classList.add('vscode-dark');}</script>\n`
        : '';
    const base = baseHref ? `<base href="${escapeHtml(baseHref)}">` : '';
    // Live reload: the docs server streams a "reload" event over SSE whenever a
    // file under the docs root changes, so saving a .md refreshes the open page.
    // Scroll position is kept across the reload so editing a long page doesn't
    // jump you back to the top. Off for the one-shot file:// CLI.
    const liveReloadScript = liveReload
      ? `<script>(function(){var k='gbv-scroll:'+location.pathname;try{var y=sessionStorage.getItem(k);if(y!==null){sessionStorage.removeItem(k);addEventListener('load',function(){scrollTo(0,+y);});}var s=new EventSource('/__livereload');s.onmessage=function(){sessionStorage.setItem(k,String(scrollY));location.reload();};}catch(e){}})();</script>\n`
      : '';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${base}
<title>${escapeHtml(title)} — GitBook Viewer</title>
<style>${baseCss}</style>
<style>
/* Breadcrumb bar and folder listings (docs server only). */
.gbv-topbar { position: sticky; top: 0; z-index: 10; padding: 0.6rem 1.5rem;
  font: 0.85rem/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  border-bottom: 1px solid rgb(var(--gb-tint-subtle));
  background: rgb(var(--gb-tint-base) / 0.9); color: rgb(var(--gb-tint-muted));
  backdrop-filter: saturate(1.2) blur(4px); }
.gbv-topbar a { color: inherit; text-decoration: none; }
.gbv-topbar a:hover { text-decoration: underline; }
.gbv-topbar .gbv-sep { opacity: 0.5; margin: 0 0.4rem; }
.gbv-topbar .gbv-current { color: rgb(var(--gb-tint-text)); }
.gbv-listing { list-style: none; padding-left: 0; }
.gbv-listing li { margin: 0.25rem 0; }
.gbv-listing a::before { content: '📄 '; }
.gbv-listing a.gbv-dir::before { content: '📁 '; }
.gbv-error { white-space: pre-wrap; padding: 1rem; border-radius: 6px;
  background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.35); }
</style>
<style>${fontsCss}</style>
<style>${gitbookCss}</style>
</head>
<body>
${autoProbe}${schemeMarker}${topbar}<main class="gbv-article">
${body}
</main>
<script>${previewJs}</script>
${liveReloadScript}</body>
</html>
`;
  }

  return { renderBody, wrapHtml, assets: { fontsCss, gitbookCss, previewJs, baseCss } };
}

/**
 * VS Code's markdown preview strips a leading YAML front-matter block before
 * markdown-it sees the source; mirror that so the `---` delimiters don't render
 * as an <hr> + setext heading. Only a block at the very start of the file is
 * front matter — a `---` anywhere else is a thematic break and is left alone.
 * The page header still recovers the description because pageHeader.ts
 * re-reads the whole file independently.
 */
export function stripFrontMatter(text) {
  const match = /^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Open a URL in the OS default browser, detached from this process. */
export function openInBrowser(url) {
  const { spawn } = require('node:child_process');
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}
