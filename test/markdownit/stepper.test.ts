import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../../src/markdownit/plugin';

const md = gitbookPlugin(new MarkdownIt({ html: true }));

describe('stepper renderer', () => {
  it('emits a stepper wrapper with one element per step', () => {
    const html = md.render(
      ['{% stepper %}', '{% step %}', 'First', '{% endstep %}', '{% step %}', 'Second', '{% endstep %}', '{% endstepper %}'].join('\n'),
    );
    expect(html).toContain('<div class="gb-stepper">');
    expect(html.match(/class="gb-step"/g)).toHaveLength(2);
    expect(html).toContain('<p>First</p>');
    expect(html).toContain('<p>Second</p>');
  });

  it('renders headings inside a step', () => {
    const html = md.render(['{% stepper %}', '{% step %}', '### Do the thing', '{% endstep %}', '{% endstepper %}'].join('\n'));
    expect(html).toContain('<h3>Do the thing</h3>');
  });

  it('does not emit step numbers in markup', () => {
    const html = md.render(['{% stepper %}', '{% step %}', 'x', '{% endstep %}', '{% endstepper %}'].join('\n'));
    expect(html).not.toMatch(/>\s*1\s*</);
  });
});
