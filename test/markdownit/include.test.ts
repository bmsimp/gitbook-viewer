import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';
import { renderLikeVsCode } from '../helpers/render';

const FILES: Record<string, string> = {
  '/repo/.gitbook/includes/note.md': '---\ntitle: Note\n---\n\n# Note\n\nRaise a [request](https://x.test/new).\n',
  '/repo/.gitbook/includes/outer.md': 'Outer.\n\n{% include "inner.md" %}\n',
  '/repo/.gitbook/includes/inner.md': 'Inner.\n',
  '/repo/.gitbook/includes/loop.md': '{% include "loop.md" %}\n',
  // Front matter that would produce a page header if the include were treated
  // as a page of its own rather than as a fragment of the host document.
  '/repo/.gitbook/includes/described.md':
    '---\ndescription: Include description\nicon: rocket\n---\n\nDescribed body.\n',
  // Root-document cycle: back.md includes the document being rendered.
  '/repo/docs/setup/index.md': 'Root body.\n\n{% include "../../.gitbook/includes/back.md" %}\n',
  '/repo/.gitbook/includes/back.md': '{% include "../../docs/setup/index.md" %}\n',
  // CRLF include whose leading html block must still end at the blank line;
  // without newline normalization the "\r" lines count as non-blank and the
  // <details> block swallows the whole file, leaving the hint raw.
  '/repo/.gitbook/includes/crlf.md':
    '<details>\r\n\r\n<summary>More</summary>\r\n\r\n{% hint style="info" %}\r\nInside.\r\n{% endhint %}\r\n\r\n</details>\r\n',
  // Cross-directory nesting: the inner include only resolves if the nested
  // render is rooted at outer2.md rather than at the host document.
  '/repo/a/outer2.md': 'Outer two.\n\n{% include "../b/inner2.md" %}\n',
  '/repo/b/inner2.md': 'Innermost content.\n\n![i](img.png)\n',
  // Depth chain c0 -> c1 -> ... -> c5 (leaf).
  '/repo/chain/c0.md': '{% include "c1.md" %}\n',
  '/repo/chain/c1.md': '{% include "c2.md" %}\n',
  '/repo/chain/c2.md': '{% include "c3.md" %}\n',
  '/repo/chain/c3.md': '{% include "c4.md" %}\n',
  '/repo/chain/c4.md': '{% include "c5.md" %}\n',
  '/repo/chain/c5.md': 'Deep leaf.\n',
  // Diamond fan: each level includes the next five times. Including f1 costs
  // 1+5+25+125 = 156 expansions; including f2 costs 1+5+25 = 31.
  '/repo/fan/f1.md': Array.from({ length: 5 }, () => '{% include "f2.md" %}').join('\n\n') + '\n',
  '/repo/fan/f2.md': Array.from({ length: 5 }, () => '{% include "f3.md" %}').join('\n\n') + '\n',
  '/repo/fan/f3.md': Array.from({ length: 5 }, () => '{% include "f4.md" %}').join('\n\n') + '\n',
  '/repo/fan/f4.md': 'Fan leaf.\n',
};

const readFile = (p: string): string | null => FILES[p.replace(/\\/g, '/')] ?? null;

const md = gitbookPlugin(new MarkdownIt({ html: true }), { readFile });

const env = () => ({ currentDocument: { fsPath: '/repo/docs/setup/index.md' } });

