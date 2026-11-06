// @vitest-environment jsdom
// The Orca editor's browser bundle: build it, load it in a DOM, and check it
// renders GitBook syntax with no file system to lean on.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let renderer;

beforeAll(async () => {
  execFileSync(process.execPath, [path.join(projectRoot, 'scripts', 'build-orca-plugin.mjs')], { stdio: 'pipe' });
  const bundle = path.join(projectRoot, 'orca-plugin', 'editor', 'vendor', 'gitbook-renderer.js');
  renderer = await import(/* @vite-ignore */ `${pathToFileURL(bundle).href}?t=${Date.now()}`);
}, 60_000);

describe('Orca editor renderer', () => {
  it('renders GitBook blocks and the front-matter subtitle', () => {
    const html = renderer.render(
      '---\ndescription: Subtitle here\n---\n# Title\n\n{% hint style="warning" %}\nCareful\n{% endhint %}\n\n' +
        '{% tabs %}\n{% tab title="A" %}\naa\n{% endtab %}\n{% tab title="B" %}\nbb\n{% endtab %}\n{% endtabs %}\n',
    );
    expect(html).not.toContain('{%');
    expect(html).toContain('Subtitle here');
    expect(html).toContain('gb-hint');
    expect(html).toContain('gb-tabs');
    expect(html).toContain('<h1 id="title">');
  });

  it('keeps a mid-document --- as a divider', () => {
    expect(renderer.render('A\n\n---\n\nB\n')).toContain('<hr>');
  });

  it('explains includes and relative images instead of failing', () => {
    const html = renderer.render('{% include "../shared/snippet.md" %}\n\n![logo](img/logo.png)\n');
    expect(html).not.toContain('include failed');
    expect(html).toContain('gbv-unavailable');
    expect(html).toContain('../shared/snippet.md');
    expect(html).toContain('img/logo.png');
    expect(html).not.toContain('<img src="img/logo.png"');
  });

  it('still shows remote images', () => {
    expect(renderer.render('![x](https://example.com/x.png)\n')).toContain('<img src="https://example.com/x.png"');
  });

  it('ships the GitBook styles', () => {
    expect(renderer.styles.gitbookCss).toContain('.gb-hint');
    expect(renderer.styles.fontsCss).toContain('@font-face');
  });
});
