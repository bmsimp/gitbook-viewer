// Browser build of the GitBook renderer for the Orca custom editor. Bundled by
// scripts/build-orca-plugin.mjs into editor/vendor/gitbook-renderer.js.
//
// An Orca custom editor only ever receives the open file's text: no path, no
// file system, no network. So the shared plugin is given a file reader that
// knows exactly one file — this document — and anything that needs another
// file (includes, images) renders as a clear "not available here" note
// pointing at gitbook-serve, which has the whole docs tree.

import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';
import { gitbookSlug } from '../../src/markdownit/mention';
import fontsCss from '../../media/fonts.css';
import gitbookCss from '../../media/gitbook.css';
import baseCss from '../../scripts/lib/standalone-base.css';
import '../../media/preview.js';

/** Stand-in path for the open document. POSIX-style so path handling stays POSIX. */
const DOC_PATH = '/__orca_document__.md';

let currentText = '';

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
gitbookPlugin(md, {
  readFile: (absolutePath) => (absolutePath === DOC_PATH ? currentText : null),
  readDocumentText: (docPath) => (docPath === DOC_PATH ? currentText : undefined),
});

type Token = ReturnType<MarkdownIt['parse']>[number];

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const unavailable = (kind: string, detail: string) =>
  `<div class="gbv-unavailable"><strong>${kind}</strong> <code>${escapeHtml(detail)}</code>` +
  `<span>Not shown in this view — run <code>gitbook-serve --orca</code> to see it.</span></div>`;

// Includes can't be read from inside the editor; say so plainly rather than
// showing the extension's "include failed" error.
const renderInclude = md.renderer.rules.gitbook_include!;
md.renderer.rules.gitbook_include = (tokens, idx, options, env, self) => {
  const html = renderInclude(tokens, idx, options, env, self);
  if (!html.includes('gb-include-error')) {
    return html;
  }
  const target = (tokens[idx]!.meta as { target?: string } | null)?.target ?? '';
  return unavailable('Include', target);
};

// Relative images point at files the editor can't load; remote and data: URLs work.
const renderImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const src = tokens[idx]!.attrGet('src') ?? '';
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) {
    return renderImage(tokens, idx, options, env, self);
  }
  return unavailable('Image', src);
};

// GitBook-style anchor ids, so in-page #links and the outline line up.
md.core.ruler.push('gbv_heading_ids', (state) => {
  const seen = new Map<string, number>();
  const tokens: Token[] = state.tokens;
  tokens.forEach((token, i) => {
    if (token.type !== 'heading_open' || token.attrGet('id')) {
      return;
    }
    const text = (tokens[i + 1]?.children ?? [])
      .filter((t) => t.type === 'text' || t.type === 'code_inline')
      .map((t) => t.content)
      .join('');
    const base = gitbookSlug(text);
    if (!base) {
      return;
    }
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    token.attrSet('id', count ? `${base}-${count}` : base);
  });
});

/** Same leading-front-matter rule as VS Code: only a block at the very top. */
function stripFrontMatter(text: string): string {
  const match = /^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length) : text;
}

/** Render markdown source to GitBook body HTML. */
export function render(text: string): string {
  currentText = text;
  const tokens = md.parse(stripFrontMatter(text), { currentDocument: undefined });
  return md.renderer.render(tokens, md.options, { currentDocument: { fsPath: DOC_PATH } });
}

export const styles = { fontsCss, gitbookCss, baseCss };
