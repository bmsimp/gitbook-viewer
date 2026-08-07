import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const SCRIPT = readFileSync('media/preview.js', 'utf8');

const HTML = `
<div class="gb-tabs" data-gb-tabs>
  <div class="gb-tabs__strip" role="tablist"></div>
  <div class="gb-tabs__tab" data-gb-tab-index="0" data-gb-tab-title="One" data-gb-active="true"></div>
  <div class="gb-tabs__tab" data-gb-tab-index="1" data-gb-tab-title="Two" data-gb-active="false" hidden></div>
</div>`;

function boot(): Document {
  const dom = new JSDOM(`<body>${HTML}</body>`, { runScripts: 'outside-only' });
  dom.window.eval(SCRIPT);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom.window.document;
}

describe('preview tab script', () => {
  let doc: Document;
  beforeEach(() => {
    doc = boot();
  });

  it('builds one button per panel from the panel titles', () => {
    const buttons = doc.querySelectorAll('.gb-tabs__button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.textContent).toBe('One');
    expect(buttons[1]!.textContent).toBe('Two');
  });

  it('marks the first button selected', () => {
    expect(doc.querySelectorAll('.gb-tabs__button')[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('switches panels on click', () => {
    const buttons = doc.querySelectorAll<HTMLButtonElement>('.gb-tabs__button');
    buttons[1]!.click();

    const panels = doc.querySelectorAll<HTMLElement>('.gb-tabs__tab');
    expect(panels[0]!.hasAttribute('hidden')).toBe(true);
    expect(panels[1]!.hasAttribute('hidden')).toBe(false);
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('does not build buttons twice if run again', () => {
    doc.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event('DOMContentLoaded'));
    expect(doc.querySelectorAll('.gb-tabs__button')).toHaveLength(2);
  });

  it('wires ARIA roles and labels between buttons and panels', () => {
    const button = doc.querySelectorAll('.gb-tabs__button')[1]!;
    const panel = doc.querySelectorAll('.gb-tabs__tab')[1]!;
    expect(button.getAttribute('role')).toBe('tab');
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(button.id);
    expect(panel.id).toBeTruthy();
    expect(button.id).toBeTruthy();
  });

  it('keeps groups independent', () => {
    const two = new JSDOM(`<body>${HTML}${HTML}</body>`, { runScripts: 'outside-only' });
    two.window.eval(SCRIPT);
    two.window.document.dispatchEvent(new two.window.Event('DOMContentLoaded'));
    const groups = two.window.document.querySelectorAll('[data-gb-tabs]');
    const second = groups[1]!.querySelectorAll<HTMLButtonElement>('.gb-tabs__button');
    second[1]!.click();
    const firstPanels = groups[0]!.querySelectorAll<HTMLElement>('.gb-tabs__tab');
    expect(firstPanels[0]!.hasAttribute('hidden')).toBe(false); // first group untouched
    expect(groups[1]!.querySelectorAll<HTMLElement>('.gb-tabs__tab')[1]!.hasAttribute('hidden')).toBe(
      false,
    );
  });

  it('falls back to a numbered label when a title is missing', () => {
    const dom = new JSDOM(
      '<body><div class="gb-tabs" data-gb-tabs><div class="gb-tabs__strip"></div><div class="gb-tabs__tab" data-gb-tab-index="0"></div></div></body>',
      { runScripts: 'outside-only' },
    );
    dom.window.eval(SCRIPT);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    expect(dom.window.document.querySelector('.gb-tabs__button')!.textContent).toBe('Tab 1');
  });

  it('does nothing when there are no tab groups', () => {
    const dom = new JSDOM('<body><p>plain</p></body>', { runScripts: 'outside-only' });
    expect(() => {
      dom.window.eval(SCRIPT);
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    }).not.toThrow();
  });
});
