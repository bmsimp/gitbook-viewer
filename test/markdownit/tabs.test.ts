import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';
import { renderLikeVsCode } from '../helpers/render';

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
    const html = renderLikeVsCode(md, SOURCE);
    expect(html).toContain('<div class="gb-tabs" data-gb-tabs>');
    expect(html.match(/class="gb-tabs__tab"/g)).toHaveLength(2);
    expect(html).toContain('data-gb-tab-title="Formal Tone"');
    expect(html).toContain('data-gb-tab-title="Informal Tone"');
  });

  it('marks the first tab active and the rest hidden', () => {
    const html = renderLikeVsCode(md, SOURCE);
    expect(html).toContain('<div class="gb-tabs__tab" data-gb-tab-index="0" data-gb-active="true"');
    expect(html).toContain('<div class="gb-tabs__tab" data-gb-tab-index="1" data-gb-active="false"');
    expect(html).toMatch(/data-gb-tab-title="Informal Tone" hidden>/);
  });

  it('escapes quotes in a tab title', () => {
    const html = renderLikeVsCode(md, `{% tabs %}\n{% tab title='A "B" & <C>' %}\nx\n{% endtab %}\n{% endtabs %}`);
    expect(html).toContain('data-gb-tab-title="A &quot;B&quot; &amp; &lt;C&gt;"');
  });

  it('falls back to a numbered title for a titleless tab', () => {
    const html = renderLikeVsCode(md, '{% tabs %}\n{% tab %}\nx\n{% endtab %}\n{% endtabs %}');
    expect(html).toContain('data-gb-tab-title="Tab 1"');
  });

  it('renders an orphan tab after a closed group as a fresh visible tab', () => {
    const html = renderLikeVsCode(md, 
      `${SOURCE}\n\n{% tab title="Orphan" %}\nOrphan body\n{% endtab %}`,
    );
    expect(html).toMatch(/data-gb-tab-title="Orphan"/);
    expect(html).toContain(
      '<div class="gb-tabs__tab" data-gb-tab-index="0" data-gb-active="true" data-gb-tab-title="Orphan">',
    );
  });

  it('renders markdown inside a tab body', () => {
    expect(renderLikeVsCode(md, SOURCE)).toContain('<p>Formal body</p>');
  });
});
