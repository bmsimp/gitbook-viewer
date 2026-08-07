import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';
import { renderLikeVsCode } from '../helpers/render';

const md = gitbookPlugin(new MarkdownIt({ html: true }));

const STORYLANE =
  '{% @storylane/embed subdomain="app" linkValue="x" url="https://app.storylane.io/share/x" %}';

describe('integration block renderer', () => {
  it('renders a storylane card linking to the validated url', () => {
    const html = renderLikeVsCode(md, STORYLANE);
    expect(html).toContain(
      '<a class="gb-integration gb-integration--storylane" href="https://app.storylane.io/share/x"',
    );
    expect(html).toContain('gb-integration__badge');
    expect(html).toContain('<svg'); // play badge
    expect(html).toContain('<span class="gb-integration__title">Interactive demo</span>');
    expect(html).toContain('<span class="gb-integration__subtitle">Storylane</span>');
    expect(html).toContain(
      '<span class="gb-integration__url">https://app.storylane.io/share/x</span>',
    );
    expect(html).not.toContain('<iframe');
  });

  it('renders a generic card for any other vendor block', () => {
    const html = renderLikeVsCode(
      md,
      '{% @cipp-external-webpage-block/cyberdrain url="https://standards.cipp.app/" fullWidth="true" %}',
    );
    expect(html).toContain('<a class="gb-integration" href="https://standards.cipp.app/"');
    expect(html).toContain(
      '<span class="gb-integration__title">@cipp-external-webpage-block/cyberdrain</span>',
    );
    expect(html).toContain('<span class="gb-integration__subtitle">GitBook integration</span>');
    expect(html).not.toContain('gb-integration--storylane');
    expect(html).not.toContain('gb-integration__badge');
  });

  it('renders a linkless div card with a note when the url is missing', () => {
    const html = renderLikeVsCode(md, '{% @storylane/embed subdomain="app" %}');
    expect(html).toContain('<div class="gb-integration gb-integration--storylane"');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('<a ');
    expect(html).toContain('<span class="gb-integration__note">no url provided</span>');
    expect(html).not.toContain('gb-integration__url');
  });

  it('treats a javascript: url as invalid', () => {
    const html = renderLikeVsCode(md, '{% @storylane/embed url="javascript:alert(1)" %}');
    expect(html).toContain('<div class="gb-integration gb-integration--storylane"');
    expect(html).not.toContain('href=');
    expect(html).toContain('no url provided');
  });

  it('tolerates weird spacing around the tag and attributes', () => {
    const html = renderLikeVsCode(
      md,
      '  {%   @storylane/embed    url="https://app.storylane.io/share/y"   subdomain="app"  %}  ',
    );
    expect(html).toContain('href="https://app.storylane.io/share/y"');
    expect(html).toContain('gb-integration--storylane');
  });

  it('never leaves an integration tag as literal text', () => {
    const html = renderLikeVsCode(md, `# Title\n\n${STORYLANE}\n\nAfter.\n`);
    expect(html).not.toContain('{% @storylane');
    expect(html).not.toContain('{%');
    expect(html).toContain('gb-integration');
  });

  it('leaves a bare @name without a slash as literal text', () => {
    const html = renderLikeVsCode(md, '{% @foo %}');
    expect(html).toContain('{% @foo %}');
    expect(html).not.toContain('gb-integration');
  });

  it('escapes html metacharacters coming from attributes and the block name', () => {
    const html = renderLikeVsCode(
      md,
      '{% @storylane/embed url="https://x.test/?a=1&b=<2>" %}',
    );
    expect(html).toContain('&amp;b=&lt;2&gt;');
    expect(html).not.toContain('b=<2>');
  });
});
