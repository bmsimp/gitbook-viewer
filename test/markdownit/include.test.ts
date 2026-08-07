import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';

const FILES: Record<string, string> = {
  '/repo/.gitbook/includes/note.md': '---\ntitle: Note\n---\n\n# Note\n\nRaise a [request](https://x.test/new).\n',
  '/repo/.gitbook/includes/outer.md': 'Outer.\n\n{% include "inner.md" %}\n',
  '/repo/.gitbook/includes/inner.md': 'Inner.\n',
  '/repo/.gitbook/includes/loop.md': '{% include "loop.md" %}\n',
  // Root-document cycle: back.md includes the document being rendered.
  '/repo/docs/setup/index.md': 'Root body.\n\n{% include "../../.gitbook/includes/back.md" %}\n',
  '/repo/.gitbook/includes/back.md': '{% include "../../docs/setup/index.md" %}\n',
  // Rebase-origin fixtures in two different directories.
  '/repo/a/outer2.md': 'Link out.\n\n{% include "../b/inner2.md" %}\n',
  '/repo/b/inner2.md': 'See [docs](./ref.md).\n',
  // Depth chain c0 -> c1 -> ... -> c5 (leaf).
  '/repo/chain/c0.md': '{% include "c1.md" %}\n',
  '/repo/chain/c1.md': '{% include "c2.md" %}\n',
  '/repo/chain/c2.md': '{% include "c3.md" %}\n',
  '/repo/chain/c3.md': '{% include "c4.md" %}\n',
  '/repo/chain/c4.md': '{% include "c5.md" %}\n',
  '/repo/chain/c5.md': 'Deep leaf.\n',
  // Diamond fan: each level includes the next five times (1+5+25+125 = 156
  // expansions from a single top-level include, exceeding the 100 budget).
  '/repo/fan/f1.md': Array.from({ length: 5 }, () => '{% include "f2.md" %}').join('\n\n') + '\n',
  '/repo/fan/f2.md': Array.from({ length: 5 }, () => '{% include "f3.md" %}').join('\n\n') + '\n',
  '/repo/fan/f3.md': Array.from({ length: 5 }, () => '{% include "f4.md" %}').join('\n\n') + '\n',
  '/repo/fan/f4.md': 'Fan leaf.\n',
};

const md = gitbookPlugin(new MarkdownIt({ html: true }), {
  readFile: (p: string) => FILES[p.replace(/\\/g, '/')] ?? null,
});

const env = () => ({ currentDocument: { fsPath: '/repo/docs/setup/index.md' } });

describe('include', () => {
  it('splices the target markdown inline with no wrapper chrome', () => {
    const html = md.render('{% include "../../.gitbook/includes/note.md" %}', env());
    expect(html).toContain('<h1>Note</h1>');
    expect(html).toContain('<a href="https://x.test/new">request</a>');
    expect(html).not.toContain('gb-include-error');
  });

  it('strips front matter from the included file', () => {
    expect(md.render('{% include "../../.gitbook/includes/note.md" %}', env())).not.toContain('title: Note');
  });

  it('renders a visible error box when the target is missing', () => {
    const html = md.render('{% include "../../.gitbook/includes/gone.md" %}', env());
    expect(html).toContain('<div class="gb-include-error">');
    expect(html).toContain('gone.md');
  });

  it('resolves a nested include relative to the including file', () => {
    const html = md.render('{% include "../../.gitbook/includes/outer.md" %}', env());
    expect(html).toContain('<p>Outer.</p>');
    expect(html).toContain('<p>Inner.</p>');
  });

  it('breaks a self-referencing include instead of hanging', () => {
    const html = md.render('{% include "../../.gitbook/includes/loop.md" %}', env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('cycle');
  });

  it('renders an error when the document path is unknown', () => {
    expect(md.render('{% include "a.md" %}', {})).toContain('gb-include-error');
  });

  it('detects a cycle through the root document without rendering its body', () => {
    const html = md.render('{% include "../../.gitbook/includes/back.md" %}', env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('cycle');
    expect(html).not.toContain('Root body.');
  });

  it('stamps spliced inline tokens with the file they came from', () => {
    const tokens = md.parse('{% include "../../a/outer2.md" %}', env());
    const inlines = tokens.filter((t) => t.type === 'inline') as Array<
      MarkdownIt.Token & { gbRebaseFrom?: string }
    >;
    const outerInline = inlines.find((t) => t.content.includes('Link out.'));
    const innerInline = inlines.find((t) => t.content.includes('[docs]'));
    expect(outerInline?.gbRebaseFrom?.replace(/\\/g, '/')).toMatch(/\/a\/outer2\.md$/);
    expect(innerInline?.gbRebaseFrom?.replace(/\\/g, '/')).toMatch(/\/b\/inner2\.md$/);
    expect(tokens.every((t) => t.map === null)).toBe(true);
  });

  it('allows an include chain five levels deep', () => {
    const html = md.render('{% include "../../chain/c1.md" %}', env());
    expect(html).toContain('Deep leaf.');
    expect(html).not.toContain('gb-include-error');
  });

  it('rejects an include chain six levels deep with a depth error', () => {
    const html = md.render('{% include "../../chain/c0.md" %}', env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('5');
    expect(html).not.toContain('Deep leaf.');
  });

  it('caps total expansion with a budget on diamond-shaped include graphs', () => {
    const html = md.render('{% include "../../fan/f1.md" %}', env());
    expect(html).toContain('gb-include-error');
    expect(html).toContain('budget');
  });

  it('leaves ordinary multi-include documents under the budget', () => {
    const source = [
      '{% include "../../.gitbook/includes/inner.md" %}',
      '{% include "../../.gitbook/includes/inner.md" %}',
      '{% include "../../.gitbook/includes/inner.md" %}',
    ].join('\n\n');
    const html = md.render(source, env());
    expect(html).not.toContain('gb-include-error');
    expect(html.match(/<p>Inner\.<\/p>/g)).toHaveLength(3);
  });
});
