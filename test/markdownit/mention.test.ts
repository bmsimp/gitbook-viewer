import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';
import { gitbookSlug } from '../../src/markdownit/mention';
import { renderLikeVsCode } from '../helpers/render';

const FILES: Record<string, string> = {
  '/docs/task.md': '---\ntitle: Scheduled Task Details\n---\n\n# Tasks\n',
  '/docs/plain.md': '# Plain Page\n\nBody.\n',
  '/docs/README.md': '---\ntitle: Home\n---\n',
  '/docs/tenant/standards/README.md': '---\ntitle: Standards\n---\n',
  '/docs/templates/README.md':
    '---\ntitle: Templates\n---\n\n## Available Standards\n\n' +
    '## 2. Updating from v6 (or Older) to v7+\n\n' +
    '```\n# not a heading\n```\n',
  '/docs/untitled.md': 'Just prose, no heading and no front matter.\n',
  '/docs/.gitbook/includes/frag.md': 'See [sibling.md](sibling.md "mention").\n',
  '/docs/.gitbook/includes/sibling.md': '---\ntitle: Sibling Title\n---\n',
};

const md = gitbookPlugin(new MarkdownIt({ html: true }), {
  readFile: (p: string) => FILES[p.replace(/\\/g, '/')] ?? null,
});

const env = () => ({ currentDocument: { fsPath: '/docs/index.md' } });

describe('mention links', () => {
  it('replaces the link text with the target front-matter title', () => {
    const html = renderLikeVsCode(md, '[task.md](task.md "mention")', env());
    expect(html).toContain('<a href="task.md" title="mention">');
    expect(html).toContain('<span class="gb-mention">Scheduled Task Details</span></a>');
    expect(html).not.toContain('>task.md<');
  });

  it('falls back to the first H1 when the target has no front matter', () => {
    const html = renderLikeVsCode(md, '[plain.md](plain.md "mention")', env());
    expect(html).toContain('<span class="gb-mention">Plain Page</span>');
  });

  it('resolves a directory target to its README title', () => {
    const html = renderLikeVsCode(md, '[standards](tenant/standards/ "mention")', env());
    expect(html).toContain('<span class="gb-mention">Standards</span>');
  });

  it('resolves a ./ target to the README next to the document', () => {
    const html = renderLikeVsCode(md, '[.](./ "mention")', env());
    expect(html).toContain('<span class="gb-mention">Home</span>');
  });

  it('shows the heading text for an anchor mention', () => {
    const html = renderLikeVsCode(
      md,
      '[#available-standards](templates/#available-standards "mention")',
      env(),
    );
    expect(html).toContain('<span class="gb-mention">Available Standards</span>');
  });

  it('matches digit-leading anchors carrying the id- prefix and kept dots', () => {
    const html = renderLikeVsCode(
      md,
      '[#x](templates/#id-2.-updating-from-v6-or-older-to-v7 "mention")',
      env(),
    );
    expect(html).toContain('<span class="gb-mention">2. Updating from v6 (or Older) to v7+</span>');
  });

  it('matches a stale anchor variant without the id- prefix or dots', () => {
    // The corpus links both #id-2.-updating-... and #2-updating-... at the
    // same heading; the loose pass catches the older spelling.
    const html = renderLikeVsCode(
      md,
      '[#x](templates/#2-updating-from-v6-or-older-to-v7 "mention")',
      env(),
    );
    expect(html).toContain('<span class="gb-mention">2. Updating from v6 (or Older) to v7+</span>');
  });

  it('does not treat fenced code lines as headings', () => {
    const html = renderLikeVsCode(md, '[#x](templates/#not-a-heading "mention")', env());
    expect(html).not.toContain('not a heading</span>');
    expect(html).toContain('<span class="gb-mention">Templates</span>');
  });

  it('falls back to the page title when no heading matches the anchor', () => {
    const html = renderLikeVsCode(md, '[#nope](templates/#nope "mention")', env());
    expect(html).toContain('<span class="gb-mention">Templates</span>');
  });

  it('keeps the original text when the target has no title at all', () => {
    const html = renderLikeVsCode(md, '[untitled.md](untitled.md "mention")', env());
    expect(html).toContain('>untitled.md</a>');
    expect(html).not.toContain('gb-mention');
  });

  it('keeps the original text when the target file is missing', () => {
    const html = renderLikeVsCode(md, '[gone.md](gone.md "mention")', env());
    expect(html).toContain('>gone.md</a>');
    expect(html).not.toContain('gb-mention');
  });

  it('leaves an external url with a mention title untouched', () => {
    const html = renderLikeVsCode(md, '[docs site](https://example.com/x "mention")', env());
    expect(html).toContain('>docs site</a>');
    expect(html).not.toContain('gb-mention');
  });

  it('leaves mentions untouched when there is no currentDocument', () => {
    const html = renderLikeVsCode(md, '[task.md](task.md "mention")', {});
    expect(html).toContain('>task.md</a>');
    expect(html).not.toContain('gb-mention');
  });

  it('never touches a non-mention link', () => {
    const html = renderLikeVsCode(md, '[task.md](task.md "tooltip")', env());
    expect(html).toContain('>task.md</a>');
    expect(html).not.toContain('gb-mention');
  });

  it('resolves a mention inside an include relative to the include file', () => {
    const html = renderLikeVsCode(md, '{% include "./.gitbook/includes/frag.md" %}', env());
    expect(html).toContain('<span class="gb-mention">Sibling Title</span>');
  });

  it('does not suppress text after the link', () => {
    const html = renderLikeVsCode(md, 'before [task.md](task.md "mention") after', env());
    expect(html).toContain('before ');
    expect(html).toContain(' after');
    expect(html).toContain('<span class="gb-mention">Scheduled Task Details</span>');
  });

  it('does not eat the document on a link_open with no matching link_close', () => {
    // Hand-degrade a real token stream: drop the mention's link_close so the
    // renderer sees a malformed inline. Without the close-ahead guard the
    // suppression flag would swallow every later text token.
    const tokens = md.parse('[task.md](task.md "mention") tail\n\nnext paragraph\n', {
      currentDocument: undefined,
      containingImages: new Set(),
      resourceProvider: undefined,
    });
    const inline = tokens.find((t) => t.type === 'inline');
    inline!.children = inline!.children!.filter((t) => t.type !== 'link_close');
    const html = md.renderer.render(tokens, md.options, env());
    expect(html).toContain('tail');
    expect(html).toContain('next paragraph');
  });
});

describe('gitbookSlug', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(gitbookSlug('Available Standards')).toBe('available-standards');
  });

  it('keeps dots and prefixes digit-leading slugs with id-', () => {
    expect(gitbookSlug('2. Updating from v6 (or Older) to v7+')).toBe(
      'id-2.-updating-from-v6-or-older-to-v7',
    );
  });

  it('keeps dots inside version numbers without a prefix', () => {
    expect(gitbookSlug('Pre-Version 7.1 Self-Hosted Deployments')).toBe(
      'pre-version-7.1-self-hosted-deployments',
    );
  });
});
