import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';

const FILES: Record<string, string> = {
  '/docs/endpoints.md': '---\ntitle: Endpoints\ndescription: Every endpoint\n---\n# Endpoints\n',
  '/docs/plain.md': '# Plain Page\n',
};

const md = gitbookPlugin(new MarkdownIt({ html: true }), {
  readFile: (p: string) => FILES[p.replace(/\\/g, '/')] ?? null,
});

const env = { currentDocument: { fsPath: '/docs/index.md' } };

describe('content-ref renderer', () => {
  it('renders a card using the target front matter', () => {
    const html = md.render('{% content-ref url="endpoints.md" %}\n[endpoints.md](endpoints.md)\n{% endcontent-ref %}', env);
    expect(html).toContain('<a class="gb-content-ref" href="endpoints.md">');
    expect(html).toContain('<span class="gb-content-ref__title">Endpoints</span>');
    expect(html).toContain('<span class="gb-content-ref__desc">Every endpoint</span>');
    expect(html).toContain('<div class="gb-content-ref__body" hidden>');
  });

  it('falls back to the first H1 when there is no front matter', () => {
    const html = md.render('{% content-ref url="plain.md" %}\nx\n{% endcontent-ref %}', env);
    expect(html).toContain('<span class="gb-content-ref__title">Plain Page</span>');
  });

  it('falls back to the url when the target is missing', () => {
    const html = md.render('{% content-ref url="gone.md" %}\nx\n{% endcontent-ref %}', env);
    expect(html).toContain('<span class="gb-content-ref__title">gone.md</span>');
  });

  it('strips an anchor when resolving the target file', () => {
    const html = md.render('{% content-ref url="endpoints.md#section" %}\nx\n{% endcontent-ref %}', env);
    expect(html).toContain('<span class="gb-content-ref__title">Endpoints</span>');
    expect(html).toContain('href="endpoints.md#section"');
  });
});

describe('code renderer', () => {
  it('wraps a fence in a wrapping container', () => {
    const html = md.render('{% code overflow="wrap" %}\n```js\nconst a = 1;\n```\n{% endcode %}');
    expect(html).toContain('<div class="gb-code gb-code--wrap">');
    expect(html).toContain('<code class="language-js">');
  });

  it('omits the wrap modifier when overflow is not set', () => {
    const html = md.render('{% code %}\n```\nx\n```\n{% endcode %}');
    expect(html).toContain('<div class="gb-code">');
    expect(html).not.toContain('gb-code--wrap');
  });
});

describe('file renderer', () => {
  it('renders a download card showing the file name', () => {
    const html = md.render('{% file src="../../.gitbook/assets/report.pdf" %}');
    expect(html).toContain('<a class="gb-file" href="../../.gitbook/assets/report.pdf" download>');
    expect(html).toContain('<span class="gb-file__name">report.pdf</span>');
  });

  it('tolerates an explicit end tag', () => {
    const html = md.render('{% file src="a/b.yml" %}\n{% endfile %}');
    expect(html.match(/class="gb-file"/g)).toHaveLength(1);
  });
});

describe('embed renderer', () => {
  it('renders a link card rather than an iframe', () => {
    const html = md.render('{% embed url="https://learn.microsoft.com/graph" %}');
    expect(html).toContain('<a class="gb-embed" href="https://learn.microsoft.com/graph"');
    expect(html).not.toContain('<iframe');
  });

  it('shows the host as the card label', () => {
    expect(md.render('{% embed url="https://app.guidde.com/share/x" %}')).toContain('app.guidde.com');
  });

  it('omits the host span for a non-absolute url', () => {
    const html = md.render('{% embed url="not a url" %}');
    expect(html.match(/gb-embed__url/g)).toHaveLength(1);
    expect(html).not.toContain('gb-embed__host');
  });
});

describe('href validation', () => {
  it('omits the href for a javascript: url but keeps the card', () => {
    const html = md.render('{% embed url="javascript:alert(1)" %}');
    expect(html).not.toContain('href=');
    expect(html).toContain('class="gb-embed"');
  });

  it('keeps the href for a normal https url', () => {
    expect(md.render('{% embed url="https://example.com/x" %}')).toContain(
      'href="https://example.com/x"',
    );
  });
});
