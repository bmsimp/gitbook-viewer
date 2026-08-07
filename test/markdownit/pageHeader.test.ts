import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';

const FILES: Record<string, string> = {
  '/docs/a.md': '---\ndescription: How to set things up\nicon: rocket\n---\n\n# Setup\n\nBody.\n',
  '/docs/b.md': '# Plain\n\nBody.\n',
  '/docs/c.md': '---\ndescription: Only a description\n---\n\n# C\n',
};

const md = gitbookPlugin(new MarkdownIt({ html: true }), {
  readFile: (p: string) => FILES[p.replace(/\\/g, '/')] ?? null,
});

describe('page header', () => {
  it('renders description and icon above the content', () => {
    const html = md.render('# Setup\n\nBody.\n', { currentDocument: { fsPath: '/docs/a.md' } });
    expect(html).toContain('<div class="gb-page-header">');
    expect(html).toContain('<div class="gb-page-header__icon" data-gb-icon="rocket"');
    expect(html).toContain('<p class="gb-page-header__desc">How to set things up</p>');
    expect(html.indexOf('gb-page-header')).toBeLessThan(html.indexOf('<h1>Setup</h1>'));
  });

  it('renders nothing when there is no front matter', () => {
    expect(md.render('# Plain\n', { currentDocument: { fsPath: '/docs/b.md' } })).not.toContain('gb-page-header');
  });

  it('renders the header with no icon when only a description exists', () => {
    const html = md.render('# C\n', { currentDocument: { fsPath: '/docs/c.md' } });
    expect(html).toContain('gb-page-header__desc');
    expect(html).not.toContain('gb-page-header__icon');
  });

  it('renders nothing when the document path is unknown', () => {
    expect(md.render('# X\n', {})).not.toContain('gb-page-header');
  });

  it('prefers unsaved buffer text over the file on disk', () => {
    const withBuffer = gitbookPlugin(new MarkdownIt({ html: true }), {
      readFile: (p: string) => FILES[p.replace(/\\/g, '/')] ?? null,
      readDocumentText: () => '---\ndescription: Edited in buffer\n---\n\n# X\n',
    });
    const html = withBuffer.render('# X\n', { currentDocument: { fsPath: '/docs/a.md' } });
    expect(html).toContain('Edited in buffer');
  });
});
