import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';

const md = gitbookPlugin(new MarkdownIt({ html: true }));

const SOURCE = [
  '{% tabs %}',
  '{% tab title="Formal Tone" %}',
  'Formal body',
  '{% endtab %}',
  '{% tab title="Informal Tone" %}',
  'Informal body',
  '{% endtab %}',
  '{% endtabs %}',
].join('\n');

describe('tabs renderer', () => {
  it('emits a tab group with a button per tab', () => {
    const html = md.render(SOURCE);
    expect(html).toContain('<div class="gb-tabs" data-gb-tabs>');
    expect(html.match(/class="gb-tabs__tab"/g)).toHaveLength(2);
    expect(html).toContain('data-gb-tab-title="Formal Tone"');
    expect(html).toContain('data-gb-tab-title="Informal Tone"');
  });

  it('marks the first tab active and the rest hidden', () => {
    const html = md.render(SOURCE);
    expect(html).toContain('<div class="gb-tabs__tab" data-gb-tab-index="0" data-gb-active="true"');
    expect(html).toContain('<div class="gb-tabs__tab" data-gb-tab-index="1" data-gb-active="false"');
  });

  it('escapes quotes in a tab title', () => {
    const html = md.render('{% tabs %}\n{% tab title="A \\"B\\"" %}\nx\n{% endtab %}\n{% endtabs %}');
    expect(html).not.toContain('data-gb-tab-title="A "B""');
  });

  it('renders markdown inside a tab body', () => {
    expect(md.render(SOURCE)).toContain('<p>Formal body</p>');
  });
});
