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

  it('keeps the selected tab across a full re-render', async () => {
    // VS Code re-renders the preview body and re-injects the script on every
    // content change, so the selection has to outlive both.
    const dom = new JSDOM(`<body>${HTML}</body>`, { runScripts: 'outside-only' });
    const win = dom.window;
    // Wait for the document to finish loading so the script takes the same
    // path it does in a real webview: re-injected into an already-parsed
    // document, building immediately off readyState. Re-dispatching
    // DOMContentLoaded instead would wake the *previous* eval's listener,
    // which still closes over its own state and would mask a regression.
    await new Promise<void>((resolve) => {
      win.addEventListener('load', () => resolve());
    });
    const before = new Set(Object.getOwnPropertyNames(win));

    win.eval(SCRIPT);
    win.document.querySelectorAll<HTMLButtonElement>('.gb-tabs__button')[1]!.click();

    win.document.body.innerHTML = HTML; // fresh markup: tab 0 active again
    win.eval(SCRIPT);

    const buttons = win.document.querySelectorAll('.gb-tabs__button');
    expect(buttons).toHaveLength(2);
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true');
    expect(buttons[0]!.getAttribute('aria-selected')).toBe('false');
    const panels = win.document.querySelectorAll<HTMLElement>('.gb-tabs__tab');
    expect(panels[1]!.hasAttribute('hidden')).toBe(false);
    expect(panels[0]!.hasAttribute('hidden')).toBe(true);

    // The HTML named-access rule auto-exposes every id'd element on window, so
    // the generated button/panel ids show up here without the script ever
    // assigning them. Discount those: what matters is that the script itself
    // claims exactly one name.
    const elementIds = new Set(
      Array.from(win.document.querySelectorAll('[id]')).map((element) => element.id),
    );
    const added = Object.getOwnPropertyNames(win).filter(
      (key) => !before.has(key) && !elementIds.has(key),
    );
    expect(added).toEqual(['__gitbookViewerTabState']);
  });

  it('moves selection with the arrow keys and follows with focus', () => {
    const buttons = doc.querySelectorAll<HTMLButtonElement>('.gb-tabs__button');
    const win = doc.defaultView as Window & typeof globalThis;
    buttons[0]!.focus();
    buttons[0]!.dispatchEvent(
      new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );

    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true');
    expect(doc.querySelectorAll<HTMLElement>('.gb-tabs__tab')[1]!.hasAttribute('hidden')).toBe(
      false,
    );
    expect(doc.activeElement).toBe(buttons[1]);
  });

  it('wraps arrow navigation and supports Home/End', () => {
    const buttons = doc.querySelectorAll<HTMLButtonElement>('.gb-tabs__button');
    const win = doc.defaultView as Window & typeof globalThis;
    const press = (from: number, key: string) =>
      buttons[from]!.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true }));

    press(0, 'ArrowLeft'); // wraps backwards to the last tab
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true');
    press(1, 'ArrowRight'); // wraps forwards to the first tab
    expect(buttons[0]!.getAttribute('aria-selected')).toBe('true');
    press(0, 'End');
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true');
    press(1, 'Home');
    expect(buttons[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('gives only the selected button a roving tabindex', () => {
    const buttons = doc.querySelectorAll<HTMLButtonElement>('.gb-tabs__button');
    expect(buttons[0]!.getAttribute('tabindex')).toBe('0');
    expect(buttons[1]!.getAttribute('tabindex')).toBe('-1');

    buttons[1]!.click();
    expect(buttons[0]!.getAttribute('tabindex')).toBe('-1');
    expect(buttons[1]!.getAttribute('tabindex')).toBe('0');
  });

  it('does nothing when there are no tab groups', () => {
    const dom = new JSDOM('<body><p>plain</p></body>', { runScripts: 'outside-only' });
    expect(() => {
      dom.window.eval(SCRIPT);
      dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    }).not.toThrow();
  });
});

describe('gitbook document detection', () => {
  function bootWith(html: string): Document {
    const dom = new JSDOM(`<body>${html}</body>`, { runScripts: 'outside-only' });
    dom.window.eval(SCRIPT);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    return dom.window.document;
  }

  it('marks the body when the document contains gitbook markup', () => {
    const doc = bootWith('<div class="gb-hint gb-hint--info"><div class="gb-hint__body"></div></div>');
    expect(doc.body.hasAttribute('data-gb-doc')).toBe(true);
  });

  it('leaves a plain markdown document unmarked', () => {
    const doc = bootWith('<h1>Plain</h1><p>No gitbook blocks here.</p>');
    expect(doc.body.hasAttribute('data-gb-doc')).toBe(false);
  });

  it('clears the mark when a re-render removes all gitbook markup', async () => {
    const dom = new JSDOM('<body><div class="gb-hint"></div></body>', {
      runScripts: 'outside-only',
    });
    // Wait for the document to finish loading so the re-injected script runs
    // build() immediately off readyState, the same path a real webview takes.
    await new Promise<void>((resolve) => {
      dom.window.addEventListener('load', () => resolve());
    });
    dom.window.eval(SCRIPT);
    expect(dom.window.document.body.hasAttribute('data-gb-doc')).toBe(true);

    dom.window.document.body.innerHTML = '<p>plain now</p>';
    dom.window.eval(SCRIPT);
    expect(dom.window.document.body.hasAttribute('data-gb-doc')).toBe(false);
  });
});
