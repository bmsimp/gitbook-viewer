import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';

const md = gitbookPlugin(new MarkdownIt({ html: true }));

describe('hint renderer', () => {
  it('wraps the body in a styled callout', () => {
    const html = md.render('{% hint style="warning" %}\nBe careful.\n{% endhint %}');
    expect(html).toContain('<div class="gb-hint gb-hint--warning">');
    expect(html).toContain('<div class="gb-hint__icon" aria-hidden="true">');
    expect(html).toContain('<div class="gb-hint__body">');
    expect(html).toContain('<p>Be careful.</p>');
    expect(html.trimEnd().endsWith('</div>')).toBe(true);
  });

  it('defaults to the info style when none is given', () => {
    expect(md.render('{% hint %}\nx\n{% endhint %}')).toContain('gb-hint--info');
  });

  it('falls back to info for an unrecognized style', () => {
    expect(md.render('{% hint style="nope" %}\nx\n{% endhint %}')).toContain('gb-hint--info');
  });

  it('renders markdown inside the body', () => {
    const html = md.render('{% hint style="info" %}\nUse **bold** and `code`.\n{% endhint %}');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('supports nested hints inside steps', () => {
    const html = md.render(
      ['{% stepper %}', '{% step %}', '{% hint style="danger" %}', 'no', '{% endhint %}', '{% endstep %}', '{% endstepper %}'].join('\n'),
    );
    expect(html).toContain('gb-stepper');
    expect(html).toContain('gb-hint--danger');
  });

  it('leaves an unknown tag as literal text', () => {
    expect(md.render('{% bogus %}')).toContain('{% bogus %}');
  });

  it('does not treat an indented code block as a tag', () => {
    expect(md.render('    {% hint %}')).toContain('<pre><code>{% hint %}');
  });
});