describe('include', () => {
  it('splices the target markdown inline with no wrapper chrome', () => {
    const html = renderLikeVsCode(md, '{% include "../../.gitbook/includes/note.md" %}', env());
    expect(html).toContain('<h1>Note</h1>');
    expect(html).toContain('<a href="https://x.test/new">request</a>');
    expect(html).not.toContain('gb-include-error');
  });

  it('emits a hidden detection marker before the spliced content', () => {
    const html = renderLikeVsCode(md, '{% include "../../.gitbook/includes/note.md" %}', env());
    const marker = html.indexOf('<span class="gb-include-marker" hidden aria-hidden="true"></span>');
    expect(marker).toBeGreaterThanOrEqual(0);
    expect(marker).toBeLessThan(html.indexOf('<h1>Note</h1>'));
  });

  it('strips front matter from the included file', () => {
    expect(renderLikeVsCode(md, '{% include "../../.gitbook/includes/note.md" %}', env())).not.toContain('title: Note');
  });

  it('normalizes CRLF include content so tags inside html blocks still render', () => {
    const html = renderLikeVsCode(md, '{% include "../../.gitbook/includes/crlf.md" %}', env());
    expect(html).toContain('gb-hint');
    expect(html).not.toContain('{% hint');
  });

  it('renders a visible error box when the target is missing', () => {
    const html = renderLikeVsCode(md, '{% include "../../.gitbook/includes/gone.md" %}', env());
    expect(html).toContain('<div class="gb-include-error">');
    expect(html).toContain('gone.md');
  });

  it('resolves a nested include relative to the including file', () => {
    const html = renderLikeVsCode(md, '{% include "../../.gitbook/includes/outer.md" %}', env());
    expect(html).toContain('<p>Outer.</p>');
    expect(html).toContain('<p>Inner.</p>');
  });

  it('breaks a self-referencing include instead of hanging', () => {
    const html = renderLikeVsCode(md, '{% include "../../.gitbook/includes/loop.md" %}', env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('cycle');
  });

  it('renders an error when the document path is unknown', () => {
    expect(renderLikeVsCode(md, '{% include "a.md" %}', {})).toContain('gb-include-error');
  });

  it('detects a cycle through the root document without rendering its body', () => {
    const html = renderLikeVsCode(md, '{% include "../../.gitbook/includes/back.md" %}', env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('cycle');
    expect(html).not.toContain('Root body.');
  });

  it('allows an include chain five levels deep', () => {
    const html = renderLikeVsCode(md, '{% include "../../chain/c1.md" %}', env());
    expect(html).toContain('Deep leaf.');
    expect(html).not.toContain('gb-include-error');
  });

  it('rejects an include chain six levels deep with a depth error', () => {
    const html = renderLikeVsCode(md, '{% include "../../chain/c0.md" %}', env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('5');
    expect(html).not.toContain('Deep leaf.');
  });

  it('caps total expansion with a budget on diamond-shaped include graphs', () => {
    const html = renderLikeVsCode(md, '{% include "../../fan/f1.md" %}', env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('budget');
  });

  it('leaves ordinary multi-include documents under the budget', () => {
    const source = [
      '{% include "../../.gitbook/includes/inner.md" %}',
      '{% include "../../.gitbook/includes/inner.md" %}',
      '{% include "../../.gitbook/includes/inner.md" %}',
    ].join('\n\n');
    const html = renderLikeVsCode(md, source, env());
    expect(html).not.toContain('gb-include-error');
    expect(html.match(/<p>Inner\.<\/p>/g)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Regression guards for the parse/render env split. VS Code tokenizes with an
// env that has no currentDocument and renders with the real one, so an include
// resolved at parse time always failed with "the document has no file path".
// ---------------------------------------------------------------------------
describe('include under the VS Code parse/render split', () => {
  it('resolves when the document path is only known at render time', () => {
    const tokens = md.parse('{% include "../../.gitbook/includes/note.md" %}', {
      currentDocument: undefined,
    });
    const html = md.renderer.render(tokens, md.options, env());
    expect(html).toContain('<h1>Note</h1>');
    expect(html).not.toContain('gb-include-error');
  });

  it('renders one cached token stream against two different documents', () => {
    // VS Code caches tokens per document, so the tokens must carry no
    // document-dependent state at all.
    const tokens = md.parse('{% include "inner.md" %}', { currentDocument: undefined });
    const fromIncludes = md.renderer.render(tokens, md.options, {
      currentDocument: { fsPath: '/repo/.gitbook/includes/host.md' },
    });
    const fromDocs = md.renderer.render(tokens, md.options, env());
    expect(fromIncludes).toContain('<p>Inner.</p>');
    expect(fromDocs).toContain('gb-include-error');
  });

  it('resolves a nested include living in a different directory', () => {
    const html = renderLikeVsCode(md, '{% include "../../a/outer2.md" %}', env());
    expect(html).toContain('<p>Outer two.</p>');
    expect(html).toContain('<p>Innermost content.</p>');
    expect(html).not.toContain('gb-include-error');
  });

  it('gives the nested render a currentDocument pointing at the include file', () => {
    // This is what lets VS Code's own image/link rules resolve relative assets
    // inside an include against the include's directory (replacing the old
    // rebase core rule). Stand in for those rules with a probe.
    const seen: Array<string | undefined> = [];
    const probe = gitbookPlugin(new MarkdownIt({ html: true }), { readFile });
    probe.renderer.rules.image = (_tokens, _idx, _options, probeEnv) => {
      seen.push((probeEnv as { currentDocument?: { fsPath: string } }).currentDocument?.fsPath);
      return '<img>';
    };
    renderLikeVsCode(probe, '{% include "../../a/outer2.md" %}', env());
    expect(seen.map((p) => p?.replace(/\\/g, '/'))).toEqual(['/repo/b/inner2.md']);
  });

  it('shares one expansion budget across sibling includes, not one per include', () => {
    // Each f2 include costs 31 expansions, under the 100 cap on its own; four
    // of them cost 124, so only a counter shared by reference across the
    // nested envs can catch this.
    const source = Array.from({ length: 4 }, () => '{% include "../../fan/f2.md" %}').join('\n\n');
    const html = renderLikeVsCode(md, source, env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('budget');
  });

  it('does not emit a page header for an included file with a description', () => {
    const html = renderLikeVsCode(md, '{% include "../../.gitbook/includes/described.md" %}', env());
    expect(html).toContain('Described body.');
    expect(html).not.toContain('gb-page-header');
  });
});
