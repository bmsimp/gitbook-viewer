import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';

const FILES: Record<string, string> = {
  '/repo/.gitbook/includes/note.md': '---\ntitle: Note\n---\n\n# Note\n\nRaise a [request](https://x.test/new).\n',
  '/repo/.gitbook/includes/outer.md': 'Outer.\n\n{% include "inner.md" %}\n',
  '/repo/.gitbook/includes/inner.md': 'Inner.\n',
  '/repo/.gitbook/includes/loop.md': '{% include "loop.md" %}\n',
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
});
