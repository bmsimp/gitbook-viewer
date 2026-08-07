import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';
import { rebasePath } from '../../src/markdownit/rebase';

describe('rebasePath', () => {
  it('rewrites a relative path between two directories', () => {
    expect(rebasePath('assets/x.png', '/repo/.gitbook/includes', '/repo/docs/setup')).toBe(
      '../../.gitbook/includes/assets/x.png',
    );
  });

  it('normalizes a leading ./', () => {
    expect(rebasePath('./a.png', '/repo/.gitbook/includes', '/repo/.gitbook/includes')).toBe('a.png');
  });

  it('leaves absolute urls alone', () => {
    expect(rebasePath('https://x.test/a.png', '/a', '/b')).toBe('https://x.test/a.png');
    expect(rebasePath('mailto:a@b.test', '/a', '/b')).toBe('mailto:a@b.test');
  });

  it('leaves root-relative and anchor targets alone', () => {
    expect(rebasePath('/top.png', '/a', '/b')).toBe('/top.png');
    expect(rebasePath('#section', '/a', '/b')).toBe('#section');
  });

  it('always emits forward slashes', () => {
    expect(rebasePath('a.png', 'C:\\repo\\inc', 'C:\\repo\\docs')).toBe('../inc/a.png');
  });
});

const FILES: Record<string, string> = {
  '/repo/.gitbook/includes/note.md': 'See ![shot](assets/x.png) and [more](other.md) and [ext](https://x.test).\n',
  '/repo/.gitbook/includes/linked-image.md': '[![shot](assets/x.png)](pages/target.md)\n',
  '/repo/a/outer.md': '{% include "../b/inner.md" %}\n',
  '/repo/b/inner.md': '![i](img.png)\n',
};

const md = gitbookPlugin(new MarkdownIt({ html: true }), {
  readFile: (p: string) => FILES[p.replace(/\\/g, '/')] ?? null,
});

describe('include path rebasing', () => {
  const env = () => ({ currentDocument: { fsPath: '/repo/docs/setup/index.md' } });

  it('rebases image sources from the include directory', () => {
    const html = md.render('{% include "../../.gitbook/includes/note.md" %}', env());
    expect(html).toContain('src="../../.gitbook/includes/assets/x.png"');
  });

  it('rebases relative links', () => {
    const html = md.render('{% include "../../.gitbook/includes/note.md" %}', env());
    expect(html).toContain('href="../../.gitbook/includes/other.md"');
  });

  it('leaves external links untouched', () => {
    expect(md.render('{% include "../../.gitbook/includes/note.md" %}', env())).toContain('href="https://x.test"');
  });

  it('rebases an image nested inside a link (flat inline children)', () => {
    const html = md.render('{% include "../../.gitbook/includes/linked-image.md" %}', env());
    expect(html).toContain('href="../../.gitbook/includes/pages/target.md"');
    expect(html).toContain('src="../../.gitbook/includes/assets/x.png"');
  });

  it('leaves the host document own relative links untouched', () => {
    const html = md.render(
      '[h](host.md)\n\n{% include "../../.gitbook/includes/note.md" %}',
      env(),
    );
    expect(html).toContain('href="host.md"');
    expect(html).toContain('href="../../.gitbook/includes/other.md"');
  });

  it('rebases from the deepest include (first stamp wins through nesting)', () => {
    const html = md.render('{% include "../a/outer.md" %}', {
      currentDocument: { fsPath: '/repo/docs/index.md' },
    });
    expect(html).toContain('src="../b/img.png"');
  });
});
