import { describe, expect, it } from 'vitest';
import { checkReferences } from '../../src/diagnostics/referenceChecker';

const exists = (p: string): boolean =>
  ['/repo/.gitbook/includes/note.md', '/repo/docs/other.md', '/repo/docs/assets/a.pdf'].includes(
    p.replace(/\\/g, '/'),
  );

const check = (src: string) => checkReferences(src, '/repo/docs/index.md', exists);

describe('checkReferences', () => {
  it('reports nothing for a clean document', () => {
    expect(check('{% hint style="info" %}\nok\n{% endhint %}\n')).toEqual([]);
  });

  it('accepts an include that exists', () => {
    expect(check('{% include "../.gitbook/includes/note.md" %}\n')).toEqual([]);
  });

  it('warns about a missing include target', () => {
    const issues = check('{% include "../.gitbook/includes/gone.md" %}\n');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', line: 0, code: 'missing-target' });
    expect(issues[0]!.message).toContain('gone.md');
  });

  it('warns about a missing content-ref target', () => {
    const issues = check('{% content-ref url="nope.md" %}\nx\n{% endcontent-ref %}\n');
    expect(issues.filter((i) => i.code === 'missing-target')).toHaveLength(1);
  });

  it('accepts a content-ref with an anchor on an existing file', () => {
    expect(check('{% content-ref url="other.md#top" %}\nx\n{% endcontent-ref %}\n')).toEqual([]);
  });

  it('ignores http targets', () => {
    expect(check('{% embed url="https://x.test/a" %}\n')).toEqual([]);
  });

  it('warns about a missing file src', () => {
    expect(check('{% file src="assets/missing.pdf" %}\n')[0]).toMatchObject({ code: 'missing-target' });
  });

  it('errors on an unclosed container tag', () => {
    const issues = check('{% hint style="info" %}\nno close\n');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', code: 'unbalanced', line: 0 });
  });

  it('errors on a close tag with no opening tag', () => {
    expect(check('{% endhint %}\n')[0]).toMatchObject({ severity: 'error', code: 'unbalanced' });
  });

  it('does not require a close tag for file or embed', () => {
    expect(check('{% file src="assets/a.pdf" %}\n')).toEqual([]);
  });

  it('reports an unknown tag as information', () => {
    expect(check('{% mystery %}\n')[0]).toMatchObject({ severity: 'information', code: 'unknown-tag' });
  });

  it('reports the column range of the offending tag', () => {
    const issues = check('  {% include "gone.md" %}\n');
    expect(issues[0]).toMatchObject({ startCol: 2, endCol: 25 });
  });

  it('flags an include resolving outside the workspace root when one is given', () => {
    const issues = checkReferences(
      '{% include "../../../etc/passwd" %}\n',
      '/repo/docs/index.md',
      () => true, // pretend it exists
      '/repo', // workspace root
    );
    expect(issues[0]).toMatchObject({ code: 'outside-workspace', severity: 'information' });
  });

  it('does not flag in-workspace includes when a root is given', () => {
    const issues = checkReferences(
      '{% include "../.gitbook/includes/note.md" %}\n',
      '/repo/docs/index.md',
      exists,
      '/repo',
    );
    expect(issues).toEqual([]);
  });
});
